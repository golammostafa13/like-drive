import type { DriveFolder } from "@/types";

/**
 * The folder tree, walked in memory.
 *
 * Every one of these takes the *whole* flat list of folders and works from it.
 * That looks wasteful and is not: the entire tree of a drive this size is a few
 * kilobytes, one indexed `select id, parent_id, name from folders` fetches it,
 * and every question a page asks — breadcrumbs, children, where a move is
 * allowed to land — is then answered without another round trip.
 *
 * The alternative is a recursive CTE per question, which is more SQL, more
 * latency per page, and a second representation of the same tree to keep
 * correct. If this ever holds thousands of folders, replace these three
 * functions with `WITH RECURSIVE` and nothing else changes — which is the
 * reason they are three small functions rather than inlined into the pages.
 */

/** Index by id once, so a walk is O(depth) rather than O(depth × folders). */
function index(folders: DriveFolder[]): Map<string, DriveFolder> {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

/**
 * Root first, ending with the folder itself. Empty for the drive root.
 *
 * The hop limit is not defensive clutter. A cycle here is a `while` that never
 * ends, in a Server Component, on every request for the affected folder — and
 * although `folders_no_cycle` in the migration makes one impossible to create,
 * this is the code that would hang if that trigger were ever dropped in a
 * migration someone wrote in a hurry. Bounded, it renders a wrong breadcrumb
 * instead.
 */
export function breadcrumbOf(
  folders: DriveFolder[],
  folderId: string | null,
): DriveFolder[] {
  if (!folderId) return [];

  const byId = index(folders);
  const trail: DriveFolder[] = [];
  let cursor: string | null = folderId;
  let hops = 0;

  while (cursor && hops < 64) {
    const folder: DriveFolder | undefined = byId.get(cursor);
    if (!folder) break;
    trail.unshift(folder);
    cursor = folder.parentId;
    hops += 1;
  }

  return trail;
}

/** Direct children of a folder, or of the root when `parentId` is null. */
export function childrenOf(
  folders: DriveFolder[],
  parentId: string | null,
): DriveFolder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every folder beneath one, not including it.
 *
 * Used to grey out illegal destinations in a move picker. It is *not* used to
 * delete: `on delete cascade` plus the `orphan_objects` trigger do that in one
 * statement, atomically, and an application-side walk would reintroduce
 * exactly the partial-delete this design removes.
 */
export function descendantIds(
  folders: DriveFolder[],
  folderId: string,
): Set<string> {
  const byParent = new Map<string | null, DriveFolder[]>();
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    byParent.set(folder.parentId, siblings);
  }

  const found = new Set<string>();
  const queue = [folderId];

  while (queue.length) {
    const current = queue.pop()!;
    for (const child of byParent.get(current) ?? []) {
      // Guards against a cycle that should not exist. See `breadcrumbOf`.
      if (found.has(child.id)) continue;
      found.add(child.id);
      queue.push(child.id);
    }
  }

  return found;
}

/**
 * Where a folder may be moved to: anywhere but itself and its own descendants.
 *
 * The database rejects the illegal cases anyway (`folders_no_cycle`), so this
 * is about not offering a choice that will be refused, not about safety.
 */
export function validMoveTargets(
  folders: DriveFolder[],
  folderId: string,
): DriveFolder[] {
  const forbidden = descendantIds(folders, folderId);
  forbidden.add(folderId);
  return folders.filter((folder) => !forbidden.has(folder.id));
}
