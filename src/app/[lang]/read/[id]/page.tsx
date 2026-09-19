import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PdfReader } from "@/components/pdf-reader";
import { getSession } from "@/lib/auth/current";
import { getReadyFile } from "@/lib/db/files";
import { getDictionaryFor } from "@/lib/i18n";
import { hasLocale, localePath } from "@/lib/i18n/config";
import { fill } from "@/lib/i18n/format";

/**
 * The reader shell.
 *
 * Thin on purpose: it checks the session, fetches one row, and hands the file
 * to a Client Component. Everything expensive — pdf.js, the worker, the
 * virtualised column — is loaded in the browser and only once this page has
 * decided the person is allowed to see it.
 *
 * Note that the backdrop scene disposes itself on this route. The reader
 * budgets tens of megabytes of page bitmaps, and a live WebGL context beside
 * that is how a phone kills the tab — see `components/backdrop.tsx`.
 */

export async function generateMetadata(
  props: PageProps<"/[lang]/read/[id]">,
): Promise<Metadata> {
  const { lang, id } = await props.params;
  const dict = getDictionaryFor(lang);
  const file = await getReadyFile(id).catch(() => null);

  return {
    title: file
      ? fill(lang === "bn" ? "bn" : "en", dict.reader.metaTitle, {
          title: file.name,
        })
      : dict.notFound.title,
    // Never indexed, and not merely because it is behind a session: a search
    // result naming someone's private document is a leak even when the link
    // itself refuses to open.
    robots: { index: false, follow: false },
  };
}

export default async function ReadPage(
  props: PageProps<"/[lang]/read/[id]">,
) {
  const { lang, id } = await props.params;
  if (!hasLocale(lang)) notFound();

  const session = await getSession();
  if (!session) redirect(localePath(lang, `/signin?next=/${lang}/read/${id}`));

  const file = await getReadyFile(id).catch(() => null);
  if (!file) notFound();

  return (
    <PdfReader
      file={file}
      backHref={localePath(
        lang,
        file.folderId ? `/drive/${file.folderId}` : "/drive",
      )}
      lang={lang}
    />
  );
}
