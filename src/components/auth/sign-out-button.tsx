"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { cn } from "@/lib/utils";

/**
 * Sign out, as a form rather than a link.
 *
 * A GET that destroys a session can be triggered by anything that fetches a
 * URL — an image tag on another site, a link prefetcher, an overeager crawler.
 * A POST through a Server Action cannot, and it works with JavaScript off.
 */
export function SignOutButton({
  dict,
  lang,
}: {
  dict: Dictionary;
  lang: Locale;
}) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="lang" value={lang} />
      <button
        type="submit"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-mute hover:bg-accent-soft hover:text-accent",
          textClass(lang),
        )}
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{dict.nav.signOut}</span>
      </button>
    </form>
  );
}
