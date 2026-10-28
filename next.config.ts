import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Walrus Memory SDK runs on the server only.
  serverExternalPackages: ["@mysten-incubation/memwal"],
};

export default nextConfig;
