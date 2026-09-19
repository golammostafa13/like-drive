import { cookies } from "next/headers";
import {
  canAdminister,
  hasLibraryAccess,
  readSessionToken,
  sessionCookieName,
  type Session,
} from "@/lib/auth/session";

/**
 * Reading the current session from a Server Component or Server Action.
 *
 * Split from `session.ts` because that module has to stay importable by
 * `proxy.ts`, which has no access to `next/headers`.
 */

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return readSessionToken(store.get(sessionCookieName)?.value);
}

/**
 * The administrator's session, or null, including when someone is in with the
 * reader password, which is the ordinary case.
 */
export async function getAdmin(): Promise<Session | null> {
  const session = await getSession();
  return canAdminister(session) ? session : null;
}

/** The session of someone entitled to read the library, or null. */
export async function getReader(): Promise<Session | null> {
  const session = await getSession();
  return hasLibraryAccess(session) ? session : null;
}

/**
 * Hard gate for anything that mutates the catalogue.
 *
 * Server Actions are reachable by direct POST, so this is called inside every
 * one of them rather than being left to the proxy: a route guard protects
 * navigation, not endpoints.
 */
export async function requireAdmin(): Promise<Session> {
  const admin = await getAdmin();
  if (!admin) throw new Error("Not authorised.");
  return admin;
}
