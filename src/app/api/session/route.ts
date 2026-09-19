import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/config";
import { canAdminister, readSessionToken } from "@/lib/auth/session";

/**
 * What the browser is signed in as, for the header.
 *
 * The session cookie is `httpOnly` (deliberately, so a script that gets onto
 * the page cannot walk off with it), which means the client cannot read the
 * role out of it. This endpoint is how it asks.
 *
 * It exists so the header can stay out of the render path. Reading the session
 * in the layout would opt every page in the site out of prerendering for one
 * pill in one corner of one bar; asking for it after paint keeps the pages
 * static and costs a request that overlaps with the rest of the page load.
 *
 * Nothing is returned that the person is not already holding, and `no-store`
 * keeps one visitor's state off another's screen via a shared cache.
 */

export interface SessionSummary {
  name: string;
  /** Whether this session may administer the library. */
  admin: boolean;
}

const noStore = {
  // `private` as well as `no-store`: the response is per-visitor, and a proxy
  // in front of this deployment must never hold it for anyone else.
  "cache-control": "no-store, private",
} as const;

export async function GET(request: NextRequest) {
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  if (!session) {
    return NextResponse.json({ session: null }, { headers: noStore });
  }

  const summary: SessionSummary = {
    name: session.name,
    admin: canAdminister(session),
  };

  return NextResponse.json({ session: summary }, { headers: noStore });
}
