import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from './lib/cx.js';
import { Eyebrow } from './Eyebrow.js';

export interface MetaStripItem {
  label: string;
  value: string;
}

export interface MetaStripProps extends HTMLAttributes<HTMLDivElement> {
  items: MetaStripItem[];
}

/**
 * Equal cells separated by 1px dividers, values in tabular-nums. See
 * shared.md Part B, `<MetaStrip>`.
 */
export const MetaStrip = forwardRef<HTMLDivElement, MetaStripProps>(function MetaStrip(
  { items, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        'flex divide-x divide-line overflow-hidden rounded-control border border-line',
        className,
      )}
      {...rest}
    >
      {items.map((item) => (
        <div key={item.label} className="flex-1 px-4 py-3 text-center">
          <Eyebrow tone="faint">{item.label}</Eyebrow>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{item.value}</p>
        </div>
      ))}
    </div>
  );
});
