import type { Fixture } from './test-utils/fixture.js';
import type { StarStripProps } from './StarStrip.js';

export const starStripFixtures: Fixture<StarStripProps>[] = [
  {
    name: 'all-present',
    props: { hasSituation: true, hasTask: true, hasAction: true, hasResult: true },
  },
  {
    name: 'all-missing',
    props: { hasSituation: false, hasTask: false, hasAction: false, hasResult: false },
  },
  {
    name: 'missing-action-and-result',
    props: { hasSituation: true, hasTask: true, hasAction: false, hasResult: false },
  },
];
