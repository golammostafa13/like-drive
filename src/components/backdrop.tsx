"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import type { SceneHandle } from "@/lib/scenes/harness";

/**
 * Mounts the WebGL backdrop, and knows when not to.
 *
 * Three things decide whether a renderer exists at all, and each is a hard no
 * rather than a degradation:
 *
 *   1. `prefers-reduced-motion`, or no WebGL, or a low-memory device —
 *      checked by `shouldAnimate()`. The CSS gradient underneath is not a
 *      placeholder in that case; it is the design.
 *
 *   2. **The reader.** On `/read/[id]` the scene is disposed outright rather
 *      than paused. pdf.js budgets tens of megabytes of page bitmaps by its
 *      own account, and a paused canvas still holds its GPU context and its
 *      buffers — the saving from pausing is the frame time, which is not the
 *      resource under pressure there. It comes back on the way out.
 *
 *   3. Server rendering, obviously: three.js is imported inside the effect so
 *      that neither it nor the scene module lands in the initial bundle. It is
 *      about 600KB, and nobody should pay for it before the page is usable.
 *
 * The still gradient sits underneath permanently rather than being swapped
 * out. It costs nothing, it is what shows during the moment before the first
 * frame, and it means the disposal in case 2 reveals a background rather than
 * a hole.
 */
export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const [ready, setReady] = useState(false);

  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  // `/en/read/<id>` → the second segment is the route.
  const inReader = pathname.split("/").filter(Boolean)[1] === "read";

  useEffect(() => {
    if (inReader) return;

    let cancelled = false;

    (async () => {
      const { shouldAnimate } = await import("@/lib/scenes/harness");
      if (!shouldAnimate()) return;

      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container || cancelled) return;

      const { createBackdropScene } = await import(
        "@/lib/scenes/backdrop-scene"
      );
      if (cancelled) return;

      sceneRef.current = createBackdropScene({
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
  }, [inReader]);

  // A theme change is three colour assignments, not a rebuild — which is the
  // whole reason the scene reads its palette from CSS custom properties.
  useEffect(() => {
    sceneRef.current?.refreshTheme();
  }, [resolvedTheme]);

  return (
    <div aria-hidden="true">
      <div className="backdrop-still" />
      {!inReader && (
        <canvas
          ref={canvasRef}
          className="backdrop-canvas transition-opacity duration-1000"
          style={{ opacity: ready ? 1 : 0 }}
        />
      )}
    </div>
  );
}
