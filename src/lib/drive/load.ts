import "server-only";

import { listFiles } from "@/lib/db/files";
import { listFolders } from "@/lib/db/folders";
import { looksPaused } from "@/lib/supabase/admin";
import { breadcrumbOf, childrenOf } from "@/lib/tree";
import type { FolderContents } from "@/types";

/**
 * Everything one drive page needs, in two queries.
 *
 * The whole folder tree comes back in the first, because it is a few kilobytes
 * and `lib/tree` then answers the breadcrumb and the child list from it
 * without further round trips — see the note at the top of that module. The
 * second fetches the files in this one folder.
 *
 * They run in parallel: neither depends on the other, and on a free-tier
 * database the two latencies are the page's whole cost.
 */

export type LoadResult =
  | { state: "ok"; contents: FolderContents }
  | { state: "missing" }
  /**
   * The project is asleep, not broken.
   *
   * A free Supabase project pauses after seven days of inactivity, and every
   * query then fails at the transport layer rather than returning something a
   * caller can read. The daily cron exists to prevent it, but a deployment
   * that sat idle over a holiday still meets it — and "the library is waking
   * up" is a far better page than a stack trace, because it tells the person
   * the true thing: wait a moment and try again.
   */
  | { state: "asleep" };

export async function loadFolder(folderId: string | null): Promise<LoadResult> {
  try {
    const [folders, files] = await Promise.all([
      listFolders(),
      listFiles(folderId),
    ]);

    const folder = folderId
      ? (folders.find((entry) => entry.id === folderId) ?? null)
      : null;

    // A folder id in the URL that is not in the tree is a 404, not an empty
    // folder: it was deleted, or the link was mistyped, and showing "this
    // folder is empty" for something that does not exist is a lie.
    if (folderId && !folder) return { state: "missing" };

    return {
      state: "ok",
      contents: {
        folder,
        breadcrumbs: breadcrumbOf(folders, folderId),
        folders: childrenOf(folders, folderId),
        files,
      },
    };
  } catch (error) {
    if (looksPaused(error)) return { state: "asleep" };
    throw error;
  }
}
