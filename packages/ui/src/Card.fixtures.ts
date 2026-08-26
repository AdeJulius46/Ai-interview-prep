import type { Fixture } from './test-utils/fixture.js';
import type { CardProps } from './Card.js';

export const cardFixtures: Fixture<CardProps>[] = [
  { name: 'basic', props: { children: 'Card body content' } },
  { name: 'with-classname', props: { children: 'Card body content', className: 'p-0' } },
];
