"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current";
import {
  deleteFile,
  getReadyFile,
  moveFile,
  renameFile,
} from "@/lib/db/files";
import {
  createFolder,
  deleteFolder,
  getFolder,
  moveFolder,
  renameFolder,
} from "@/lib/db/folders";
import { describeDbError } from "@/lib/db/errors";
import { drainOrphans } from "@/lib/db/orphans";
import { isSafeName, MAX_FILE_NAME, MAX_FOLDER_NAME, tidyName } from "@/lib/names";
import type { ActionResult, DriveFolder } from "@/types";

/**
 * Everything that changes the drive.
 *
 * **Every function here calls `requireAdmin()` as its first statement.** That
 * is not belt-and-braces over the guard in `proxy.ts`: a Server Action is
 * reached by a direct POST and never passes through the proxy at all, so this
 * is the only check there is. The proxy keeps non-admins off the admin
 * *screens*; this keeps them out of the operations.
 *
 * Note how little of this touches storage. Rename and move are single-row
 * UPDATEs, because object keys are uuids rather than paths — see the note at
 * the top of `lib/storage/keys`. Only deletion has bytes to deal with, and
 * even then the row goes first.
 */

const nameInput = (max: number) =>
  z
    .string()
    .transform(tidyName)
    .refine((value) => value.length > 0 && value.length <= max, {
      message: "That name is empty or too long.",
    })
    .refine(isSafeName, {
      message: "That name contains characters that are not allowed.",
    });

const createFolderInput = z.object({
  parentId: z.uuid().nullable(),
  name: nameInput(MAX_FOLDER_NAME),
});

export async function createFolderAction(
  input: unknown,
): Promise<ActionResult<DriveFolder>> {
  const admin = await requireAdmin();

  const parsed = createFolderInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const { parentId, name } = parsed.data;

  if (parentId && !(await getFolder(parentId))) {
    return { ok: false, error: "That folder no longer exists." };
  }

  try {
    const folder = await createFolder({
      parentId,
      name,
      createdBy: admin.email,
    });
    revalidatePath("/", "layout");
    return { ok: true, value: folder };
  } catch (error) {
    return { ok: false, error: describeDbError(error) };
  }
}

const renameInput = z.object({
  kind: z.enum(["file", "folder"]),
  id: z.uuid(),
  name: z.string(),
});

/**
 * Rename, without touching a single byte.
 *
 * This is the payoff of id-derived object keys. Under a scheme where the key
 * mirrored the visible path, renaming a folder would mean copying every object
 * beneath it and deleting the originals — unbounded, untransactional, and at
 * up to 50MB a copy. Here it is one UPDATE, and the name a file downloads
 * under follows automatically because `Content-Disposition` is built from the
 * row at request time rather than baked into storage.
 */
export async function renameAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = renameInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid." };

  const name = nameInput(
    parsed.data.kind === "folder" ? MAX_FOLDER_NAME : MAX_FILE_NAME,
  ).safeParse(parsed.data.name);
  if (!name.success) {
    return { ok: false, error: name.error.issues[0]?.message ?? "Invalid." };
  }

  try {
    if (parsed.data.kind === "folder") {
      await renameFolder(parsed.data.id, name.data);
    } else {
      await renameFile(parsed.data.id, name.data);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeDbError(error) };
  }
}

const moveInput = z.object({
  kind: z.enum(["file", "folder"]),
  id: z.uuid(),
  parentId: z.uuid().nullable(),
});

/**
 * Move, also one UPDATE.
 *
 * The illegal case — a folder into its own descendant — is refused by the
 * `folders_no_cycle` trigger rather than by a check here. That is deliberate:
 * a check in application code can be raced by two simultaneous moves that each
 * see a legal tree and together make a ring. The trigger cannot be.
 */
export async function moveAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid." };
  const { kind, id, parentId } = parsed.data;

  if (parentId && !(await getFolder(parentId))) {
    return { ok: false, error: "That folder no longer exists." };
  }

  try {
    if (kind === "folder") await moveFolder(id, parentId);
    else await moveFile(id, parentId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeDbError(error) };
  }
}

const deleteInput = z.object({
  kind: z.enum(["file", "folder"]),
  id: z.uuid(),
});

/**
 * Delete a file, or a folder and everything beneath it.
 *
 * **The row goes first and the bytes go second**, and the asymmetry is the
 * whole argument. Bytes-first with a failed row delete leaves a row pointing
 * at nothing: the file still lists and 404s when opened, which is user-visible
 * breakage only an admin can clear. Row-first with a failed object delete
 * leaves an object nobody references: invisible, costing quota alone, and
 * mechanically reclaimable.
 *
 * Reclaimable because the `files_enqueue_objects` trigger writes a tombstone
 * into `orphan_objects` *in the same transaction as the delete*. So a folder
 * delete is one statement — the cascade reaches every descendant folder and
 * file, and every object in the subtree is queued atomically — and the
 * `drainOrphans()` below is free to be best-effort. Whatever it cannot remove
 * is still queued for the daily cron.
 *
 * That is also why there is no tree walk here. Walking the tree in application
 * code to collect keys before deleting is exactly the partial-delete this
 * design removes.
 */
export async function deleteAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid." };
  const { kind, id } = parsed.data;

  try {
    if (kind === "folder") {
      if (!(await getFolder(id))) return { ok: true }; // already gone
      await deleteFolder(id);
    } else {
      if (!(await getReadyFile(id))) return { ok: true };
      await deleteFile(id);
    }
  } catch (error) {
    return { ok: false, error: describeDbError(error) };
  }

  // Best-effort, and deliberately not awaited into the result: the delete has
  // already committed and the tombstones with it, so a storage hiccup here
  // must not report the delete as failed when it succeeded.
  await drainOrphans().catch(() => {});

  revalidatePath("/", "layout");
  return { ok: true };
}
