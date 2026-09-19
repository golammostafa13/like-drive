import Link from "next/link";
import { HardDrive } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Dictionary } from "@/lib/i18n";
import {
  localePath,
  otherLocale,
  switchLocalePath,
  type Locale,
} from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The bar across the top.
 *
 * A Server Component, and deliberately unaware of the session. Reading the
 * cookie here would make every page that renders a header dynamic, and the
 * only thing the header would do with it is show a name — so the account menu
 * asks `/api/session` after paint instead. See `use-session.ts`.
 *
 * The language switch is a plain link to the same path in the other locale,
 * which is why `switchLocalePath` swaps the segment rather than sending
 * everyone back to the root: changing language should not also lose the folder
 * you were looking at.
 */
export function Header({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href={localePath(lang, "/drive")}
          className="flex items-center gap-2 font-semibold"
        >
          <HardDrive className="size-5 text-accent" aria-hidden="true" />
          <span
            className={cn(
              "bg-gradient-to-r from-[var(--brand-1)] via-[var(--brand-2)] to-[var(--brand-3)] bg-clip-text text-transparent",
              textClass(lang),
            )}
          >
            {lang === "bn" ? site.nameBn : site.name}
          </span>
        </Link>

        <div className="flex-1" />

        <Link
          href={switchLocalePath(`/${lang}/drive`, otherLocale(lang))}
          className="rounded-lg px-2 py-1 text-sm text-ink-mute hover:bg-accent-soft hover:text-accent"
        >
          {dict.nav.switchLanguage}
        </Link>

        <ThemeToggle label={dict.nav.toggleTheme} />
        <SignOutButton dict={dict} lang={lang} />
      </div>
    </header>
  );
}
