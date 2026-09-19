"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import type { Dictionary } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import { formatBytes, textClass } from "@/lib/i18n/content";
import type { ShelfScene } from "@/lib/scenes/shelf-scene";
import { cn } from "@/lib/utils";
import type { DriveFile } from "@/types";

/**
 * The 3D shelf, plus the list that makes it usable without it.
 *
 * The canvas is `aria-hidden` and the `<ul>` beneath it is not visually
 * hidden — it is the caption row *and* the real control. That is deliberate
 * rather than an accessibility afterthought: a WebGL canvas is a single opaque
 * element to a screen reader and to a keyboard, so a shelf that were only a
 * canvas would be a view with no way in for anyone not using a mouse.
 *
 * So the links below are how the files are opened, and the shelf is a picture
 * of them that happens to also respond to a click. On reduced motion, without
 * WebGL, or on a low-memory device, the canvas simply never mounts and the
 * list is the entire view — still complete, still ordered, still navigable.
 */
export function ShelfView({
  files,
  dict,
  lang,
}: {
  files: DriveFile[];
  dict: Dictionary;
  lang: Locale;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ShelfScene | null>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [focused, setFocused] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    let poll = 0;

    (async () => {
      const { shouldAnimate } = await import("@/lib/scenes/harness");
      if (!shouldAnimate()) return;

      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container || cancelled) return;

      const { createShelfScene } = await import("@/lib/scenes/shelf-scene");
      if (cancelled) return;

      sceneRef.current = createShelfScene({
        canvas,
        container,
        onReady: () => setMounted(true),
        items: files.map((file) => ({
          id: file.id,
          name: file.name,
          // Page count as thickness, normalised so a 1,500-page reference
          // volume is a fat spine and a two-page note is a thin one, without
          // either running off the shelf. Clamped, because one outlier would
          // otherwise flatten every other spine to the same sliver.
          thickness: Math.min((file.pageCount ?? 40) / 400, 1),
          hasThumb: file.hasThumb,
        })),
      });

      sceneRef.current.onActivate((index) => {
        const file = files[index];
        if (file) router.push(localePath(lang, `/read/${file.id}`));
      });

      // The hovered spine lives inside the render loop, which is outside
      // React. Polling it a few times a second is enough for a caption and
      // costs nothing; lifting it through a callback per frame would mean a
      // React render at 60fps for one line of text.
      poll = window.setInterval(() => {
        setFocused(sceneRef.current?.focused() ?? -1);
      }, 120);
    })();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setMounted(false);
    };
  }, [files, lang, router]);

  useEffect(() => {
    sceneRef.current?.refreshTheme();
  }, [resolvedTheme]);

  const hovered = focused >= 0 ? files[focused] : null;

  return (
    <div>
      <div className="relative h-72 overflow-hidden rounded-xl bg-bg-deep sm:h-80">
        <canvas ref={canvasRef} aria-hidden="true" className="size-full" />

        {mounted && (
          <p
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/70 to-transparent px-4 py-3 text-sm text-white",
              textClass(lang),
            )}
          >
            {hovered
              ? `${hovered.name} · ${formatBytes(hovered.sizeBytes, lang)}`
              : ""}
          </p>
        )}
      </div>

      {/* Not a fallback — the real list, always present. See the note above. */}
      <ul className="mt-4 flex flex-wrap gap-2">
        {files.map((file) => (
          <li key={file.id}>
            <Link
              href={localePath(lang, `/read/${file.id}`)}
              className={cn(
                "inline-block max-w-[14rem] truncate rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-mute hover:border-accent hover:text-accent",
                textClass(lang),
              )}
            >
              {file.name}
            </Link>
          </li>
        ))}
      </ul>

      <p className="sr-only">{dict.drive.viewShelf}</p>
    </div>
  );
}
