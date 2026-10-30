import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Walrus Memory SDK runs on the server only.
  serverExternalPackages: ["@mysten-incubation/memwal"],
  // Keep the dev badge out of screenshots and demo recordings.
  devIndicators: false,
};

export default nextConfig;
