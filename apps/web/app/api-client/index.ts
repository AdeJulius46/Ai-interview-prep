// Wraps fetch and parses every response through the matching @coach/contracts
// schema before returning, so the API changing shape fails loudly at this
// boundary rather than producing `undefined` three components deep. See
// shared.md, "Using it in Next.js".
//
// Phase 1 wired the dependency and re-exported the contract types the rest
// of the app uses. Phase 5 adds the first concrete endpoint call,
// `createInterview`, used by the setup screen (`app/page.tsx`). The rest
// (getInterview, session-token, ...) land in the phases that need them.
export type {
  Competency,
  Seniority,
  InterviewStatus,
  Speaker,
  CreateInterviewInput,
  InterviewDto,
  InterviewSummaryDto,
  SessionTokenResponse,
  TranscriptLine,
  AppendMessagesResult,
  FeedbackDto,
  ProgressDto,
  HistoryPageDto,
  ApiErrorCode,
  ApiErrorBody,
} from '@coach/contracts';

import {
  ApiErrorBodySchema,
  AppendMessagesResultSchema,
  HistoryPageDtoSchema,
  InterviewDtoSchema,
  ProgressDtoSchema,
  SessionTokenResponseSchema,
  type ApiErrorBody,
  type AppendMessagesResult,
  type CreateInterviewInput,
  type HistoryPageDto,
  type InterviewDto,
  type ProgressDto,
  type SessionTokenResponse,
  type TranscriptLine,
} from '@coach/contracts';

export { ApiErrorBodySchema };

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8080';

/**
 * Parses a non-2xx response into the shared ApiErrorBody shape. Falls back
 * to a generic, still on-contract body when the server's response itself
 * doesn't parse, so callers never have to handle a third, unshaped case.
 */
export async function toApiError(res: Response): Promise<ApiErrorBody> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = ApiErrorBodySchema.safeParse(body);
  if (parsed.success) return parsed.data;
  return {
    statusCode: res.status,
    error: 'ScoringFailed',
    message: 'Something went wrong. Try again.',
  };
}

/**
 * POSTs a new interview setup and parses the response through
 * `InterviewDtoSchema`. Non-2xx responses throw the parsed `ApiErrorBody`
 * (via `toApiError`) rather than a generic Error, so callers (the setup
 * screen) can render the server's own message. See shared.md, "Using it in
 * Next.js", and frontend.md, "Screens > 1. Setup".
 */
export async function createInterview(input: CreateInterviewInput): Promise<InterviewDto> {
  const res = await fetch(`${API_BASE}/api/interviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toApiError(res);
  return InterviewDtoSchema.parse(await res.json());
}

/**
 * POSTs to `/interviews/:id/session-token` and parses the response through
 * `SessionTokenResponseSchema` — `{ sessionToken, timeLimitSecs, expiresAt }`
 * only, never `avatarId`/`voiceId`/`llmId`/`systemPrompt` (see
 * architecture.md, "The key never crosses arrow 6"). Non-2xx responses throw
 * the parsed `ApiErrorBody` via `toApiError`, e.g. 409
 * `InterviewAlreadyStarted` or 502 `AnamUnavailable`, so `useAnamSession` can
 * surface the server's own message. See frontend.md, "`useAnamSession` hook
 * > start()".
 */
export async function startSession(interviewId: string): Promise<SessionTokenResponse> {
  const res = await fetch(`${API_BASE}/api/interviews/${interviewId}/session-token`, {
    method: 'POST',
  });
  if (!res.ok) throw await toApiError(res);
  return SessionTokenResponseSchema.parse(await res.json());
}

/**
 * Flushes a batch of transcript lines to `/interviews/:id/messages`. See
 * frontend.md, "Transcript buffering": callers send
 * `snapshot.slice(lastFlushedIndex)`, never the whole history, and the
 * server dedupes/upserts on `(interviewId, sequence)` so a retried flush of
 * an already-stored range is harmless.
 */
export async function appendMessages(
  interviewId: string,
  messages: TranscriptLine[],
): Promise<AppendMessagesResult> {
  const res = await fetch(`${API_BASE}/api/interviews/${interviewId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw await toApiError(res);
  return AppendMessagesResultSchema.parse(await res.json());
}

/**
 * POSTs `/interviews/:id/complete` once the session has ended. Uses
 * `navigator.sendBeacon` when available and `useBeacon` is set (the
 * `beforeunload`/`pagehide` path, where a normal `fetch` would be
 * cancelled — frontend.md, "Teardown"); otherwise a normal `fetch`, so the
 * caller can await the response and know reconciliation has run.
 */
export async function completeInterview(
  interviewId: string,
  options?: { useBeacon?: boolean },
): Promise<InterviewDto | null> {
  const url = `${API_BASE}/api/interviews/${interviewId}/complete`;
  if (options?.useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([], { type: 'application/json' }));
    return null;
  }
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw await toApiError(res);
  return InterviewDtoSchema.parse(await res.json());
}

/**
 * GETs a page of `/interviews` (newest first) for the history screen. See
 * backend.md, "History list" — `nextCursor` is `null` once there is no
 * further page.
 */
export async function getHistory(options?: {
  limit?: number;
  cursor?: string;
}): Promise<HistoryPageDto> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const query = params.toString();
  const res = await fetch(`${API_BASE}/api/interviews${query ? `?${query}` : ''}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw await toApiError(res);
  return HistoryPageDtoSchema.parse(await res.json());
}

/**
 * GETs `/progress`: the score trend and STAR coverage across every SCORED
 * session. See backend.md, "GET /progress".
 */
export async function getProgress(): Promise<ProgressDto> {
  const res = await fetch(`${API_BASE}/api/progress`, { cache: 'no-store' });
  if (!res.ok) throw await toApiError(res);
  return ProgressDtoSchema.parse(await res.json());
}
