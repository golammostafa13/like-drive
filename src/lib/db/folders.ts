import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DriveFolder } from "@/types";

/**
 * Folder reads and writes.
 *
 * Every function here runs as the service role, so *none* of them is an
 * authorisation boundary. The caller decides who may do this — `requireAdmin()`
 * in the Server Actions, `getReader()` in the pages — and these functions
 * assume that decision has already been made.
 */

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  created_by: string;
}

function toFolder(row: FolderRow): DriveFolder {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/**
 * The whole tree, in one query.
 *
 * Deliberately unfiltered: `lib/tree` answers breadcrumbs, children and
 * move-targets from this one array, so fetching a subtree would mean fetching
 * again for the breadcrumb above it. See the note at the top of `lib/tree`.
 */
export async function listFolders(): Promise<DriveFolder[]> {
  const { data, error } = await supabaseAdmin()
    .from("folders")
    .select("id, parent_id, name, created_at, created_by")
    .order("name");

  if (error) throw error;
  return (data as FolderRow[]).map(toFolder);
}

export async function getFolder(id: string): Promise<DriveFolder | null> {
  const { data, error } = await supabaseAdmin()
    .from("folders")
    .select("id, parent_id, name, created_at, created_by")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toFolder(data as FolderRow) : null;
}

export async function createFolder(input: {
  parentId: string | null;
  name: string;
  createdBy: string;
}): Promise<DriveFolder> {
  const { data, error } = await supabaseAdmin()
    .from("folders")
    .insert({
      parent_id: input.parentId,
      name: input.name,
      created_by: input.createdBy,
    })
    .select("id, parent_id, name, created_at, created_by")
    .single();

  if (error) throw error;
  return toFolder(data as FolderRow);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("folders")
    .update({ name })
    .eq("id", id);
  if (error) throw error;
}

export async function moveFolder(
  id: string,
  parentId: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("folders")
    .update({ parent_id: parentId })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Delete a folder and everything beneath it — in one statement.
 *
 * `on delete cascade` takes the descendant folders and their files, and the
 * `files_enqueue_objects` trigger writes a tombstone into `orphan_objects` for
 * every object in the subtree, inside this same transaction. So there is no
 * tree walk here and no partial delete: either the whole subtree goes and every
 * object is queued for removal, or nothing does.
 *
 * The bytes themselves are removed afterwards, best-effort, by
 * `drainOrphans()`. That is safe precisely because the tombstones are already
 * committed — whatever fails is retried by the daily cron.
 */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("folders").delete().eq("id", id);
  if (error) throw error;
}
