import '@testing-library/jest-dom/vitest';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { AxeResults } from 'axe-core';

// vitest.config.ts runs with `globals: false`, so React Testing Library's
// own auto-cleanup (which relies on a global `afterEach`) never registers.
// Without this every test in a file shares one DOM, and queries like
// getByRole start finding N copies of the same element.
afterEach(cleanup);

// Hand-rolled jest-axe-style matcher — see test-utils/axe.ts for why this
// isn't `vitest-axe/matchers`.
expect.extend({
  toHaveNoViolations(results: AxeResults) {
    const violations = results.violations ?? [];
    const pass = violations.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? 'expected axe violations, found none'
          : violations
              .map(
                (v) =>
                  `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
                    .map((n) => n.target.join(', '))
                    .join('\n  ')}\n  ${v.helpUrl}`,
              )
              .join('\n\n'),
    };
  },
});

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- default
  // must line up with whatever else augments `Assertion` in this program.
  interface Assertion<T = any> {
    toHaveNoViolations(): void;
    // @testing-library/jest-dom/vitest registers these matchers at runtime
    // (imported above) and ships its own `declare module 'vitest'` for
    // them, but pnpm resolves more than one physical `vitest` package
    // instance in this workspace (peer-dependency hashing), so jest-dom's
    // augmentation targets a different `vitest` module than the one our
    // test files import from and the two never merge. Redeclaring the
    // handful of matchers actually used here keeps typecheck honest
    // without depending on that merge.
    toBeInTheDocument(): void;
    toHaveAttribute(name: string, value?: string): void;
    toHaveTextContent(text: string | RegExp): void;
  }
}
