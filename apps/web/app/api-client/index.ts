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
  FeedbackDto,
  ProgressDto,
  ApiErrorCode,
  ApiErrorBody,
} from '@coach/contracts';

import {
  ApiErrorBodySchema,
  InterviewDtoSchema,
  SessionTokenResponseSchema,
  type ApiErrorBody,
  type CreateInterviewInput,
  type InterviewDto,
  type SessionTokenResponse,
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
