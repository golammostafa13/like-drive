"use client";

import { useEffect } from "react";

/**
 * Keep saved reading positions from accumulating for ever.
 *
 * The reader stores a position per file under `gdrive:progress:<fileId>` as
 * `{ page, savedAt }`. Keying on the id rather than the name is what makes
 * rename and move free — the position follows the file, because the id is the
 * one thing about it that never changes.
 *
 * Deletion is the case no server can clean up: the key lives in every reader's
 * browser, and a Server Action has no way to reach any of them. Two things
 * handle it between them, and neither is this hook's cleverness:
 *
 *   1. **The reader deletes its own key when the file 404s.** That is the
 *      precise fix, it happens at exactly the right moment, and it needs no
 *      knowledge of what else exists.
 *   2. **This hook expires entries by age**, for the reader who opens one file
 *      once and never returns to it. It is a broom, not a reconciliation.
 *
 * An earlier version of this also removed any id missing from the current
 * folder listing. That was wrong: a file in a *different* folder is perfectly
 * alive and absent from this listing, so it deleted positions for files that
 * still existed every time someone opened a subfolder.
 */

const PREFIX = "gdrive:progress:";
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export function usePruneProgress() {
  useEffect(() => {
    const now = Date.now();

    try {
      const doomed: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;

        let savedAt = 0;
        try {
          const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "");
          if (parsed && typeof parsed === "object" && "savedAt" in parsed) {
            savedAt = Number((parsed as { savedAt: unknown }).savedAt) || 0;
          }
        } catch {
          // A key written by an older version, or corrupted. Undatable
          // entries are swept rather than kept for ever.
          savedAt = 0;
        }

        if (savedAt === 0 || now - savedAt > MAX_AGE_MS) doomed.push(key);
      }

      // Collected first, removed after: removing inside the loop shifts every
      // subsequent index and silently skips half the keys.
      for (const key of doomed) localStorage.removeItem(key);
    } catch {
      // Private browsing, blocked site data, a quota error. A reading position
      // is a convenience; none of this is worth an exception reaching a page.
    }
    // Once per mount of the drive page. There is nothing to react to: this is
    // housekeeping, not a view of state.
  }, []);
}
