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
 * The allowlist is one origin long, and it is worth saying why that one.
 *
 * Reading a file needs nothing added: `/api/file/[id]` proxies the bytes, so
 * from the browser's point of view every PDF is same-origin. That is a side
 * benefit of proxying rather than its purpose, but it is a real one — a
 * signed-URL read path would have had to open `connect-src` to Supabase for
 * every visitor rather than only for the administrator uploading.
 *
 * What does need it is the upload: the browser PUTs bytes straight to Supabase
 * Storage, because Vercel's free tier will not carry a 20MB request body. So
 * the project origin is allowed, and nothing else is.
 *
 * Read at build time, which is when `next.config.ts` is evaluated. An unset
 * variable is not fatal — everything but uploading still works — so this
 * degrades to a self-only policy rather than throwing during a build that has
 * no Supabase configured yet.
 */
function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const supabase = supabaseOrigin();

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
  // data:/blob: cover pdf.js canvas rendering and the thumbnail canvas at
  // upload time. No remote host: thumbnails are proxied through /api/thumb,
  // so they are same-origin like everything else.
  "img-src 'self' data: blob:",
  // PDF.js runs its parser in a worker created from a blob URL.
  "worker-src 'self' blob:",
  "frame-src 'self'",
  // Supabase for the upload PUT; dev also needs the HMR websocket.
  `connect-src 'self'${supabase ? ` ${supabase}` : ""}${
    isDev ? " ws: http://localhost:*" : ""
  }`,
  "media-src 'self'",
  // Nothing is needed for WebGL: a shader is not script-src, and the three.js
  // scenes create no workers and load no remote assets.
  "manifest-src 'self'",
  // Production only. Over plain HTTP this rewrites every subresource request
  // to https://, which the dev server does not speak — the stylesheet then
  // fails and the page renders as unstyled HTML. Browsers exempt `localhost`
  // and `127.0.0.1` from the upgrade, so the breakage appears only when dev is
  // reached by any other name: the LAN address Next also prints, a container
  // IP, a tunnel. There is nothing to upgrade to in dev, so the directive buys
  // nothing there in exchange for that.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
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
