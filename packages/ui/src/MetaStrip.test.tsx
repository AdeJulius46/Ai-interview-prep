import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { MetaStrip } from './MetaStrip.js';
import { metaStripFixtures } from './MetaStrip.fixtures.js';

runFixtureSuite('MetaStrip', MetaStrip, metaStripFixtures);

describe('MetaStrip', () => {
  it('renders every label and value', () => {
    render(
      <MetaStrip
        items={[
          { label: 'Interviewer', value: 'John' },
          { label: 'Questions', value: '3' },
          { label: 'Time limit', value: '180s' },
        ]}
      />,
    );
    expect(screen.getByText('Interviewer')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('180s')).toBeInTheDocument();
  });
});
