import type { NextConfig } from "next";

const serverUrl = process.env.SERVER_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${serverUrl}/api/:path*` },
      { source: "/health", destination: `${serverUrl}/health` },
      { source: "/webmail", destination: `${serverUrl}/webmail` },
      { source: "/logout", destination: `${serverUrl}/logout` }
    ];
  }
};

export default nextConfig;
