// Deterministic stand-in for `@anam-ai/js-sdk`, loaded by
// `app/interview/[id]/live-room.tsx` only when `window.__ANAM_MOCK__` is set
// by a Playwright `addInitScript`. See testing.md, "The two hard mocking
// rules > 1. Anam is never called in an automated test": this is the ONLY
// production-code concession to testing, and this file is that concession —
// it is testing infrastructure, not app code, so it is allowed to expose
// test-only globals that live-room.tsx itself never touches.
//
// Matches `AnamClientLike` (see ../interview/[id]/anam-types.ts) closely
// enough that live-room.tsx's real integration code — listener registration
// before streaming, `state = live` only on SESSION_READY, teardown on
// `stopStreaming` — drives correctly against it, exactly as it would against
// the real SDK.
//
// Timeline once `streamToVideoElement` is called:
//   t+0      navigator.mediaDevices.getUserMedia (a REAL browser call — works
//            under Playwright's --use-fake-device-for-media-stream, and
//            rejects if a test denies permission or stubs the API to reject)
//   t+300ms  streamToVideoElement's promise resolves ("stream attached").
//            Deliberately NOT the live signal — see frontend.md.
//   t+700ms  SESSION_READY fires (400ms after the stream promise resolved,
//            per testing.md gate:6: "The mock resolves the stream promise
//            400ms before firing SESSION_READY").
//   t+850ms  MESSAGE_HISTORY_UPDATED — greeting only.
//   t+1050ms MESSAGE_HISTORY_UPDATED — + "Question one."
//   t+1400ms MESSAGE_HISTORY_UPDATED — + a scripted candidate turn.
//   t+1750ms MESSAGE_HISTORY_UPDATED — + an interviewer probe.
//
// Every snapshot is the FULL conversation so far, matching real Anam
// behaviour (README.md: "full conversation snapshot ... emitted each time a
// participant finishes speaking") rather than a delta — testing.md calls out
// that a mock emitting deltas would let a broken implementation pass.

export const AnamEvent = {
  SESSION_READY: 'SESSION_READY',
  MESSAGE_HISTORY_UPDATED: 'MESSAGE_HISTORY_UPDATED',
  MESSAGE_STREAM_EVENT_RECEIVED: 'MESSAGE_STREAM_EVENT_RECEIVED',
} as const;

declare global {
  interface Window {
    __ANAM_MOCK__?: boolean;
    __anamMockCallLog?: string[];
    __anamMockLocalStream?: MediaStream;
  }
}

const STREAM_ATTACH_DELAY_MS = 300;
const SESSION_READY_DELAY_MS = 400;
const GREETING_DELAY_MS = 150;
const QUESTION_ONE_DELAY_MS = 200;
const CANDIDATE_TURN_DELAY_MS = 350;
const PROBE_DELAY_MS = 350;

interface MockMessage {
  role: 'user' | 'persona';
  content: string;
}

type Listener = (...args: never[]) => void;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logCall(name: string): void {
  if (typeof window === 'undefined') return;
  window.__anamMockCallLog = window.__anamMockCallLog ?? [];
  window.__anamMockCallLog.push(name);
}

class MockAnamClient {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private stream: MediaStream | null = null;
  private stopped = false;

  addListener(event: string, callback: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  removeListener(event: string, callback: Listener): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: unknown[]): void {
    if (this.stopped) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridging a heterogeneous listener map
    this.listeners.get(event)?.forEach((cb) => (cb as any)(...args));
  }

  private schedule(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      if (this.stopped) return;
      fn();
    }, ms);
    this.timers.push(id);
  }

  async streamToVideoElement(videoElementId: string): Promise<void> {
    logCall('streamToVideoElement');
    // A real browser call. Playwright grants it via
    // --use-fake-device-for-media-stream, or a test can stub
    // navigator.mediaDevices.getUserMedia to reject (permission denied).
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = stream;
    if (typeof window !== 'undefined') window.__anamMockLocalStream = stream;

    const videoEl = document.getElementById(videoElementId) as HTMLVideoElement | null;
    if (videoEl) videoEl.srcObject = stream;

    await delay(STREAM_ATTACH_DELAY_MS);
    if (this.stopped) return;

    this.runScript();
  }

  private runScript(): void {
    this.schedule(SESSION_READY_DELAY_MS, () => {
      this.emit(AnamEvent.SESSION_READY, 'mock-session-id');

      const messages: MockMessage[] = [];

      this.schedule(GREETING_DELAY_MS, () => {
        messages.push({
          role: 'persona',
          content: "Hi, I'm your interviewer today. We'll go through a few questions.",
        });
        this.emit(AnamEvent.MESSAGE_HISTORY_UPDATED, messages.slice());
      });

      this.schedule(GREETING_DELAY_MS + QUESTION_ONE_DELAY_MS, () => {
        messages.push({
          role: 'persona',
          content: 'Question one. Tell me about a time you owned a project end to end.',
        });
        this.emit(AnamEvent.MESSAGE_HISTORY_UPDATED, messages.slice());
      });

      this.schedule(GREETING_DELAY_MS + QUESTION_ONE_DELAY_MS + CANDIDATE_TURN_DELAY_MS, () => {
        messages.push({
          role: 'user',
          content: 'Sure — last year I led the migration of our billing service end to end.',
        });
        this.emit(AnamEvent.MESSAGE_HISTORY_UPDATED, messages.slice());
      });

      this.schedule(
        GREETING_DELAY_MS + QUESTION_ONE_DELAY_MS + CANDIDATE_TURN_DELAY_MS + PROBE_DELAY_MS,
        () => {
          messages.push({ role: 'persona', content: 'What was the outcome for the team?' });
          this.emit(AnamEvent.MESSAGE_HISTORY_UPDATED, messages.slice());
        },
      );
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- matches the real SDK's async signature
  async stopStreaming(): Promise<void> {
    logCall('stopStreaming');
    this.stopped = true;
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.length = 0;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
  }
}

export function createClient(_sessionToken: string): MockAnamClient {
  return new MockAnamClient();
}
