import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { cx } from './lib/cx.js';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'> {
  variant: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows `loadingLabel` (or `children` if none given) and sets aria-busy. */
  loading?: boolean;
  /** Text shown while `loading`. Falls back to `children` when omitted. */
  loadingLabel?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const VARIANT_CLASSES: Record<ButtonProps['variant'], string> = {
  primary: 'bg-accent text-white disabled:bg-accent-soft disabled:text-white',
  secondary: 'border border-line bg-surface text-ink disabled:text-ink-faint',
};

/**
 * See shared.md Part B, `<Button>`. Focus ring is `--color-accent` at a 2px
 * offset, minimum touch target is 44px. `disabled` (including the implicit
 * disabled state while `loading`) never fires `onClick` — gate:4 asserts
 * this directly.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, disabled = false, loading = false, loadingLabel, children, onClick, className, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (isDisabled) return;
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cx(
        'inline-flex min-h-11 items-center justify-center rounded-[8px] px-[18px] py-[10px] text-sm font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
});
