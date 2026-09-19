import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * These are set statically here rather than in `proxy.ts` on purpose. A
 * nonce-based CSP has to be generated per request, which opts every page out
 * of static rendering, and static rendering is the entire reason this
 * architecture can absorb a 100k-visitors/minute spike from cache.
 *
 * Production hardening step: move the CSP to a Cloudflare Transform Rule /
 * Worker at the edge, where a nonce or hash can be injected into an already
 * cached response. Until then `script-src` needs 'unsafe-inline', because
 * Next's hydration payload and the pre-paint theme script are both inline.
 * Every other directive below is already locked down.
 */
const isDev = process.env.NODE_ENV === "development";

/**
 * There is no third-party allowlist. The door is a password rather than an
 * identity provider, the sponsor's artwork is served from this origin, and the
 * fonts are self-hosted by `next/font`, so every directive below is `'self'`
 * plus, where a browser API demands it, `data:` and `blob:`.
 *
 * That is worth stating rather than leaving as an absence: it is the whole
 * reason the About page can promise no third-party scripts and mean it, and any
 * future host added here breaks that promise.
 */

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // React's dev build needs eval() for stack reconstruction and HMR.
  // Production never gets it.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Fonts are self-hosted by next/font, so no font CDN needs allowing.
  "font-src 'self'",
  // data:/blob: cover PDF.js canvas rendering, the drawn cover art and the
  // drawn Lanso D pack faces. No remote host: the sponsor's own logo and pack
  // shot are in public/ precisely so this line can stay 'self'.
  "img-src 'self' data: blob:",
  // PDF.js runs its parser in a worker created from a blob URL.
  "worker-src 'self' blob:",
  "frame-src 'self'",
  // Dev needs the HMR websocket; production talks only to its own origin.
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "media-src 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

};

export default nextConfig;
