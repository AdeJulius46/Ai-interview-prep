'use client';

// Setup screen. See frontend.md, "Screens > 1. Setup (/)". Role (text),
// seniority (segmented control), competencies (multi-select chips, 1 to 5),
// question count (1 to 5, default 3). The value held in state and sent to
// the API is always the raw uppercase enum member — the label maps
// (`COMPETENCY_LABELS`, `SENIORITY_LABELS`) are for display only, never
// transformed on the way to the API.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  CompetencySchema,
  SenioritySchema,
  COMPETENCY_LABELS,
  SENIORITY_LABELS,
  type Competency,
  type Seniority,
} from '@coach/contracts';
import { Button, Card, Eyebrow, Pill } from './ui';
import { createInterview } from './api-client';

const COMPETENCIES = CompetencySchema.options;
const SENIORITIES = SenioritySchema.options;
const MAX_COMPETENCIES = 5;
const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 5;

function errorMessageFrom(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message;
  }
  return 'Something went wrong. Try again.';
}

export default function Home() {
  const router = useRouter();

  const [role, setRole] = useState('');
  const [seniority, setSeniority] = useState<Seniority>('MID');
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [questionCount, setQuestionCount] = useState(3);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = role.trim().length >= 2 && competencies.length >= 1 && !submitting;

  function toggleCompetency(value: Competency) {
    setCompetencies((current) => {
      if (current.includes(value)) {
        setLimitMessage(null);
        return current.filter((c) => c !== value);
      }
      if (current.length >= MAX_COMPETENCIES) {
        setLimitMessage(`You can select up to ${MAX_COMPETENCIES} competencies.`);
        return current;
      }
      setLimitMessage(null);
      return [...current, value];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const interview = await createInterview({
        role: role.trim(),
        seniority,
        competencies,
        questionCount,
      });
      router.push(`/interview/${interview.id}`);
    } catch (err) {
      setErrorMessage(errorMessageFrom(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>Behavioural interview practice</Eyebrow>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-ink sm:text-[36px]">
        Mock Interview Coach
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-[1.55] text-ink-muted">
        Practise concise STAR answers with a live interviewer. Set up a role, seniority,
        and the competencies you want to be probed on.
      </p>

      <Card className="mt-8">
        <Card.Header
          eyebrow="Setup"
          title="Start a session"
          aside={<Pill>Sessions run for 3 minutes.</Pill>}
        />

        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-sm font-medium text-ink">
              Role
            </label>
            <input
              id="role"
              name="role"
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Frontend Engineer"
              className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            />
          </div>

          <fieldset className="mt-6 border-0 p-0">
            <legend className="text-sm font-medium text-ink">Seniority</legend>
            <div className="mt-2 inline-flex flex-wrap gap-2 rounded-[10px] border border-line bg-canvas p-1">
              {SENIORITIES.map((value) => {
                const selected = seniority === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={selected ? 'primary' : 'secondary'}
                    aria-pressed={selected}
                    onClick={() => setSeniority(value)}
                    className={selected ? '' : 'border-transparent bg-transparent'}
                  >
                    {SENIORITY_LABELS[value]}
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-6 border-0 p-0">
            <legend className="text-sm font-medium text-ink">Competencies</legend>
            <p className="mt-1 text-xs text-ink-faint">
              Choose 1 to {MAX_COMPETENCIES}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COMPETENCIES.map((value) => {
                const selected = competencies.includes(value);
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={selected ? 'primary' : 'secondary'}
                    aria-pressed={selected}
                    onClick={() => toggleCompetency(value)}
                  >
                    {COMPETENCY_LABELS[value]}
                  </Button>
                );
              })}
            </div>
            <p role="status" aria-live="polite" className="mt-2 min-h-[1.2em] text-xs text-warn">
              {limitMessage}
            </p>
          </fieldset>

          <fieldset className="mt-2 border-0 p-0">
            <legend className="text-sm font-medium text-ink">Question count</legend>
            <div className="mt-2 inline-flex items-center gap-3 rounded-[10px] border border-line bg-canvas px-3 py-1.5">
              <Button
                type="button"
                variant="secondary"
                aria-label="Decrease question count"
                disabled={questionCount <= MIN_QUESTION_COUNT}
                onClick={() => setQuestionCount((q) => Math.max(MIN_QUESTION_COUNT, q - 1))}
                className="border-transparent bg-transparent px-2 py-1"
              >
                −
              </Button>
              <span aria-live="polite" className="w-4 text-center text-sm font-semibold tabular-nums text-ink">
                {questionCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                aria-label="Increase question count"
                disabled={questionCount >= MAX_QUESTION_COUNT}
                onClick={() => setQuestionCount((q) => Math.min(MAX_QUESTION_COUNT, q + 1))}
                className="border-transparent bg-transparent px-2 py-1"
              >
                +
              </Button>
            </div>
          </fieldset>

          {errorMessage ? (
            <p role="alert" className="mt-4 text-sm font-medium text-warn">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6">
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={submitting} loadingLabel="Starting...">
              Start setup
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
