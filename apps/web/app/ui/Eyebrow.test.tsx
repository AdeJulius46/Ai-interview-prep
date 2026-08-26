import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { runFixtureSuite } from './test-utils/run-fixture-suite';
import { Eyebrow } from './Eyebrow';
import { eyebrowFixtures } from './Eyebrow.fixtures';

runFixtureSuite('Eyebrow', Eyebrow, eyebrowFixtures);

describe('Eyebrow', () => {
  it('renders its children as text', () => {
    render(<Eyebrow>LIVE ROOM</Eyebrow>);
    expect(screen.getByText('LIVE ROOM')).toBeInTheDocument();
  });
});
