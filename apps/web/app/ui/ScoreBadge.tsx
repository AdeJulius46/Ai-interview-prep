import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from './lib/cx';

export interface ScoreBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  score: number;
  max?: number;
}

/** Tabular-numeral score readout, e.g. "4 / 5". See shared.md Part B, `<ScoreBadge>`. */
export const ScoreBadge = forwardRef<HTMLSpanElement, ScoreBadgeProps>(function ScoreBadge(
  { score, max = 5, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(
        'inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 text-sm font-semibold tabular-nums text-ink',
        className,
      )}
      {...rest}
    >
      <span>{score}</span>
      <span className="text-ink-faint">/ {max}</span>
    </span>
  );
});
