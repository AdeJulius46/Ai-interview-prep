import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite';
import { VideoStage } from './VideoStage';
import { videoStageFixtures } from './VideoStage.fixtures';

runFixtureSuite('VideoStage', VideoStage, videoStageFixtures);

describe('VideoStage', () => {
  it('renders a video element with playsinline and autoplay present', () => {
    render(<VideoStage id="anam-video" state="idle" aria-label="Interview stage" />);
    const video = screen.getByLabelText('Interview stage');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('autoplay');
    expect((video as HTMLVideoElement).muted).toBe(false);
  });

  it('forwards a ref to the underlying video element', () => {
    const ref = createRef<HTMLVideoElement>();
    render(<VideoStage id="anam-video" state="idle" aria-label="Interview stage" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLVideoElement);
    expect(ref.current?.id).toBe('anam-video');
  });
});
