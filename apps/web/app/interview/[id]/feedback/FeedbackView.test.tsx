// Component-level coverage for the Feedback screen. See frontend.md,
// "Screens > 3. Feedback".
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { FeedbackDto } from '@coach/contracts';
import { FeedbackView } from './FeedbackView';

const feedback: FeedbackDto = {
  id: '11111111-1111-4111-8111-111111111111',
  interviewId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-01-01T00:00:00.000Z',
  overallScore: 3.5,
  strengths: ['Clear ownership', 'Structured explanation'],
  answers: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      questionIndex: 0,
      question: 'Tell me about a time you owned a project end to end.',
      answerSummary: 'Led the billing migration end to end.',
      hasSituation: true,
      hasTask: true,
      hasAction: true,
      hasResult: true,
      score: 4,
      improvement: 'Quantify the improvement with a specific metric.',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      questionIndex: 1,
      question: 'Tell me about a disagreement with a peer.',
      answerSummary: 'Described the disagreement but never the outcome.',
      hasSituation: true,
      hasTask: true,
      hasAction: false,
      hasResult: false,
      score: 3,
      improvement: 'State what you personally did and what happened next.',
    },
  ],
};

describe('FeedbackView', () => {
  it('renders each question with its answer summary, STAR strip, score, and improvement', () => {
    render(<FeedbackView feedback={feedback} />);

    const q1 = screen.getByText(/owned a project end to end/i).closest('li')!;
    expect(within(q1).getByText(/led the billing migration/i)).toBeInTheDocument();
    expect(within(q1).getByText('4')).toBeInTheDocument();
    expect(within(q1).getByText(/quantify the improvement/i)).toBeInTheDocument();

    const q2 = screen.getByText(/disagreement with a peer/i).closest('li')!;
    expect(within(q2).getByLabelText(/action: missing/i)).toBeInTheDocument();
    expect(within(q2).getByLabelText(/result: missing/i)).toBeInTheDocument();
    expect(within(q2).getByLabelText(/situation: present/i)).toBeInTheDocument();
  });

  it('renders overall strengths and the mean score', () => {
    render(<FeedbackView feedback={feedback} />);
    expect(screen.getByText('Clear ownership')).toBeInTheDocument();
    expect(screen.getByText('Structured explanation')).toBeInTheDocument();
    expect(screen.getByText('3.5')).toBeInTheDocument();
  });

  it('emphasises the missing STAR element visually, not just the score', () => {
    render(<FeedbackView feedback={feedback} />);
    // Both questions render a StarStrip with an accessible "missing" name
    // for absent elements, independent of colour — shared.md Part B.
    expect(screen.getAllByLabelText(/: missing/i).length).toBeGreaterThan(0);
  });
});
