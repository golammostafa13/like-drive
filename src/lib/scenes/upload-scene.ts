import * as THREE from "three";
import {
  createDisposer,
  createLoop,
  readToken,
  safePixelRatio,
  type SceneOptions,
} from "@/lib/scenes/harness";

/**
 * A sheet of paper flying into a folder, driven by the upload itself.
 *
 * The important thing about this scene is what drives it. `setProgress` is fed
 * from `xhr.upload.onprogress` — the real count of bytes acknowledged — so the
 * sheet's position along its arc *is* the progress bar. That is the whole
 * reason `lib/upload/client` uses `XMLHttpRequest` in 2026: `fetch` reports no
 * upload progress, and an animation eased on a timer would be a lie told at
 * sixty frames a second, arriving before the bytes do or still flying after
 * they have landed.
 *
 * The progress it is given is smoothed, not snapped. A network delivering
 * bytes in bursts produces a value that jumps, and a sheet that teleports
 * reads as a glitch; easing toward the target keeps the motion continuous
 * while never letting it run ahead of the truth.
 */

export interface UploadScene {
  /** 0 → 1, from the real upload. */
  setProgress(value: number): void;
  /** The bytes have landed; play the drop and the folder's pulse. */
  land(): void;
  refreshTheme(): void;
  dispose(): void;
}

export function createUploadScene(options: SceneOptions): UploadScene {
  const { canvas, container, onReady } = options;
  const disposer = createDisposer();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(safePixelRatio());
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 100);
  camera.position.set(0, 1.4, 7.2);
  camera.lookAt(0, -0.2, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  const rim = new THREE.PointLight(0xffffff, 40, 20);
  rim.position.set(-4, 1, 3);
  scene.add(ambient, key, rim);

  // ── The sheet ────────────────────────────────────────────────────────────
  const sheetGeometry = disposer.track(new THREE.PlaneGeometry(1.5, 2, 12, 16));
  const sheetMaterial = disposer.track(
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0.02,
    }),
  );
  const sheet = new THREE.Mesh(sheetGeometry, sheetMaterial);
  scene.add(sheet);

  // The undeformed vertex positions, kept so the fold can be recomputed from
  // the original every frame rather than accumulating on itself — which is
  // what makes a deformation drift and eventually turn inside out.
  const rest = Float32Array.from(
    (sheetGeometry.attributes.position as THREE.BufferAttribute).array,
  );

  // ── The folder ───────────────────────────────────────────────────────────
  const folderGroup = new THREE.Group();
  folderGroup.position.set(2.6, -1.5, 0);

  const bodyGeometry = disposer.track(new THREE.BoxGeometry(2.4, 1.6, 0.35));
  const folderMaterial = disposer.track(
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.08 }),
  );
  const body = new THREE.Mesh(bodyGeometry, folderMaterial);

  const tabGeometry = disposer.track(new THREE.BoxGeometry(0.9, 0.25, 0.35));
  const tab = new THREE.Mesh(tabGeometry, folderMaterial);
  tab.position.set(-0.7, 0.92, 0);

  folderGroup.add(body, tab);
  scene.add(folderGroup);

  function refreshTheme() {
    sheetMaterial.color.set(readToken("--surface-2", "#ffffff"));
    folderMaterial.color.set(readToken("--accent", "#4f46c8"));
    rim.color.set(readToken("--accent-lit", "#a78bfa"));
    key.color.set(readToken("--brand-1", "#6366f1"));
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

  let target = 0;
  let shown = 0;
  let landedAt = -1;
  let elapsed = 0;
  let announced = false;

  const stop = createLoop(container, (delta) => {
    elapsed += delta;

    // Ease toward the true value rather than snapping to it. Framerate-
    // independent: the same 1 - e^(-kt) curve at 30fps and at 120fps.
    shown += (target - shown) * (1 - Math.exp(-6 * delta));

    // A shallow arc from the left into the folder's mouth.
    const t = Math.min(shown, 1);
    sheet.position.x = -3.2 + t * 5.6;
    sheet.position.y = 0.9 - Math.sin(t * Math.PI) * -0.9 - t * 2.1;
    sheet.position.z = Math.sin(t * Math.PI) * 0.8;
    sheet.rotation.z = -0.5 + t * 0.9;
    sheet.rotation.y = t * 0.8;

    // The paper curls as it flies, and flattens as it lands.
    const curl = Math.sin(t * Math.PI) * 0.55;
    const position = sheetGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      position.setXYZ(
        i,
        x,
        y,
        Math.sin(x * 1.6 + elapsed * 2) * curl * 0.25 + x * x * curl * 0.3,
      );
    }
    position.needsUpdate = true;
    sheetGeometry.computeVertexNormals();

    if (landedAt >= 0) {
      const since = elapsed - landedAt;
      // One short pulse, not a loop: it marks a moment that has passed.
      const pulse = Math.max(0, 1 - since * 2.2);
      folderGroup.scale.setScalar(1 + pulse * 0.16);
      sheetMaterial.opacity = Math.max(0, 1 - since * 2.4);
      sheetMaterial.transparent = true;
    }

    renderer.render(scene, camera);

    if (!announced) {
      announced = true;
      onReady?.();
    }
  });

  return {
    setProgress(value: number) {
      target = Math.min(Math.max(value, 0), 1);
    },
    land() {
      target = 1;
      if (landedAt < 0) landedAt = elapsed;
    },
    refreshTheme,
    dispose() {
      stop();
      resizeObserver.disconnect();
      scene.clear();
      disposer.disposeAll();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
