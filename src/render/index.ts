/**
 * Render contract + ThreeRenderer facade (CONTRACT.md §2.7).
 *
 * The renderer is a pure function of (state history, events, simulated time):
 * nothing in `render()` reads the wall clock to decide what to draw, so two
 * captures of one recording are pixel-identical. See docs/design/rendering.md.
 */
import * as THREE from 'three';
import type { CameraDebug, CompiledTrack, GameEvent, GamePhase, PhysicsState, QualityTier, RenderStats } from '../core/types';
import { ArtLibrary, idsFor } from './art/library';
import { biomeFor, type Biome } from './biomes';
import { BikeModel, type HeroBike } from './bike/bikeModel';
import { HERO_URLS, loadGltf, type ModelChoice, type ModelChoices } from './hero/gltf';
import { GltfBike } from './hero/gltfBike';
import { GltfRider } from './hero/gltfRider';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CameraRig } from './camera/rig';
import { FrameBuilder } from './frame';
import { LightingRig, fogify } from './lighting/environment';
import { MaterialLibrary } from './materials/library';
import { Emitters } from './particles/emitters';
import { PostChain } from './post/chain';
import { RiderModel } from './rider/riderModel';
import { buildBiomeKit } from './world/biomeKit';
import { buildGates, type Gates } from './world/gates';
import { buildObstacles, type ObstacleMeshes } from './world/obstacles';
import { groundFloorY, profileY } from './world/track';
import { HALL } from './world/hall';
import { buildRideSurfaces } from './world/deck';

export interface GameRenderer {
  readonly canvas: HTMLCanvasElement;
  setTrack(track: CompiledTrack): void;
  /** Draw one frame. Returns render time in ms (performance.now delta). */
  render(state: PhysicsState, alpha: number): number;
  /** Block until the GPU has finished the last frame (1x1 readPixels). */
  finish(): void;
  resize(width: number, height: number, pixelRatio?: number): void;
  stats(): RenderStats;
  readonly framesRendered: number;
  dispose(): void;
  // CONTRACT §2.7 additions
  onEvent(e: GameEvent): void;
  setQuality(tier: QualityTier): void;
  camera(): CameraDebug;
  setRunInfo(info: { runTime: number; phase: GamePhase }): void;
  /** PB ghost: translucent desaturated bike+rider following `state`; null hides it. */
  setGhost?(state: PhysicsState | null): void;
  /** Resolves when the current track's art and any requested hero model are in (frame 0 is then final). */
  whenReady?(): Promise<void>;
  /** Cooperative startup for a loading screen: chunked ≤ 16 ms tasks, `report(done, total, label)`. */
  prepare?(report: (done: number, total: number, label?: string) => void): Promise<void>;
}

export interface ThreeRendererOptions {
  antialias?: boolean;
  pixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  quality?: QualityTier;
  /** Hero model choice (`?rider=gltf&bike=gltf`); default procedural. */
  riderModel?: ModelChoice;
  bikeModel?: ModelChoice;
}

type HeroRider = RiderModel | GltfRider;

export interface RenderBudget {
  calls: number;
  triangles: number;
  texturesMB: number;
}
export const RENDER_BUDGET: RenderBudget = { calls: 300, triangles: 500_000, texturesMB: 96 };

interface World {
  group: THREE.Group;
  obstacles: ObstacleMeshes;
  gates: Gates;
  flicker: THREE.MeshStandardMaterial[];
  flickerBase: number[];
  /** Textures whose offset scrolls with tSim (molten flow). */
  scroll: { tex: THREE.Texture; vx: number; vy: number }[];
  textureBytes: number;
  trackCalls: number;
  trackTris: number;
  /** Built with the art pack present (false → rebuilt once the pack settles, if nothing was drawn yet). */
  withArt: boolean;
  /** Loaded art ids the build used (a later settle with more of them rebuilds an undrawn world). */
  artKey: string;
  /** Melt sources (foundry): the two follow lights snap to the nearest ones each frame. */
  fountains: { x: number; y: number; z: number }[];
  meltLights: THREE.PointLight[];
  /** `frameCount` when the world was built: a rebuild is only allowed before the first frame. */
  builtAtFrame: number;
}

export class ThreeRenderer implements GameRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly lib: MaterialLibrary;
  private lightingRig: LightingRig | null = null;
  private readonly rig = new CameraRig();
  private bikeRef: HeroBike | null = null;
  private riderRef: HeroRider | null = null;
  private models: ModelChoices = { riderModel: 'proc', bikeModel: 'proc' };
  private readonly gltf: { bike: GLTF | null; rider: GLTF | null } = { bike: null, rider: null };
  /** In-flight setModels (glTF load + swap); `whenReady` waits for it. */
  private heroPending: Promise<void> = Promise.resolve();
  private heroLoading = 0;
  private readonly emitters = new Emitters();
  private postRef: PostChain | null = null;
  private readonly frames = new FrameBuilder();
  private world: World | null = null;
  private track: CompiledTrack | null = null;
  /** Round 8/9: the generated art pack, loaded in tiers (boot set in `prepare`, the rest per track in `setTrack`). */
  readonly art = new ArtLibrary('art/');
  /** The current track's art request (awaited by `whenReady`). */
  private artRequest: Promise<void> = Promise.resolve();
  private artIds: string[] = [];
  private artBackground: THREE.Texture | null = null;
  /** Loader callback kept after `prepare` for the background phases (per-track art). */
  private report: (done: number, total: number, label?: string) => void = () => undefined;
  private lightingApplied = false;
  private width = 1280;
  /**
   * Play mode (no `preserveDrawingBuffer`, i.e. not the harness): the front end's frame loop
   * starts rendering the menu backdrop before `main.ts` calls `prepare()`, so a frame drawn
   * before the core is built paints a placeholder and (if nobody has yet) starts `prepare()`
   * itself — never the synchronous build. Harness mode keeps the synchronous first frame.
   */
  private readonly lazyBoot: boolean;
  private booted = false;
  private biome: Biome = biomeFor('industrial');
  private frameCount = 0;
  private tier: QualityTier;
  private height = 720;
  private pixelRatio: number;
  private phase: GamePhase = 'riding';
  private runTime = 0;
  private flashT = -1;
  private lastTSim = 0;
  private readonly rendererString: string;
  private readonly contextKind: string;
  private readonly syncPixel = new Uint8Array(4);
  private readonly tmp = new THREE.Vector3();
  private lastCheckpoint = -1;
  // Ghost (CONTRACT §2.7 setGhost): a second bike+rider with ghosted materials, no
  // shadow, no particles, no contact blobs; nothing else in the scene reads it.
  private ghost: { root: THREE.Group; bike: HeroBike; rider: HeroRider; mats: THREE.Material[] } | null = null;
  private ghostState: PhysicsState | null = null;
  private readonly ghostFrames = new FrameBuilder();
  /** Wall-clock ms spent generating textures (diagnostic only). */
  textureGenMs = 0;

  constructor(parent: HTMLElement, options: ThreeRendererOptions = {}) {
    this.canvas = document.createElement('canvas');
    parent.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: options.antialias ?? false, // MSAA happens in the composer target when supported
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    this.pixelRatio = options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // ACES lives in the composite pass
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const gl = this.renderer.getContext();
    this.contextKind = gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl';
    this.rendererString = describeRenderer(gl);

    this.lib = new MaterialLibrary(0x7a1a15);
    this.scene.add(this.emitters.group);
    this.tier = options.quality ?? 'high';
    this.lazyBoot = !(options.preserveDrawingBuffer ?? false);
    // Round 9: the constructor is the WebGL context only. Lighting (sky PMREM), the hero
    // meshes, the post chain, the procedural textures and the art pack are built by
    // `prepare()` in ≤ 16 ms tasks (or lazily by the first call that needs them).
    if (options.riderModel === 'gltf' || options.bikeModel === 'gltf') this.setModels({ riderModel: options.riderModel ?? 'proc', bikeModel: options.bikeModel ?? 'proc' });
    // Art progress goes to whatever loader callback `prepare` installed (per-track requests
    // after boot show as a background phase: "World art · canyon 3/4 (0.12 / 0.20 MB)").
    const mb = (b: number): string => `${(b / (1024 * 1024)).toFixed(2)} MB`;
    this.art.onProgress = (d, t, label, bytes, bytesTotal) => this.report(d, t, `${label === 'art pack' ? 'Art pack' : `World art · ${label}`} ${d}/${t} (${mb(bytes)} / ${mb(bytesTotal)})`);
    this.art.onRequestSettled = () => {
      // Determinism: a world that has already been drawn is never swapped mid-run (a capture is
      // all-art or all-procedural); the next setTrack picks the pack up. Callers that need the
      // art-complete first frame await `whenReady()` before rendering.
      const w = this.world;
      if (this.track && w && this.art.ok && w.builtAtFrame === this.frameCount && w.artKey !== this.artKey()) this.setTrack(this.track);
    };
    (window as unknown as { __render?: ThreeRenderer }).__render = this; // debug handle for the harness
    performance.mark?.('render:ctor');
  }

  // -- lazy core (round 9) ----------------------------------------------------

  private get lighting(): LightingRig {
    if (!this.lightingRig) {
      this.lightingRig = new LightingRig(this.renderer, this.scene);
      this.lightingRig.setQuality(this.tier);
    }
    return this.lightingRig;
  }

  /** Sky + PMREM for the current biome (GPU work; once per biome change). */
  private ensureLighting(): void {
    if (this.lightingApplied) return;
    this.lightingApplied = true;
    this.lighting.apply(this.biome);
  }

  private get post(): PostChain {
    if (!this.postRef) {
      this.postRef = new PostChain(this.renderer, this.scene, this.rig.camera);
      this.postRef.setQuality(this.tier);
      this.postRef.setSize(this.width, this.height, this.pixelRatio);
      this.postRef.applyBiome(this.biome);
    }
    return this.postRef;
  }

  private get bike(): HeroBike {
    this.ensureHero();
    return this.bikeRef!;
  }

  private set bike(b: HeroBike) {
    this.bikeRef = b;
  }

  private get rider(): HeroRider {
    this.ensureHero();
    return this.riderRef!;
  }

  private set rider(r: HeroRider) {
    this.riderRef = r;
  }

  /** Build the procedural hero once (≈ 30 k + 20 k tris of lathe/tube geometry). */
  private ensureHero(): void {
    if (this.bikeRef && this.riderRef) return;
    if (!this.bikeRef) {
      this.bikeRef = new BikeModel(this.lib);
      this.scene.add(this.bikeRef.root);
      if (this.track) this.bindGround(this.track);
    }
    if (!this.riderRef) {
      this.riderRef = new RiderModel(this.lib);
      this.riderRef.attach(this.bikeRef);
      this.scene.add(this.riderRef.root);
    }
  }

  private bindGround(track: CompiledTrack): void {
    const profile = track.def.profile;
    const bike = this.bikeRef;
    if (!bike) return;
    bike.ground = (x) => {
      const y = profileY(profile, x);
      const dy = profileY(profile, x + 0.3) - profileY(profile, x - 0.3);
      return { y, angle: Math.atan2(dy, 0.6) };
    };
  }

  /** Art ids the current track's biome draws, for change detection on a settle. */
  private artKey(): string {
    return this.art.ok && this.art.requested(this.artIds) ? this.artIds.filter((id) => this.art.has(id)).join(',') : '';
  }

  /** Debug access for harness scripts (not part of the contract). */
  get debug(): { scene: THREE.Scene; renderer: THREE.WebGLRenderer; lighting: LightingRig; post: PostChain; lib: MaterialLibrary; rig: CameraRig; THREE: typeof THREE; bike: HeroBike; rider: HeroRider; models: ModelChoices } {
    return { scene: this.scene, renderer: this.renderer, lighting: this.lighting, post: this.post, lib: this.lib, rig: this.rig, THREE, bike: this.bike, rider: this.rider, models: this.models };
  }

  // -- hero models (round 8) --------------------------------------------------

  /**
   * Choose the hero meshes. Hot-swappable mid-run: the new bike/rider are built, take over
   * the calibrated frame origin and landing state, the rider re-attaches to the new frame,
   * and the next `render()` poses them from the same physics state — physics, camera and
   * particles are untouched. A swap is a render-only event; with `?bike=gltf` the glTF is
   * loaded before `ready`, so captures are deterministic.
   */
  setModels(m: ModelChoices): void {
    this.models = { riderModel: m.riderModel === 'gltf' ? 'gltf' : 'proc', bikeModel: m.bikeModel === 'gltf' ? 'gltf' : 'proc' };
    const want = this.models;
    this.heroLoading++;
    const run = async (): Promise<void> => {
      if (want.bikeModel === 'gltf' && !this.gltf.bike) this.gltf.bike = await loadGltf(HERO_URLS.bike);
      if (want.riderModel === 'gltf' && !this.gltf.rider) this.gltf.rider = await loadGltf(HERO_URLS.rider);
      if (want !== this.models) return; // superseded
      this.applyModels();
    };
    this.heroPending = run()
      .catch((e) => console.warn('[render] setModels failed', e))
      .then(() => {
        this.heroLoading--;
      });
  }

  private makeBike(choice: ModelChoice): HeroBike {
    return choice === 'gltf' && this.gltf.bike ? new GltfBike(this.gltf.bike, this.lib) : new BikeModel(this.lib);
  }

  private makeRider(choice: ModelChoice): HeroRider {
    return choice === 'gltf' && this.gltf.rider ? new GltfRider(this.gltf.rider, this.lib) : new RiderModel(this.lib);
  }

  private kindOfBike(b: HeroBike): ModelChoice {
    return b instanceof GltfBike ? 'gltf' : 'proc';
  }

  private kindOfRider(r: HeroRider): ModelChoice {
    return r instanceof GltfRider ? 'gltf' : 'proc';
  }

  private applyModels(): void {
    const wantBike = this.models.bikeModel === 'gltf' && this.gltf.bike ? 'gltf' : 'proc';
    const wantRider = this.models.riderModel === 'gltf' && this.gltf.rider ? 'gltf' : 'proc';
    let changed = false;
    if (this.kindOfBike(this.bike) !== wantBike) {
      const next = this.makeBike(wantBike);
      const old = this.bike;
      next.placer.copyFrom(old.placer);
      next.ground = old.ground;
      this.scene.remove(old.root);
      this.scene.add(next.root);
      this.bike = next;
      this.rider.attach(next);
      old.dispose();
      changed = true;
    }
    if (this.kindOfRider(this.rider) !== wantRider) {
      const old = this.rider;
      old.detach();
      this.scene.remove(old.root);
      const next = this.makeRider(wantRider);
      next.attach(this.bike);
      this.scene.add(next.root);
      this.rider = next;
      old.dispose();
      changed = true;
    }
    if (changed && this.ghost) {
      // The ghost follows the same choice (ghost tint works for both kits).
      const gs = this.ghostState;
      this.scene.remove(this.ghost.root);
      this.ghost.bike.dispose();
      this.ghost.rider.dispose();
      this.ghost = this.buildGhost();
      this.ghost.root.visible = gs !== null;
    }
  }

  get framesRendered(): number {
    return this.frameCount;
  }

  /**
   * True once procedural textures exist, the art pack has settled (loaded or failed) and at
   * least one lit frame has been drawn — the frame after that is the final look.
   */
  get ready(): boolean {
    return this.lib.hasTextures && this.art.settled && this.art.requested(this.artIds) && this.heroLoading === 0 && this.frameCount > 0;
  }

  /**
   * Resolves when the boot art, the current track's art request and any requested glTF hero
   * are in — the first frame drawn after this is final (`hook.loadTrack` awaits it so frame 0
   * is art-complete). Nothing here reads the wall clock.
   */
  whenReady(): Promise<void> {
    const req = this.artRequest;
    return Promise.all([this.art.whenSettled, req, this.heroPending]).then(() => (this.artRequest !== req ? this.whenReady() : undefined));
  }

  private prepared: Promise<void> | null = null;
  private preparing = false;
  /** `prepare()` timeline: [label, ms, bytes] per step (diagnostic; `debugInfo().prepare`). */
  readonly prepareTimeline: { step: string; ms: number; bytes: number }[] = [];

  /**
   * Cooperative startup for the loading screen (round 9). The constructor made only the WebGL
   * context; this builds everything else in tasks of ≤ 16 ms (or one GPU call) and reports
   * `(done, total, label)` for the loader's row. Idempotent. `render()` before this resolves
   * still draws (lazy builds + a synchronous texture fallback; the harness path never calls
   * prepare). Steps: art pack boot set (fetch + createImageBitmap off-thread, bytes reported) ·
   * hero meshes (bike, rider as two tasks) · lighting (sky → PMREM) · post chain · procedural
   * materials (painters in row bands, 12 ms budget) · hero glTF (if requested) · shaders
   * (`compileAsync`, two materials per task) · one warm-up frame through the post chain.
   * The per-track art beyond the boot set is requested by `setTrack` and reported through the
   * same callback as a background phase.
   */
  prepare(report: (done: number, total: number, label?: string) => void = () => undefined): Promise<void> {
    if (this.prepared) return this.prepared;
    this.preparing = true;
    this.report = report;
    const yieldFrame = (): Promise<void> => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
    const mb = (b: number): string => `${(b / (1024 * 1024)).toFixed(2)} MB`;
    const timeline = this.prepareTimeline;
    let stepT0 = performance.now();
    let stepBytes = 0;
    const mark = (step: string): void => {
      const now = performance.now();
      timeline.push({ step, ms: Math.round((now - stepT0) * 10) / 10, bytes: stepBytes });
      performance.mark?.(`render:prepare:${step}`);
      stepT0 = now;
      stepBytes = 0;
    };
    const run = async (): Promise<void> => {
      // 1. Art pack boot set: the showcase biome's plate, container skins, banners, crowd
      //    (fetch + decode are off the main thread; only bookkeeping runs here).
      const artP = this.art.load();
      report(0, 1, 'Art pack');
      await yieldFrame();
      mark('art:start');
      // 2. Hero meshes: two tasks (each is one procedural kit's geometry).
      report(0, 2, 'Hero meshes · bike');
      if (!this.bikeRef) {
        this.bikeRef = new BikeModel(this.lib);
        this.scene.add(this.bikeRef.root);
        if (this.track) this.bindGround(this.track);
      }
      await yieldFrame();
      mark('hero:bike');
      report(1, 2, 'Hero meshes · rider');
      this.ensureHero();
      await yieldFrame();
      mark('hero:rider');
      // 3. Lighting: sky texture + PMREM (GPU; the first shader compile on software GL is long).
      report(0, 1, 'Lighting · sky environment');
      this.ensureLighting();
      await yieldFrame();
      mark('lighting');
      // 4. Post chain (targets + shader materials; compiled by the warm-up frame below).
      report(0, 1, 'Post chain');
      void this.post;
      await yieldFrame();
      mark('post:create');
      // 5. Procedural materials in 12 ms slices (a 512² painter is 50–65 ms whole on a slow host).
      const n = this.lib.jobCount;
      while (this.lib.jobsDone < n) {
        report(this.lib.generateProgress * 100, 100, `Materials · ${this.lib.currentJobName} ${this.lib.jobsDone + 1}/${n}`);
        this.lib.generateStep(12);
        await yieldFrame();
      }
      report(100, 100, `Materials ${n}/${n}`);
      this.textureGenMs = this.lib.generateMs;
      stepBytes = this.lib.textureBytes;
      mark('materials');
      // 6. Hero glTF (only when requested).
      if (this.models.bikeModel === 'gltf' || this.models.riderModel === 'gltf') {
        report(0, 1, `Loading ${this.models.riderModel === 'gltf' ? 'rider' : 'bike'} model`);
        await this.heroPending;
        report(1, 1, 'Hero models');
        mark('hero:gltf');
      }
      // 7. The boot art (usually already in by now; on 3G this is the wait that shows bytes).
      await artP;
      stepBytes = this.art.bytesDelivered;
      report(1, 1, `Art pack ${this.art.progress.done}/${this.art.progress.total} (${mb(this.art.bytesDelivered)})`);
      mark('art:settled');
      await yieldFrame();
      // 8. Shaders: compile what is in the scene (hero + the world if a track is set) in chunks.
      report(0, 1, 'Shaders');
      const mats: THREE.Material[] = [];
      const seen = new Set<THREE.Material>();
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (!seen.has(mat)) {
          seen.add(mat);
          mats.push(mat);
        }
      });
      const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
      if (r.compileAsync) {
        // Two materials per call: on a real driver each call is a handful of ms; software GL
        // compiles the first standard program synchronously (seconds) — not splittable from JS.
        const chunk = 2;
        for (let i = 0; i < mats.length; i += chunk) {
          const keep = new Set(mats.slice(i, i + chunk));
          const hidden: THREE.Object3D[] = [];
          this.scene.traverse((o) => {
            const m = (o as THREE.Mesh).material;
            if (!m) return;
            const list = Array.isArray(m) ? m : [m];
            if (!list.some((x) => keep.has(x)) && o.visible) {
              o.visible = false;
              hidden.push(o);
            }
          });
          try {
            // Bind the HDR scene target: program parameters include the output colour space, and a
            // compile against the canvas would build a second (sRGB) variant of every material.
            this.renderer.setRenderTarget(this.post.sceneTarget);
            await r.compileAsync(this.scene, this.rig.camera);
          } finally {
            this.renderer.setRenderTarget(null);
            for (const o of hidden) o.visible = true;
          }
          const d = Math.min(mats.length, i + chunk);
          report(d, mats.length, `Shaders ${d}/${mats.length} programs`);
          await yieldFrame();
        }
      }
      mark('shaders');
      // 9. First frame, two rows: the plain scene (shadow-depth programs + the GPU's first
      // draw of every pipeline) and then the composer (screen-quad shaders compileAsync cannot
      // reach). Nothing is captured from either. On software GL (SwiftShader) these are the
      // seconds-long tasks — the driver JITs each pipeline at its first draw; no JS split exists.
      report(0, 2, 'First frame · world + shadows');
      this.renderer.info.autoReset = false;
      this.post.renderSceneOnly();
      await yieldFrame();
      mark('firstframe:world');
      report(1, 2, 'First frame · post chain');
      this.post.render();
      await yieldFrame();
      mark('firstframe:post');
      report(2, 2, 'Ready');
    };
    this.prepared = run().finally(() => {
      this.preparing = false;
      this.booted = true;
    });
    return this.prepared;
  }

  /** A cheap clear in the biome's fog colour while `prepare()` is still building the core. */
  private placeholderFrame(): void {
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this.biome.fogColor, 1);
    this.renderer.clear(true, true, false);
  }

  // -- contract -------------------------------------------------------------

  setTrack(track: CompiledTrack): void {
    this.clearWorld();
    this.track = track;
    const biome = biomeFor(track.def.meta?.biome);
    if (biome !== this.biome || !this.lightingApplied) {
      this.biome = biome;
      this.lightingApplied = true;
      this.lighting.apply(biome);
    }
    // Per-track art (round 9): request what this biome draws beyond the boot set (other
    // plates + skies, wall decals, the night crowd). `whenReady()` waits for it; if it lands
    // before the first frame the world is rebuilt with it (`onRequestSettled`).
    this.artIds = idsFor(biome.id);
    void this.art.load();
    if (!this.art.requested(this.artIds)) {
      const pending = this.art.pendingBytes(this.artIds);
      this.artRequest = this.art.request(this.artIds, `${biome.id} (${(pending / (1024 * 1024)).toFixed(2)} MB)`).catch(() => undefined);
    }
    // All-or-nothing (determinism): the world uses the pack only once this biome's whole set has
    // settled; a partial set would make two captures differ by which files had landed.
    const art = this.art.ok && this.art.requested(this.artIds) ? this.art : null;
    // Sky panorama as the background for exterior biomes (the kit also draws it as a far quad).
    this.artBackground?.dispose();
    this.artBackground = null;
    if (art && !this.biome.interior) {
      const skyId = { canyon: 'sky-canyon', snow: 'sky-snow', nightCity: 'sky-nightcity' }[this.biome.id as 'canyon' | 'snow' | 'nightCity'];
      const sky = skyId ? art.texture(skyId, true, true) : null;
      if (sky) {
        const bg = sky.clone();
        bg.mapping = THREE.EquirectangularReflectionMapping;
        bg.wrapS = THREE.RepeatWrapping;
        bg.needsUpdate = true;
        this.artBackground = bg;
        this.scene.background = bg;
      }
    }
    this.lighting.setFloor(groundFloorY(track.def.profile, this.biome.interior));
    this.post.applyBiome(this.biome);
    this.rig.setKeys(track.def.meta?.camera);
    // Camera bounds (round 8): inside the hall for interiors (floor + 1.5 … roof − 1, between the
    // back wall and the front), a generous sky box for exteriors. Hard clamp every frame.
    {
      const floorY = groundFloorY(track.def.profile, this.biome.interior);
      const b = track.bounds;
      if (this.biome.interior) {
        this.rig.bounds = { minX: b.minX - 36, maxX: b.maxX + 56, minY: floorY + 1.5, maxY: floorY + HALL.height - 1.0, minZ: HALL.wallZ + 1.0, maxZ: HALL.frontZ - 1.0 };
      } else {
        this.rig.bounds = { minX: b.minX - 60, maxX: b.maxX + 80, minY: b.minY - 6, maxY: floorY + 60, minZ: -40, maxZ: 120 };
      }
    }

    const group = new THREE.Group();
    group.name = 'world';
    const ribbons = buildRideSurfaces(track, this.biome, this.lib);
    const obstacles = buildObstacles(track, this.lib);
    const gates = buildGates(track, this.biome, this.lib, art);
    const kit = buildBiomeKit(track, this.biome, this.lib, art);
    group.add(ribbons.group, ribbons.supports, obstacles.group, gates.group, kit.group);
    // One program variant for the whole world: every standard material gets the full map set.
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.lib.complete(m as THREE.MeshStandardMaterial);
    });
    this.scene.add(group);
    this.world = {
      group,
      obstacles,
      gates,
      flicker: kit.flicker,
      flickerBase: kit.flicker.map((m) => m.emissiveIntensity),
      scroll: kit.scroll,
      textureBytes: kit.textureBytes + gates.textureBytes,
      trackCalls: ribbons.drawCalls + obstacles.drawCalls,
      trackTris: ribbons.triangles + obstacles.triangles,
      withArt: art !== null,
      artKey: this.artKey(),
      builtAtFrame: this.frameCount,
      fountains: kit.fountains,
      meltLights: [],
    };
    if (this.biome.id === 'foundry' && kit.fountains.length) {
      // Camera-following melt lights: the two nearest pours / furnace mouths light the kit and
      // the hero from below (no GI; the emissive melt lights nothing by itself).
      for (let i = 0; i < 2; i++) {
        const pl = new THREE.PointLight(0xff7a22, 140, 34, 2);
        group.add(pl);
        this.world.meltLights.push(pl);
      }
    }
    const profile = track.def.profile;
    this.rig.ground = (x) => profileY(profile, x);
    this.rig.finishX = track.def.finishX;
    this.bindGround(track);
    const fy = track.def.profile.length ? track.def.profile[track.def.profile.length - 1]!.y : 0;
    this.emitters.setTrack(track.def.seed, gates.jets, track.def.finishX, fy, this.biome, kit.fountains);
    this.frames.invalidate();
    this.lastCheckpoint = -1;
    this.flashT = -1;
    if (this.world.trackCalls > 20 || this.world.trackTris > 80_000) {
      console.warn(`[render] track budget: ${this.world.trackCalls} calls / ${Math.round(this.world.trackTris)} tris (cap 20 / 80k)`);
    }
  }

  onEvent(e: GameEvent): void {
    this.emitters.onEvent(e);
    if (e.type === 'finish') this.flashT = this.lastTSim;
    if (e.type === 'restart') {
      this.frames.invalidate();
      this.ghostFrames.invalidate();
    }
  }

  setRunInfo(info: { runTime: number; phase: GamePhase }): void {
    this.phase = info.phase;
    this.runTime = info.runTime;
    this.rig.setPhase(info.phase);
  }

  setGhost(state: PhysicsState | null): void {
    this.ghostState = state;
    if (state && !this.ghost) this.ghost = this.buildGhost();
    if (!state) {
      this.ghostFrames.invalidate();
      if (this.ghost) this.ghost.root.visible = false;
    }
  }

  private buildGhost(): NonNullable<ThreeRenderer['ghost']> {
    const bike = this.makeBike(this.kindOfBike(this.bike));
    const rider = this.makeRider(this.kindOfRider(this.rider));
    rider.attach(bike);
    bike.root.remove(...bike.contacts);
    const root = new THREE.Group();
    root.name = 'ghost';
    root.add(bike.root, rider.root);
    const cache = new Map<THREE.Material, THREE.Material>();
    const mats: THREE.Material[] = [];
    const grey = new THREE.Color(0x9aa4b4);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.castShadow = false;
      m.receiveShadow = false;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      let g = cache.get(src);
      if (!g) {
        const std = src as THREE.MeshStandardMaterial;
        g = std.isMeshStandardMaterial && std.name && this.lib.has(std.name) ? this.lib.derive(std.name) : fogify(src.clone());
        g.transparent = true;
        g.opacity = 0.35;
        g.depthWrite = false;
        const gs = g as THREE.MeshStandardMaterial;
        if (gs.isMeshStandardMaterial) {
          gs.vertexColors = false; // same define set as the wheel's spoke material → no new program
          gs.color.lerp(grey, 0.65);
          gs.emissive.setHex(0x000000);
          gs.metalness = Math.min(gs.metalness, 0.3);
        } else if ((g as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
          (g as THREE.MeshBasicMaterial).color.lerp(grey, 0.65);
        }
        cache.set(src, g);
        mats.push(g);
      }
      m.material = g;
      m.renderOrder = -1;
    });
    this.scene.add(root);
    return { root, bike, rider, mats };
  }

  setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.postRef?.setQuality(tier);
    this.lightingRig?.setQuality(tier);
    this.emitters.countScale = tier === 'low' ? 0.5 : 1;
    // Shadows off on low: materials must recompile to drop the shadow sampling.
    const shadows = tier !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) mat.needsUpdate = true;
      });
    }
  }

  camera(): CameraDebug {
    return this.rig.debug();
  }

  render(state: PhysicsState, alpha: number): number {
    const t0 = performance.now();
    if (!this.booted) {
      if (this.lazyBoot) {
        // Play mode: the loader owns the wait; draw a placeholder until `prepare()` is done.
        if (!this.prepared) void this.prepare();
        this.placeholderFrame();
        return performance.now() - t0;
      }
      // Harness path (no loader): the core is built here, once, synchronously — the textures
      // appear on the same frame in every capture.
      this.ensureHero();
      this.ensureLighting();
      if (!this.lib.hasTextures) {
        this.lib.generateTextures();
        this.textureGenMs = this.lib.generateMs;
      }
      if (!this.preparing) this.booted = true;
    }
    const f = this.frames.build(state, alpha);
    this.lastTSim = f.tSim;

    this.rig.update(f);
    const cam = this.rig.camera;
    this.lighting.follow(this.rig.targetX, this.rig.targetY, this.rig.distance > 20);

    this.bike.update(f);
    this.rider.update(f);
    // Ghost: same interpolation, its own state history; capped at 35 % opacity.
    if (this.ghost) {
      const gs = this.ghostState;
      this.ghost.root.visible = gs !== null;
      if (gs) {
        const gf = this.ghostFrames.build(gs, alpha);
        this.ghost.bike.update(gf);
        this.ghost.rider.update(gf);
        for (const m of this.ghost.mats) if (m.opacity > 0.35) m.opacity = 0.35;
      }
    }
    // Dynamic colliders.
    const w = this.world;
    if (w) {
      for (const s of f.seesaws) {
        const o = w.obstacles.seesaws.get(s.id);
        if (o) o.rotation.z = s.angle;
      }
      for (const d of f.drums) {
        const o = w.obstacles.drums.get(d.id);
        if (o) o.rotation.z = d.spin;
      }
      if (f.checkpoint !== this.lastCheckpoint) {
        this.lastCheckpoint = f.checkpoint;
        w.gates.lamps.forEach((m, i) => {
          const lit = i <= f.checkpoint;
          m.emissive.setHex(lit ? 0x22ff55 : 0x7a1010);
          m.emissiveIntensity = lit ? 4 : 1.5;
        });
        w.gates.plaques.forEach((m, i) => m.emissive.setHex(i <= f.checkpoint ? 0x22ff55 : 0x000000));
      }
      for (let i = 0; i < w.flicker.length; i++) {
        w.flicker[i]!.emissiveIntensity = w.flickerBase[i]! * (1 + 0.15 * Math.sin(23 * f.tSim) * Math.sin(7.3 * f.tSim));
      }
      for (const s of w.scroll) s.tex.offset.set((s.vx * f.tSim) % 1, (s.vy * f.tSim) % 1);
      if (w.meltLights.length) {
        // Two nearest melt sources to the camera target (deterministic: pure function of state).
        const tx = this.rig.targetX;
        let a = -1;
        let b = -1;
        let da = Infinity;
        let db = Infinity;
        for (let i = 0; i < w.fountains.length; i++) {
          const d = Math.abs(w.fountains[i]!.x - tx);
          if (d < da) {
            b = a;
            db = da;
            a = i;
            da = d;
          } else if (d < db) {
            b = i;
            db = d;
          }
        }
        [a, b].forEach((idx, k) => {
          const pl = w.meltLights[k]!;
          if (idx < 0) {
            pl.intensity = 0;
            return;
          }
          const s = w.fountains[idx]!;
          pl.position.set(s.x, s.y + 1.2, s.z + 2.5);
          const flick = 1 + 0.12 * Math.sin(17 * f.tSim + idx) * Math.sin(5.1 * f.tSim);
          pl.intensity = 140 * flick;
        });
      }
      // Crowd: cheer for 3.5 s after GO and through the finish; sway otherwise.
      const cheer = this.phase === 'finished' || f.finished || (this.phase === 'riding' && this.runTime < 3.5) ? 1 : 0;
      w.gates.anim.uTime.value = f.tSim;
      w.gates.anim.uCheer.value = cheer;
    }
    this.post.setTime(f.tSim);
    // Particles.
    this.bike.toWorld(this.bike.exhaustTip.x, this.bike.exhaustTip.y, this.bike.exhaustTip.z, this.tmp);
    this.emitters.setViewport(this.height * Math.min(this.pixelRatio, this.tier === 'low' ? 1 : this.tier === 'medium' ? 1.5 : 2), (cam.fov * Math.PI) / 180);
    this.emitters.update(f, this.tmp, this.rig.targetX);

    // Post dynamics: smear only above 9 m/s, along the screen-space travel direction. After the
    // line (round 9) speed effects are off: no smear, no chromatic aberration on the coasting hold.
    const dbg = this.rig.debug();
    const speedFx = f.finished ? 0 : f.speed;
    const smear = Math.min(8, Math.max(0, (speedFx - 9) * 1.1));
    const dl = Math.hypot(f.velX, f.velY) || 1;
    const flash = this.flashT >= 0 ? Math.max(0, 1 - (f.tSim - this.flashT) / 0.2) : 0;
    this.post.setDynamics(speedFx, dbg.bikeScreenX, dbg.bikeScreenY, smear, f.velX / dl, -f.velY / dl, flash);

    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.post.render();
    this.frameCount++;
    return performance.now() - t0;
  }

  finish(): void {
    // gl.finish() returns immediately in Chromium; a 1x1 readPixels blocks on raster.
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPixel);
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    if (pixelRatio !== undefined) {
      this.pixelRatio = pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.rig.setAspect(width / height);
    this.postRef?.setSize(width, height, this.pixelRatio);
  }

  stats(): RenderStats {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      texturesMB: estimateTextureMB(this.scene) + (this.lightingRig?.textureBytes ?? 0) / (1024 * 1024),
      renderer: this.rendererString,
      contextKind: this.contextKind,
    };
  }

  /** Extra diagnostics for the harness / perf report. */
  debugInfo(): { biome: string; zoom: string; phase: GamePhase; tier: QualityTier; trackCalls: number; trackTris: number; textureGenMs: number; passes: number; art: { settled: boolean; ok: boolean; loadMs: number; deliveredMB: number; inWorld: boolean; trackComplete: boolean; trackIds: number }; prepare: { step: string; ms: number; bytes: number }[] } {
    return {
      prepare: this.prepareTimeline,
      biome: this.biome.id,
      zoom: this.rig.zoomState,
      phase: this.phase,
      tier: this.tier,
      trackCalls: this.world?.trackCalls ?? 0,
      trackTris: Math.round(this.world?.trackTris ?? 0),
      textureGenMs: this.textureGenMs,
      passes: this.postRef?.info.passes ?? 0,
      art: { settled: this.art.settled, ok: this.art.ok, loadMs: Math.round(this.art.loadMs), deliveredMB: +(this.art.bytesDelivered / (1024 * 1024)).toFixed(2), inWorld: this.world?.withArt ?? false, trackComplete: this.art.requested(this.artIds), trackIds: this.artIds.length },
    };
  }

  dispose(): void {
    this.clearWorld();
    this.postRef?.dispose();
    this.lightingRig?.dispose();
    this.lib.dispose();
    this.art.dispose();
    this.artBackground?.dispose();
    for (const s of this.emitters.systems) s.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // -- internals ------------------------------------------------------------

  private clearWorld(): void {
    const w = this.world;
    if (!w) return;
    this.scene.remove(w.group);
    w.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        // Library materials are shared; only dispose clones / one-offs (they carry no name from the library).
        if (mat && !(mat as THREE.Material).name) {
          for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
            if (v instanceof THREE.CanvasTexture) v.dispose();
          }
          (mat as THREE.Material).dispose();
        }
      }
    });
    this.world = null;
  }
}

/** Unmasked renderer string when the debug extension is available. */
export function describeRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) {
    const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string | null;
    const v = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string | null;
    if (r) return v ? `${v} / ${r}` : r;
  }
  return String(gl.getParameter(gl.RENDERER));
}

/**
 * Rough GPU texture footprint: RGBA8 with a mip chain (x1.33), float textures by type.
 * Art-pack textures count at their delivered (compressed) size — `userData.deliveredBytes`,
 * the budget rule for the generated assets (round 8).
 */
export function estimateTextureMB(scene: THREE.Scene): number {
  const seen = new Set<THREE.Texture>();
  let bytes = 0;
  const visit = (value: unknown): void => {
    if (value instanceof THREE.Texture && !seen.has(value)) {
      seen.add(value);
      const delivered = value.userData['deliveredBytes'] as number | undefined;
      if (delivered) {
        bytes += delivered;
        return;
      }
      const img = value.image as { width?: number; height?: number } | undefined;
      const w = img?.width ?? 0;
      const h = img?.height ?? 0;
      const bpp = value.type === THREE.FloatType ? 16 : value.type === THREE.HalfFloatType ? 8 : 4;
      bytes += w * h * bpp * (value.generateMipmaps ? 1.333 : 1);
    }
  };
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) visit(value);
      const sm = m as THREE.ShaderMaterial;
      if (sm.uniforms) for (const u of Object.values(sm.uniforms)) visit(u.value);
    }
  });
  if (scene.environment) visit(scene.environment);
  if (scene.background instanceof THREE.Texture) visit(scene.background);
  return bytes / (1024 * 1024);
}
