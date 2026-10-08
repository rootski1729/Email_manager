import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin: /api/* is proxied to the
 * backend, so the httpOnly refresh cookie stays first-party and SSE works
 * through the same path.
 *
 * NOTE: rewrites are resolved when `next build` runs and are baked into the
 * build output (including the standalone server). Set API_ORIGIN at build
 * time — e.g. as a Docker build arg or a Vercel environment variable.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:8000").replace(/\/+$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  // Dev only: allow opening the dev server through a Coder port-forward URL.
  allowedDevOrigins: ["*.coder.fogteams.com"],
  poweredByHeader: false,
  // Next's gzip buffers proxied server-sent events (streamed AI answers, live updates) until the stream ends.
  // Compression belongs to the edge anyway: Caddy encodes every response in production (deploy/caddy).
  compress: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  async redirects() {
    // Plain-language aliases for the client sections (the real URLs are unchanged, so old links keep working).
    return [
      { source: "/home", destination: "/dashboard", permanent: false },
      { source: "/important", destination: "/messages", permanent: false },
      { source: "/watch", destination: "/rules", permanent: false },
      { source: "/send-email", destination: "/templates", permanent: false },
      { source: "/whatsapp", destination: "/destinations", permanent: false },
      { source: "/activity", destination: "/deliveries", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
