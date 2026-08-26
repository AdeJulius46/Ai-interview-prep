import type { AnswerFeedback, Feedback } from '@prisma/client';
import type { FeedbackDto } from '@coach/contracts';

export function toFeedbackDto(feedback: Feedback & { answers: AnswerFeedback[] }): FeedbackDto {
  return {
    id: feedback.id,
    interviewId: feedback.interviewId,
    createdAt: feedback.createdAt.toISOString(),
    overallScore: feedback.overallScore,
    strengths: feedback.strengths,
    answers: feedback.answers
      .slice()
      .sort((a, b) => a.questionIndex - b.questionIndex)
      .map((answer) => ({
        id: answer.id,
        questionIndex: answer.questionIndex,
        question: answer.question,
        answerSummary: answer.answerSummary,
        hasSituation: answer.hasSituation,
        hasTask: answer.hasTask,
        hasAction: answer.hasAction,
        hasResult: answer.hasResult,
        score: answer.score,
        improvement: answer.improvement,
      })),
  };
}
