import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/config";
import { hasLibraryAccess, readSessionToken } from "@/lib/auth/session";
import { getReadyFile } from "@/lib/db/files";
import { mintThumbReadUrl } from "@/lib/storage/signing";

/**
 * First-page thumbnails, behind the same gate as everything else.
 *
 * The cheaper-looking option is a public bucket: no session check, no function
 * invocation, a plain `<img src>`. It is refused here on the grounds the whole
 * app is built on. The first page of a PDF is almost always its title page, so
 * a public thumbnail bucket publishes the table of contents of a library that
 * was deliberately put behind a password. The keys are uuids, but a design
 * whose privacy rests on nobody ever sharing one URL is not a private design.
 *
 * The cost of refusing it is small enough to state exactly: a thumbnail is
 * 10–25KB, so a full grid of fifty is well under a megabyte against a 5GB
 * monthly budget. And because the object key is derived from the file id and
 * therefore never changes, the response can be cached hard — a revisit pays
 * nothing at all.
 *
 * `immutable` is honest here in a way it usually is not. Replacing a file
 * means a new row and a new id, so this URL's content genuinely cannot change.
 */

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  // No redirect branch, unlike the file route: a thumbnail is only ever
  // fetched by an <img>, never navigated to, so a 401 is the whole answer.
  if (!hasLibraryAccess(session)) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  const file = await getReadyFile(id).catch(() => null);
  if (!file?.hasThumb) return new NextResponse(null, { status: 404 });

  let url: string;
  try {
    url = await mintThumbReadUrl(file.id, 120);
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  const upstream = await fetch(url).catch(() => null);
  if (!upstream?.ok) {
    return new NextResponse(null, { status: upstream?.status ?? 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400, immutable",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
