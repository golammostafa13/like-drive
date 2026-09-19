import { defaultLocale, hasLocale } from "@/lib/i18n/config";

/**
 * Pick a language from `Accept-Language`.
 *
 * Hand-parsed rather than pulled from `negotiator` + `intl-localematcher`: two
 * locales and no regional variants do not need 40KB of dependency, and this
 * code has to run on every uncached first request.
 *
 * Lives apart from `config.ts` because both the proxy and the unlock route
 * handler need it, and neither can reach for anything server-only: a QR code
 * carries no language, so the first thing either does with a bare URL is guess
 * one from the browser.
 */
export function preferredLocale(header: string | null) {
  if (!header) return defaultLocale;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        tag: tag.trim().toLowerCase(),
        q: q ? Number(q.split("=")[1]) || 0 : 1,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // "bn-BD" and "bn" both mean Bengali here.
    const base = tag.split("-")[0];
    if (hasLocale(base)) return base;
  }
  return defaultLocale;
}
