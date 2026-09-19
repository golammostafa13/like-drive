import type { Locale } from "@/lib/i18n/config";

/**
 * Locale-aware presentation of raw values.
 *
 * Kept apart from the dictionaries because these format *data* — a file size,
 * a page count, a date — rather than interface copy. The dictionaries hold
 * sentences; this holds the rules for dropping numbers into them.
 *
 * Trimmed from the sibling libraries' `content.ts`, which also chose between a
 * record's English and Bengali titles. Nothing here is bilingual in that sense:
 * a file is named once, by whoever uploaded it, and that name is shown as typed
 * in both languages.
 */

const numberFormatters: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US"),
  bn: new Intl.NumberFormat("bn-BD"),
};

/**
 * Bengali digits are the single most visible giveaway of a half-translated
 * page: "40টি ফাইল" reads as broken in a way "৪০টি ফাইল" does not. Every
 * number that reaches the screen goes through here.
 */
export function formatNumberIn(n: number, lang: Locale): string {
  return numberFormatters[lang].format(n);
}

/**
 * The Bengali type stack needs a different font and a taller line box than the
 * Latin one. `.bn` in globals.css carries both; this decides where it lands.
 */
export function textClass(lang: Locale): string | undefined {
  return lang === "bn" ? "bn" : undefined;
}

/**
 * Bytes as a human reads them.
 *
 * Binary steps (1024) with the decimal names everyone actually uses, because
 * "1.4 MB" is what the operating system's own file listing says and a drive
 * that disagreed with it by 5% would look wrong rather than precise.
 */
export function formatBytes(bytes: number, lang: Locale): string {
  if (bytes < 1024) return `${formatNumberIn(bytes, lang)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 ("9.4 MB"), none above it ("24 MB"): the second digit
  // of a large size is noise, and the first decimal of a small one is not.
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${formatNumberIn(rounded, lang)} ${units[unit]}`;
}

/** A date as a short, unambiguous label. Never a relative "3 days ago". */
export function formatDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
