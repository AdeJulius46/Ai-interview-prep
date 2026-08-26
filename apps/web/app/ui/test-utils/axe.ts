import axeCore, { type AxeResults, type RunOptions } from 'axe-core';

/**
 * Runs axe-core against a mounted container. Vitest + RTL + jest-axe is the
 * prescribed tooling (testing.md's tooling table), but the `vitest-axe`
 * package's own `extend-expect`/`matchers` subpath ships broken (an empty
 * compiled `extend-expect.js`, and its `matchers` subpath does not resolve
 * cleanly under NodeNext moduleResolution). Driving `axe-core` directly and
 * pairing it with a hand-rolled `toHaveNoViolations` matcher (see setup.ts)
 * reproduces the same jest-axe-style API without depending on that broken
 * packaging.
 */
export function axe(container: Element, options?: RunOptions): Promise<AxeResults> {
  return axeCore.run(container, options ?? {});
}
