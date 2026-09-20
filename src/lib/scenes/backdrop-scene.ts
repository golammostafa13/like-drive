import * as THREE from "three";
import {
  createDisposer,
  createLoop,
  readToken,
  safePixelRatio,
  type SceneOptions,
} from "@/lib/scenes/harness";

/**
 * The backdrop: a slow drift of cut crystal, lit by its own environment.
 *
 * Mounted once in the layout and left alone, so it survives navigation rather
 * than tearing down and rebuilding on every route change — which is both
 * cheaper and the only way the motion reads as continuous rather than as a
 * flicker between pages.
 *
 * ── Why facets rather than planes ─────────────────────────────────────────
 * This began as flat planes with additive blending, which is the cheapest way
 * to get *haze*: overlapping quads build light and the result is a soft fog.
 * What it cannot do is glint. A crystal reads as a crystal because adjacent
 * facets catch the light at different angles, so a slow tumble sweeps a
 * highlight across one face at a time. That needs real faces with real
 * normals, which is what `OctahedronGeometry` gives for eight triangles —
 * still trivial geometry, but shaded rather than washed.
 *
 * ── Why an environment map, and why it is generated ───────────────────────
 * A polished surface shows what is around it. With three point lights and no
 * environment, `MeshPhysicalMaterial` has nothing to reflect but three dots,
 * and reads as plastic no matter how low the roughness goes. So a small
 * equirectangular gradient is built in memory from the same CSS tokens the
 * rest of the page uses — brand-3 above, surface through the middle, brand-1
 * below, with one bright band standing in for a window — and run through
 * `PMREMGenerator`. It is 64×32 pixels and costs one prefilter at startup.
 *
 * Loading an HDR file would look better still and is refused on the grounds
 * that it is a megabyte of network for a decoration, on a page whose whole
 * design is that the decoration never delays anything.
 *
 * ── The constraints it is still built to ──────────────────────────────────
 *
 * **Two draw calls.** Every crystal is an instance of one geometry; the edge
 * pass is a second instanced mesh sharing the same transforms. It was one
 * before, and the second buys the bright rim that makes glass look cut rather
 * than moulded.
 *
 * **No shader of its own.** Still stock materials, so a theme change is a
 * handful of `Color.set()` calls plus one environment rebuild. A custom shader
 * would recompile on every toggle — a dropped frame at exactly the moment
 * someone is watching the colours change.
 *
 * **No loop point.** The drift, spin and shimmer rates are deliberately not
 * multiples of one another, so the arrangement never visibly repeats.
 *
 * **It yields.** `dispose()` is called outright when the reader opens a PDF —
 * see `BackdropHost` — because the reader holds tens of megabytes of page
 * bitmaps and a live GPU context beside that is how a phone kills the tab.
 */

/**
 * Fewer than the 68 planes this replaced.
 *
 * A physical material with clearcoat and iridescence costs real fragment work,
 * and these crystals overlap — every pixel is shaded several times over. The
 * count came down to pay for the material, and the scene reads as *more*
 * rather than less, because each shape now carries light instead of merely
 * tinting what is behind it.
 */
const COUNT = 34;

/** How far the camera leans toward the pointer. Small on purpose: see below. */
const PARALLAX_RANGE = 1.15;

export interface BackdropHandle {
  refreshTheme(): void;
  /**
   * Which arrangement to ease toward.
   *
   * `signin` pulls the camera in and gathers the crystals into the middle
   * distance, so the one screen with nothing else on it gets a composition
   * rather than a scatter. `app` opens back out, because behind a folder of
   * documents the backdrop's job is to stay out of the way.
   */
  setMood(mood: "app" | "signin"): void;
  dispose(): void;
}

interface Crystal {
  base: THREE.Vector3;
  axis: THREE.Vector3;
  phase: number;
  drift: number;
  spin: number;
  scale: number;
  /** Non-uniform, so these are shards of crystal rather than a bag of dice. */
  stretch: number;
}

export function createBackdropScene(options: SceneOptions): BackdropHandle {
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
  // Filmic rather than linear: highlights on a polished facet blow past 1.0
  // constantly, and clipping them to flat white is the difference between
  // "lit" and "overexposed".
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // ── Lights ───────────────────────────────────────────────────────────────
  // Three keys remain for direction — the environment supplies the reflection
  // but nothing that moves across a face as the crystal turns.
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  const lightA = new THREE.PointLight(0xffffff, 130, 60);
  const lightB = new THREE.PointLight(0xffffff, 110, 60);
  const lightC = new THREE.PointLight(0xffffff, 90, 60);
  lightA.position.set(-9, 6, 8);
  lightB.position.set(10, -4, 6);
  lightC.position.set(0, 8, -6);
  scene.add(ambient, lightA, lightB, lightC);

  // ── The crystals ─────────────────────────────────────────────────────────
  const geometry = disposer.track(new THREE.OctahedronGeometry(0.62, 0));

  const material = disposer.track(
    new THREE.MeshPhysicalMaterial({
      transparent: true,
      opacity: 0.34,
      // Flat shading is what keeps the eight triangles reading as facets.
      // Smooth normals would round them into a blob and undo the whole point.
      flatShading: true,
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      // The faint spectral shift across a facet edge. This is the single
      // property doing most of the work of "not plastic".
      iridescence: 1,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 420],
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  const edgeMaterial = disposer.track(
    new THREE.MeshBasicMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  const edges = new THREE.InstancedMesh(geometry, edgeMaterial, COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  edges.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Drawn after the solids so the rim sits on top of its own face.
  edges.renderOrder = 1;
  scene.add(mesh, edges);

  const crystals: Crystal[] = [];
  for (let i = 0; i < COUNT; i++) {
    crystals.push({
      base: new THREE.Vector3(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 19,
        (Math.random() - 0.5) * 16 - 9,
      ),
      axis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize(),
      phase: Math.random() * Math.PI * 2,
      drift: 0.08 + Math.random() * 0.13,
      spin: 0.04 + Math.random() * 0.09,
      scale: 0.34 + Math.random() * 0.95,
      stretch: 0.75 + Math.random() * 0.7,
    });
  }

  const dummy = new THREE.Object3D();
  const quaternion = new THREE.Quaternion();

  // ── Environment ──────────────────────────────────────────────────────────
  let environment: THREE.Texture | null = null;

  /**
   * A 64×32 equirectangular gradient, built from the brand tokens.
   *
   * The horizontal term is what makes the highlight a *streak* rather than a
   * band running all the way round: a crystal turning under an even ring of
   * light never glints, because there is no edge for the highlight to cross.
   */
  function buildEnvironment() {
    const width = 64;
    const height = 32;
    const data = new Uint8Array(width * height * 4);

    const top = new THREE.Color(readToken("--brand-3", "#22d3ee"));
    const middle = new THREE.Color(readToken("--surface", "#ffffff"));
    const bottom = new THREE.Color(readToken("--brand-1", "#6366f1"));
    const colour = new THREE.Color();

    for (let y = 0; y < height; y++) {
      const t = y / (height - 1);
      if (t < 0.5) colour.copy(top).lerp(middle, t * 2);
      else colour.copy(middle).lerp(bottom, (t - 0.5) * 2);

      // A soft bright band a third of the way down, as a window would be.
      const band = Math.exp(-(((t - 0.28) * 9) ** 2)) * 0.85;

      for (let x = 0; x < width; x++) {
        const across = Math.sin((x / width) * Math.PI * 2) * 0.5 + 0.5;
        const streak = band * (0.35 + 0.65 * across ** 3);
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
    lightA.color.set(readToken("--brand-1", "#6366f1"));
    lightB.color.set(readToken("--brand-2", "#8b5cf6"));
    lightC.color.set(readToken("--brand-3", "#22d3ee"));
    material.color.set(readToken("--surface", "#ffffff"));
    edgeMaterial.color.set(readToken("--brand-3", "#22d3ee"));

    // The dark theme needs less of everything: the same opacity that reads as
    // a whisper on white reads as fog on near-black.
    const dark = document.documentElement.classList.contains("dark");
    // The body carries the shape; the rim only hints at the cut. Weighted the
    // other way round — which is where this first landed — a crystal reads as
    // an empty wireframe cage rather than as glass.
    material.opacity = dark ? 0.5 : 0.42;
    material.envMapIntensity = dark ? 1.6 : 1.5;
    edgeMaterial.opacity = dark ? 0.07 : 0.05;
    ambient.intensity = dark ? 0.14 : 0.25;
    renderer.toneMappingExposure = dark ? 0.95 : 1.05;

    // The reflection is built out of the tokens, so it is rebuilt with them.
    // Once per theme toggle, never per frame.
    buildEnvironment();
  }

  // ── Parallax ─────────────────────────────────────────────────────────────
  /**
   * The camera leans a little toward the pointer, and eases rather than
   * tracks.
   *
   * Both halves of that matter. Motion coupled 1:1 to the pointer reads as a
   * gadget and makes the page feel unsteady under a moving cursor; a lerp
   * toward a target one-tenth the size reads as depth, which is the actual
   * goal. On a touch screen there is no pointer at all and the scene simply
   * keeps its slow drift — nothing here is a control, so nothing is lost.
   */
  const pointer = new THREE.Vector2(0, 0);
  const pointerTarget = new THREE.Vector2(0, 0);

  function onPointerMove(event: PointerEvent) {
    pointerTarget.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      (event.clientY / window.innerHeight) * 2 - 1,
    );
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ── Mood ─────────────────────────────────────────────────────────────────
  let moodTarget = 0;
  let mood = 0;

  function setMood(next: "app" | "signin") {
    moodTarget = next === "signin" ? 1 : 0;
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

    // Eased toward their targets rather than set: both of these change in
    // response to something the user did, and a jump would be a flinch.
    pointer.lerp(pointerTarget, Math.min(1, delta * 2.4));
    mood += (moodTarget - mood) * Math.min(1, delta * 1.6);

    for (let i = 0; i < COUNT; i++) {
      const crystal = crystals[i];

      // Toward the middle distance as the mood goes to `signin`, so the
      // gathering is a composition rather than a zoom.
      const gather = 1 - mood * 0.18;

      dummy.position.set(
        crystal.base.x * gather +
          Math.sin(elapsed * crystal.drift + crystal.phase) * 1.6,
        crystal.base.y * gather +
          Math.cos(elapsed * crystal.drift * 0.8 + crystal.phase) * 1.2,
        crystal.base.z,
      );

      quaternion.setFromAxisAngle(
        crystal.axis,
        elapsed * crystal.spin + crystal.phase,
      );
      dummy.quaternion.copy(quaternion);
      dummy.scale.set(
        crystal.scale,
        crystal.scale * crystal.stretch,
        crystal.scale,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      edges.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    edges.instanceMatrix.needsUpdate = true;

    camera.position.x = -pointer.x * PARALLAX_RANGE;
    camera.position.y = pointer.y * PARALLAX_RANGE;
    camera.position.z = 14 - mood * 1.2;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    if (!announced) {
      announced = true;
      onReady?.();
    }
  });

  return {
    refreshTheme,
    setMood,
    dispose() {
      stop();
      window.removeEventListener("pointermove", onPointerMove);
      resizeObserver.disconnect();
      scene.clear();
      scene.environment = null;
      environment?.dispose();
      pmrem.dispose();
      // `InstancedMesh.dispose()` frees the instance buffers; the geometry and
      // materials are tracked separately because they are shared and three.js
      // will not free them from here.
      mesh.dispose();
      edges.dispose();
      disposer.disposeAll();
      renderer.dispose();
      // Hand the GPU context back rather than waiting for collection: a
      // browser allows only a handful, and this scene is mounted and disposed
      // every time the reader is opened and closed.
      renderer.forceContextLoss();
    },
  };
}
