import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { formatNumberIn } from "@/lib/i18n/content";

/**
 * Interpolation.
 *
 * The dictionaries hold nothing but strings: `"{n} files"` rather than
 * `(n) => ...`. Two reasons:
 *
 *   1. A function cannot cross the Server/Client Component boundary, so a
 *      dictionary with functions in it can never be passed as a prop. Plain
 *      data can go anywhere.
 *   2. Translators (and future locales) get a file with no code in it.
 *
 * Numbers are formatted for the locale on the way in — see `formatNumberIn`.
 */
export function fill(
  lang: Locale,
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) return "";
    return typeof value === "number" ? formatNumberIn(value, lang) : value;
  });
}

/**
 * Plurals.
 *
 * English inflects the noun; Bengali does not, and instead attaches the
 * classifier -টি to the number. Both are expressed by giving each language a
 * "one" and a "many" template and letting it decide whether they differ.
 */
function plural(
  lang: Locale,
  n: number,
  one: string,
  many: string,
  extra: Record<string, string | number> = {},
): string {
  return fill(lang, n === 1 ? one : many, { n, ...extra });
}

export function filesCount(dict: Dictionary, lang: Locale, n: number): string {
  return plural(lang, n, dict.common.filesOne, dict.common.filesMany);
}

export function foldersCount(dict: Dictionary, lang: Locale, n: number): string {
  return plural(lang, n, dict.common.foldersOne, dict.common.foldersMany);
}

export function resultsCount(dict: Dictionary, lang: Locale, n: number): string {
  return plural(lang, n, dict.common.resultsOne, dict.common.resultsMany);
}

export function pagesCount(dict: Dictionary, lang: Locale, n: number): string {
  return plural(lang, n, dict.common.pagesOne, dict.common.pagesMany);
}
