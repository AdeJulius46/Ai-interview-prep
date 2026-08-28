// Presentational History screen. Takes both API responses as props (no
// fetching of its own — see shared.md's "Component rules": "No useEffect
// that fetches"), so it's directly unit-testable. See frontend.md,
// "Screens > 4. History": "A list of past sessions ... and a score trend
// across sessions. Also render starCoverage: a four-bar view ... That is
// the screen's actual payload."
import type { HistoryPageDto, ProgressDto } from '@coach/contracts';
import { COMPETENCY_LABELS, SENIORITY_LABELS } from '@coach/contracts';
import { Card, EmptyState, Eyebrow, ScoreBadge } from '../ui';

export interface HistoryViewProps {
  page: HistoryPageDto;
  progress: ProgressDto;
}

const STAR_LABELS: { key: keyof ProgressDto['starCoverage']; label: string }[] = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '0.0';
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function HistoryView({ page, progress }: HistoryViewProps) {
  const { trend, starCoverage } = progress;

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>Behavioural interview practice</Eyebrow>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-ink sm:text-[36px]">History</h1>
      <p className="mt-2 max-w-prose text-sm leading-[1.55] text-ink-muted">
        Past sessions and how your STAR answers have progressed.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <Card.Header eyebrow="Trend" title="Score over time" />
          {trend.sessionCount === 0 ? (
            <EmptyState>No sessions yet.</EmptyState>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-ink-faint">First</p>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {trend.first.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-ink-faint">Latest</p>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {trend.latest.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-ink-faint">Change</p>
                <p
                  className={
                    trend.delta >= 0
                      ? 'text-2xl font-semibold tabular-nums text-accent'
                      : 'text-2xl font-semibold tabular-nums text-warn'
                  }
                >
                  {formatDelta(trend.delta)}
                </p>
              </div>
              <p className="text-xs text-ink-faint sm:ml-auto">
                {trend.sessionCount} session{trend.sessionCount === 1 ? '' : 's'}
              </p>
            </div>
          )}
        </Card>

        <Card>
          <Card.Header eyebrow="Coverage" title="STAR coverage" />
          <ul className="flex flex-col gap-3">
            {STAR_LABELS.map(({ key, label }) => {
              const fraction = starCoverage[key];
              const percent = Math.round(fraction * 100);
              return (
                <li key={key} className="flex items-center gap-3">
                  <span className="w-20 text-sm text-ink-muted">{label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="w-12 text-right text-sm tabular-nums text-ink">{percent}%</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <Card.Header eyebrow="Sessions" title="Past sessions" />
        {page.items.length === 0 ? (
          <EmptyState>No sessions yet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {page.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-ink">{item.role}</h3>
                  <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-ink-muted">
                    <span>{formatDate(item.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{SENIORITY_LABELS[item.seniority]}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-faint">
                    {item.competencies.map((c) => (
                      <span key={c}>{COMPETENCY_LABELS[c]}</span>
                    ))}
                  </p>
                </div>
                {item.overallScore !== null ? (
                  <ScoreBadge score={item.overallScore} />
                ) : (
                  <span className="text-xs text-ink-faint">Not scored</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
