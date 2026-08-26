import { z } from 'zod';
import { CompetencySchema, InterviewStatusSchema, SenioritySchema } from './enums.js';

export const CreateInterviewInputSchema = z.object({
  role: z.string().trim().min(2).max(80),
  seniority: SenioritySchema,
  competencies: z.array(CompetencySchema).min(1).max(5),
  questionCount: z.number().int().min(1).max(5).default(3),
});
export type CreateInterviewInput = z.infer<typeof CreateInterviewInputSchema>;

export const InterviewDtoSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  seniority: SenioritySchema,
  competencies: z.array(CompetencySchema),
  questionCount: z.number().int(),
  timeLimitSecs: z.number().int(),
  interviewerName: z.string(),
  status: InterviewStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
});
export type InterviewDto = z.infer<typeof InterviewDtoSchema>;

export const InterviewSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  role: z.string(),
  seniority: SenioritySchema,
  competencies: z.array(CompetencySchema),
  status: InterviewStatusSchema,
  overallScore: z.number().nullable(),
});
export type InterviewSummaryDto = z.infer<typeof InterviewSummaryDtoSchema>;
