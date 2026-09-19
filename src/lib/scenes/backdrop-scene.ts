import * as THREE from "three";
import {
  createDisposer,
  createLoop,
  readToken,
  safePixelRatio,
  type SceneHandle,
  type SceneOptions,
} from "@/lib/scenes/harness";

/**
 * The backdrop: a slow drift of translucent shards, lit from three sides.
 *
 * Mounted once in the layout and left alone, so it survives navigation rather
 * than tearing down and rebuilding on every route change — which is both
 * cheaper and the only way the motion reads as continuous rather than as a
 * flicker between pages.
 *
 * ── The constraints it is built to ────────────────────────────────────────
 *
 * **One draw call.** Every shard is an instance of one plane geometry sharing
 * one material. A hundred separate meshes would look identical and cost a
 * hundred state changes per frame, on a canvas that is meant to be the least
 * important thing on the screen.
 *
 * **No shader of its own.** `MeshStandardMaterial` with three lights, so a
 * theme change is three `Color.set()` calls. A custom shader would mean
 * recompiling on every toggle, and a compile is a frame drop at exactly the
 * moment the user is looking at the colours changing.
 *
 * **No loop point.** The three rotation rates are deliberately not multiples
 * of one another, so the arrangement does not visibly repeat. A backdrop you
 * can catch repeating stops being background.
 *
 * **It yields.** `dispose()` is called outright when the reader opens a PDF —
 * see `BackdropHost` — because the reader holds tens of megabytes of page
 * bitmaps and a live GPU context beside that is how a phone kills the tab.
 */

const COUNT = 68;

interface Shard {
  base: THREE.Vector3;
  axis: THREE.Vector3;
  phase: number;
  drift: number;
  spin: number;
  scale: number;
}

export function createBackdropScene(options: SceneOptions): SceneHandle {
  const { canvas, container, onReady } = options;
  const disposer = createDisposer();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(safePixelRatio());
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  // ── Lights: the three brand tokens, read from CSS ────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const lightA = new THREE.PointLight(0xffffff, 120, 60);
  const lightB = new THREE.PointLight(0xffffff, 100, 60);
  const lightC = new THREE.PointLight(0xffffff, 80, 60);
  lightA.position.set(-9, 6, 8);
  lightB.position.set(10, -4, 6);
  lightC.position.set(0, 8, -6);
  scene.add(ambient, lightA, lightB, lightC);

  // ── The shards ───────────────────────────────────────────────────────────
  const geometry = disposer.track(new THREE.PlaneGeometry(1, 1.4));
  const material = disposer.track(
    new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.5,
      roughness: 0.35,
      metalness: 0.1,
      side: THREE.DoubleSide,
      // Additive so overlapping shards build light rather than muddying into
      // a flat grey — which is what happens with normal blending and is the
      // usual reason this kind of backdrop looks cheap.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const shards: Shard[] = [];
  for (let i = 0; i < COUNT; i++) {
    shards.push({
      base: new THREE.Vector3(
        (Math.random() - 0.5) * 26,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 14 - 4,
      ),
      axis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize(),
      phase: Math.random() * Math.PI * 2,
      // Not multiples of each other: see the note on loop points above.
      drift: 0.08 + Math.random() * 0.13,
      spin: 0.04 + Math.random() * 0.09,
      scale: 0.5 + Math.random() * 1.9,
    });
  }

  const dummy = new THREE.Object3D();
  const quaternion = new THREE.Quaternion();

  function refreshTheme() {
    lightA.color.set(readToken("--brand-1", "#6366f1"));
    lightB.color.set(readToken("--brand-2", "#8b5cf6"));
    lightC.color.set(readToken("--brand-3", "#22d3ee"));
    material.color.set(readToken("--surface", "#ffffff"));
    // The dark theme needs less of everything: the same opacity that reads as
    // a whisper on white reads as fog on near-black.
    const dark = document.documentElement.classList.contains("dark");
    material.opacity = dark ? 0.32 : 0.5;
    ambient.intensity = dark ? 0.18 : 0.35;
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

  let elapsed = 0;
  let announced = false;

  const stop = createLoop(container, (delta) => {
    elapsed += delta;

    for (let i = 0; i < COUNT; i++) {
      const shard = shards[i];
      dummy.position.set(
        shard.base.x + Math.sin(elapsed * shard.drift + shard.phase) * 1.6,
        shard.base.y + Math.cos(elapsed * shard.drift * 0.8 + shard.phase) * 1.2,
        shard.base.z,
      );
      quaternion.setFromAxisAngle(shard.axis, elapsed * shard.spin + shard.phase);
      dummy.quaternion.copy(quaternion);
      dummy.scale.setScalar(shard.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);

    if (!announced) {
      announced = true;
      onReady?.();
    }
  });

  return {
    refreshTheme,
    dispose() {
      stop();
      resizeObserver.disconnect();
      scene.clear();
      // `InstancedMesh.dispose()` frees the instance buffers; its geometry and
      // material are tracked separately because they are shared and three.js
      // will not free them from here.
      mesh.dispose();
      disposer.disposeAll();
      renderer.dispose();
      // Hand the GPU context back rather than waiting for collection: a
      // browser allows only a handful, and this scene is mounted and disposed
      // every time the reader is opened and closed.
      renderer.forceContextLoss();
    },
  };
}
