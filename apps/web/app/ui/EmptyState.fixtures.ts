import type { Fixture } from './test-utils/fixture';
import type { EmptyStateProps } from './EmptyState';

export const emptyStateFixtures: Fixture<EmptyStateProps>[] = [
  { name: 'default', props: { children: 'Transcript will appear here.' } },
  {
    name: 'custom-min-height',
    props: { children: 'Transcript will appear here.', minHeight: 200 },
  },
];
