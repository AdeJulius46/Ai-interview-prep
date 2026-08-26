import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // apps/web depends on @coach/contracts as "workspace:*"; Next.js needs it
  // listed here so its dist/ output is transpiled through Next's own
  // pipeline rather than treated as pre-built, opaque node_modules code.
  // See shared.md, "Build config". UI primitives (formerly @coach/ui) now
  // live directly in apps/web/app/ui and need no such entry.
  transpilePackages: ['@coach/contracts'],
};

export default nextConfig;
