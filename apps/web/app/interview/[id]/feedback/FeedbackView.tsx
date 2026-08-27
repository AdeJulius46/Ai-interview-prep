// Presentational Feedback screen. See frontend.md, "Screens > 3.
// Feedback": per question, the question, the candidate's answer summary, a
// four-cell STAR strip, the 1-5 score, and one improvement sentence. Then
// overall strengths and the mean score. "Missing STAR elements are the
// visual emphasis, not the score."
import type { FeedbackDto } from '@coach/contracts';
import { Card, Eyebrow, ScoreBadge, StarStrip } from '../../../ui';

export interface FeedbackViewProps {
  feedback: FeedbackDto;
}

export function FeedbackView({ feedback }: FeedbackViewProps) {
  const answers = feedback.answers.slice().sort((a, b) => a.questionIndex - b.questionIndex);

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-12">
      <Eyebrow>Behavioural interview practice</Eyebrow>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-[36px] font-bold tracking-[-0.02em] text-ink">Your STAR report</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.08em] text-ink-faint">Overall</span>
          <ScoreBadge score={feedback.overallScore} />
        </div>
      </div>

      <Card className="mt-6">
        <Card.Header eyebrow="Strengths" title="What stood out" />
        <ul className="flex flex-wrap gap-2">
          {feedback.strengths.map((strength) => (
            <li
              key={strength}
              className="rounded-control border border-line bg-canvas px-3 py-1.5 text-sm text-ink"
            >
              {strength}
            </li>
          ))}
        </ul>
      </Card>

      <ul className="mt-5 flex flex-col gap-5">
        {answers.map((answer) => (
          <li key={answer.id}>
            <Card>
              <Card.Header
                eyebrow={`Question ${answer.questionIndex + 1}`}
                title={answer.question}
                aside={<ScoreBadge score={answer.score} />}
              />
              <p className="text-sm leading-[1.55] text-ink-muted">{answer.answerSummary}</p>

              <div className="mt-4">
                <StarStrip
                  hasSituation={answer.hasSituation}
                  hasTask={answer.hasTask}
                  hasAction={answer.hasAction}
                  hasResult={answer.hasResult}
                />
              </div>

              <p className="mt-4 text-sm font-medium text-ink">{answer.improvement}</p>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
