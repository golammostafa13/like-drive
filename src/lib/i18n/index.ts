import { en } from "@/lib/i18n/dictionaries/en";
import { bn } from "@/lib/i18n/dictionaries/bn";
import { defaultLocale, hasLocale, type Locale } from "@/lib/i18n/config";

/**
 * The dictionary shape is whatever English is. Every other language is typed
 * against it, so a missing key fails `tsc` rather than shipping an English
 * sentence into a Bengali page.
 */
export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, bn };

/**
 * Plain object lookup rather than the dynamic `import()` the Next.js i18n guide
 * suggests. Both dictionaries together are a few kilobytes, they are only ever
 * read in Server Components (the client gets rendered HTML), and being able to
 * call this synchronously means shared components can take a `dict` prop with
 * no async plumbing.
 */
export function getDictionary(lang: Locale): Dictionary {
  return dictionaries[lang];
}

/**
 * For code paths that only have a raw string: a route param, a form field,
 * and must not throw on rubbish input.
 */
export function getDictionaryFor(lang: string | undefined): Dictionary {
  return dictionaries[hasLocale(lang) ? lang : defaultLocale];
}

export {
  defaultLocale,
  hasLocale,
  locales,
  localeNames,
  localePath,
  otherLocale,
  switchLocalePath,
  type Locale,
} from "@/lib/i18n/config";
