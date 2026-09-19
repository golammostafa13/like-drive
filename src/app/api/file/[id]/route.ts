import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/config";
import { hasLibraryAccess, readSessionToken } from "@/lib/auth/session";
import { getReadyFile } from "@/lib/db/files";
import { dispositionName } from "@/lib/storage/keys";
import { mintPdfReadUrl } from "@/lib/storage/signing";
import { localePath } from "@/lib/i18n/config";
import { preferredLocale } from "@/lib/i18n/negotiate";

/**
 * The only way to a file's bytes.
 *
 * The proxy's matcher skips `/api`, so this route checks the session itself.
 * That is not a second line of defence; for this path it is the only one, and
 * it runs before a single byte is fetched.
 *
 * ── Why the bytes are proxied rather than redirected ──────────────────────
 *
 * The obvious cheaper-looking design is to hand the browser a signed Supabase
 * URL and let it fetch Storage directly: one lot of egress instead of two.
 * Measured, it is the opposite, and the reason is worth writing down because
 * nothing about it is visible in a failing test.
 *
 * Supabase Storage does serve real 206s and does allow the `Range` *request*
 * header cross-origin. But it sends no `Access-Control-Expose-Headers`, and
 * hosted Storage has no CORS configuration to add one. Cross-origin, JavaScript
 * may only read the six CORS-safelisted response headers, and `Accept-Ranges`
 * and `Content-Range` are not among them.
 *
 * pdf.js decides whether to use ranges at all by reading `Accept-Ranges` off
 * the first response. Cross-origin it reads nothing, concludes the server does
 * not support ranges, and downloads the *entire file* on every open — silently,
 * with no error anywhere. A 20MB document costs 20MB per open instead of the
 * two or three megabytes its first thirty pages actually need.
 *
 * Same-origin, every header is readable and ranges work. So proxying is not a
 * bandwidth penalty paid for the gate; it is several times cheaper than the
 * alternative, and it keeps the session as the only way in. Downloads are the
 * exception and redirect — see `download/route.ts`.
 *
 * Streaming the body is also what keeps this inside Vercel's 4.5MB response
 * cap, which does not apply to streamed responses. In practice it never
 * arises: pdf.js aborts the initial unranged GET as soon as the headers land.
 */

export const runtime = "nodejs";

/** Bound the cost of a single request explicitly, whatever the plan default. */
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── The gate ────────────────────────────────────────────────────────────
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  if (!hasLibraryAccess(session)) {
    // A navigation goes to the door; a fetch gets a 401. The split matters:
    // pdf.js would otherwise try to parse the sign-in page as a PDF and report
    // a corrupt file rather than a closed session.
    if (request.headers.get("sec-fetch-mode") === "navigate") {
      const lang = preferredLocale(request.headers.get("accept-language"));
      return NextResponse.redirect(
        new URL(localePath(lang, "/signin"), request.url),
      );
    }
    return new NextResponse(null, { status: 401 });
  }

  // ── Resolve ─────────────────────────────────────────────────────────────
  const { id } = await params;
  const file = await getReadyFile(id).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  // The storage key is derived from the row id server-side and never taken
  // from the request, so there is no path here to traverse.
  const rangeHeader = request.headers.get("range");

  let upstreamUrl: string;
  try {
    upstreamUrl = await mintPdfReadUrl(file.id, { expiresIn: 120 });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  const upstream = await fetch(upstreamUrl, {
    headers: rangeHeader ? { Range: rangeHeader } : {},
    redirect: "follow",
  }).catch(() => null);

  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    return new NextResponse(null, { status: upstream?.status ?? 502 });
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${dispositionName(file.name)}"`,
    "Accept-Ranges": "bytes",
    // The stored content-type is whatever the uploading client declared, and
    // `commitUpload` has already checked the bytes begin with %PDF-. Setting
    // the type here rather than forwarding it, plus nosniff, means a
    // mislabelled object can never be interpreted as anything else.
    "X-Content-Type-Options": "nosniff",
    // `private` keeps this out of every shared cache; the short max-age means
    // re-opening a document a minute later costs no Supabase egress at all.
    // The siblings use `no-store` here, which is correct but re-pays for every
    // scroll back to page one.
    "Cache-Control": "private, max-age=600",
    "Vercel-CDN-Cache-Control": "no-store",
  });

  // Forwarded so the reader knows the size and can size its scrollbar, and so
  // a 206 is a truthful 206.
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
