// The minimal shape `live-room.tsx` programs against. Both the real
// `@anam-ai/js-sdk` (dynamically imported inside the start handler, per
// frontend.md's "critical integration rule") and `app/testing/anam-mock.ts`
// (loaded instead when `window.__ANAM_MOCK__` is set, per testing.md)
// satisfy this interface, so swapping one for the other is a drop-in
// replacement rather than a special case in live-room.tsx.
//
// Event names match the real SDK's `AnamEvent` string enum values exactly
// (confirmed against the installed `@anam-ai/js-sdk` package: `SESSION_READY`,
// `MESSAGE_HISTORY_UPDATED`, `MESSAGE_STREAM_EVENT_RECEIVED`), so the mock
// reuses the same literal strings.

/** A line in an `AnamEvent.MESSAGE_HISTORY_UPDATED` snapshot. The real SDK's
 * `MessageRole` is `'user' | 'persona'`; treat anything that isn't `'user'`
 * as the interviewer so a future role rename doesn't silently misattribute
 * lines. */
export interface AnamMessage {
  role: string;
  content: string;
}

export interface AnamMessageStreamEvent {
  role: string;
  content: string;
  endOfSpeech: boolean;
}

export const AnamEventNames = {
  SESSION_READY: 'SESSION_READY',
  MESSAGE_HISTORY_UPDATED: 'MESSAGE_HISTORY_UPDATED',
  MESSAGE_STREAM_EVENT_RECEIVED: 'MESSAGE_STREAM_EVENT_RECEIVED',
} as const;

export interface AnamClientLike {
  addListener(event: string, callback: (...args: never[]) => void): void;
  removeListener?(event: string, callback: (...args: never[]) => void): void;
  streamToVideoElement(videoElementId: string): Promise<void>;
  stopStreaming(): Promise<void> | void;
}

export interface AnamModuleLike {
  createClient(sessionToken: string): AnamClientLike;
}

// `window.__ANAM_MOCK__` is set by a Playwright `addInitScript` (see
// testing.md) before the app's module loads. Declared here so both
// use-anam-session.ts and app/testing/anam-mock.ts see the same ambient
// type without either needing to import the other.
declare global {
  interface Window {
    __ANAM_MOCK__?: boolean;
  }
}
