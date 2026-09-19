/**
 * The rules every WebGL scene in this project follows, in one place.
 *
 * Lifted from the shape the sibling libraries settled on in
 * `lib/lansod-scene.ts` and `lib/exium-scene.ts`, with the parts that were
 * repeated in both pulled out here:
 *
 *   • **Everything created is tracked and disposed.** three.js does not free
 *     GPU memory when an object goes out of scope; a geometry, a material and
 *     a texture each hold buffers until told otherwise. A component that
 *     mounts a scene on every navigation and leaks a renderer each time is a
 *     component that ends the session on a phone — and this app mounts one on
 *     a route the reader enters and leaves constantly.
 *
 *   • **Colours come from CSS custom properties**, never from literals, so a
 *     theme toggle is a `refreshTheme()` call rather than a rebuild, and the
 *     scene can never drift out of step with the rest of the page.
 *
 *   • **The loop stops when nobody is looking.** An `IntersectionObserver` for
 *     scrolling away, and `visibilitychange` for a backgrounded tab.
 *
 *   • **Pixel ratio is capped.** Uncapped `devicePixelRatio` on a modern phone
 *     means rendering four times the pixels of the screen, and it is the
 *     single most common reason a WebGL backdrop is janky on hardware that is
 *     perfectly capable of it.
 */

export interface SceneHandle {
  /** Re-read the design tokens after a light/dark switch. */
  refreshTheme(): void;
  dispose(): void;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  /** Fired once the first frame is on screen, so a fallback can fade out. */
  onReady?: () => void;
}

/**
 * Whether to run WebGL at all.
 *
 * Three independent reasons not to, and the app must be completely usable
 * under every one of them — the scenes are decoration over a working page,
 * never the page itself.
 */
export function shouldAnimate(): boolean {
  if (typeof window === "undefined") return false;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }

  // A device that reports little memory is one where a second GPU context
  // beside a 60MB pdf.js canvas is a real risk rather than a theoretical one.
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory < 4) return false;

  return hasWebGL();
}

let webglSupport: boolean | null = null;

/**
 * Probed once and cached. Creating a context to ask is not free, and asking
 * per scene would mean three contexts created and thrown away on a page that
 * mounts three scenes.
 */
export function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const probe = document.createElement("canvas");
    const gl =
      probe.getContext("webgl2") ??
      probe.getContext("webgl");
    webglSupport = gl !== null;
    // Hand the context back at once rather than holding one of the browser's
    // small, fixed number of them for the life of the page.
    (gl as WebGLRenderingContext | null)
      ?.getExtension("WEBGL_lose_context")
      ?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Never more than 1.5: see the note at the top of this file. */
export function safePixelRatio(): number {
  return Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    1.5,
  );
}

/**
 * Read a CSS custom property as a colour string.
 *
 * Falls back rather than throwing, because this runs inside a render loop's
 * setup and a mistyped token name should cost a wrong colour, not a blank
 * canvas where a background used to be.
 */
export function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * A small bookkeeper for the things three.js will not free on its own.
 *
 * Used as `track(new THREE.BoxGeometry(...))` at the point of creation, so
 * there is never a gap between making a resource and registering it — the gap
 * being where every leak of this kind actually comes from.
 */
export function createDisposer() {
  const items: { dispose(): void }[] = [];

  return {
    track<T extends { dispose(): void }>(item: T): T {
      items.push(item);
      return item;
    },
    disposeAll(): void {
      for (const item of items) {
        try {
          item.dispose();
        } catch {
          // One resource refusing to free must not strand the rest, and the
          // renderer's own dispose() is always the last thing after this.
        }
      }
      items.length = 0;
    },
  };
}

/**
 * Run `frame` on every animation frame, but only while the canvas is on screen
 * and the tab is visible.
 *
 * Returns a stop function that removes every listener and cancels the pending
 * frame. Forgetting one of those is how a disposed scene keeps rendering into
 * a detached canvas.
 */
export function createLoop(
  container: HTMLElement,
  frame: (deltaSeconds: number) => void,
) {
  let running = false;
  let visible = true;
  let onScreen = true;
  let handle = 0;
  let last = 0;

  function tick(now: number) {
    // Clamped: a tab restored after a minute in the background otherwise
    // reports a sixty-second delta and every animation jumps to its end.
    const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    frame(delta);
    handle = requestAnimationFrame(tick);
  }

  function sync() {
    const shouldRun = visible && onScreen;
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) {
      last = 0;
      handle = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(handle);
    }
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    },
    { threshold: 0 },
  );
  observer.observe(container);

  const onVisibility = () => {
    visible = document.visibilityState === "visible";
    sync();
  };
  document.addEventListener("visibilitychange", onVisibility);

  sync();

  return function stop() {
    cancelAnimationFrame(handle);
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    running = false;
  };
}
