"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { useTheme } from "@/components/theme-provider";
import type { SceneHandle } from "@/lib/scenes/harness";

/**
 * The mark in the header: the flat logo, with a turning crystal over it where
 * that is affordable.
 *
 * Both are always in the DOM and the SVG never unmounts. The canvas fades in
 * over it once the first frame lands and fades out if the scene is disposed,
 * so there is no frame in which the header has no logo — which is what would
 * happen if this swapped one element for the other on a slow device.
 *
 * three.js is imported inside the effect, exactly as `Backdrop` does it, so
 * neither the library nor the scene reaches the initial bundle. On a page that
 * already mounts the backdrop, this import is served from the module cache and
 * costs nothing beyond the scene itself.
 */
export function BrandMark3D({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const [ready, setReady] = useState(false);

  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { shouldAnimate } = await import("@/lib/scenes/harness");
      if (!shouldAnimate()) return;

      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container || cancelled) return;

      const { createMarkScene } = await import("@/lib/scenes/mark-scene");
      if (cancelled) return;

      sceneRef.current = createMarkScene({
        canvas,
        container,
        onReady: () => setReady(true),
      });
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.refreshTheme();
  }, [resolvedTheme]);

  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <BrandMark className="size-full" />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 size-full transition-opacity duration-700"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </span>
  );
}
