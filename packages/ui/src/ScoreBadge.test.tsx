import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { ScoreBadge } from './ScoreBadge.js';
import { scoreBadgeFixtures } from './ScoreBadge.fixtures.js';

runFixtureSuite('ScoreBadge', ScoreBadge, scoreBadgeFixtures);

describe('ScoreBadge', () => {
  it('renders the score against the max', () => {
    render(<ScoreBadge score={4} max={5} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });
});
