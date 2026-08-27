'use client';

// Fetches both API responses client-side and hands them to the
// presentational <HistoryView>. Originally a Server Component per
// frontend.md's general "server components fetch data" guidance, but that
// makes the request happen on the Next.js server process itself — outside
// the reach of any browser-network mock (Playwright's `page.route`, msw in
// the browser), which broke gate:10's full-path test the moment it tried
// to run this screen without a live apps/api instance. Converted to
// client-fetch-on-arrival, the same pattern the Feedback screen already
// uses, so it can be tested the same way as every other screen.
import { useEffect, useState } from 'react';
import type { HistoryPageDto, ProgressDto } from '@coach/contracts';
import { getHistory, getProgress } from '../api-client';
import { Eyebrow } from '../ui';
import { HistoryView } from './HistoryView';

const ERROR_MESSAGE = 'Could not load your history. Try again.';

export default function HistoryPage() {
  const [data, setData] = useState<{ page: HistoryPageDto; progress: ProgressDto } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getHistory(), getProgress()])
      .then(([page, progress]) => {
        if (!cancelled) setData({ page, progress });
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
  }, []);

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

  if (!data) {
    return (
      <main className="mx-auto max-w-[1120px] px-6 py-12">
        <Eyebrow>Behavioural interview practice</Eyebrow>
        <h1 className="mt-2 text-[36px] font-bold tracking-[-0.02em] text-ink">History</h1>
        <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-muted">
          Loading...
        </p>
      </main>
    );
  }

  return <HistoryView page={data.page} progress={data.progress} />;
}
