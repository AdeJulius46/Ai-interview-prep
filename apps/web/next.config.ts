import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Both apps depend on @coach/contracts as "workspace:*"; Next.js needs it
  // listed here so its dist/ output is transpiled through Next's own
  // pipeline rather than treated as pre-built, opaque node_modules code.
  // See shared.md, "Build config". @coach/ui (Phase 4 UI primitives) is the
  // same story.
  transpilePackages: ['@coach/contracts', '@coach/ui'],
};

export default nextConfig;
