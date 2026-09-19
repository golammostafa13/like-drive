"use client";

import { lazy, Suspense } from "react";
import Link from "next/link";
import { FileText, Folder } from "lucide-react";
import { RowActions } from "@/components/drive/row-actions";
import type { Dictionary } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import { formatBytes, formatDate, textClass } from "@/lib/i18n/content";
import { pagesCount } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { DriveFile, DriveFolder, ViewMode } from "@/types";

/**
 * Folders and files, in whichever of the three views is chosen.
 *
 * The shelf is `lazy()` rather than imported directly, which is what keeps
 * three.js out of the bundle for the great majority of visits that never
 * switch to it. Grid and list are plain DOM and always present.
 */
const Shelf = lazy(() =>
  import("@/components/drive/shelf-view").then((module) => ({
    default: module.ShelfView,
  })),
);

export function FileGrid({
  folders,
  files,
  view,
  isAdmin,
  dict,
  lang,
}: {
  folders: DriveFolder[];
  files: DriveFile[];
  view: ViewMode;
  isAdmin: boolean;
  dict: Dictionary;
  lang: Locale;
}) {
  return (
    <div className="mt-6 space-y-8">
      {folders.length > 0 && (
        <section>
          <h2 className="sr-only">{dict.drive.newFolder}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map((folder) => (
              <li key={folder.id} className="group relative">
                <Link
                  href={localePath(lang, `/drive/${folder.id}`)}
                  className="card flex items-center gap-3 px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-e2"
                >
                  <Folder
                    className="size-5 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium",
                      textClass(lang),
                    )}
                  >
                    {folder.name}
                  </span>
                </Link>
                {isAdmin && (
                  <RowActions
                    kind="folder"
                    id={folder.id}
                    name={folder.name}
                    dict={dict}
                    lang={lang}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {files.length > 0 && (
        <section>
          <h2 className="sr-only">{dict.drive.title}</h2>

          {view === "shelf" ? (
            <Suspense
              fallback={
                <p
                  className={cn(
                    "py-16 text-center text-sm text-ink-mute",
                    textClass(lang),
                  )}
                >
                  {dict.common.loading}
                </p>
              }
            >
              <Shelf files={files} dict={dict} lang={lang} />
            </Suspense>
          ) : view === "list" ? (
            <ul className="card divide-y divide-line overflow-hidden">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="group relative flex items-center gap-3 px-4 py-3 hover:bg-accent-soft/40"
                >
                  <FileText
                    className="size-5 shrink-0 text-ink-faint"
                    aria-hidden="true"
                  />
                  <Link
                    href={localePath(lang, `/read/${file.id}`)}
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium",
                      textClass(lang),
                    )}
                  >
                    {file.name}
                  </Link>
                  <span className="hidden shrink-0 text-xs text-ink-mute sm:block">
                    {formatBytes(file.sizeBytes, lang)}
                  </span>
                  <span className="hidden shrink-0 text-xs text-ink-faint md:block">
                    {formatDate(file.createdAt, lang)}
                  </span>
                  {isAdmin && (
                    <RowActions
                      kind="file"
                      id={file.id}
                      name={file.name}
                      inline
                      dict={dict}
                      lang={lang}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {files.map((file) => (
                <li key={file.id} className="group relative">
                  <Link
                    href={localePath(lang, `/read/${file.id}`)}
                    className="card block overflow-hidden transition-all hover:-translate-y-1 hover:shadow-e2"
                  >
                    <div className="relative aspect-[3/4] bg-bg-deep">
                      {file.hasThumb ? (
                        // A plain <img>, not next/image: the source is a gated
                        // route that returns a signed-through stream, so the
                        // optimiser could neither fetch nor cache it, and the
                        // route already sets an immutable cache header.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/thumb/${file.id}`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <FileText
                            className="size-10 text-ink-faint"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          textClass(lang),
                        )}
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-mute">
                        {formatBytes(file.sizeBytes, lang)}
                        {file.pageCount
                          ? ` · ${pagesCount(dict, lang, file.pageCount)}`
                          : ""}
                      </p>
                    </div>
                  </Link>
                  {isAdmin && (
                    <RowActions
                      kind="file"
                      id={file.id}
                      name={file.name}
                      dict={dict}
                      lang={lang}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
