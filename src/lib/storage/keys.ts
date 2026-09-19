/**
 * Bucket names, object keys and the upload ceiling.
 *
 * Importable from anywhere, including Client Components: it is all constants
 * and pure functions, and the upload form needs the size limit to reject a
 * file before spending a round trip on it.
 *
 * ── Why keys are ids and not paths ────────────────────────────────────────
 * A file's bytes live at `<uuid>.pdf` at the root of the bucket. Nothing in
 * the key records the folder the file appears in or the name it displays
 * under, and that is the decision the rest of this codebase leans on hardest.
 *
 * The alternative — keys mirroring the visible tree, `Reports/2024/q3.pdf` —
 * makes renaming a folder an O(n) copy-and-delete of every object beneath it,
 * with no transaction around it, at up to 50MB a copy, against a 1GB quota.
 * One interrupted rename and the library is inconsistent in a way nothing can
 * repair automatically.
 *
 * With id keys, rename and move are single-row UPDATEs that never touch
 * storage at all. The name a file downloads under is built from the database
 * row at request time, so it follows a rename for free; and the reader's saved
 * position, keyed on the same id, survives both.
 */

export const BUCKET_PDF = "library";
export const BUCKET_THUMB = "thumbs";

/**
 * 50MB — the per-file ceiling on Supabase's free tier.
 *
 * Mirrored in the bucket's own `file_size_limit`, and that copy is the one
 * that matters: this constant stops the browser starting an upload it cannot
 * finish, but a client that lies about the size still meets the bucket's limit
 * as a clean 413 on the PUT itself.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Thumbnails are ~10–25KB; this only catches something pathological. */
export const MAX_THUMB_BYTES = 256 * 1024;

export function pdfKey(fileId: string): string {
  return `${fileId}.pdf`;
}

export function thumbKey(fileId: string): string {
  return `${fileId}.webp`;
}

/**
 * The display name, cleaned for use in `Content-Disposition`.
 *
 * The header is latin-1 and quote-delimited, so a name with a quote in it
 * truncates the filename and a name with a newline in it splits the response
 * headers. The database rejects control characters and slashes on the way in;
 * this is the second gate, at the point the value becomes part of a protocol.
 */
export function dispositionName(name: string): string {
  const safe = name.replace(/["\\\r\n]/g, "").trim() || "document";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}
