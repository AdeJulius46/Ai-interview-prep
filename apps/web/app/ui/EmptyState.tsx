import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './lib/cx';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  minHeight?: number | string;
}

/** Dashed-border placeholder. See shared.md Part B, `<EmptyState>`. */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { children, minHeight = 120, className, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        'flex items-center justify-center rounded-control border border-dashed border-line px-4 text-center text-sm text-ink-faint',
        className,
      )}
      style={{ minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});
