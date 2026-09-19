/**
 * Who may read the drive, and who may administer it.
 *
 * The door asks for two things — an address and a word — and they answer two
 * different questions:
 *
 *   • **Reading** needs `SITE_PASSWORD`. Everyone who is let in types the same
 *     word. Nothing here opens without it: not the file list, not the reader,
 *     not a download.
 *   • **Administering** needs `ADMIN_PASSWORD` *and* an address listed in
 *     `ADMIN_EMAILS`. Neither is sufficient alone.
 *
 * The address is why this is not simply "one password, two roles". A shared
 * word cannot say who typed it, so requiring the address as well means
 * administration is granted to a person rather than to a string, and withdrawn
 * by editing a variable rather than by rotating a password every reader uses.
 *
 * For a reader the address grants nothing and is checked against nothing. Any
 * address that looks like an address is accepted, and a new one simply becomes
 * a new account: it is recorded so the drive's owner can see who is reading,
 * and it is the only durable handle on a visitor that a shared password can
 * ever provide.
 */

/**
 * The reader's password.
 *
 * Be clear-eyed about what this is. It is short, it is shared, and everyone
 * who has ever been let in can pass it on. It is a lock on a door, not a
 * vault: it can never administer the drive, and the rate limit in
 * `lib/auth/rate-limit` is what stops it being counted up to rather than
 * guessed. Set something longer than the default in any deployment that
 * matters.
 *
 * **A blank variable falls back to the default, and `??` would not have done
 * that.** An empty string is not nullish, so `process.env.SITE_PASSWORD ?? …`
 * leaves this `""` when the variable exists with no value — which the guard in
 * `passwordRole` then reads as "no reader password configured" and skips. The
 * result is a door that refuses every reader for every word typed, with no
 * error and no log. Not hypothetical: it is what a blank field in a Vercel
 * form produces.
 *
 * Note the asymmetry with `ADMIN_PASSWORD` below, which does NOT fall back on
 * blank. Falling back here restores a word that was already shared, so it
 * costs nothing; doing the same there would resurrect a public default as the
 * administrator's password for anyone who blanked the field to turn admin off.
 * Blank means "the default" for readers and "nobody" for administrators, and
 * those are the safe directions for each.
 */
export const SITE_PASSWORD = process.env.SITE_PASSWORD?.trim()
  ? process.env.SITE_PASSWORD
  : "1234";

/**
 * The administrator's password.
 *
 * **Never make this the reader password with characters added.** Two passwords
 * where one is a prefix of the other are a trap, and the trap is not in `===`:
 * it is in every plausible edit *around* it. A `startsWith`, an `includes`, a
 * "be forgiving about trailing whitespace" tweak, a fuzzy compare copied in
 * from somewhere else — any of those matches `12345` against `1234` and hands
 * the drive to whoever asks. `passwordRole` below tests this one first and
 * compares it exactly, and that ordering is deliberate insurance rather than a
 * consequence of `===`.
 *
 * `??`, deliberately, where `SITE_PASSWORD` uses a blank check: setting this
 * variable to nothing leaves it `""`, and `passwordRole`'s guard then matches
 * no password at all, which is the correct reading of a deliberately emptied
 * admin password. There is no default. Unset means nobody can administer.
 */
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * The addresses that administer this drive.
 *
 * One value, comma- or whitespace-separated, so several administrators need
 * not share one inbox:
 *
 *   ADMIN_EMAILS=owner@example.org,second-account@example.org
 *
 * `ADMIN_EMAIL` (singular) is still read when `ADMIN_EMAILS` is unset.
 *
 * Empty means *nobody* administers. That is the important case to get right:
 * an unset variable must not match a blank address and hand the drive to
 * whoever arrives first, which is why `isAdminEmail` refuses everything rather
 * than falling back to something permissive.
 */
export const adminEmails: readonly string[] = parseEmailList(
  process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "",
);

/** Cookie signing secret. Any long random string; rotate to sign everyone out. */
export const authSecret = process.env.AUTH_SECRET ?? "";

export const sessionCookieName = "drive_session";

/** Eight hours: one working day, then type the word again. */
export const sessionTtlSeconds = 8 * 60 * 60;

/**
 * The session cookie's flags, in one place.
 *
 * Two code paths set this cookie, and a cookie that is `httpOnly` in one of
 * them and not the other is not a cookie anyone can reason about.
 */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: sessionTtlSeconds,
} as const;

/**
 * Addresses are compared case-insensitively, and untrimmed input is a typo
 * rather than a different person — so both sides of every comparison go
 * through here.
 */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Splits a configured list into normalised addresses.
 *
 * Commas, semicolons and any whitespace all separate, because a value pasted
 * into a hosting dashboard picks up whichever the person happened to type. The
 * `filter(Boolean)` is not tidiness: without it a trailing comma contributes an
 * empty string to the list, and an empty string in `adminEmails` is an entry
 * that matches an unset address.
 */
export function parseEmailList(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    // Quotes are stripped per entry, not from the whole value, because that is
    // where they land. A dashboard field holding `"a@x.com,b@y.com"` keeps the
    // quotes as literal characters, and splitting first leaves them attached to
    // the *first* and *last* addresses — so a quoted list does not fail loudly,
    // it silently invalidates both ends of itself. With two administrators
    // configured that is every administrator, and the symptom is an admin
    // password refused with no clue as to why.
    .map((entry) => entry.replace(/^["']+|["']+$/g, ""))
    .map(normaliseEmail)
    .filter(Boolean);
}

/**
 * Deliberately loose: one `@`, a dot in the domain, no spaces.
 *
 * This is a shape test, not a validity test. Nothing is ever sent to the
 * address, so the only thing a stricter pattern could achieve is turning away
 * someone whose real address it did not anticipate.
 */
export function isEmailShaped(email: string): boolean {
  const parts = email.split("@");
  return (
    parts.length === 2 &&
    parts[0].length > 0 &&
    parts[1].includes(".") &&
    !parts[1].startsWith(".") &&
    !parts[1].endsWith(".") &&
    !email.includes(" ")
  );
}

/**
 * Whether an address is on the administrators' list.
 *
 * Checked against the address inside the signed session rather than anything
 * the browser has just sent, and checked at the moment it matters rather than
 * stamped into the cookie — see the note on `canAdminister` in
 * `lib/auth/session`.
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return adminEmails.includes(normaliseEmail(email));
}

/** What a typed password entitles the typist to, or null for neither. */
export type Role = "reader" | "admin";

/**
 * The whole authorisation decision, in one function.
 *
 * Compared against what was typed, untrimmed on the right-hand side only:
 * a trailing space is a typo rather than a different password, so the input is
 * trimmed, but the configured value is used exactly as set, so a deployment
 * that deliberately puts a space in its password still works.
 *
 * Case-sensitive, and admin first — see the note on `ADMIN_PASSWORD`.
 */
export function passwordRole(typed: string): Role | null {
  const value = typed.trim();
  if (!value) return null;
  if (ADMIN_PASSWORD && value === ADMIN_PASSWORD) return "admin";
  if (SITE_PASSWORD && value === SITE_PASSWORD) return "reader";
  return null;
}

/**
 * The door, both fields.
 *
 * `passwordRole` says which word was typed; this says what the pair of
 * (address, word) actually opens. Pure and offline: no store to consult, which
 * is what lets a reader in without a network round trip.
 *
 * The case worth reading twice is the admin password typed by an address that
 * is not on the list. It returns `null` — turned away — rather than falling
 * back to reader access. That matters more than it looks: if the two passwords
 * were ever made to share a prefix, "downgrade an unlisted admin attempt to a
 * reader" would mean anyone holding the reader word could append characters at
 * random and still be let in. One word opens one thing.
 */
export function doorRole(email: string, typed: string): Role | null {
  const word = passwordRole(typed);
  if (!word) return null;
  if (word === "admin") return isAdminEmail(email) ? "admin" : null;
  return "reader";
}

/** The display name for an address: its local part, which is enough. */
export function displayName(email: string): string {
  return normaliseEmail(email).split("@")[0] || "reader";
}
