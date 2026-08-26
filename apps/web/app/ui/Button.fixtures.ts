import type { Fixture } from './test-utils/fixture';
import type { ButtonProps } from './Button';

export const buttonFixtures: Fixture<ButtonProps>[] = [
  { name: 'primary', props: { variant: 'primary', children: 'Start interview' } },
  {
    name: 'primary-disabled',
    props: { variant: 'primary', disabled: true, children: 'Start interview' },
  },
  {
    name: 'primary-loading',
    props: {
      variant: 'primary',
      loading: true,
      loadingLabel: 'Connecting...',
      children: 'Start interview',
    },
  },
  { name: 'secondary', props: { variant: 'secondary', children: 'Skip question' } },
  {
    name: 'secondary-disabled',
    props: { variant: 'secondary', disabled: true, children: 'Skip question' },
  },
];
