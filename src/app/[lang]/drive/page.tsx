import { notFound, redirect } from "next/navigation";
import { DriveScreen } from "@/components/drive/drive-screen";
import { Header } from "@/components/header";
import { Asleep } from "@/components/asleep";
import { getSession } from "@/lib/auth/current";
import { canAdminister } from "@/lib/auth/session";
import { loadFolder } from "@/lib/drive/load";
import { getDictionaryFor } from "@/lib/i18n";
import { hasLocale, localePath } from "@/lib/i18n/config";

/** The root of the drive. */
export default async function DrivePage(props: PageProps<"/[lang]/drive">) {
  const { lang } = await props.params;
  if (!hasLocale(lang)) notFound();

  // The proxy has already turned away anyone without a session, but this is a
  // Server Component reading data and it must not depend on that: a route
  // guard protects navigation, and this is where the data actually is.
  const session = await getSession();
  if (!session) redirect(localePath(lang, "/signin"));

  const dict = getDictionaryFor(lang);
  const result = await loadFolder(null);

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
