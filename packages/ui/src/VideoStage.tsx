import { forwardRef, type VideoHTMLAttributes } from 'react';
import { cx } from './lib/cx.js';

export type VideoStageState = 'idle' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';

export interface VideoStageProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'autoPlay' | 'playsInline' | 'muted'> {
  id?: string;
  state: VideoStageState;
  'aria-label': string;
}

/**
 * Wraps the `<video>` element with the attributes a consumer cannot get
 * wrong: `autoPlay`, `playsInline`, `muted={false}`, a black background so
 * the pre-connect state is a deliberate black frame, and a fixed 16/10
 * aspect ratio. Forwards its ref so `useAnamSession` can target it directly.
 * See shared.md Part B, `<VideoStage>`, and README.md's autoplay-policy /
 * mobile-Safari `playsInline` note.
 */
export const VideoStage = forwardRef<HTMLVideoElement, VideoStageProps>(function VideoStage(
  { id, state, className, ...rest },
  ref,
) {
  return (
    <div
      data-state={state}
      className={cx(
        'aspect-[16/10] overflow-hidden rounded-control border border-line bg-black',
        className,
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live avatar stream, no captions track exists */}
      <video
        ref={ref}
        id={id}
        autoPlay
        playsInline
        muted={false}
        className="h-full w-full object-cover"
        {...rest}
      />
    </div>
  );
});
