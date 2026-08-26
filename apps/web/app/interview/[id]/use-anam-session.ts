'use client';

// The whole live experience is one hook. See frontend.md, "`useAnamSession`
// hook", and architecture.md diagram 4 (the client session state machine),
// which this file implements verbatim: idle -> connecting -> live -> ending
// -> ended, plus error. `start()` is the only thing that may trigger a
// network call or import the SDK, and it must be invoked from a click (never
// on mount) or the browser's autoplay policy silently blocks the stream.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@coach/contracts';
import { startSession } from '../../api-client';
import { AnamEventNames, type AnamClientLike, type AnamMessage, type AnamModuleLike } from './anam-types';

export type SessionState = 'idle' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';

/** Stable DOM id `streamToVideoElement` targets. Rendered by `<VideoStage>`
 * in live-room.tsx. */
export const VIDEO_ELEMENT_ID = 'interview-video';

/** At T-30s the timer switches to the warning treatment (frontend.md, "Timer"). */
export const WARNING_THRESHOLD_SECS = 30;

// Error states, written as directions not apologies — copied verbatim from
// frontend.md's error-states table so the UI never paraphrases them.
const ERROR_MESSAGES = {
  micDenied:
    "Microphone access is blocked. Allow it in your browser's site settings, then start again.",
  anamUnavailable: 'Could not reach the interviewer. Check your connection and start again.',
  streamDropped:
    'The connection dropped. Your answers so far are saved. End the session to get your report.',
  timesUp: "Time's up. Scoring your answers.",
} as const;

// Counts interviewer turns containing the marker phrase the persona emits
// ("Question two.", "Question three.") rather than candidate turns, so a
// probe never inflates the count (frontend.md, "questionsAnswered").
const QUESTION_MARKER = /\bQuestion (one|two|three|four|five)\b/i;

function isMicDenied(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'NotAllowedError';
  }
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'NotAllowedError'
  );
}

function isApiErrorBody(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

/** `role: 'assistant'` (per README.md's documented shape) maps to
 * INTERVIEWER, and so does the installed SDK's actual `'persona'` role —
 * treat anything that isn't `'user'` as the interviewer. */
function toTranscript(messages: AnamMessage[]): TranscriptLine[] {
  const now = new Date().toISOString();
  return messages.map((message, index) => ({
    speaker: message.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER',
    content: message.content,
    spokenAt: now,
    sequence: index,
  }));
}

function countQuestionsAnswered(lines: TranscriptLine[]): number {
  return lines.filter(
    (line) => line.speaker === 'INTERVIEWER' && QUESTION_MARKER.test(line.content),
  ).length;
}

export interface UseAnamSessionResult {
  state: SessionState;
  error: string | null;
  secondsRemaining: number | null;
  transcript: TranscriptLine[];
  questionsAnswered: number;
  /** Populated once `start()`'s session-token response arrives. Not part of
   * frontend.md's minimal signature, but the live room's meta strip needs
   * the real server-clamped value rather than a guess. */
  timeLimitSecs: number | null;
  start: () => Promise<void>;
  skipQuestion: () => void;
  end: (reason: 'user' | 'timeout' | 'unload') => Promise<void>;
}

export function useAnamSession(interviewId: string): UseAnamSessionResult {
  const [state, setState] = useState<SessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [timeLimitSecs, setTimeLimitSecs] = useState<number | null>(null);

  const stateRef = useRef<SessionState>('idle');
  const clientRef = useRef<AnamClientLike | null>(null);
  const startingRef = useRef(false);
  const endingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Every teardown path — End clicked, timer zero, unmount, beforeunload,
  // pagehide, route change (App Router unmounts this component on
  // navigation, so unmount covers that case too) — funnels through here.
  // See frontend.md, "Teardown".
  const end = useCallback(
    async (reason: 'user' | 'timeout' | 'unload') => {
      if (endingRef.current) return;
      if (stateRef.current !== 'connecting' && stateRef.current !== 'live') return;
      endingRef.current = true;

      stateRef.current = 'ending';
      if (mountedRef.current) setState('ending');
      clearTimer();

      const client = clientRef.current;
      clientRef.current = null;
      try {
        await client?.stopStreaming();
      } catch {
        // Teardown must never throw past this point: the session is over
        // either way, and surfacing this error is less useful than a
        // guaranteed track stop.
      }

      stateRef.current = 'ended';
      if (mountedRef.current) {
        if (reason === 'timeout') setError(ERROR_MESSAGES.timesUp);
        setState('ended');
      }
      endingRef.current = false;
    },
    [clearTimer],
  );

  const endRef = useRef(end);
  useEffect(() => {
    endRef.current = end;
  }, [end]);

  const startCountdown = useCallback(
    (limitSecs: number) => {
      clearTimer();
      setSecondsRemaining(limitSecs);
      let remaining = limitSecs;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (mountedRef.current) setSecondsRemaining(0);
          clearTimer();
          void endRef.current('timeout');
          return;
        }
        if (mountedRef.current) setSecondsRemaining(remaining);
      }, 1000);
    },
    [clearTimer],
  );

  const start = useCallback(async () => {
    // Guards against a double click minting two tokens: the ref check is
    // synchronous, so it also blocks a second click that lands before React
    // re-renders the disabled Start button (state alone would not, since
    // both clicks would close over the same pre-render `state` value).
    if (startingRef.current || stateRef.current !== 'idle') return;
    startingRef.current = true;
    stateRef.current = 'connecting';
    setState('connecting');
    setError(null);

    try {
      const { sessionToken, timeLimitSecs: limitSecs } = await startSession(interviewId);
      if (mountedRef.current) setTimeLimitSecs(limitSecs);

      // Dynamic import INSIDE the click handler, not at module scope — a
      // module-scope import still runs during this component's server
      // render pass in the App Router. See frontend.md, "The critical
      // integration rule". In tests, window.__ANAM_MOCK__ (set by a
      // Playwright addInitScript before the app's module loads) swaps in
      // the deterministic mock so the real SDK is never called.
      const sdk: AnamModuleLike =
        typeof window !== 'undefined' && window.__ANAM_MOCK__
          ? ((await import('../../testing/anam-mock')) as unknown as AnamModuleLike)
          : ((await import('@anam-ai/js-sdk')) as unknown as AnamModuleLike);

      const client = sdk.createClient(sessionToken);
      clientRef.current = client;

      // Listeners registered BEFORE streaming, or the greeting is lost.
      client.addListener(AnamEventNames.SESSION_READY, (() => {
        if (stateRef.current !== 'connecting') return;
        stateRef.current = 'live';
        if (mountedRef.current) setState('live');
        // Countdown starts here, not on streamToVideoElement resolving, so
        // connection time is not billed against the candidate's 3 minutes.
        startCountdown(limitSecs);
      }) as never);

      client.addListener(AnamEventNames.MESSAGE_HISTORY_UPDATED, ((...args: unknown[]) => {
        const messages = args[0] as AnamMessage[];
        const lines = toTranscript(messages);
        if (!mountedRef.current) return;
        setTranscript(lines);
        setQuestionsAnswered(countQuestionsAnswered(lines));
      }) as never);

      client.addListener(AnamEventNames.MESSAGE_STREAM_EVENT_RECEIVED, (() => {
        // Partial captions are never persisted (frontend.md, "Transcript
        // buffering"): they are superseded by the next history snapshot.
        // Phase 7 wires this into the live caption under the video;
        // gate:6 does not assert on it.
      }) as never);

      await client.streamToVideoElement(VIDEO_ELEMENT_ID);
      // Deliberately do NOT transition to 'live' here. The promise
      // resolving means the stream was attached; SESSION_READY means the
      // persona can actually talk. See frontend.md.
    } catch (err) {
      clientRef.current = null;
      stateRef.current = 'error';
      if (mountedRef.current) {
        if (isMicDenied(err)) {
          setError(ERROR_MESSAGES.micDenied);
        } else if (isApiErrorBody(err)) {
          setError(err.message);
        } else {
          setError(ERROR_MESSAGES.anamUnavailable);
        }
        setState('error');
      }
    } finally {
      startingRef.current = false;
    }
  }, [interviewId, startCountdown]);

  const skipQuestion = useCallback(() => {
    if (stateRef.current !== 'live') return;
    // Minimal for gate:6, which only asserts the enabled/disabled
    // affordance (frontend.md's control-availability table). Phase 7+ wires
    // this into an actual persona interrupt/skip signal.
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function handleUnload() {
      void endRef.current('unload');
    }
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      void endRef.current('unload');
    };
  }, []);

  return {
    state,
    error,
    secondsRemaining,
    transcript,
    questionsAnswered,
    timeLimitSecs,
    start,
    skipQuestion,
    end,
  };
}
