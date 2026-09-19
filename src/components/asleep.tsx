import { Moon } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { cn } from "@/lib/utils";

/**
 * What to show when the database is paused rather than broken.
 *
 * A free Supabase project sleeps after seven days of inactivity. The daily
 * cron exists to prevent that, but a deployment that sat idle over a holiday
 * still meets it, and the honest thing to say is the useful thing: wait a
 * moment and try again. A stack trace, or a generic "something went wrong",
 * would send someone looking for a bug that is not there.
 */
export function Asleep({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <Moon className="mx-auto size-8 text-accent" aria-hidden="true" />
        <p className={cn("mt-4 text-ink-mute", textClass(lang))}>
          {dict.drive.waking}
        </p>
      </div>
    </main>
  );
}
