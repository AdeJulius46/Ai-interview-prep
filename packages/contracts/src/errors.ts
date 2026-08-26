import { z } from 'zod';

// Error codes the frontend branches on. See backend.md, "Error handling".
export const ApiErrorCodeSchema = z.enum([
  'InterviewNotFound',
  'InterviewAlreadyStarted',
  'InterviewNotCompleted',
  'TranscriptTooShort',
  'AnamUnavailable',
  'ScoringFailed',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  statusCode: z.number().int(),
  error: ApiErrorCodeSchema,
  message: z.string().min(1),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
