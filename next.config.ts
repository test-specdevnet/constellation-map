import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    cpus: 1,
    workerThreads: true,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
