import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { pdfKey, thumbKey } from "@/lib/storage/keys";
import type { DriveFile } from "@/types";

/**
 * File rows.
 *
 * As with `db/folders`, none of this authorises anything; it assumes the
 * caller already has.
 *
 * The `status` column is the spine of the upload design. A row is written
 * `pending` *before* the upload URL is minted and only becomes `ready` once the
 * bytes have been verified to exist and to start with `%PDF-`. Every read below
 * filters on `ready`, which is what makes a failed or abandoned upload simply
 * invisible rather than a card in the grid that 404s when opened.
 */

const SELECT =
  "id, folder_id, name, size_bytes, page_count, has_thumb, created_at, created_by";

interface FileRow {
  id: string;
  folder_id: string | null;
  name: string;
  size_bytes: number;
  page_count: number | null;
  has_thumb: boolean;
  created_at: string;
  created_by: string;
}

function toFile(row: FileRow): DriveFile {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    hasThumb: row.has_thumb,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/** The ready files directly inside one folder, or the root. */
export async function listFiles(
  folderId: string | null,
): Promise<DriveFile[]> {
  const query = supabaseAdmin()
    .from("files")
    .select(SELECT)
    .eq("status", "ready")
    .order("name");

  const { data, error } = await (folderId
    ? query.eq("folder_id", folderId)
    : query.is("folder_id", null));

  if (error) throw error;
  return (data as FileRow[]).map(toFile);
}

/** Every ready file, for the drive-wide search and the storage total. */
export async function listAllFiles(): Promise<DriveFile[]> {
  const { data, error } = await supabaseAdmin()
    .from("files")
    .select(SELECT)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as FileRow[]).map(toFile);
}

export async function getReadyFile(id: string): Promise<DriveFile | null> {
  const { data, error } = await supabaseAdmin()
    .from("files")
    .select(SELECT)
    .eq("id", id)
    .eq("status", "ready")
    .maybeSingle();

  if (error) throw error;
  return data ? toFile(data as FileRow) : null;
}

/**
 * Reserve a row, and with it an id and therefore an object key.
 *
 * Written before the upload URL exists, which is what collapses the two
 * orphan directions into one: bytes can only ever land at a key derived from a
 * row that already exists, so there is never an object nobody can name.
 */
export async function insertPendingFile(input: {
  id: string;
  folderId: string | null;
  name: string;
  createdBy: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("files").insert({
    id: input.id,
    folder_id: input.folderId,
    name: input.name,
    status: "pending",
    object_key: pdfKey(input.id),
    created_by: input.createdBy,
  });
  if (error) throw error;
}

/**
 * Promote a verified upload.
 *
 * `eq("status", "pending")` is what makes this idempotent and unreplayable: a
 * commit that arrives twice, or late, or from a replayed request, updates
 * nothing the second time.
 */
export async function markFileReady(
  id: string,
  input: { sizeBytes: number; pageCount: number | null; hasThumb: boolean },
): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("files")
    .update({
      status: "ready",
      size_bytes: input.sizeBytes,
      page_count: input.pageCount,
      has_thumb: input.hasThumb,
      thumb_key: input.hasThumb ? thumbKey(id) : null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function renameFile(id: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("files")
    .update({ name })
    .eq("id", id);
  if (error) throw error;
}

export async function moveFile(
  id: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("files")
    .update({ folder_id: folderId })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Delete a file row. The trigger queues its objects in the same transaction.
 *
 * Row first, bytes second — see the long note in the migration. The short
 * version: a row without bytes is a card that 404s and only an admin can
 * clear; bytes without a row are invisible and mechanically reclaimable.
 */
export async function deleteFile(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("files").delete().eq("id", id);
  if (error) throw error;
}

/** Abandon a reservation whose upload never arrived, or was rejected. */
export async function deletePendingFile(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("files")
    .delete()
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

/** Bytes held by ready files, for the quota readout on the admin bar. */
export async function totalBytes(): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("files")
    .select("size_bytes")
    .eq("status", "ready");

  if (error) throw error;
  return (data as { size_bytes: number }[]).reduce(
    (sum, row) => sum + row.size_bytes,
    0,
  );
}
