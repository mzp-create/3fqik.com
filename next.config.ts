import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow testing over the server's public IP (next dev blocks
  // cross-origin requests to /_next/* resources from unlisted hosts).
  // Irrelevant in production (next start does not enforce this).
  allowedDevOrigins: ["54.254.137.151"],
};

export default nextConfig;
