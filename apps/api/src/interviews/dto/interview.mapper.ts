import type { Interview } from '@prisma/client';
import type { InterviewDto } from '@coach/contracts';

// Serialises a Prisma Interview row to the wire shape in InterviewDtoSchema.
// Dates go to ISO strings here, once, so nothing downstream has to remember.
export function toInterviewDto(interview: Interview): InterviewDto {
  return {
    id: interview.id,
    role: interview.role,
    seniority: interview.seniority,
    competencies: interview.competencies,
    questionCount: interview.questionCount,
    timeLimitSecs: interview.timeLimitSecs,
    interviewerName: interview.interviewerName,
    status: interview.status,
    createdAt: interview.createdAt.toISOString(),
    startedAt: interview.startedAt ? interview.startedAt.toISOString() : null,
    endedAt: interview.endedAt ? interview.endedAt.toISOString() : null,
  };
}
