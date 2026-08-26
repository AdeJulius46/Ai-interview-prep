'use client';

// Live room. See frontend.md, "Screens > 2. Live room (/interview/[id])",
// and its visual specification — this is the screen in the supplied
// screenshot. All state lives in `useAnamSession`; this component is purely
// presentational wiring on top of it and the `app/ui` primitives.
import {
  Button,
  Card,
  Eyebrow,
  MetaStrip,
  Pill,
  StatusDot,
  TranscriptList,
  VideoStage,
  type Status,
} from '../../ui';
import {
  useAnamSession,
  VIDEO_ELEMENT_ID,
  WARNING_THRESHOLD_SECS,
  type SessionState,
} from './use-anam-session';

// Question count and interviewer name are not sourced from real data here:
// there is no GET /interviews/:id endpoint yet (out of Phase 6 scope, and
// apps/api is not this phase's to change — see README.md's build order).
// `3` mirrors CreateInterviewInputSchema's default question count and
// `John` mirrors the Prisma `Interview.interviewerName` default
// (backend.md). Neither is asserted on by gate:6. A future GET endpoint
// should replace both with the real per-interview values.
const DEFAULT_QUESTION_COUNT = 3;
const DEFAULT_INTERVIEWER_NAME = 'John';
const DEFAULT_TIME_LIMIT_SECS = 180;

const STATUS_LABEL: Record<SessionState, string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  live: 'Live',
  ending: 'Ending',
  ended: 'Ended',
  error: 'Error',
};

const STATUS_TONE: Record<SessionState, Status> = {
  idle: 'ready',
  connecting: 'connecting',
  live: 'live',
  ending: 'ended',
  ended: 'ended',
  error: 'error',
};

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface LiveRoomProps {
  interviewId: string;
}

export default function LiveRoom({ interviewId }: LiveRoomProps) {
  const {
    state,
    error,
    secondsRemaining,
    transcript,
    questionsAnswered,
    timeLimitSecs,
    start,
    skipQuestion,
    end,
  } = useAnamSession(interviewId);

  // Button availability by state — frontend.md's control-availability
  // table, verbatim. Never let Start be clickable twice.
  const isIdle = state === 'idle';
  const isConnecting = state === 'connecting';
  const isLive = state === 'live';
  const canSkip = isLive;
  const canEnd = isConnecting || isLive;
  const isWarning = secondsRemaining !== null && secondsRemaining <= WARNING_THRESHOLD_SECS;

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Live room</Eyebrow>
          <h1 className="mt-2 text-[36px] font-bold tracking-[-0.02em] text-ink">
            Mock Interview Coach
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-[1.55] text-ink-muted">
            Practise concise STAR answers with a live interviewer. Nothing streams until you
            start.
          </p>
        </div>
        <StatusDot status={STATUS_TONE[state]} label={STATUS_LABEL[state]} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.9fr_1fr]">
        <Card>
          <Card.Header
            eyebrow="Live room"
            title="Interview stage"
            aside={<Pill>3 minute sessions</Pill>}
          />

          <VideoStage id={VIDEO_ELEMENT_ID} state={state} aria-label="Interviewer video stream" />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={!isIdle}
              loading={isConnecting}
              loadingLabel="Connecting..."
              onClick={() => void start()}
            >
              Start interview
            </Button>
            <Button variant="secondary" disabled={!canSkip} onClick={skipQuestion}>
              Skip question
            </Button>
            <Button variant="secondary" disabled={!canEnd} onClick={() => void end('user')}>
              End interview
            </Button>

            <div
              role="status"
              aria-live="polite"
              className="flex min-h-11 flex-1 items-center rounded-control bg-canvas px-4 text-sm"
            >
              {error ? (
                <span className={state === 'error' ? 'font-medium text-warn' : 'text-ink-muted'}>
                  {error}
                </span>
              ) : (
                <span className="text-ink-muted">
                  <span className="font-semibold text-ink">
                    {questionsAnswered} of {DEFAULT_QUESTION_COUNT}
                  </span>{' '}
                  questions answered
                  {secondsRemaining !== null ? (
                    <span
                      className={
                        isWarning
                          ? 'ml-3 font-semibold tabular-nums text-warn'
                          : 'ml-3 tabular-nums text-ink-muted'
                      }
                    >
                      {formatSeconds(secondsRemaining)} remaining
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          </div>

          <MetaStrip
            className="mt-4"
            items={[
              { label: 'Interviewer', value: DEFAULT_INTERVIEWER_NAME },
              { label: 'Questions', value: String(DEFAULT_QUESTION_COUNT) },
              {
                label: 'Time limit',
                value: `${timeLimitSecs ?? DEFAULT_TIME_LIMIT_SECS}s`,
              },
            ]}
          />
        </Card>

        <Card>
          <Card.Header eyebrow="Capture" title="Live transcript" />
          <p className="mb-3 text-sm text-ink-muted">
            Captured from the interviewer and your answers.
          </p>
          <TranscriptList lines={transcript} emptyMessage="Transcript will appear here." />
        </Card>
      </div>
    </main>
  );
}
