"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FolderPlus, Home, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileGrid } from "@/components/drive/file-grid";
import { NewFolderDialog } from "@/components/drive/new-folder-dialog";
import { Toolbar } from "@/components/drive/toolbar";
import { UploadPanel } from "@/components/drive/upload-panel";
import { usePruneProgress } from "@/components/drive/use-prune-progress";
import type { Dictionary } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { fill } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { FolderContents, SortKey, ViewMode } from "@/types";

/**
 * The drive, once the server has fetched it.
 *
 * A Client Component because search, sort and the view toggle are all local
 * state that should never cost a round trip: the folder's contents are already
 * here, and filtering fifty rows in the browser is instantaneous where a
 * server round trip on every keystroke is not.
 *
 * `isAdmin` arrives as a prop from the page, which read it from the signed
 * cookie. It decides only what is *rendered* — every action it gates calls
 * `requireAdmin()` on the server as its first statement, because hiding a
 * button is a courtesy and not a permission.
 */
export function DriveScreen({
  contents,
  isAdmin,
  dict,
  lang,
}: {
  contents: FolderContents;
  isAdmin: boolean;
  dict: Dictionary;
  lang: Locale;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [view, setView] = useState<ViewMode>("grid");
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Expire ancient saved reading positions. The precise cleanup — forgetting
  // a file that has been deleted — happens in the reader when the file 404s;
  // this is just the broom. See the hook.
  usePruneProgress();

  const folders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contents.folders;
    return contents.folders.filter((folder) =>
      folder.name.toLowerCase().includes(needle),
    );
  }, [contents.folders, query]);

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? contents.files.filter((file) =>
          file.name.toLowerCase().includes(needle),
        )
      : contents.files;

    // Copied before sorting: `contents.files` is a prop, and sorting it in
    // place mutates React's own data and makes the next render order-dependent.
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.createdAt.localeCompare(a.createdAt);
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "largest":
          return b.sizeBytes - a.sizeBytes;
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [contents.files, query, sort]);

  const empty = folders.length === 0 && files.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* ── Breadcrumbs ──────────────────────────────────────────────── */}
      <nav
        aria-label="Breadcrumb"
        className={cn(
          "mb-6 flex flex-wrap items-center gap-1 text-sm",
          textClass(lang),
        )}
      >
        <Link
          href={localePath(lang, "/drive")}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink-mute hover:bg-accent-soft hover:text-accent"
        >
          <Home className="size-4" aria-hidden="true" />
          {dict.drive.root}
        </Link>

        {contents.breadcrumbs.map((crumb, index) => {
          const last = index === contents.breadcrumbs.length - 1;
          return (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight
                className="size-4 text-ink-faint"
                aria-hidden="true"
              />
              {last ? (
                <span aria-current="page" className="px-2 py-1 font-medium">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={localePath(lang, `/drive/${crumb.id}`)}
                  className="rounded-lg px-2 py-1 text-ink-mute hover:bg-accent-soft hover:text-accent"
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* ── Title and admin actions ──────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1
          className={cn(
            "text-2xl font-semibold tracking-tight",
            textClass(lang),
          )}
        >
          {contents.folder?.name ?? dict.drive.title}
        </h1>

        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreatingFolder(true)}
              className={textClass(lang)}
            >
              <FolderPlus aria-hidden="true" />
              {dict.drive.newFolder}
            </Button>
            <Button
              size="sm"
              onClick={() => setUploading(true)}
              className={textClass(lang)}
            >
              <Upload aria-hidden="true" />
              {dict.drive.upload}
            </Button>
          </div>
        )}
      </div>

      <Toolbar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        view={view}
        onView={setView}
        dict={dict}
        lang={lang}
      />

      {empty ? (
        <p
          className={cn(
            "card mt-8 px-6 py-16 text-center text-ink-mute",
            textClass(lang),
          )}
        >
          {query
            ? fill(lang, dict.drive.noResults, { q: query })
            : contents.folder
              ? dict.drive.emptyFolder
              : isAdmin
                ? dict.drive.emptyAdmin
                : dict.drive.empty}
        </p>
      ) : (
        <FileGrid
          folders={folders}
          files={files}
          view={view}
          isAdmin={isAdmin}
          dict={dict}
          lang={lang}
        />
      )}

      {isAdmin && uploading && (
        <UploadPanel
          folderId={contents.folder?.id ?? null}
          onClose={() => setUploading(false)}
          dict={dict}
          lang={lang}
        />
      )}

      {isAdmin && creatingFolder && (
        <NewFolderDialog
          parentId={contents.folder?.id ?? null}
          onClose={() => setCreatingFolder(false)}
          dict={dict}
          lang={lang}
        />
      )}
    </main>
  );
}
