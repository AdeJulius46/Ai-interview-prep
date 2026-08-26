import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { Card } from './Card.js';
import { cardFixtures } from './Card.fixtures.js';
import type { Fixture } from './test-utils/fixture.js';
import type { CardHeaderProps } from './Card.js';

runFixtureSuite('Card', Card, cardFixtures);

const cardHeaderFixtures: Fixture<CardHeaderProps>[] = [
  { name: 'title-only', props: { title: 'Interview stage' } },
  { name: 'with-eyebrow', props: { eyebrow: 'LIVE ROOM', title: 'Interview stage' } },
  {
    name: 'with-aside',
    props: {
      eyebrow: 'LIVE ROOM',
      title: 'Interview stage',
      aside: <span>3 minute sessions</span>,
    },
  },
];

runFixtureSuite('Card.Header', Card.Header, cardHeaderFixtures);

describe('Card', () => {
  it('renders eyebrow, title, and aside slots', () => {
    render(
      <Card>
        <Card.Header eyebrow="LIVE ROOM" title="Interview stage" aside={<span>3 min</span>} />
      </Card>,
    );
    expect(screen.getByText('LIVE ROOM')).toBeInTheDocument();
    expect(screen.getByText('Interview stage')).toBeInTheDocument();
    expect(screen.getByText('3 min')).toBeInTheDocument();
  });
});
