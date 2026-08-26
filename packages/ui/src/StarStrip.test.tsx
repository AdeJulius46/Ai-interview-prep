import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { StarStrip } from './StarStrip.js';
import { starStripFixtures } from './StarStrip.fixtures.js';

runFixtureSuite('StarStrip', StarStrip, starStripFixtures);

describe('StarStrip', () => {
  it('gives present and missing cells different accessible names, not just colour', () => {
    render(
      <StarStrip hasSituation={true} hasTask={true} hasAction={false} hasResult={false} />,
    );
    expect(screen.getByRole('img', { name: 'Situation: present' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Task: present' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Action: missing' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Result: missing' })).toBeInTheDocument();
  });

  it('renders the S/T/A/R cell labels', () => {
    render(<StarStrip hasSituation hasTask hasAction hasResult />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });
});
