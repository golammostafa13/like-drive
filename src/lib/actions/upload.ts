"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current";
import {
  deletePendingFile,
  insertPendingFile,
  markFileReady,
} from "@/lib/db/files";
import { getFolder } from "@/lib/db/folders";
import {
  BUCKET_PDF,
  BUCKET_THUMB,
  MAX_UPLOAD_BYTES,
  pdfKey,
  thumbKey,
} from "@/lib/storage/keys";
import {
  mintPdfUploadUrl,
  mintThumbUploadUrl,
  objectInfo,
  objectMagic,
} from "@/lib/storage/signing";
import { describeDbError } from "@/lib/db/errors";
import { isSafeName } from "@/lib/names";
import type { ActionResult } from "@/types";

/**
 * Upload, in three parts, with the bytes never touching this server.
 *
 * Vercel's free tier caps a request body at about 4.5MB and Next caps a Server
 * Action's at 1MB by default, so a 20MB PDF cannot arrive through either. It
 * goes browser → Supabase Storage directly, and the server's whole job is to
 * decide who may upload, reserve the row, hand out a scoped URL, and then
 * check that what turned up is what was promised.
 *
 * ── Why the row is written first ──────────────────────────────────────────
 * The reservation exists before the upload URL does. That is deliberate and it
 * is what removes the need for any reconciliation pass:
 *
 *   • Bytes land, commit never runs  → the row is still `pending`, every read
 *     filters `status='ready'`, so it is invisible. Reaped after two hours.
 *   • Row exists, bytes never land   → the same `pending` state, reaped the
 *     same way.
 *
 * There is no third case, because the object key is derived from the row id:
 * bytes can only ever land at a key belonging to a row that already exists, so
 * an object nobody can name is not reachable. Nothing has to list a bucket and
 * diff it against a table.
 */

const ticketInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(isSafeName, {
      message: "That name contains characters that are not allowed.",
    }),
  folderId: z.uuid().nullable(),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export interface UploadTicket {
  fileId: string;
  pdfUrl: string;
  thumbUrl: string;
}

export async function createUploadTicket(
  input: unknown,
): Promise<ActionResult<UploadTicket>> {
  // First line, always. A Server Action is a public POST endpoint and never
  // passes through the route guard in `proxy.ts`.
  const admin = await requireAdmin();

  const parsed = ticketInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const { name, folderId, sizeBytes } = parsed.data;

  // `sizeBytes` is a claim, and it is checked here only so the browser is told
  // "too large" before spending a round trip. The limit that cannot be lied
  // past is the bucket's own `file_size_limit`, enforced on the PUT itself.
  void sizeBytes;

  // Verify the destination still exists. Without this, a folder deleted while
  // the dialog was open yields a ticket for a row that cascades away
  // mid-upload — the bytes land, the row is gone, and the object is orphaned
  // with no tombstone to find it by.
  if (folderId && !(await getFolder(folderId))) {
    return { ok: false, error: "That folder no longer exists." };
  }

  // Server-side, never from the client: the object key is derived from this,
  // so a client-chosen id is a client-chosen storage path.
  const fileId = randomUUID();

  try {
    await insertPendingFile({
      id: fileId,
      folderId,
      name,
      createdBy: admin.email,
    });
  } catch (error) {
    return { ok: false, error: describeDbError(error) };
  }

  try {
    const [pdf, thumb] = await Promise.all([
      mintPdfUploadUrl(fileId),
      mintThumbUploadUrl(fileId),
    ]);
    return { ok: true, value: { fileId, pdfUrl: pdf.url, thumbUrl: thumb.url } };
  } catch {
    // The reservation would be reaped in two hours anyway; clearing it now
    // keeps the name free for an immediate retry.
    await deletePendingFile(fileId).catch(() => {});
    return { ok: false, error: "Could not start the upload. Try again." };
  }
}

const commitInput = z.object({
  fileId: z.uuid(),
  pageCount: z.number().int().positive().nullable(),
  hasThumb: z.boolean(),
});

/**
 * Promote a reservation, having checked the bytes rather than taken the
 * browser's word for it.
 *
 * Three checks, each closing something the previous one cannot:
 *
 *   1. The object exists. The browser reporting success is the browser's
 *      opinion; a row promoted on that alone is a card in the grid that 404s.
 *   2. Its size is read back from Storage rather than from the form, because
 *      the form's number is a claim and this one is a fact.
 *   3. It starts with `%PDF-`. The bucket's `allowed_mime_types` checks the
 *      content-type the *client declared on the PUT*, which is a label, not
 *      evidence. This is the only check that looks at the file itself.
 */
export async function commitUpload(
  input: unknown,
): Promise<ActionResult<{ fileId: string }>> {
  await requireAdmin();

  const parsed = commitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid." };
  const { fileId, pageCount, hasThumb } = parsed.data;

  const info = await objectInfo(BUCKET_PDF, pdfKey(fileId));
  if (!info || info.size <= 0) {
    await deletePendingFile(fileId).catch(() => {});
    return { ok: false, error: "The file did not arrive. Nothing was saved." };
  }

  const magic = await objectMagic(BUCKET_PDF, pdfKey(fileId));
  if (!magic?.startsWith("%PDF-")) {
    await deletePendingFile(fileId).catch(() => {});
    return { ok: false, error: "That file is not a PDF." };
  }

  // Trust the thumbnail only if it is actually there. A failed thumbnail PUT
  // is not worth failing an upload over — the grid falls back to an icon — but
  // a row claiming a thumbnail that does not exist is a broken image on every
  // render.
  const thumbPresent =
    hasThumb && (await objectInfo(BUCKET_THUMB, thumbKey(fileId))) !== null;

  try {
    const promoted = await markFileReady(fileId, {
      sizeBytes: info.size,
      pageCount,
      hasThumb: thumbPresent,
    });
    if (!promoted) {
      // Already committed, or already reaped. Either way this call has nothing
      // left to do, and saying so is better than reporting a failure for work
      // that is done.
      return { ok: true, value: { fileId } };
    }
  } catch (error) {
    return { ok: false, error: describeDbError(error) };
  }

  revalidatePath("/", "layout");
  return { ok: true, value: { fileId } };
}

/** Called when the browser gives up, so the name is free again at once. */
export async function abandonUpload(fileId: string): Promise<void> {
  await requireAdmin();
  if (!z.uuid().safeParse(fileId).success) return;
  await deletePendingFile(fileId).catch(() => {});
  revalidatePath("/", "layout");
}
