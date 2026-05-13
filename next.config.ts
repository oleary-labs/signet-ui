import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["lightningcss", "better-sqlite3"],
  transpilePackages: ["@oleary-labs/signet-sdk"],
};

export default nextConfig;
