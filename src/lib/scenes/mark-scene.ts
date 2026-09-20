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
 * The logo, as one turning crystal.
 *
 * The same octahedron and the same generated environment as the backdrop, at
 * 36 pixels square. Sharing the *language* rather than the code: this scene
 * owns a single mesh with no instancing, no parallax and no mood, because at
 * this size none of that would be visible and all of it would still cost.
 *
 * ── On spending a GPU context on a logo ───────────────────────────────────
 * A browser allows only a handful of live WebGL contexts, and this one is
 * mounted on every page rather than on a route. That is affordable here only
 * because of what it is not: no instancing, one draw call, a canvas smaller
 * than a favicon, and a loop the harness already stops the moment the header
 * scrolls out of view or the tab goes to the background.
 *
 * It is also the first thing dropped. `shouldAnimate()` gates it exactly as
 * it gates the backdrop, and the flat `BrandMark` underneath is a finished
 * logo rather than a placeholder — so reduced motion, a low-memory phone or
 * no WebGL at all costs nothing but the rotation.
 *
 * ── On the speed ──────────────────────────────────────────────────────────
 * One turn every twenty seconds. A logo that spins at a speed you would
 * describe as "spinning" pulls the eye away from the page on every page, which
 * is the opposite of what a mark is for; this one is close to the threshold
 * where you notice it only if you look.
 */

const TURN_SECONDS = 20;

export function createMarkScene(options: SceneOptions): SceneHandle {
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.set(0, 0, 4.2);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const key = new THREE.PointLight(0xffffff, 18, 20);
  key.position.set(2.5, 3, 4);
  const fill = new THREE.PointLight(0xffffff, 10, 20);
  fill.position.set(-3, -1.5, 2);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4), key, fill);

  // Slightly taller than wide, so it reads as the cut stone in the favicon
  // rather than as a die balanced on a corner.
  const geometry = disposer.track(new THREE.OctahedronGeometry(1, 0));
  const material = disposer.track(
    new THREE.MeshPhysicalMaterial({
      flatShading: true,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      iridescence: 1,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [140, 400],
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.95,
    }),
  );

  const crystal = new THREE.Mesh(geometry, material);
  crystal.scale.set(0.86, 1.25, 0.86);
  scene.add(crystal);

  let environment: THREE.Texture | null = null;

  /** The backdrop's gradient environment, at the smallest size that still
   *  produces a moving highlight rather than a flat tint. */
  function buildEnvironment() {
    const width = 32;
    const height = 16;
    const data = new Uint8Array(width * height * 4);

    const top = new THREE.Color(readToken("--brand-3", "#22d3ee"));
    const middle = new THREE.Color(readToken("--surface", "#ffffff"));
    const bottom = new THREE.Color(readToken("--brand-1", "#6366f1"));
    const colour = new THREE.Color();

    for (let y = 0; y < height; y++) {
      const t = y / (height - 1);
      if (t < 0.5) colour.copy(top).lerp(middle, t * 2);
      else colour.copy(middle).lerp(bottom, (t - 0.5) * 2);
      const band = Math.exp(-(((t - 0.3) * 8) ** 2)) * 0.9;

      for (let x = 0; x < width; x++) {
        const across = Math.sin((x / width) * Math.PI * 2) * 0.5 + 0.5;
        const streak = band * (0.3 + 0.7 * across ** 3);
        const i = (y * width + x) * 4;
        data[i] = Math.min(255, (colour.r + streak) * 255);
        data[i + 1] = Math.min(255, (colour.g + streak) * 255);
        data[i + 2] = Math.min(255, (colour.b + streak) * 255);
        data[i + 3] = 255;
      }
    }

    const source = new THREE.DataTexture(data, width, height);
    source.mapping = THREE.EquirectangularReflectionMapping;
    source.colorSpace = THREE.SRGBColorSpace;
    source.needsUpdate = true;

    const next = pmrem.fromEquirectangular(source).texture;
    source.dispose();

    environment?.dispose();
    environment = next;
    scene.environment = next;
  }

  function refreshTheme() {
    key.color.set(readToken("--brand-2", "#8b5cf6"));
    fill.color.set(readToken("--brand-3", "#22d3ee"));
    material.color.set(readToken("--surface", "#ffffff"));
    material.envMapIntensity = document.documentElement.classList.contains(
      "dark",
    )
      ? 1.9
      : 1.6;
    buildEnvironment();
  }

  function resize() {
    const size = Math.max(1, Math.min(container.clientWidth, container.clientHeight));
    renderer.setSize(size, size, false);
    camera.aspect = 1;
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
    crystal.rotation.y = (elapsed / TURN_SECONDS) * Math.PI * 2;
    // A slight nod off the vertical, so the turn shows three facets rather
    // than sweeping the same silhouette past twice a revolution.
    crystal.rotation.x = Math.sin(elapsed * 0.18) * 0.22;

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
      scene.environment = null;
      environment?.dispose();
      pmrem.dispose();
      disposer.disposeAll();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
