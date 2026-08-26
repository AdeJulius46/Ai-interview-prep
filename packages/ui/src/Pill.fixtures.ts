import type { Fixture } from './test-utils/fixture.js';
import type { PillProps } from './Pill.js';

export const pillFixtures: Fixture<PillProps>[] = [
  { name: 'neutral', props: { children: '3 minute sessions', tone: 'neutral' } },
  { name: 'accent', props: { children: 'Live', tone: 'accent' } },
  { name: 'warn', props: { children: 'Time low', tone: 'warn' } },
  { name: 'default-tone', props: { children: '3 minute sessions' } },
];
