import type { Fixture } from './test-utils/fixture.js';
import type { MetaStripProps } from './MetaStrip.js';

export const metaStripFixtures: Fixture<MetaStripProps>[] = [
  {
    name: 'interview-meta',
    props: {
      items: [
        { label: 'Interviewer', value: 'John' },
        { label: 'Questions', value: '3' },
        { label: 'Time limit', value: '180s' },
      ],
    },
  },
  {
    name: 'two-items',
    props: {
      items: [
        { label: 'Score', value: '4' },
        { label: 'Max', value: '5' },
      ],
    },
  },
];
