import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/config";
import { hasLibraryAccess, readSessionToken } from "@/lib/auth/session";
import { getReadyFile } from "@/lib/db/files";
import { mintPdfReadUrl } from "@/lib/storage/signing";
import { localePath } from "@/lib/i18n/config";
import { preferredLocale } from "@/lib/i18n/negotiate";

/**
 * Download: check the session, then redirect to a brief signed URL.
 *
 * The sibling route to this one — `../route.ts` — proxies every byte, and for
 * *reading* that is both the gate and the cheaper option. A download is
 * different in one way that flips the answer: it is the whole file however it
 * is served. There are no ranges to lose and nothing for pdf.js to
 * misinterpret, so routing 20MB through a serverless function buys nothing
 * that the redirect does not already give.
 *
 * The session is still checked here, before the URL is minted. What is handed
 * out is a URL that works for sixty seconds; a proxy would hand out a URL that
 * works for as long as the cookie does. Neither is a capability the person did
 * not already have.
 *
 * ── The `download` parameter is not decoration ────────────────────────────
 * The HTML `download` attribute is ignored on cross-origin URLs, so once the
 * browser follows this redirect to Supabase, nothing on our side can influence
 * the saved filename. Passing `download` to `createSignedUrl` makes Supabase
 * send `Content-Disposition: attachment; filename=…` itself, and it is the only
 * reason the file does not land in someone's Downloads folder named after a
 * uuid.
 *
 * Because the name is read from the database row at request time, a file
 * renamed after it was uploaded downloads under its new name — storage is
 * never touched by a rename.
 */

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

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

  let url: string;
  try {
    url = await mintPdfReadUrl(file.id, {
      expiresIn: 60,
      downloadAs: file.name,
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  // 302 rather than 307: this is a GET being pointed elsewhere, and the
  // response must never be cached — the URL it carries expires in a minute.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
