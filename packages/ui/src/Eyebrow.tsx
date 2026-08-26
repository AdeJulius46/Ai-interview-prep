import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './lib/cx.js';

export interface EyebrowProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactNode;
  /** `accent` for section eyebrows, `faint` for meta-strip cell labels. Defaults to `accent`. */
  tone?: 'accent' | 'faint';
}

/**
 * Uppercase micro-label. See shared.md Part B, `<Eyebrow>`: 11px, weight 600,
 * letter-spacing 0.08em, `--accent` or `--ink-faint`.
 */
export const Eyebrow = forwardRef<HTMLSpanElement, EyebrowProps>(function Eyebrow(
  { children, tone = 'accent', className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(
        'text-[11px] font-semibold uppercase tracking-[0.08em]',
        tone === 'faint' ? 'text-ink-faint' : 'text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
});
