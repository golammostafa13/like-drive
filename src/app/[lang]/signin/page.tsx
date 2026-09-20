import type { Metadata } from "next";
import { BrandMark3D } from "@/components/brand-mark-3d";
import { DoorForm } from "@/components/auth/door-form";
import { getDictionaryFor } from "@/lib/i18n";
import { hasLocale, otherLocale, switchLocalePath } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * The only page reachable without a session.
 *
 * A Server Component that renders a form and nothing else: no session read, no
 * database call, no `dynamic` opt-out. It prerenders per language at build
 * time, which is what lets the door open instantly even when the Supabase
 * project behind it is still waking up.
 */

export async function generateMetadata(
  props: PageProps<"/[lang]/signin">,
): Promise<Metadata> {
  const { lang } = await props.params;
  const dict = getDictionaryFor(lang);
  return { title: dict.auth.title };
}

export default async function SignInPage(props: PageProps<"/[lang]/signin">) {
  const { lang } = await props.params;
  if (!hasLocale(lang)) notFound();

  const { next } = await props.searchParams;
  const dict = getDictionaryFor(lang);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* The mark at the size it was drawn for. The backdrop gathers its
              crystals in behind this screen (see `Backdrop`), so the logo is
              the near element of one composition rather than an ornament
              sitting on top of an unrelated one. */}
          <BrandMark3D className="mx-auto mb-4 size-14" />
          <h1
            className={cn(
              "bg-gradient-to-r from-[var(--brand-1)] via-[var(--brand-2)] to-[var(--brand-3)] bg-clip-text text-4xl font-semibold tracking-tight text-transparent",
              textClass(lang),
            )}
          >
            {lang === "bn" ? site.nameBn : site.name}
          </h1>
          <p className={cn("mt-2 text-sm text-ink-mute", textClass(lang))}>
            {lang === "bn" ? site.taglineBn : site.tagline}
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          <DoorForm
            dict={dict}
            lang={lang}
            next={typeof next === "string" ? next : undefined}
          />
        </div>

        <div className="mt-6 text-center">
          <Link
            href={switchLocalePath(`/${lang}/signin`, otherLocale(lang))}
            className="text-sm text-ink-mute underline-offset-4 hover:text-accent hover:underline"
          >
            {dict.nav.switchLanguage}
          </Link>
        </div>
      </div>
    </main>
  );
}
