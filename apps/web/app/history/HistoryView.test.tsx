// Component-level coverage for the History screen. See frontend.md,
// "Screens > 4. History", and testing.md, gate:9 ("pnpm --filter web test
// -- history").
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { HistoryPageDto, ProgressDto } from '@coach/contracts';
import { HistoryView } from './HistoryView';

const page: HistoryPageDto = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-01-03T00:00:00.000Z',
      role: 'Backend Engineer',
      seniority: 'SENIOR',
      competencies: ['CONFLICT', 'DELIVERY'],
      status: 'SCORED',
      overallScore: 4.2,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'Frontend Engineer',
      seniority: 'MID',
      competencies: ['OWNERSHIP'],
      status: 'SCORED',
      overallScore: 3.0,
    },
  ],
  nextCursor: null,
};

const progress: ProgressDto = {
  sessions: [
    { id: '22222222-2222-4222-8222-222222222222', completedAt: '2026-01-01T00:00:00.000Z', overallScore: 3.0, role: 'Frontend Engineer' },
    { id: '11111111-1111-4111-8111-111111111111', completedAt: '2026-01-03T00:00:00.000Z', overallScore: 4.2, role: 'Backend Engineer' },
  ],
  trend: { first: 3.0, latest: 4.2, delta: 1.2, sessionCount: 2 },
  starCoverage: { situation: 1, task: 0.8, action: 0.6, result: 0.4 },
};

describe('HistoryView', () => {
  it('renders each session with its date, role, seniority, competencies, and score', () => {
    render(<HistoryView page={page} progress={progress} />);

    const backendRow = screen.getByText('Backend Engineer').closest('li')!;
    expect(within(backendRow).getByText('Senior')).toBeInTheDocument();
    expect(within(backendRow).getByText(/handling conflict/i)).toBeInTheDocument();
    expect(within(backendRow).getByText(/delivering under pressure/i)).toBeInTheDocument();
    expect(within(backendRow).getByText('4.2')).toBeInTheDocument();

    const frontendRow = screen.getByText('Frontend Engineer').closest('li')!;
    expect(within(frontendRow).getByText('Mid')).toBeInTheDocument();
    expect(within(frontendRow).getByText(/^ownership$/i)).toBeInTheDocument();
  });

  it('orders sessions newest first, matching the page it was given', () => {
    render(<HistoryView page={page} progress={progress} />);
    const sessionsCard = screen
      .getByRole('heading', { name: /past sessions/i })
      .closest('[class*="rounded-card"]') as HTMLElement;
    const roles = within(sessionsCard)
      .getAllByRole('listitem')
      .map((li) => within(li).getByRole('heading').textContent);
    expect(roles).toEqual(['Backend Engineer', 'Frontend Engineer']);
  });

  it('renders the score trend', () => {
    render(<HistoryView page={page} progress={progress} />);
    const trendCard = screen
      .getByRole('heading', { name: /score over time/i })
      .closest('[class*="rounded-card"]') as HTMLElement;
    expect(within(trendCard).getByText('3.0')).toBeInTheDocument();
    expect(within(trendCard).getByText('4.2')).toBeInTheDocument();
    expect(within(trendCard).getByText('+1.2')).toBeInTheDocument();
    expect(within(trendCard).getByText('2 sessions')).toBeInTheDocument();
  });

  it('renders a four-bar STAR coverage view with situation, task, action, result', () => {
    render(<HistoryView page={page} progress={progress} />);
    expect(screen.getByText(/situation/i)).toBeInTheDocument();
    expect(screen.getByText(/task/i)).toBeInTheDocument();
    expect(screen.getByText(/action/i)).toBeInTheDocument();
    expect(screen.getByText(/result/i)).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows an empty state when there are no sessions yet', () => {
    render(
      <HistoryView
        page={{ items: [], nextCursor: null }}
        progress={{ sessions: [], trend: { first: 0, latest: 0, delta: 0, sessionCount: 0 }, starCoverage: { situation: 0, task: 0, action: 0, result: 0 } }}
      />,
    );
    expect(screen.getAllByText(/no sessions yet/i).length).toBeGreaterThan(0);
  });
});
