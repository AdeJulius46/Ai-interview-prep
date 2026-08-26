import type { Fixture } from './test-utils/fixture';
import type { TranscriptListProps } from './TranscriptList';

export const transcriptListFixtures: Fixture<TranscriptListProps>[] = [
  {
    name: 'empty',
    props: { lines: [], emptyMessage: 'Transcript will appear here.' },
  },
  {
    name: 'with-lines',
    props: {
      emptyMessage: 'Transcript will appear here.',
      lines: [
        {
          speaker: 'INTERVIEWER',
          content: 'Tell me about a time you owned a project end to end.',
          spokenAt: '2026-08-26T10:00:00.000Z',
          sequence: 0,
        },
        {
          speaker: 'CANDIDATE',
          content: 'Sure, at my last job I led the migration of our billing system.',
          spokenAt: '2026-08-26T10:00:05.000Z',
          sequence: 1,
        },
      ],
    },
  },
];
