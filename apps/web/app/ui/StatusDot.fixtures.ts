import type { Fixture } from './test-utils/fixture';
import type { StatusDotProps } from './StatusDot';

export const statusDotFixtures: Fixture<StatusDotProps>[] = [
  { name: 'ready', props: { status: 'ready', label: 'Ready' } },
  { name: 'connecting', props: { status: 'connecting', label: 'Connecting' } },
  { name: 'live', props: { status: 'live', label: 'Live' } },
  { name: 'error', props: { status: 'error', label: 'Error' } },
  { name: 'ended', props: { status: 'ended', label: 'Ended' } },
];
