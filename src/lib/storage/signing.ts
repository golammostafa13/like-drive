import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  BUCKET_PDF,
  BUCKET_THUMB,
  dispositionName,
  pdfKey,
  thumbKey,
} from "@/lib/storage/keys";

/**
 * Every conversation this app has with Supabase Storage.
 *
 * Server-only, because all of it runs as the service role. The browser's one
 * dealing with Storage is a PUT to a URL minted here, which carries its own
 * scoped token and grants nothing else.
 */

/**
 * A URL the browser may PUT one object to.
 *
 * Supabase fixes the lifetime at two hours and does not let it be configured,
 * which is why the reaper in the cron route uses the same two hours as its
 * threshold for abandoning a `pending` row: after that the ticket is dead and
 * the upload can never arrive.
 */
export async function mintUploadUrl(
  bucket: string,
  key: string,
): Promise<{ url: string; token: string }> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUploadUrl(key);

  if (error || !data) {
    throw new Error(`Could not mint an upload URL: ${error?.message}`);
  }
  return { url: data.signedUrl, token: data.token };
}

export function mintPdfUploadUrl(fileId: string) {
  return mintUploadUrl(BUCKET_PDF, pdfKey(fileId));
}

export function mintThumbUploadUrl(fileId: string) {
  return mintUploadUrl(BUCKET_THUMB, thumbKey(fileId));
}

/**
 * A short-lived URL for reading one object.
 *
 * Two callers, wanting opposite things:
 *
 *   • The file route, which fetches this itself and proxies the bytes. The URL
 *     never leaves the server, so its lifetime only needs to outlast one fetch.
 *   • The download route, which 302s the browser at it. There the URL *is*
 *     handed out, so it is deliberately brief.
 *
 * `download` is not decoration. The HTML `download` attribute is ignored on a
 * cross-origin URL, so when the browser follows a redirect to Supabase this
 * parameter is the only thing that makes the saved file carry its real name
 * rather than a bare uuid.
 */
export async function mintReadUrl(
  bucket: string,
  key: string,
  options: { expiresIn?: number; download?: string } = {},
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(key, options.expiresIn ?? 60, {
      ...(options.download ? { download: options.download } : {}),
    });

  if (error || !data) {
    throw new Error(`Could not sign ${bucket}/${key}: ${error?.message}`);
  }
  return data.signedUrl;
}

export function mintPdfReadUrl(
  fileId: string,
  options: { expiresIn?: number; downloadAs?: string } = {},
) {
  return mintReadUrl(BUCKET_PDF, pdfKey(fileId), {
    expiresIn: options.expiresIn,
    ...(options.downloadAs
      ? { download: dispositionName(options.downloadAs) }
      : {}),
  });
}

export function mintThumbReadUrl(fileId: string, expiresIn = 60) {
  return mintReadUrl(BUCKET_THUMB, thumbKey(fileId), { expiresIn });
}

/**
 * What Storage actually holds at a key, or null.
 *
 * Called at commit time, because the browser saying an upload succeeded is the
 * browser's opinion. A `pending` row promoted on that opinion alone is a card
 * in the grid that 404s when opened, which is the one failure this design
 * works to make impossible.
 */
export async function objectInfo(
  bucket: string,
  key: string,
): Promise<{ size: number; contentType: string } | null> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).info(key);
  if (error || !data) return null;
  return {
    size: data.size ?? 0,
    contentType: data.contentType ?? "",
  };
}

/**
 * The first bytes of an object.
 *
 * `allowed_mime_types` on the bucket checks the content-type the *client*
 * declared on its PUT, which is a label, not evidence. This reads the file
 * itself so `commitUpload` can insist on a `%PDF-` signature before a row is
 * ever shown to a reader.
 */
export async function objectMagic(
  bucket: string,
  key: string,
  bytes = 8,
): Promise<string | null> {
  try {
    const url = await mintReadUrl(bucket, key, { expiresIn: 30 });
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${bytes - 1}` },
    });
    if (!response.ok && response.status !== 206) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Best-effort object deletion, in batches.
 *
 * Best-effort is safe here only because of `orphan_objects`: the row is already
 * gone and its tombstone was written in the same transaction, so anything that
 * fails below is still queued for the daily cron to retry. Without that table
 * this would have to be a transaction, and it cannot be one.
 */
export async function deleteObjects(
  bucket: string,
  keys: string[],
): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];

  // Supabase takes a list, but a very long one is a very long URL and a single
  // failure loses the whole batch. A hundred at a time keeps both bounded.
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    try {
      const { error } = await supabaseAdmin()
        .storage.from(bucket)
        .remove(batch);
      if (error) failed.push(...batch);
      else deleted.push(...batch);
    } catch {
      failed.push(...batch);
    }
  }

  return { deleted, failed };
}

export { BUCKET_PDF, BUCKET_THUMB };
