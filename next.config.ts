import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [],
experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
