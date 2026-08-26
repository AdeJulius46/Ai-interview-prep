import type { Fixture } from './test-utils/fixture.js';
import type { EyebrowProps } from './Eyebrow.js';

export const eyebrowFixtures: Fixture<EyebrowProps>[] = [
  { name: 'accent', props: { children: 'LIVE ROOM', tone: 'accent' } },
  { name: 'faint', props: { children: 'INTERVIEWER', tone: 'faint' } },
  { name: 'default-tone', props: { children: 'CAPTURE' } },
];
