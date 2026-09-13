import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (see deploy/deploy.sh).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
