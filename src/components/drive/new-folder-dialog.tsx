"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createFolderAction } from "@/lib/actions/drive";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { MAX_FOLDER_NAME } from "@/lib/names";
import { cn } from "@/lib/utils";

/**
 * A native `<dialog>`, opened modally.
 *
 * `showModal()` rather than a div with a high z-index: the browser then
 * handles the focus trap, the inert background, Escape to close, and the
 * top-layer stacking that otherwise fights every `overflow: hidden` ancestor.
 * All of that is behaviour the WAI-ARIA dialog pattern requires and that a
 * hand-rolled overlay reimplements badly.
 */
export function NewFolderDialog({
  parentId,
  onClose,
  dict,
  lang,
}: {
  parentId: string | null;
  onClose: () => void;
  dict: Dictionary;
  lang: Locale;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Only `showModal()` puts the element in the top layer and makes the rest
    // of the page inert; the `open` attribute alone does neither.
    ref.current?.showModal();
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createFolderAction({ parentId, name });
      if (result.ok) {
        ref.current?.close();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <dialog
      ref={ref}
      // Fires for Escape as well as for `close()`, so the parent's state
      // cannot be left thinking the dialog is still open.
      onClose={onClose}
      className="card m-auto w-[min(28rem,calc(100vw-2rem))] p-6 backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <h2 className={cn("text-lg font-semibold", textClass(lang))}>
          {dict.drive.newFolder}
        </h2>

        <div className="space-y-2">
          <label
            htmlFor="folder-name"
            className={cn("block text-sm text-ink-mute", textClass(lang))}
          >
            {dict.drive.newFolderName}
          </label>
          <input
            id="folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_FOLDER_NAME}
            required
            autoFocus
            className={cn(
              "h-11 w-full rounded-xl border border-line bg-surface px-3 text-ink",
              textClass(lang),
            )}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              ref.current?.close();
              onClose();
            }}
            className={textClass(lang)}
          >
            {dict.common.cancel}
          </Button>
          <Button type="submit" disabled={pending} className={textClass(lang)}>
            {pending ? dict.common.loading : dict.common.save}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
