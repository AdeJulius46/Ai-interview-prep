import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite';
import { TranscriptList } from './TranscriptList';
import { transcriptListFixtures } from './TranscriptList.fixtures';

runFixtureSuite('TranscriptList', TranscriptList, transcriptListFixtures);

describe('TranscriptList', () => {
  it('falls back to the empty state when lines is empty', () => {
    render(<TranscriptList lines={[]} emptyMessage="Transcript will appear here." />);
    expect(screen.getByText('Transcript will appear here.')).toBeInTheDocument();
  });

  it('renders an aria-live polite region with speaker labels', () => {
    render(
      <TranscriptList
        emptyMessage="Transcript will appear here."
        lines={[
          {
            speaker: 'INTERVIEWER',
            content: 'Question one.',
            spokenAt: '2026-08-26T10:00:00.000Z',
            sequence: 0,
          },
          {
            speaker: 'CANDIDATE',
            content: 'My answer.',
            spokenAt: '2026-08-26T10:00:05.000Z',
            sequence: 1,
          },
        ]}
      />,
    );
    const region = screen.getByRole('log');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Interviewer')).toBeInTheDocument();
    expect(screen.getByText('Candidate')).toBeInTheDocument();
    expect(screen.getByText('Question one.')).toBeInTheDocument();
    expect(screen.getByText('My answer.')).toBeInTheDocument();
  });
});
