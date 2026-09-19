"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme-provider";
import type { UploadScene as Scene } from "@/lib/scenes/upload-scene";

/**
 * Mounts the upload animation, and refuses to when it would be wrong.
 *
 * Note what it does *not* replace. The determinate `<progressbar>` in
 * `UploadPanel` is always rendered, with a real `aria-valuenow`; this canvas
 * sits above it and is `aria-hidden`. So a reader on `prefers-reduced-motion`,
 * on a device with no WebGL, or using a screen reader loses nothing but the
 * decoration — the actual progress is conveyed by the bar and the live region
 * either way.
 *
 * That ordering matters: the animation is an illustration of the progress, not
 * the report of it.
 */
export function UploadScene({
  phase,
  progress,
}: {
  phase: string;
  progress: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { shouldAnimate } = await import("@/lib/scenes/harness");
      if (!shouldAnimate()) return;

      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container || cancelled) return;

      const { createUploadScene } = await import("@/lib/scenes/upload-scene");
      if (cancelled) return;

      sceneRef.current = createUploadScene({ canvas, container });
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.refreshTheme();
  }, [resolvedTheme]);

  useEffect(() => {
    sceneRef.current?.setProgress(progress);
  }, [progress]);

  useEffect(() => {
    // The bytes are in; everything after this is the server checking them.
    if (phase === "finishing" || phase === "done") sceneRef.current?.land();
  }, [phase]);

  // Only occupies space while something is happening: an empty 3D stage above
  // a file picker is decoration with nothing to illustrate.
  if (phase === "idle") return null;

  return (
    <div className="mt-4 h-40 w-full overflow-hidden rounded-xl bg-bg-deep">
      <canvas ref={canvasRef} aria-hidden="true" className="size-full" />
    </div>
  );
}
