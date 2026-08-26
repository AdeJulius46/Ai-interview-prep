import type { Fixture } from './test-utils/fixture.js';
import type { VideoStageProps } from './VideoStage.js';

export const videoStageFixtures: Fixture<VideoStageProps>[] = [
  { name: 'idle', props: { id: 'anam-video', state: 'idle', 'aria-label': 'Interview stage' } },
  {
    name: 'connecting',
    props: { id: 'anam-video', state: 'connecting', 'aria-label': 'Interview stage' },
  },
  { name: 'live', props: { id: 'anam-video', state: 'live', 'aria-label': 'Interview stage' } },
  { name: 'error', props: { id: 'anam-video', state: 'error', 'aria-label': 'Interview stage' } },
];
