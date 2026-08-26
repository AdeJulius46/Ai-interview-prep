import type { ComponentType } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from './axe.js';
import type { Fixture } from './fixture.js';

/**
 * Drives snapshot + jest-axe coverage from a component's *.fixtures.ts file.
 * Adding a fixture state automatically gets a snapshot and an a11y check
 * (shared.md, "Component rules" #4).
 */
export function runFixtureSuite<P extends object>(
  componentName: string,
  Component: ComponentType<P>,
  fixtures: Fixture<P>[],
) {
  describe(`${componentName} fixtures`, () => {
    it('has at least one fixture', () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });

    for (const fixture of fixtures) {
      describe(fixture.name, () => {
        it('matches its snapshot', () => {
          const { container } = render(<Component {...fixture.props} />);
          expect(container).toMatchSnapshot();
        });

        it('has no axe violations', async () => {
          const { container } = render(<Component {...fixture.props} />);
          const results = await axe(container);
          expect(results).toHaveNoViolations();
        });
      });
    }
  });
}
