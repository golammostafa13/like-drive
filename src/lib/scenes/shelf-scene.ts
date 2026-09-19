import * as THREE from "three";
import {
  createDisposer,
  createLoop,
  readToken,
  safePixelRatio,
  type SceneOptions,
} from "@/lib/scenes/harness";

/**
 * Files as spines on a shelf, pushed along by the pointer.
 *
 * ── One InstancedMesh, not one mesh per file ──────────────────────────────
 * A folder of two hundred documents must stay one draw call. Two hundred
 * meshes would each carry their own matrix upload and material binding, and
 * the frame cost would rise linearly with a number the user chooses — which is
 * how a view that is pleasant with a dozen files becomes unusable with a
 * hundred, on exactly the drives where it would be most useful.
 *
 * ── Why the spines carry no thumbnail ─────────────────────────────────────
 * That one draw call is bought with one shared material, and a shared material
 * means a shared texture. Giving each spine its own cover therefore needs
 * either an atlas plus per-instance UV offsets injected through
 * `onBeforeCompile`, or a texture array — both of which are a custom shader,
 * and a custom shader has to be recompiled on every theme change, which is a
 * dropped frame at exactly the moment someone is watching the colours change.
 *
 * So the spines are coloured, not covered, and the hovered one names itself in
 * ordinary DOM beneath the canvas — which is also the only version of this a
 * screen reader can use. Thumbnails already exist where they earn their place:
 * the grid view, as real `<img>` elements the browser can cache, lazy-load and
 * decode off the main thread.
 *
 * `MAX_SPINES` bounds the instance buffers for a folder someone fills with
 * thousands of files; beyond it the shelf shows the first slice and the grid
 * remains the complete view.
 */

const MAX_SPINES = 400;

export interface ShelfScene {
  /** Which spine is under the pointer, or -1. Returned for the caption. */
  focused(): number;
  /** Open the focused file. Set by the host. */
  onActivate(handler: (index: number) => void): void;
  refreshTheme(): void;
  dispose(): void;
}

export interface ShelfItem {
  id: string;
  name: string;
  /** Relative thickness, from the page count — a long document is a fat book. */
  thickness: number;
  hasThumb: boolean;
}

export function createShelfScene(
  options: SceneOptions & { items: ShelfItem[] },
): ShelfScene {
  const { canvas, container, items, onReady } = options;
  const disposer = createDisposer();
  const count = Math.min(items.length, MAX_SPINES);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(safePixelRatio());
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 120);
  camera.position.set(0, 0.6, 9);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 6, 8);
  scene.add(ambient, key);

  const geometry = disposer.track(new THREE.BoxGeometry(1, 1, 1));
  const material = disposer.track(
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
  );

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(count, 1));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Per-instance tint. Colour is the one thing an InstancedMesh can vary
  // without a custom shader, which is exactly why the spines are coloured
  // rather than covered — see the note at the top of this file.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(Math.max(count, 1) * 3),
    3,
  );
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  /** Lay the spines out along x, each as wide as its page count suggests. */
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const width = 0.24 + items[i].thickness * 0.5;
    offsets.push(cursor + width / 2);
    cursor += width + 0.04;
  }
  const shelfWidth = cursor;

  function refreshTheme() {
    key.color.set(readToken("--brand-1", "#6366f1"));
    for (let i = 0; i < count; i++) {
      // Spread hues across the accent so neighbouring spines separate, the
      // way a real shelf does. Deterministic in the index, so a spine keeps
      // its colour across re-renders.
      tint.set(readToken("--accent", "#4f46c8"));
      tint.offsetHSL(((i * 0.13) % 1) * 0.12 - 0.06, 0, ((i % 5) - 2) * 0.03);
      mesh.setColorAt(i, tint);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  refreshTheme();

  // ── Pointer: scrub along the shelf, and pick ─────────────────────────────
  let pan = 0;
  let panTarget = 0;
  let hovered = -1;
  let activate: ((index: number) => void) | null = null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onPointerMove(event: PointerEvent) {
    const rect = container.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    // Pointer near an edge pushes the shelf along, so the whole row is
    // reachable without a scrollbar competing with the page's own.
    panTarget = pointer.x * Math.max(0, shelfWidth / 2 - 4);
  }

  function onClick() {
    if (hovered >= 0) activate?.(hovered);
  }

  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("click", onClick);

  let announced = false;

  const stop = createLoop(container, (delta) => {
    pan += (panTarget - pan) * (1 - Math.exp(-4 * delta));

    for (let i = 0; i < count; i++) {
      const width = 0.24 + items[i].thickness * 0.5;
      const x = offsets[i] - shelfWidth / 2 - pan;
      const lift = i === hovered ? 0.35 : 0;
      dummy.position.set(x, lift, 0);
      dummy.rotation.set(0, i === hovered ? 0.35 : 0, 0);
      dummy.scale.set(width, 2.4, 0.9);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(mesh)[0];
    hovered = hit?.instanceId ?? -1;
    container.style.cursor = hovered >= 0 ? "pointer" : "default";

    renderer.render(scene, camera);

    if (!announced) {
      announced = true;
      onReady?.();
    }
  });

  return {
    focused: () => hovered,
    onActivate(handler) {
      activate = handler;
    },
    refreshTheme,
    dispose() {
      stop();
      resizeObserver.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("click", onClick);
      container.style.cursor = "";
      scene.clear();
      mesh.dispose();
      disposer.disposeAll();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
