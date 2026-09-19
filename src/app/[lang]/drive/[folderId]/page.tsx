import { notFound, redirect } from "next/navigation";
import { DriveScreen } from "@/components/drive/drive-screen";
import { Header } from "@/components/header";
import { Asleep } from "@/components/asleep";
import { getSession } from "@/lib/auth/current";
import { canAdminister } from "@/lib/auth/session";
import { loadFolder } from "@/lib/drive/load";
import { getDictionaryFor } from "@/lib/i18n";
import { hasLocale, localePath } from "@/lib/i18n/config";

/**
 * One folder, addressed by id rather than by path.
 *
 * `/drive/<uuid>` rather than `/drive/Reports/2024`, for the same reason
 * storage keys are ids: rename is a feature here, and a path-shaped URL breaks
 * every link to a folder the moment someone renames an ancestor. The
 * breadcrumb is rebuilt from the tree on each render, so the trail is always
 * current even though the URL never changes.
 */
export default async function FolderPage(
  props: PageProps<"/[lang]/drive/[folderId]">,
) {
  const { lang, folderId } = await props.params;
  if (!hasLocale(lang)) notFound();

  const session = await getSession();
  if (!session) redirect(localePath(lang, "/signin"));

  const dict = getDictionaryFor(lang);
  const result = await loadFolder(folderId);

  if (result.state === "asleep") return <Asleep dict={dict} lang={lang} />;
  if (result.state === "missing") notFound();

  return (
    <>
      <Header dict={dict} lang={lang} />
      <DriveScreen
        contents={result.contents}
        isAdmin={canAdminister(session)}
        dict={dict}
        lang={lang}
      />
    </>
  );
}
