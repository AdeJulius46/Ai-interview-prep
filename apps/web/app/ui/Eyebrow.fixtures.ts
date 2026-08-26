import type { Fixture } from './test-utils/fixture';
import type { EyebrowProps } from './Eyebrow';

export const eyebrowFixtures: Fixture<EyebrowProps>[] = [
  { name: 'accent', props: { children: 'LIVE ROOM', tone: 'accent' } },
  { name: 'faint', props: { children: 'INTERVIEWER', tone: 'faint' } },
  { name: 'default-tone', props: { children: 'CAPTURE' } },
];
