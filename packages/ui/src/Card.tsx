import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './lib/cx.js';
import { Eyebrow } from './Eyebrow.js';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  className?: string;
}

export interface CardHeaderProps {
  /** Optional eyebrow label, rendered through <Eyebrow>. */
  eyebrow?: string;
  title: string;
  /** Right-aligned slot, e.g. a <Pill>. */
  aside?: ReactNode;
  className?: string;
}

function CardHeaderComponent({ eyebrow, title, aside, className }: CardHeaderProps) {
  return (
    <div className={cx('mb-4 flex items-start justify-between gap-3', className)}>
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
CardHeaderComponent.displayName = 'Card.Header';

const CardBase = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        'rounded-card border border-line bg-surface p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

/**
 * Surface container. Composes with `<Card.Header>` for the eyebrow / title /
 * aside slot. See shared.md Part B, `<Card>`.
 */
export const Card = Object.assign(CardBase, { Header: CardHeaderComponent });
