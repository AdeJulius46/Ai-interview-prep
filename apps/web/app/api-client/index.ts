// Wraps fetch and parses every response through the matching @coach/contracts
// schema before returning, so the API changing shape fails loudly at this
// boundary rather than producing `undefined` three components deep. See
// shared.md, "Using it in Next.js".
//
// Phase 1 only wires the dependency and re-exports the contract types the
// rest of the app will use. The concrete endpoint calls (getInterview,
// createInterview, ...) land in the phases that need them (2, 3, 5, 7-9).
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

import { ApiErrorBodySchema, type ApiErrorBody } from '@coach/contracts';

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
