"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authSecret,
  displayName,
  doorRole,
  isAdminEmail,
  isEmailShaped,
  normaliseEmail,
  passwordRole,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/config";
import { checkDoorAttempt, clientAddress } from "@/lib/auth/rate-limit";
import { signSession } from "@/lib/auth/session";
import { noteSignIn } from "@/lib/db/accounts";
import { localePath, type Locale } from "@/lib/i18n/config";
import { getDictionaryFor } from "@/lib/i18n";
import { fill } from "@/lib/i18n/format";

/**
 * The door.
 *
 * One address, one word, and a signed cookie. There is no store to consult and
 * no second factor: `doorRole` is pure, so an ordinary reader is let in without
 * a network round trip, and the only writes are the rate-limit counter and the
 * account record.
 */

export interface DoorState {
  error?: string;
  /** Kept so a refused attempt does not also wipe what was typed. */
  email?: string;
}

export async function signInAction(
  _previous: DoorState,
  formData: FormData,
): Promise<DoorState> {
  const lang = (formData.get("lang") as Locale) ?? "en";
  const dict = getDictionaryFor(lang);
  const next = (formData.get("next") as string) || "";

  const rawEmail = String(formData.get("email") ?? "");
  const typed = String(formData.get("password") ?? "");
  const email = normaliseEmail(rawEmail);

  // A deployment with no signing key cannot issue a session, and `signSession`
  // would throw below. Say so plainly rather than failing as "wrong password",
  // which is what sends someone hunting for a typo in a password that is fine.
  if (!authSecret && process.env.NODE_ENV === "production") {
    return { error: dict.auth.misconfigured, email: rawEmail };
  }

  if (!isEmailShaped(email)) {
    return { error: dict.auth.badEmail, email: rawEmail };
  }

  // Counted before the password is checked, and counted on success too: a
  // limit that only counts failures lets someone who already has the reader
  // word hammer the admin word for free.
  const limit = await checkDoorAttempt(clientAddress(await headers()));
  if (!limit.ok) {
    return {
      error: fill(lang, dict.auth.rateLimited, {
        seconds: limit.retryAfterSeconds,
      }),
      email: rawEmail,
    };
  }

  const role = doorRole(email, typed);

  if (!role) {
    // One case deserves its own message. Someone typing the *admin* password
    // from an address that is not on the list has the right word and the wrong
    // account, and "that password is not right" would send them to rotate a
    // password that is fine. Note this leaks only that an admin password
    // exists, which the presence of an admin area already tells anyone.
    const word = passwordRole(typed);
    if (word === "admin" && !isAdminEmail(email)) {
      return { error: dict.auth.notAnAdmin, email: rawEmail };
    }
    return { error: dict.auth.badPassword, email: rawEmail };
  }

  const token = await signSession({
    role,
    email,
    name: displayName(email),
  });

  const store = await cookies();
  store.set(sessionCookieName, token, sessionCookieOptions);

  // Bookkeeping, and it must not be able to refuse entry. Someone who typed
  // the right password is in; whether the register could be written is the
  // drive's problem, not theirs.
  await noteSignIn(email, role).catch(() => {});

  // `next` is attacker-supplied, so it is accepted only as a path on this
  // origin. Without the leading-slash test, `?next=https://elsewhere` turns
  // the door into an open redirect that borrows this site's credibility.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : localePath(lang, "/drive");

  redirect(safeNext);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const lang = (formData.get("lang") as Locale) ?? "en";
  const store = await cookies();
  store.delete(sessionCookieName);
  redirect(localePath(lang, "/signin"));
}
