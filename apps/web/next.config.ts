import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Both apps depend on @coach/contracts as "workspace:*"; Next.js needs it
  // listed here so its dist/ output is transpiled through Next's own
  // pipeline rather than treated as pre-built, opaque node_modules code.
  // See shared.md, "Build config".
  transpilePackages: ['@coach/contracts'],
};

export default nextConfig;
