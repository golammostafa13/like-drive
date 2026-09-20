import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { sessionCookieName } from "@/lib/auth/config";
import { hasLibraryAccess, readSessionToken } from "@/lib/auth/session";
import { getReadyFile } from "@/lib/db/files";
import { hasLocale, localePath } from "@/lib/i18n/config";
import { preferredLocale } from "@/lib/i18n/negotiate";

/**
 * A QR code for one file, as a PNG.
 *
 * What it encodes is the reader's own address — `/{lang}/read/{id}` — and not
 * a signed storage URL. That choice is the whole design:
 *
 *   • A signed URL expires. A printed QR code does not, and a label on a shelf
 *     that stops working after sixty seconds is worse than no label.
 *   • A signed URL is a capability. Anyone photographing the code would hold
 *     the bytes directly, with no session and no way to withdraw it; the page
 *     address hands over nothing that the password does not still guard.
 *   • The reader page is what was actually asked for: it shows the document's
 *     name and size, reads it, and carries the download button.
 *
 * A scan by someone without a session lands on the page, is redirected to
 * `/{lang}/signin?next=…`, and arrives back at this file once the password is
 * accepted — so the code works for a stranger without being an open door.
 *
 * ── Why the origin comes from the request ────────────────────────────────
 * There is no configured base URL in this project, and inventing one would be
 * a second thing to keep in sync with wherever it is deployed. The host the
 * code is generated from is the host that person can reach — open the drive on
 * a phone over the LAN and the QR points at the LAN address; open it on the
 * deployed domain and it points there. Forwarded headers are preferred because
 * behind a proxy `nextUrl` carries the internal address, not the public one.
 */

export const runtime = "nodejs";

/**
 * 1000px: large enough that a phone camera reads it off a page printed at any
 * sensible size, small enough to stay a ~10KB PNG. `margin` is in modules, not
 * pixels, and 4 is the quiet zone the spec requires — a code pasted flush
 * against dark artwork without it is a code that will not scan.
 */
const SIZE = 1000;
const QUIET_ZONE = 4;

function originOf(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}

/**
 * `Content-Disposition` for the saved file.
 *
 * Two spellings of the name, because a Bengali title is unrepresentable in the
 * plain `filename=` parameter: browsers that understand RFC 5987 take
 * `filename*`, and anything older falls back to the ASCII-only version rather
 * than to a mangled one. Names cannot contain control characters — `isSafeName`
 * and a CHECK constraint both refuse them — so neither can split this header.
 */
function disposition(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  const ascii =
    base
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/["\\]/g, "")
      .trim() || "file";

  return [
    "attachment",
    `filename="qr-${ascii}.png"`,
    `filename*=UTF-8''${encodeURIComponent(`qr-${base}.png`)}`,
  ].join("; ");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  // The image is fetched by an <img> and the PNG by a navigation, so both
  // answers are needed — the same split the download route makes.
  if (!hasLibraryAccess(session)) {
    if (request.headers.get("sec-fetch-mode") === "navigate") {
      const lang = preferredLocale(request.headers.get("accept-language"));
      return NextResponse.redirect(
        new URL(localePath(lang, "/signin"), request.url),
      );
    }
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  const file = await getReadyFile(id).catch(() => null);
  if (!file) return new NextResponse(null, { status: 404 });

  // The language of the page the code opens. Asked for explicitly by the
  // dialog so the code matches the language its reader was looking at;
  // negotiated only when the route is hit directly.
  const asked = request.nextUrl.searchParams.get("lang") ?? undefined;
  const lang = hasLocale(asked)
    ? asked
    : preferredLocale(request.headers.get("accept-language"));

  const target = new URL(
    localePath(lang, `/read/${file.id}`),
    originOf(request),
  ).toString();

  let png: Buffer;
  try {
    png = await QRCode.toBuffer(target, {
      type: "png",
      width: SIZE,
      margin: QUIET_ZONE,
      // 'M' recovers ~15% of a damaged symbol. 'H' would survive a logo or a
      // coffee ring but makes the pattern denser for a URL that is already
      // long, and nothing is overlaid on this one.
      errorCorrectionLevel: "M",
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }

  const wantsFile = request.nextUrl.searchParams.get("download") !== null;

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      ...(wantsFile ? { "Content-Disposition": disposition(file.name) } : {}),
      // Not `immutable`, unlike a thumbnail: this PNG is derived from the host
      // in the request, and the same file served from a new domain has to
      // produce a new code.
      "Cache-Control": "private, max-age=3600",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
