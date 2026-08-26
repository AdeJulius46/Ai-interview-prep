'use client';

import { forwardRef, useEffect, useRef, type HTMLAttributes } from 'react';
import type { TranscriptLine } from '@coach/contracts';
import { cx } from './lib/cx';
import { EmptyState } from './EmptyState';

export interface TranscriptListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  lines: TranscriptLine[];
  emptyMessage: string;
}

const SPEAKER_LABEL: Record<TranscriptLine['speaker'], string> = {
  INTERVIEWER: 'Interviewer',
  CANDIDATE: 'Candidate',
};

const SPEAKER_CLASS: Record<TranscriptLine['speaker'], string> = {
  INTERVIEWER: 'text-accent',
  CANDIDATE: 'text-ink',
};

const NEAR_BOTTOM_PX = 24;

/**
 * `aria-live="polite"` transcript region with speaker labels and
 * auto-scroll-if-at-bottom. Falls back to `<EmptyState>` when `lines` is
 * empty. See shared.md Part B, `<TranscriptList>`.
 */
export const TranscriptList = forwardRef<HTMLDivElement, TranscriptListProps>(
  function TranscriptList({ lines, emptyMessage, className, ...rest }, forwardedRef) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const wasAtBottomRef = useRef(true);

    useEffect(() => {
      const el = scrollRef.current;
      if (!el || !wasAtBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    }, [lines]);

    const handleScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    };

    const setRefs = (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    if (lines.length === 0) {
      return (
        <div
          ref={setRefs}
          role="log"
          aria-live="polite"
          className={cx(className)}
          {...rest}
        >
          <EmptyState>{emptyMessage}</EmptyState>
        </div>
      );
    }

    return (
      <div
        ref={setRefs}
        role="log"
        aria-live="polite"
        onScroll={handleScroll}
        className={cx('max-h-80 space-y-3 overflow-y-auto', className)}
        {...rest}
      >
        {lines.map((line) => (
          <p key={line.sequence} className="text-sm leading-[1.55] text-ink-muted">
            <span className={cx('mr-2 font-semibold', SPEAKER_CLASS[line.speaker])}>
              {SPEAKER_LABEL[line.speaker]}
            </span>
            {line.content}
          </p>
        ))}
      </div>
    );
  },
);
