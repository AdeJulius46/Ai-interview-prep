import { z } from 'zod';

const fraction = z.number().min(0).max(1);

export const StarCoverageSchema = z.object({
  situation: fraction,
  task: fraction,
  action: fraction,
  result: fraction,
});
export type StarCoverage = z.infer<typeof StarCoverageSchema>;

export const ProgressDtoSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string().uuid(),
      completedAt: z.string().datetime(),
      overallScore: z.number(),
      role: z.string(),
    }),
  ),
  trend: z.object({
    first: z.number(),
    latest: z.number(),
    delta: z.number(),
    sessionCount: z.number().int().nonnegative(),
  }),
  starCoverage: StarCoverageSchema,
});
export type ProgressDto = z.infer<typeof ProgressDtoSchema>;
