// Server shell: fetches both API responses, hands them to the
// presentational <HistoryView>. See frontend.md, "Route structure" —
// server components fetch data, only interactive screens need to be
// client components, and this screen has no interactivity of its own.
import { getHistory, getProgress } from '../api-client';
import { HistoryView } from './HistoryView';

export default async function HistoryPage() {
  const [page, progress] = await Promise.all([getHistory(), getProgress()]);

  return <HistoryView page={page} progress={progress} />;
}
