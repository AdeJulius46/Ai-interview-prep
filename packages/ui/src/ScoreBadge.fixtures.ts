import type { Fixture } from './test-utils/fixture.js';
import type { ScoreBadgeProps } from './ScoreBadge.js';

export const scoreBadgeFixtures: Fixture<ScoreBadgeProps>[] = [
  { name: 'mid-score', props: { score: 3 } },
  { name: 'max-score', props: { score: 5, max: 5 } },
  { name: 'low-score', props: { score: 1, max: 5 } },
  { name: 'custom-max', props: { score: 8, max: 10 } },
];
