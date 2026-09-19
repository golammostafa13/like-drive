import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  canAdminister,
  readSessionToken,
  sessionCookieName,
} from "@/lib/auth/session";
import { hasLocale } from "@/lib/i18n/config";
import { preferredLocale } from "@/lib/i18n/negotiate";

/**
 * Three jobs, in order.
 *
 * 1. **Language.** Every route lives under `/[lang]`, so a request for `/drive`
 *    has to be sent to `/en/drive` or `/bn/drive`. Which one is decided from
 *    the browser's own `Accept-Language`, because a Bengali reader typing the
 *    bare domain should land in Bengali. This runs once, on the way in; from
 *    then on the language is in the URL and every link carries it, so no
 *    further redirects happen while browsing.
 *
 * 2. **The gate.** Nothing here opens without a session. Exactly one route is
 *    outside it — the door itself — because a door behind a lock is a locked
 *    building. There is no register: an address becomes an account by being
 *    used, so there is nothing to sign up for.
 *
 * 3. **The admin guard.** The optimistic check the Next.js docs describe: it
 *    keeps readers off the admin screens, and it costs nothing because the
 *    role is in a signed cookie that can be verified here without a data round
 *    trip. It is *not* the authorisation boundary. Every Server Action calls
 *    `requireAdmin()` itself, because a POST never passes through a page.
 *
 * Note what this file cannot reach. The matcher below excludes `/api` and
 * anything with a file extension, so the file, thumbnail and download routes
 * are not protected from here — each checks the same session itself, and for
 * those paths that check is the only one there is.
 */

/**
 * The one page reachable without a session.
 *
 * `signin` has to be open or nobody could ever get in. Everything else — the
 * drive, the reader, a file, a thumbnail — is behind it.
 */
const OPEN_ROUTES = new Set(["signin"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const lang = hasLocale(segments[0]) ? segments[0] : null;

  // --- 1. Language prefix ------------------------------------------------
  if (!lang) {
    const target = request.nextUrl.clone();
    const chosen = preferredLocale(request.headers.get("accept-language"));
    target.pathname =
      pathname === "/" ? `/${chosen}/drive` : `/${chosen}${pathname}`;
    return NextResponse.redirect(target);
  }

  const route = segments[1] ?? "";
  if (OPEN_ROUTES.has(route)) return NextResponse.next();

  // --- 2. The gate -------------------------------------------------------
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  const target = request.nextUrl.clone();
  target.search = "";

  if (!session) {
    target.pathname = `/${lang}/signin`;
    // Carried so the door returns someone to what they asked for. Read back
    // in `signInAction`, where it is accepted only as a path on this origin —
    // without that test this is an open redirect.
    target.searchParams.set("next", pathname + search);
    return NextResponse.redirect(target);
  }

  // --- 3. Admin guard ----------------------------------------------------
  if (route !== "admin") return NextResponse.next();
  if (canAdminister(session)) return NextResponse.next();

  target.pathname = `/${lang}/drive`;
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    "/((?!_next/|api/|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.[\\w]+$).*)",
  ],
};
