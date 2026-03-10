import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Resolve workspace root for Turbopack when multiple lockfiles exist (e.g. pnpm + npm)
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
