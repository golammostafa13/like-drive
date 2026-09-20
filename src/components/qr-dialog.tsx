"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { fill } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * The QR code for one file, with the PNG behind a download button.
 *
 * A native `<dialog>` opened with `showModal()`, for the reasons written at
 * the top of `drive/new-folder-dialog`: the focus trap, the inert background,
 * Escape, and top-layer stacking are all the browser's job and it does them
 * properly.
 *
 * The code itself is drawn by `/api/file/[id]/qr` rather than in the browser,
 * which keeps the QR encoder out of the client bundle entirely — this dialog
 * is an `<img>` and two buttons. It costs one request that the session already
 * allows, and the response is cacheable for an hour.
 */
export function QrDialog({
  fileId,
  fileName,
  onClose,
  dict,
  lang,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
  dict: Dictionary;
  lang: Locale;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /**
   * The address the code points at, shown as text beneath it.
   *
   * Read straight from `window` during render, which is safe here in a way it
   * would not be in most components: this dialog is mounted by a click and so
   * never renders on the server, leaving no first HTML for a hydration pass to
   * disagree with. The `typeof` guard is belt-and-braces for that claim.
   *
   * Display only. The code itself is drawn from the request's own host on the
   * server, which arrives at the same answer by the same reasoning.
   */
  const target =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${localePath(lang, `/read/${fileId}`)}`;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function close() {
    ref.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="card m-auto w-[min(24rem,calc(100vw-2rem))] p-6 backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className={cn("text-lg font-semibold", textClass(lang))}>
            {dict.qr.title}
          </h2>
          <p className={cn("text-sm text-ink-mute", textClass(lang))}>
            {dict.qr.hint}
          </p>
        </div>

        {/* White plate under the code whatever the theme: a QR inverted by
            dark mode is a QR most scanners refuse, and the PNG's own quiet
            zone is white. */}
        <div className="flex justify-center rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element --
              next/image would proxy a private, session-gated PNG through the
              optimizer, which neither needs resizing nor may be cached
              between people. */}
          <img
            src={`/api/file/${fileId}/qr?lang=${lang}`}
            alt={fill(lang, dict.qr.alt, { title: fileName })}
            width={256}
            height={256}
            className="size-56 max-w-full"
          />
        </div>

        {target && (
          <p className="break-all text-center text-xs text-ink-faint" dir="ltr">
            {target}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={close}
            className={textClass(lang)}
          >
            {dict.common.close}
          </Button>
          <Button asChild className={textClass(lang)}>
            <a href={`/api/file/${fileId}/qr?lang=${lang}&download=1`} download>
              <Download className="size-4" aria-hidden="true" />
              {dict.qr.download}
            </a>
          </Button>
        </div>
      </div>
    </dialog>
  );
}
