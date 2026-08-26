import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './lib/cx.js';

export interface PillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warn';
}

const TONE_CLASSES: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'border-line bg-canvas text-ink-muted',
  accent: 'border-accent-soft bg-accent-soft text-ink',
  warn: 'border-warn bg-surface text-warn',
};

/** Small rounded label. See shared.md Part B, `<Pill>`. Used for "3 minute sessions". */
export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { children, tone = 'neutral', className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
});
