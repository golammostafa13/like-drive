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
 * 1. **Language.** Every route lives under `/[lang]`, so a request for `/books`
 *    has to be sent to `/en/books` or `/bn/books`. Which one is decided from
 *    the browser's own `Accept-Language`, because a Bengali reader typing the
 *    bare domain should land in Bengali. This runs once, on the way in; from
 *    then on the language is in the URL and every link carries it, so no
 *    further redirects happen while browsing.
 *
 * 2. **The library gate.** Nothing on these shelves opens without the password
 *    printed in the sponsored copy. Two routes are outside it (the door and
 *    the register), and everything else, catalogue included, needs a session.
 *
 * 3. **The admin guard.** This is the optimistic check the Next.js docs
 *    describe: it keeps everyone who typed the reader password out of the admin
 *    screens, and it costs nothing because the role is in a signed cookie that
 *    can be verified here without a data round trip. It is *not* the
 *    authorisation boundary: every Server Action calls `requireAdmin()`
 *    itself, because a POST never passes through a page.
 *
 * Note what this file cannot reach: anything under `/api` or with a file
 * extension is excluded by the matcher below, so the book files are not
 * protected from here. They are served by a route handler that checks the same
 * session itself: see `app/api/file/[slug]/route.ts`.
 */

/**
 * The pages that stay reachable without the password.
 *
 * `signin` has to be open or nobody could ever get in. `signup` is open
 * because it is the register rather than a gate: someone holding a copy
 * should be able to say where they are without first proving they have read
 * the page the password is printed on.
 *
 * `qr` is the proof sheet for the code printed in that copy, and it is open
 * for the same reason `signup` is: it has to work on the deployed site, since
 * that is the only place it can draw the code at the address the code will
 * actually carry, and requiring the admin password to see a picture of a
 * public URL was a gate in front of nothing. Everything the sheet renders is
 * either already public (the register's address) or typed by whoever asked for
 * it (`?base=`). It is `noindex` and linked from nowhere.
 *
 * Everything else in the site is behind the password, catalogue included.
 */
const OPEN_ROUTES = new Set(["signin", "signup", "qr"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const lang = hasLocale(segments[0]) ? segments[0] : null;

  // --- 1. Language prefix ------------------------------------------------
  if (!lang) {
    const target = request.nextUrl.clone();
    const chosen = preferredLocale(request.headers.get("accept-language"));
    target.pathname =
      pathname === "/" ? `/${chosen}/signin` : `/${chosen}${pathname}`;
    return NextResponse.redirect(target);
  }

  const route = segments[1] ?? "";
  if (OPEN_ROUTES.has(route)) return NextResponse.next();

  // --- 2. The library gate -----------------------------------------------
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  const target = request.nextUrl.clone();
  target.search = "";

  if (!session) {
    target.pathname = `/${lang}/signin`;
    target.searchParams.set("next", pathname + search);
    return NextResponse.redirect(target);
  }

  // --- 3. Admin guard ----------------------------------------------------
  if (route !== "admin") return NextResponse.next();
  if (canAdminister(session)) return NextResponse.next();

  target.pathname = `/${lang}/books`;
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    "/((?!_next/|api/|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.[\\w]+$).*)",
  ],
};
