/**
 * Locales.
 *
 * The language lives in the URL (/en/books and /bn/books) rather than in a
 * cookie or a query string. Three reasons that matters here:
 *
 *   1. Every page stays statically prerenderable per language. A cookie read
 *      would opt the whole catalogue out of the edge cache, which is the one
 *      thing this architecture cannot afford.
 *   2. A Bengali page has a real, crawlable, linkable address, so it can rank
 *      in Bengali search rather than hiding behind a toggle.
 *   3. Sharing a link shares the language you were reading in.
 *
 * This module is deliberately free of server-only imports: the header, the
 * language switch and the reader are Client Components and all need it.
 */

export const locales = ["en", "bn"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function hasLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "bn";
}

/** How each language names itself: never translated. */
export const localeNames: Record<Locale, { short: string; full: string }> = {
  en: { short: "EN", full: "English" },
  bn: { short: "বাং", full: "বাংলা" },
};

/**
 * Prefixes an app path with the locale. Pass paths as they appear in the
 * routes ("/books", "/books/gitanjali", "/") and never hand-build the prefix,
 * so adding a third language stays a one-file change.
 */
export function localePath(lang: Locale, path = "/"): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${lang}${clean}`;
}

/**
 * Swaps the locale on an already-prefixed pathname, keeping the rest of the
 * route. Used by the switch so it lands on the same page in the other language
 * instead of dropping the reader back at the home page.
 */
export function switchLocalePath(pathname: string, next: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (hasLocale(segments[0])) segments[0] = next;
  else segments.unshift(next);
  return `/${segments.join("/")}`;
}

/** The other language. With two locales this is all a switch needs. */
export function otherLocale(lang: Locale): Locale {
  return lang === "en" ? "bn" : "en";
}
