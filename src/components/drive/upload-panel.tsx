"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import {
  abandonUpload,
  commitUpload,
  createUploadTicket,
} from "@/lib/actions/upload";
import { Button } from "@/components/ui/button";
import { UploadScene } from "@/components/drive/upload-scene-host";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { formatBytes, textClass } from "@/lib/i18n/content";
import { fill } from "@/lib/i18n/format";
import { MAX_FILE_NAME, suggestedName } from "@/lib/names";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/keys";
import { putToSignedUrl } from "@/lib/upload/client";
import { renderFirstPage } from "@/lib/upload/thumbnail";
import { cn } from "@/lib/utils";

/**
 * The upload, end to end.
 *
 * Four steps, and only the first and last touch this server:
 *
 *   1. `createUploadTicket` — the server checks the admin, reserves a row and
 *      mints two signed URLs. No bytes.
 *   2. The PUT — straight to Supabase Storage, with real progress. Vercel's
 *      free tier caps a request body at ~4.5MB, so the bytes could not come
 *      this way even if we wanted them to.
 *   3. The thumbnail — pdf.js renders page one in this browser, where the file
 *      already is, and PUTs the result to the second URL.
 *   4. `commitUpload` — the server verifies the object exists and begins with
 *      `%PDF-`, then promotes the row to `ready`.
 *
 * A failure at any point leaves the row `pending`, which every listing query
 * filters out, so a broken upload is invisible rather than a card that 404s.
 * `abandonUpload` clears it immediately; the daily cron would anyway.
 */

type Phase =
  | "idle"
  | "preparing"
  | "sending"
  | "thumbnailing"
  | "finishing"
  | "done";

export function UploadPanel({
  folderId,
  onClose,
  dict,
  lang,
}: {
  folderId: string | null;
  onClose: () => void;
  dict: Dictionary;
  lang: Locale;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function choose(next: File | null) {
    setError(null);
    if (!next) return;

    // Both checks are courtesies that save a round trip. The limits that
    // cannot be talked past are the bucket's own `allowed_mime_types` and
    // `file_size_limit`, enforced by Supabase on the PUT.
    if (next.type !== "application/pdf") {
      setError(dict.upload.notPdf);
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setError(
        fill(lang, dict.upload.tooLarge, {
          size: formatBytes(next.size, lang),
          limit: formatBytes(MAX_UPLOAD_BYTES, lang),
        }),
      );
      return;
    }

    setFile(next);
    setName(suggestedName(next.name));
  }

  async function start() {
    if (!file) return;
    setError(null);
    setPhase("preparing");
    setProgress(0);

    const ticket = await createUploadTicket({
      name,
      folderId,
      sizeBytes: file.size,
    });

    if (!ticket.ok) {
      setError(ticket.error);
      setPhase("idle");
      return;
    }

    const { fileId, pdfUrl, thumbUrl } = ticket.value;

    try {
      setPhase("sending");
      await putToSignedUrl({
        url: pdfUrl,
        body: file,
        contentType: "application/pdf",
        onProgress: setProgress,
      });

      // The thumbnail is best-effort on purpose. A browser that cannot render
      // page one — an encrypted PDF, an out-of-memory phone — should still
      // finish the upload; the grid falls back to an icon. Failing the whole
      // upload over a preview would be the wrong trade.
      setPhase("thumbnailing");
      let pageCount: number | null = null;
      let hasThumb = false;
      try {
        const thumb = await renderFirstPage(file);
        if (thumb) {
          pageCount = thumb.pageCount;
          await putToSignedUrl({
            url: thumbUrl,
            body: thumb.blob,
            contentType: thumb.blob.type || "image/webp",
          });
          hasThumb = true;
        }
      } catch {
        hasThumb = false;
      }

      setPhase("finishing");
      const committed = await commitUpload({ fileId, pageCount, hasThumb });
      if (!committed.ok) {
        setError(committed.error);
        setPhase("idle");
        return;
      }

      setPhase("done");
      // `router.refresh()` re-runs the Server Component with the new row.
      // `revalidatePath` in the action clears the cache; this is what makes
      // the open page redraw without a navigation.
      router.refresh();
      ref.current?.close();
      onClose();
    } catch (caught) {
      // Clear the reservation now so the name is free for an immediate retry,
      // rather than leaving it for the two-hour reaper.
      await abandonUpload(fileId).catch(() => {});
      setError(
        caught instanceof Error ? caught.message : dict.upload.failed,
      );
      setPhase("idle");
    }
  }

  const busy = phase !== "idle" && phase !== "done";

  const status =
    phase === "preparing"
      ? dict.upload.preparing
      : phase === "sending"
        ? fill(lang, dict.upload.sending, {
            percent: Math.round(progress * 100),
          })
        : phase === "thumbnailing"
          ? dict.upload.thumbnailing
          : phase === "finishing"
            ? dict.upload.finishing
            : "";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="card m-auto w-[min(34rem,calc(100vw-2rem))] p-6 backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <h2 className={cn("text-lg font-semibold", textClass(lang))}>
        {dict.upload.title}
      </h2>
      <p className={cn("mt-1 text-sm text-ink-mute", textClass(lang))}>
        {fill(lang, dict.drive.uploadHint, {
          size: formatBytes(MAX_UPLOAD_BYTES, lang),
        })}
      </p>

      {/* The 3D sheet flying into the folder. It is driven by `progress`,
          which comes from the real XHR upload event — the animation is the
          progress bar, so it must never be a timed guess. */}
      <UploadScene phase={phase} progress={progress} />

      {!busy && phase !== "done" && (
        <div className="mt-4 space-y-4">
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-8 text-sm text-ink-mute transition-colors hover:border-accent hover:text-accent",
              textClass(lang),
            )}
          >
            <FileUp className="size-5" aria-hidden="true" />
            {file ? file.name : dict.upload.drop}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <div className="space-y-2">
              <label
                htmlFor="upload-name"
                className={cn("block text-sm text-ink-mute", textClass(lang))}
              >
                {dict.drive.renameTo}
              </label>
              <input
                id="upload-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_FILE_NAME}
                className={cn(
                  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-ink",
                  textClass(lang),
                )}
              />
            </div>
          )}
        </div>
      )}

      {busy && (
        <div className="mt-4">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={dict.upload.title}
            className="h-2 overflow-hidden rounded-full bg-bg-deep"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${Math.max(progress * 100, 4)}%` }}
            />
          </div>
          <p
            aria-live="polite"
            className={cn("mt-2 text-sm text-ink-mute", textClass(lang))}
          >
            {status}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            ref.current?.close();
            onClose();
          }}
          className={textClass(lang)}
        >
          {dict.common.cancel}
        </Button>
        <Button
          type="button"
          disabled={!file || busy}
          onClick={start}
          className={textClass(lang)}
        >
          {dict.drive.upload}
        </Button>
      </div>
    </dialog>
  );
}
