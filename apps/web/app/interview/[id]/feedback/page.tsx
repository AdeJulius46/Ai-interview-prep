'use client';

// Generates on arrival rather than waiting for a button press (frontend.md,
// "Screens > 3. Feedback"). POST /feedback is idempotent server-side, so
// this is safe to call every time the screen is visited, including a
// refresh after the report already exists.
import { useEffect, useState } from 'react';
import { use } from 'react';
import type { FeedbackDto } from '@coach/contracts';
import { generateFeedback } from '../../../api-client';
import { Eyebrow } from '../../../ui';
import { FeedbackView } from './FeedbackView';

const ERROR_MESSAGE = 'Could not generate your report. Try again.';

export default function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [feedback, setFeedback] = useState<FeedbackDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFeedback(null);
    setError(null);

    generateFeedback(id)
      .then((result) => {
        if (!cancelled) setFeedback(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : ERROR_MESSAGE;
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-[1120px] px-6 py-12">
        <Eyebrow tone="faint">Behavioural interview practice</Eyebrow>
        <p role="alert" className="mt-4 text-sm font-medium text-warn">
          {error}
        </p>
      </main>
    );
  }

  if (!feedback) {
    return (
      <main className="mx-auto max-w-[1120px] px-6 py-12">
        <Eyebrow>Behavioural interview practice</Eyebrow>
        <h1 className="mt-2 text-[36px] font-bold tracking-[-0.02em] text-ink">
          Scoring your answers
        </h1>
        <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-muted">
          This can take a minute.
        </p>
      </main>
    );
  }

  return <FeedbackView feedback={feedback} />;
}
