import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署用（.next/standalone），本機 dev 不受影響
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
