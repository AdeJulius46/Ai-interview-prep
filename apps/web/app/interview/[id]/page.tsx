// Live room (server shell). Phase 6 builds the real client experience
// (live-room.tsx, the Anam SDK, timer, transcript) — see frontend.md,
// "Screens > 2. Live room (/interview/[id])". Phase 5 only needs the route
// to resolve so the setup screen's `router.push('/interview/<id>')` lands
// somewhere real, hence the minimal placeholder that renders the id.
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-12">
      <p className="text-sm text-ink-muted">Interview id</p>
      <p className="text-lg font-semibold text-ink">{id}</p>
      <p className="mt-4 text-sm text-ink-faint">
        The live room arrives in a later phase.
      </p>
    </main>
  );
}
