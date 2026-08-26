import { defineConfig } from 'vitest/config';

export default defineConfig({
  // apps/web's tsconfig.json sets "jsx": "preserve" for Next.js's own SWC
  // compiler. Vitest's esbuild transform needs its own JSX setting outside
  // that pipeline, or JSX compiles without importing React and every
  // component test fails with "React is not defined".
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./app/ui/test-utils/setup.ts'],
    css: false,
    globals: false,
    // Playwright specs live under e2e/ and are run by `test:e2e`, never by
    // vitest — excluded here so `pnpm test` (gate:4, gate:5, ...) never
    // picks up a *.spec.ts file meant for Playwright.
    exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**'],
  },
});
