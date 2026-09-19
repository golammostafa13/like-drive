"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Mail } from "lucide-react";
import { signInAction, type DoorState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";
import { textClass } from "@/lib/i18n/content";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * The door.
 *
 * A plain form posting to a Server Action, which means it works before any
 * JavaScript has loaded — `useActionState` upgrades it rather than
 * implementing it. For the one page standing between a visitor and everything
 * else, that matters more than it does anywhere else in the app.
 *
 * `lang` and `next` ride along as hidden fields because a Server Action
 * receives only the form: it has no access to the route params the page was
 * rendered with, and no `useRouter` to ask.
 */

function Submit({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  // Must be a child of the <form> rather than a sibling of it: `useFormStatus`
  // reads the nearest form above it in the tree, and returns a permanently
  // idle status if there is none.
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      className={cn("w-full", textClass(lang))}
    >
      {pending ? dict.auth.submitting : dict.auth.submit}
    </Button>
  );
}

export function DoorForm({
  dict,
  lang,
  next,
}: {
  dict: Dictionary;
  lang: Locale;
  next?: string;
}) {
  const [state, formAction] = useActionState<DoorState, FormData>(
    signInAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="next" value={next ?? ""} />

      <div className="space-y-2">
        <label
          htmlFor="email"
          className={cn("block text-sm font-medium text-ink", textClass(lang))}
        >
          {dict.auth.emailLabel}
        </label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.email}
            placeholder={dict.auth.emailPlaceholder}
            className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-ink placeholder:text-ink-faint"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className={cn("block text-sm font-medium text-ink", textClass(lang))}
        >
          {dict.auth.passwordLabel}
        </label>
        <div className="relative">
          <KeyRound
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-ink"
          />
        </div>
      </div>

      {state.error && (
        // `assertive` rather than `polite`: this replaces what the person was
        // about to do, so it should interrupt rather than wait for a pause.
        <p
          role="alert"
          aria-live="assertive"
          className={cn(
            "rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger",
            textClass(lang),
          )}
        >
          {state.error}
        </p>
      )}

      <Submit dict={dict} lang={lang} />
    </form>
  );
}
