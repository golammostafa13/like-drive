"use client";

import { useState, useTransition } from "react";
import { Download, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteAction, renameAction } from "@/lib/actions/drive";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { fill } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * Rename, download and delete, for an administrator.
 *
 * Rendered only when the session may administer — and that is a courtesy, not
 * a permission. Both actions below call `requireAdmin()` as their first
 * statement on the server, because a Server Action is reachable by direct POST
 * and never passes through the route guard. Hiding this menu stops a reader
 * being confused; it does not stop anybody doing anything.
 *
 * The menu is a `<details>` element rather than a state-driven popover: it
 * opens and closes without JavaScript, closes on Escape natively, and is
 * focusable and announced as a disclosure without a single ARIA attribute. For
 * three items that is the whole feature.
 */
export function RowActions({
  kind,
  id,
  name,
  inline = false,
  dict,
  lang,
}: {
  kind: "file" | "folder";
  id: string;
  name: string;
  inline?: boolean;
  dict: Dictionary;
  lang: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function rename() {
    const next = window.prompt(dict.drive.renameTo, name);
    // Cancel gives null; an unchanged name is not worth a round trip.
    if (next === null || next.trim() === name) return;

    startTransition(async () => {
      const result = await renameAction({ kind, id, name: next });
      setError(result.ok ? null : result.error);
    });
  }

  function remove() {
    const message = fill(
      lang,
      kind === "folder"
        ? dict.drive.deleteFolderConfirm
        : dict.drive.deleteFileConfirm,
      { name },
    );
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await deleteAction({ kind, id });
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <div
      className={cn(
        "z-10",
        inline
          ? "shrink-0"
          : "absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
      )}
    >
      <details className="relative">
        <summary
          className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg bg-surface/90 text-ink-mute backdrop-blur hover:text-ink [&::-webkit-details-marker]:hidden"
          aria-label={dict.drive.sortBy}
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </summary>

        <div className="card absolute right-0 top-9 z-20 w-44 overflow-hidden p-1 text-sm">
          {kind === "file" && (
            <a
              href={`/api/file/${id}/download`}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent-soft hover:text-accent",
                textClass(lang),
              )}
            >
              <Download className="size-4" aria-hidden="true" />
              {dict.common.download}
            </a>
          )}

          <button
            type="button"
            onClick={rename}
            disabled={pending}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent-soft hover:text-accent disabled:opacity-50",
              textClass(lang),
            )}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {dict.drive.rename}
          </button>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-danger hover:bg-danger-soft disabled:opacity-50",
              textClass(lang),
            )}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {dict.drive.delete}
          </button>

          {error && (
            <p role="alert" className="px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
