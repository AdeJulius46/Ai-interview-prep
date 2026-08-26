import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from './lib/cx.js';

export type Status = 'ready' | 'connecting' | 'live' | 'error' | 'ended';

export interface StatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: Status;
  label: string;
}

// frontend.md "Status pill": ready = accent dot "Ready", connecting = amber,
// live = accent with a slow pulse, error = warn, ended = faint. The token
// palette in shared.md has no dedicated amber, so `connecting` reuses the
// muted accent-soft tone (still a declared token, never a raw hex literal)
// and is distinguished from `ready`/`live` by its label and the absence of
// the pulse, rather than by colour alone.
const DOT_CLASSES: Record<Status, string> = {
  ready: 'bg-accent',
  connecting: 'bg-accent-soft',
  live: 'bg-accent',
  error: 'bg-warn',
  ended: 'bg-ink-faint',
};

/**
 * Dot plus label. Owns the pulse animation (via the `.ui-status-pulse` class
 * defined in tokens.css) and the `prefers-reduced-motion` guard, so no
 * consumer has to remember either. See shared.md Part B, `<StatusDot>`.
 */
export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(function StatusDot(
  { status, label, className, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx('inline-flex items-center gap-2', className)} {...rest}>
      <span
        aria-hidden="true"
        className={cx(
          'h-2 w-2 rounded-full',
          DOT_CLASSES[status],
          status === 'live' && 'ui-status-pulse',
        )}
      />
      <span className="text-sm font-medium text-ink">{label}</span>
    </span>
  );
});
