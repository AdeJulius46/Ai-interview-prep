'use client';

// The whole live experience is one hook. See frontend.md, "`useAnamSession`
// hook", and architecture.md diagram 4 (the client session state machine),
// which this file implements verbatim: idle -> connecting -> live -> ending
// -> ended, plus error. `start()` is the only thing that may trigger a
// network call or import the SDK, and it must be invoked from a click (never
// on mount) or the browser's autoplay policy silently blocks the stream.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@coach/contracts';
import { API_BASE, appendMessages, completeInterview, startSession } from '../../api-client';
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

// Flush cadence from frontend.md, "Transcript buffering": "Flush
// snapshot.slice(lastFlushedIndex) every 5 seconds and immediately on
// session end."
const FLUSH_INTERVAL_MS = 5000;

// Real network/SDK calls can hang in ways the mock never does (the mock's
// stopStreaming resolves instantly; a real WebRTC teardown or a slow
// backend call is under no such guarantee). Teardown must never leave the
// candidate stuck on a spinner indefinitely, so every step in end() races
// against a bound — on timeout we just move on, same as any other failure
// there: the session is over either way.
const TEARDOWN_STEP_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function sessionStorageKey(interviewId: string): string {
  return `interview:${interviewId}:transcript`;
}

interface PersistedTranscript {
  lines: TranscriptLine[];
  lastFlushedIndex: number;
}

// Mirrors the transcript snapshot and lastFlushedIndex into sessionStorage
// keyed by interview id, so a refresh mid-session does not lose unflushed
// lines (frontend.md, "Transcript buffering"). sessionStorage can throw
// (private browsing, quota) — this is a convenience mirror, never load
// bearing, so failures are swallowed.
function persistTranscript(interviewId: string, snapshot: PersistedTranscript): void {
  try {
    sessionStorage.setItem(sessionStorageKey(interviewId), JSON.stringify(snapshot));
  } catch {
    // best effort
  }
}

function restoreTranscript(interviewId: string): PersistedTranscript | null {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(interviewId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTranscript;
    if (!Array.isArray(parsed.lines) || typeof parsed.lastFlushedIndex !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedTranscript(interviewId: string): void {
  try {
    sessionStorage.removeItem(sessionStorageKey(interviewId));
  } catch {
    // best effort
  }
}

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

/** The real `@anam-ai/js-sdk`'s `ClientError` (thrown when its own
 * `POST engine/session` call, made client-side with just the session
 * token, fails) wraps a generic message ("Invalid request to start
 * session") around the actual server-side reason in `details.cause`. Left
 * unhandled, `isApiErrorBody` below would still match it (any Error has a
 * string `.message`) but show only the unhelpful generic wrapper —
 * checked first so the specific cause reaches the user instead. */
function isAnamClientError(err: unknown): err is { message: string; details?: { cause?: string } } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'ClientError' &&
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
  /** The current partial caption from MESSAGE_STREAM_EVENT_RECEIVED, for the
   * "live caption under video" (frontend.md, "Transcript buffering"). Never
   * persisted or included in a flush — superseded by the next history
   * snapshot. Not part of frontend.md's minimal signature, added the same
   * way timeLimitSecs was. */
  caption: string | null;
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
  const [caption, setCaption] = useState<string | null>(null);

  const stateRef = useRef<SessionState>('idle');
  const clientRef = useRef<AnamClientLike | null>(null);
  const startingRef = useRef(false);
  const endingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const lastFlushedIndexRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  // Flushes snapshot.slice(lastFlushedIndex) — never the whole history — and
  // only advances the marker on success. On failure the marker is left
  // alone, so the next periodic tick (or the final flush in `end()`) retries
  // the exact same slice: re-sending an already-stored range is harmless,
  // the server dedupes/upserts on (interviewId, sequence). See frontend.md,
  // "Transcript buffering".
  const flush = useCallback(
    async (options?: { useBeacon?: boolean }) => {
      const lines = transcriptRef.current;
      const from = lastFlushedIndexRef.current;
      if (from >= lines.length) return;
      const toSend = lines.slice(from);

      if (options?.useBeacon) {
        // beforeunload/pagehide: a normal fetch would be cancelled by the
        // navigation, so this is fire-and-forget with no confirmation of
        // receipt — optimistically advance the marker regardless.
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon(
            `${API_BASE}/api/interviews/${interviewId}/messages`,
            new Blob([JSON.stringify({ messages: toSend })], { type: 'application/json' }),
          );
        }
        lastFlushedIndexRef.current = lines.length;
        return;
      }

      try {
        await appendMessages(interviewId, toSend);
        lastFlushedIndexRef.current = lines.length;
        persistTranscript(interviewId, { lines, lastFlushedIndex: lastFlushedIndexRef.current });
      } catch {
        // Left unflushed on purpose — retried on the next tick.
      }
    },
    [interviewId],
  );

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const startFlushTimer = useCallback(() => {
    clearFlushTimer();
    flushTimerRef.current = setInterval(() => {
      void flushRef.current();
    }, FLUSH_INTERVAL_MS);
  }, [clearFlushTimer]);

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
      clearFlushTimer();

      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        // Timeout, not just try/catch: a real stopStreaming() that never
        // settles (unlike the mock, which always resolves instantly) must
        // not leave the candidate stuck on this screen forever.
        await withTimeout(
          Promise.resolve(client.stopStreaming()).catch(() => undefined),
          TEARDOWN_STEP_TIMEOUT_MS,
        );
      }

      // architecture.md, "What can go wrong": on unload there is deliberately
      // NO /complete call — just a best-effort sendBeacon flush, leaving the
      // interview LIVE so a reload can resume it (restored from
      // sessionStorage below) and, if the tab really is gone for good, the
      // server's cron reaper marks it ABANDONED later. /complete only runs
      // for a real end: the user clicking End, or the timer hitting zero.
      if (reason === 'unload') {
        void flushRef.current({ useBeacon: true });
      } else {
        await withTimeout(
          flushRef
            .current()
            .then(() => completeInterview(interviewId))
            .then(() => clearPersistedTranscript(interviewId))
            .catch(() => undefined),
          TEARDOWN_STEP_TIMEOUT_MS,
        );
      }

      stateRef.current = 'ended';
      if (mountedRef.current) {
        if (reason === 'timeout') setError(ERROR_MESSAGES.timesUp);
        setState('ended');
      }
      endingRef.current = false;
    },
    [clearTimer, clearFlushTimer, interviewId],
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
        // Flush cadence also starts here — connection time buys no extra
        // flushes, matching the countdown's own start signal.
        startFlushTimer();
      }) as never);

      client.addListener(AnamEventNames.MESSAGE_HISTORY_UPDATED, ((...args: unknown[]) => {
        const messages = args[0] as AnamMessage[];
        const lines = toTranscript(messages);
        transcriptRef.current = lines;
        persistTranscript(interviewId, { lines, lastFlushedIndex: lastFlushedIndexRef.current });
        if (!mountedRef.current) return;
        setTranscript(lines);
        setQuestionsAnswered(countQuestionsAnswered(lines));
      }) as never);

      client.addListener(AnamEventNames.MESSAGE_STREAM_EVENT_RECEIVED, ((...args: unknown[]) => {
        // Partial captions are never persisted (frontend.md, "Transcript
        // buffering") and never flow into transcriptRef/flush — they are
        // superseded by the next full MESSAGE_HISTORY_UPDATED snapshot.
        const partial = args[0] as { content?: string } | undefined;
        if (mountedRef.current) setCaption(partial?.content ?? null);
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
        } else if (isAnamClientError(err)) {
          setError(err.details?.cause ? `${err.message}: ${err.details.cause}` : err.message);
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
  }, [interviewId, startCountdown, startFlushTimer]);

  const skipQuestion = useCallback(() => {
    if (stateRef.current !== 'live') return;
    // Minimal for gate:6, which only asserts the enabled/disabled
    // affordance (frontend.md's control-availability table). Phase 7+ wires
    // this into an actual persona interrupt/skip signal.
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Restores unflushed lines from a previous mount of this same interview
    // (e.g. a page reload mid-session) so they are not lost — the SDK
    // connection itself cannot be resumed across a reload, but the buffered
    // transcript and its flush progress can. frontend.md, "Transcript
    // buffering"; testing.md gate:7.
    const restored = restoreTranscript(interviewId);
    if (restored) {
      transcriptRef.current = restored.lines;
      lastFlushedIndexRef.current = restored.lastFlushedIndex;
      setTranscript(restored.lines);
      setQuestionsAnswered(countQuestionsAnswered(restored.lines));
      if (restored.lastFlushedIndex < restored.lines.length) {
        void flushRef.current();
      }
    }

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
  }, [interviewId]);

  return {
    state,
    error,
    secondsRemaining,
    transcript,
    questionsAnswered,
    timeLimitSecs,
    caption,
    start,
    skipQuestion,
    end,
  };
}
