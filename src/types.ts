/**
 * The shapes that cross the server/client boundary.
 *
 * Deliberately plain and serialisable — these are passed as props from Server
 * Components into Client ones, so no Dates, no class instances, no functions.
 * Timestamps are ISO strings and are formatted at the edge by
 * `lib/i18n/content`.
 *
 * Note what is *not* here: `object_key` and `thumb_key`. Those are how the
 * server finds the bytes, and nothing in the browser has any use for them. The
 * browser addresses a file by its id — `/api/file/<id>` — and the mapping from
 * id to storage key is re-derived server-side on every request. That is the
 * same reasoning as the siblings keeping `bookFiles` out of their `Book` type:
 * a storage path that never reaches the client is a storage path that can
 * never be walked.
 */

export interface DriveFolder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  createdBy: string;
}

export interface DriveFile {
  id: string;
  folderId: string | null;
  name: string;
  sizeBytes: number;
  pageCount: number | null;
  hasThumb: boolean;
  createdAt: string;
  createdBy: string;
}

/** A folder's contents, as one page renders them. */
export interface FolderContents {
  folder: DriveFolder | null;
  /** Root first, then each ancestor, ending with the folder itself. */
  breadcrumbs: DriveFolder[];
  folders: DriveFolder[];
  files: DriveFile[];
}

export type SortKey = "name" | "newest" | "oldest" | "largest";
export type ViewMode = "grid" | "list" | "shelf";

/**
 * The result shape every Server Action returns.
 *
 * An action that throws gives the client a generic digest in production — the
 * message is deliberately scrubbed — so anything the person should actually
 * read has to come back as a value. Thrown errors are left for the genuinely
 * exceptional: a missing environment variable, a database that is gone.
 */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? { value?: never } : { value: T }))
  | { ok: false; error: string };
