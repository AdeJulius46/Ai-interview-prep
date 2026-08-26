import { z } from 'zod';

// Also earns its keep as the JSON shape description embedded in the scoring
// prompt, derived via zod-to-json-schema so the prompt cannot drift from the
// validator. See shared.md, "The scoring schema".
export const AnswerFeedbackSchema = z.object({
  questionIndex: z.number().int().min(0),
  question: z.string().min(1),
  answerSummary: z.string().min(1).max(400),
  hasSituation: z.boolean(),
  hasTask: z.boolean(),
  hasAction: z.boolean(),
  hasResult: z.boolean(),
  score: z.number().int().min(1).max(5),
  improvement: z.string().min(1).max(300),
});
export type AnswerFeedback = z.infer<typeof AnswerFeedbackSchema>;

// overallScore is deliberately absent. It is computed server side from
// `answers`, never asked of the model.
export const ScoringResultSchema = z.object({
  answers: z.array(AnswerFeedbackSchema).min(1),
  strengths: z.array(z.string().min(1)).min(2).max(4),
});
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

export const AnswerFeedbackDtoSchema = AnswerFeedbackSchema.extend({
  id: z.string().uuid(),
});
export type AnswerFeedbackDto = z.infer<typeof AnswerFeedbackDtoSchema>;

export const FeedbackDtoSchema = z.object({
  id: z.string().uuid(),
  interviewId: z.string().uuid(),
  createdAt: z.string().datetime(),
  overallScore: z.number(),
  strengths: z.array(z.string().min(1)).min(2).max(4),
  answers: z.array(AnswerFeedbackDtoSchema).min(1),
});
export type FeedbackDto = z.infer<typeof FeedbackDtoSchema>;
