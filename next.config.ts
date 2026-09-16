import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (see deploy/deploy.sh).
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@tus/server", "@tus/file-store"],
  async headers() {
    return [{ source: "/serwist/:path*", headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }] }];
  },
};

export default withSerwist(nextConfig);
