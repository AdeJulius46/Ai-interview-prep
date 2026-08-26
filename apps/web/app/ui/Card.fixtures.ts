import type { Fixture } from './test-utils/fixture';
import type { CardProps } from './Card';

export const cardFixtures: Fixture<CardProps>[] = [
  { name: 'basic', props: { children: 'Card body content' } },
  { name: 'with-classname', props: { children: 'Card body content', className: 'p-0' } },
];
