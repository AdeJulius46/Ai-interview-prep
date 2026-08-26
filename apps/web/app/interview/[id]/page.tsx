// Live room (server shell). The Anam SDK touches `window`,
// `navigator.mediaDevices`, and DOM elements, so it — and all the session
// state built on top of it — lives in `live-room.tsx`, a client component.
// This file's only job is resolving the route param and handing it to
// `<LiveRoom>`. See frontend.md, "Route structure" and "The critical
// integration rule".
import LiveRoom from './live-room';

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // `key={id}` forces a full remount when navigating client-side between
  // two different interviews (App Router reuses a component instance
  // across dynamic-segment changes otherwise), so useAnamSession's refs
  // (transcript buffer, lastFlushedIndex, ...) never leak from one
  // interview's session into another's. See testing.md gate:7: "Two
  // interviews run in sequence produce two separate stored transcripts."
  return <LiveRoom key={id} interviewId={id} />;
}
