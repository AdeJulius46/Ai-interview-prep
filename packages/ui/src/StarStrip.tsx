import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from './lib/cx.js';

export interface StarStripProps extends HTMLAttributes<HTMLDivElement> {
  hasSituation: boolean;
  hasTask: boolean;
  hasAction: boolean;
  hasResult: boolean;
}

interface Cell {
  letter: 'S' | 'T' | 'A' | 'R';
  word: 'Situation' | 'Task' | 'Action' | 'Result';
  present: boolean;
}

/**
 * Four cells labelled S / T / A / R, each present or missing. Missing
 * cells carry the visual weight, per frontend.md's feedback screen: "the
 * missing element is the instruction." Present/missing is never encoded by
 * colour alone — each cell also gets a distinct accessible name ("Result:
 * missing") and a distinct glyph (a filled dot for present, an empty ring
 * plus a strikethrough letter for missing) so it survives colourblindness
 * and greyscale. See shared.md Part B, `<StarStrip>`, and gate:4.
 */
export const StarStrip = forwardRef<HTMLDivElement, StarStripProps>(function StarStrip(
  { hasSituation, hasTask, hasAction, hasResult, className, ...rest },
  ref,
) {
  const cells: Cell[] = [
    { letter: 'S', word: 'Situation', present: hasSituation },
    { letter: 'T', word: 'Task', present: hasTask },
    { letter: 'A', word: 'Action', present: hasAction },
    { letter: 'R', word: 'Result', present: hasResult },
  ];

  return (
    <div
      ref={ref}
      className={cx('flex divide-x divide-line overflow-hidden rounded-control border border-line', className)}
      {...rest}
    >
      {cells.map((cell) => (
        <div
          key={cell.letter}
          className={cx(
            'flex flex-1 flex-col items-center gap-1 px-3 py-3',
            cell.present ? 'bg-surface' : 'bg-canvas',
          )}
        >
          <span
            role="img"
            aria-label={`${cell.word}: ${cell.present ? 'present' : 'missing'}`}
            className={cx(
              'flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold',
              cell.present
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-transparent text-ink-faint line-through decoration-2',
            )}
          >
            {cell.letter}
          </span>
        </div>
      ))}
    </div>
  );
});
