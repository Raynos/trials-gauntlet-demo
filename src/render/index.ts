/**
 * Render contract + ThreeRenderer facade (CONTRACT.md §2.7).
 *
 * The renderer is a pure function of (state history, events, simulated time):
 * nothing in `render()` reads the wall clock to decide what to draw, so two
 * captures of one recording are pixel-identical. See docs/design/rendering.md.
 */
import * as THREE from 'three';
import type { BikeClass, CameraDebug, CompiledTrack, GameEvent, GamePhase, PhysicsState, QualityTier, RenderStats, RiderOutfit } from '../core/types';
import { ArtLibrary, idsFor } from './art/library';
import { biomeFor, type Biome } from './biomes';
import { BikeModel, type HeroBike } from './bike/bikeModel';
import { HERO_URLS, loadGltf, lodUrl, shrinkTextures, type ModelChoice, type ModelChoices } from './hero/gltf';
import type { ByteProgress, StepRunner } from '../boot/plan';
import type { PrepareStep } from '../boot/steps';
import { isRiderLodEnabled, lodChoice, setRiderLodEnabled } from './hero/lod';
import { GltfBike } from './hero/gltfBike';
import { GltfRider } from './hero/gltfRider';
import { riderUrl } from './hero/urls';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CameraRig } from './camera/rig';
import { FrameBuilder } from './frame';
import { LightingRig, fogify } from './lighting/environment';
import { MaterialLibrary } from './materials/library';
import { Emitters } from './particles/emitters';
import { PostChain, tierPixelRatio, type PassWrite } from './post/chain';
import { RiderModel } from './rider/riderModel';
import { buildBiomeKit } from './world/biomeKit';
import { PropBatch, tierCasts, tierHides, tierManaged } from './world/props';
import { buildGates, type Gates } from './world/gates';
import { buildObstacles, type ObstacleMeshes } from './world/obstacles';
import { groundFloorY, profileY } from './world/track';
import { HALL } from './world/hall';
import { buildRideSurfaces } from './world/deck';

/** One frame later (rAF, or a macrotask without one) — the ≤ 16 ms task boundary for `prepare()` and track entry. */
const yieldFrame = (): Promise<void> => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

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
  /**
   * Cooperative startup for the loading screen: chunked ≤ 16 ms tasks, each sub-step run through the boot
   * plan's `run(key, work)` (keys = `PREPARE_STEPS`). The downloads it awaits (hero glTF, boot art set) start
   * in the constructor with the plan's readers (`heroBytes`, `artBytes`).
   */
  prepare?(run: StepRunner<PrepareStep>): Promise<void>;
  /**
   * v2 additive (render, round 11): repaint the hero to the bike class livery — Rookie = blue
   * plastics, white plate #7; Pro = charcoal / gunmetal / raw alloy, yellow plate #1. Applies to
   * the procedural and the glTF bike; default 'rookie' when never called. Safe at any time
   * (materials only; no rebuild, no frame skipped).
   */
  setBikeClass?(c: BikeClass): void;
  setRiderOutfit?(outfit: RiderOutfit): Promise<boolean>;
}

export interface ThreeRendererOptions {
  antialias?: boolean;
  pixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  quality?: QualityTier;
  /**
   * Hero model choice (`?rider=proc&bike=proc` to force the procedural kit). Round 10: the
   * default is the glTF hero; the procedural kit stays as the load-failure fallback (a glTF
   * that fails to load resolves null and `applyModels` keeps the procedural meshes).
   */
  riderModel?: ModelChoice;
  bikeModel?: ModelChoice;
  riderOutfit?: RiderOutfit;
  /** Boot plan: the DOWNLOAD counter for the hero glTF files the constructor starts fetching (docs/tasks/loading-progress-invariant.md). */
  heroBytes?: ByteProgress;
  /** Boot plan: the DOWNLOAD counter for the art pack's boot set; given, the constructor starts `art.load()` at once (the `bootArt` step awaits it). */
  artBytes?: ByteProgress;
  /** Boot plan `after` list: per-track art requested after the boot set (never in a number). */
  onTrackArt?: (done: number, total: number, label: string) => void;
}

type HeroRider = RiderModel | GltfRider;

/** World meshes whose shadow roles the tier rules manage (round 13): props, deck, obstacles, ribbons. */
const WORLD_MESH = /^(props:|deck:|obstacles:|ribbon:)/;
/** The surfaces the bike rides — the only shadow receivers on `low` (the deck AO skirt excluded). */
const RIDE_SURFACE = /^(deck:(?!ao)|obstacles:|ribbon:)/;
/** Hero parts too small to change the 512² silhouette on `low` (chain, sprockets, shock, pegs, spokes): no shadow draw there. */
const HERO_SMALL = /^(chain|sprocket_(front|rear)|shock_(body|spring|shaft|clevis)|pegs|wheel_(front|rear)(_spokes|:spokes))$/;

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
  /** Round 10: high-bay lamp heads + the two follow spots parked on the nearest ones. */
  lamps: { x: number; y: number; z: number }[];
  lampLights: THREE.SpotLight[];
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
  private readonly nearestScratch: number[] = [];
  private bikeClass: BikeClass = 'rookie';
  private riderOutfit: RiderOutfit = 'street';
  private riderDocumentOutfit: RiderOutfit | null = null;
  /** Parsed hero documents: the authored files and (round 13) their `-lod.glb` twins for `low` / `medium`. */
  private readonly gltf: { bike: GLTF | null; rider: GLTF | null; bikeLod: GLTF | null; riderLod: GLTF | null } = { bike: null, rider: null, bikeLod: null, riderLod: null };
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
  private tier: QualityTier = 'high';
  private height = 720;
  /** Effective canvas pixel ratio = `tierPixelRatio(tier, devicePixelRatio, width)` (round 12: the tier owns the resolution). */
  private pixelRatio: number;
  /** What the host handed `resize()` (its own DPR cap); the tier caps it further. */
  private devicePixelRatio: number;
  private readonly bikeUV = { x: 0.3, y: 0.55 };
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
  /**
   * Round 14 track entry: after `setTrack` the new world's textures are uploaded and its materials
   * compiled against the tier's scene target in ≤ 16 ms tasks (`beginEntry`); `whenReady()` waits
   * for it and `render()` paints the fog placeholder meanwhile (play mode), so the countdown never
   * runs over black frames while the GPU compiles the biome at its first draw.
   */
  private entryToken = 0;
  private entryPending: Promise<void> = Promise.resolve();
  private entering = false;
  /** Last entry's cost: wall ms from `setTrack` to ready, compile / texture task ms, textures uploaded (count, MB), programs after. */
  readonly entryStats = { biome: '', ms: 0, compileMs: 0, textureMs: 0, warmMs: 0, textures: 0, texturesMB: 0, materials: 0, programs: 0, programsBefore: 0 };

  constructor(parent: HTMLElement, options: ThreeRendererOptions = {}) {
    this.canvas = document.createElement('canvas');
    parent.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: options.antialias ?? false, // MSAA happens in the composer target when supported
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    this.tier = options.quality ?? 'high';
    this.devicePixelRatio = options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = tierPixelRatio(this.tier, this.devicePixelRatio, this.width);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES + the biome grade live in the composite pass on the HDR tiers; three applies `toneMapping`
    // only to canvas draws, so this is the `low` (direct-to-canvas) path's grade — see `gradeUniforms`.
    this.renderer.toneMapping = THREE.CustomToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const gl = this.renderer.getContext();
    this.contextKind = gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl';
    this.rendererString = describeRenderer(gl);

    this.lib = new MaterialLibrary(0x7a1a15);
    this.scene.add(this.emitters.group);
    this.emitters.ambientEnabled = this.tier !== 'low';
    this.lazyBoot = !(options.preserveDrawingBuffer ?? false);
    // Round 9: the constructor is the WebGL context only. Lighting (sky PMREM), the hero
    // meshes, the post chain, the procedural textures and the art pack are built by
    // `prepare()` in ≤ 16 ms tasks (or lazily by the first call that needs them).
    {
      this.riderOutfit = options.riderOutfit ?? 'street';
      const riderModel: ModelChoice = options.riderModel ?? 'gltf';
      const bikeModel: ModelChoice = options.bikeModel ?? 'gltf';
      if (riderModel === 'gltf' || bikeModel === 'gltf') this.setModels({ riderModel, bikeModel }, options.heroBytes);
    }
    // The boot art set (showcase plate, container skins, banners, crowd) starts now, under every boot step,
    // its bytes counted by the library's own read loop; `prepare()`'s `bootArt` step awaits it.
    if (options.artBytes) void this.art.load(options.artBytes);
    // Per-track art requested after the boot set is background: the loader's `after` list, never a number.
    // (The boot set itself reports its bytes through the reader `prepare()` hands to `art.load()`.)
    const onTrackArt = options.onTrackArt;
    if (onTrackArt) this.art.onProgress = (_d, _t, label, bytes, bytesTotal) => { if (label !== 'art pack') onTrackArt(bytes, bytesTotal, label); };
    this.art.onRequestSettled = () => {
      // Determinism: a world that has already been drawn is never swapped mid-run (a capture is
      // all-art or all-procedural); the next setTrack picks the pack up. Callers that need the
      // art-complete first frame await `whenReady()` before rendering.
      this.rebuildIfArtLanded();
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
      this.bikeRef.setLivery(this.bikeClass);
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
  setModels(m: ModelChoices, bytes?: ByteProgress): void {
    this.models = { riderModel: m.riderModel === 'gltf' ? 'gltf' : 'proc', bikeModel: m.bikeModel === 'gltf' ? 'gltf' : 'proc' };
    const want = this.models;
    const outfit = this.riderOutfit;
    this.heroLoading++;
    const run = async (): Promise<void> => {
      const url = riderUrl(outfit);
      const [bike, rider] = await Promise.all([
        want.bikeModel === 'gltf' && !this.gltf.bike
          ? Promise.all([loadGltf(HERO_URLS.bike, false, bytes), loadGltf(lodUrl(HERO_URLS.bike), true, bytes)])
          : Promise.resolve([this.gltf.bike, this.gltf.bikeLod]),
        want.riderModel === 'gltf' && (!this.gltf.rider || this.riderDocumentOutfit !== outfit)
          ? Promise.all([loadGltf(url, false, bytes), loadGltf(lodUrl(url), true, bytes)])
          : Promise.resolve([this.gltf.rider, this.gltf.riderLod]),
      ]);
      // A superseded outfit request must not even overwrite the stored documents: a later
      // quality change could otherwise resurrect the old outfit despite its swap being skipped.
      if (want !== this.models || outfit !== this.riderOutfit) return;
      [this.gltf.bike, this.gltf.bikeLod] = [bike[0] ?? null, bike[1] ?? null];
      if (want.riderModel === 'gltf') {
        if (!rider[0] || !rider[1]) throw new Error(`Could not load both detail levels of ${outfit} rider outfit`);
        [this.gltf.rider, this.gltf.riderLod] = [rider[0], rider[1]];
        this.riderDocumentOutfit = outfit;
      }
      this.applyModels();
    };
    this.heroPending = run()
      .catch((e) => console.warn('[render] setModels failed', e))
      .then(() => {
        this.heroLoading--;
      });
  }

  async setRiderOutfit(outfit: RiderOutfit): Promise<boolean> {
    const previous = this.riderDocumentOutfit ?? this.riderOutfit;
    this.riderOutfit = outfit;
    // The procedural debug model has no clothing variants. Keep the preference honest.
    if (this.models.riderModel !== 'gltf') {
      this.riderOutfit = previous;
      return false;
    }
    this.setModels(this.models);
    // A model-settings change can supersede the request while loading the same outfit.
    // Observe the current request before reporting that the installed documents are ready.
    let pending: Promise<void>;
    do {
      pending = this.heroPending;
      await pending;
    } while (outfit === this.riderOutfit && pending !== this.heroPending);
    const loaded = outfit === this.riderOutfit && this.models.riderModel === 'gltf'
      && this.riderDocumentOutfit === outfit && !!this.gltf.rider && !!this.gltf.riderLod;
    if (!loaded && outfit === this.riderOutfit) this.riderOutfit = previous;
    return loaded;
  }

  /** The document the tier draws: `high` the authored file, `low` / `medium` the LOD twin when it loaded. */
  private bikeDoc(): GLTF | null {
    return lodChoice(this.tier) === 'lod' ? this.gltf.bikeLod ?? this.gltf.bike : this.gltf.bike;
  }

  private riderDoc(): GLTF | null {
    return lodChoice(this.tier, 'rider') === 'lod' ? this.gltf.riderLod ?? this.gltf.rider : this.gltf.rider;
  }

  /** Round 14: rider LOD gate for `low` / `medium` (default off — see `hero/lod.ts lodChoice`); rebuilds the hero when the document changes. */
  setRiderLod(on: boolean): void {
    if (on === isRiderLodEnabled()) return;
    setRiderLodEnabled(on);
    if (this.bikeRef && this.riderRef && this.gltf.rider) this.applyModels();
  }

  private makeBike(choice: ModelChoice): HeroBike {
    const doc = this.bikeDoc();
    return choice === 'gltf' && doc ? new GltfBike(doc, this.lib) : new BikeModel(this.lib);
  }

  private makeRider(choice: ModelChoice): HeroRider {
    const doc = this.riderDoc();
    return choice === 'gltf' && doc ? new GltfRider(doc, this.lib) : new RiderModel(this.lib);
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
    // Round 13: a tier change swaps the document (authored ↔ LOD) — same rebuild as a model change.
    const bikeStale = this.bike instanceof GltfBike && this.bike.source !== this.bikeDoc();
    const riderStale = this.rider instanceof GltfRider && this.rider.source !== this.riderDoc();
    if (this.kindOfBike(this.bike) !== wantBike || bikeStale) {
      const next = this.makeBike(wantBike);
      if (this.tier === 'low') shrinkTextures(next.root, 512, 256);
      next.setLivery(this.bikeClass);
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
    if (this.kindOfRider(this.rider) !== wantRider || riderStale) {
      const old = this.rider;
      old.detach();
      this.scene.remove(old.root);
      const next = this.makeRider(wantRider);
      if (next instanceof GltfRider) next.setLivery(this.bikeClass);
      next.attach(this.bike);
      if (this.tier === 'low') shrinkTextures(this.bike.root, 512, 256); // after attach: the glTF rider hangs under the bike frame
      this.scene.add(next.root);
      this.rider = next;
      old.dispose();
      changed = true;
    }
    if (changed) this.applyTierVisibility(); // round 13: the new hero instance takes the tier's shadow roles
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
    const entry = this.entryPending;
    return Promise.all([this.art.whenSettled, req, this.heroPending, entry]).then(() => {
      if (this.artRequest !== req || this.entryPending !== entry) return this.whenReady();
      // Round 10: the settle callback only rebuilds an undrawn world; do the same here so a
      // caller that awaits `whenReady()` right after `setTrack` gets the art-complete world
      // even when the settle fired before `setTrack` finished wiring it.
      this.rebuildIfArtLanded();
      return undefined;
    });
  }

  /** Rebuild the world with the pack if it settled after the build and nothing has been drawn since. */
  private rebuildIfArtLanded(): void {
    const w = this.world;
    if (this.track && w && this.art.ok && w.builtAtFrame === this.frameCount && w.artKey !== this.artKey()) this.setTrack(this.track);
  }

  private prepared: Promise<void> | null = null;
  private preparing = false;
  /** `prepare()` timeline: [label, ms, bytes] per step (diagnostic; `debugInfo().prepare`). */
  readonly prepareTimeline: { step: string; ms: number; bytes: number }[] = [];

  /**
   * Cooperative startup for the loading screen (round 9; boot plan since docs/tasks/loading-progress-invariant.md).
   * The constructor made only the WebGL context; this builds everything else in tasks of ≤ 16 ms (or one
   * GPU call), each sub-step run through the boot plan's `run(key, work)` — finishing a step IS reporting
   * it, and the plan (main.ts) cannot call `done()` until every `PREPARE_STEPS` key has run. Bytes of the
   * boot art set are counted by the art library's own read loop, the hero glTF bytes by three's FileLoader,
   * both into readers the constructor received (`artBytes`, `heroBytes`), both downloads started there. No cap races any step: the boot art
   * set and the hero models are needed, so they are awaited (the per-track art beyond the boot set is
   * background, `options.onTrackArt`). Idempotent. `render()` before this resolves draws a placeholder;
   * only the plan starts this work (the harness path never calls prepare).
   * Steps: hero meshes (bike, rider as two tasks) · lighting (sky → PMREM) · post chain · procedural
   * materials (painters in row bands, 12 ms budget) · hero glTF · boot art set · shaders (`compileAsync`,
   * two materials per task) · one warm-up frame through the post chain.
   */
  prepare(run: StepRunner<PrepareStep>): Promise<void> {
    if (this.prepared) return this.prepared;
    this.preparing = true;
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
    const work = async (): Promise<void> => {
      // The boot art set: started by the constructor (with the plan's reader) or here; awaited by the `bootArt` step.
      const artP = this.art.load();
      await yieldFrame();
      mark('art:start');
      await run('heroMeshes', async (p) => {
        p.set(0, 2, 'bike');
        if (!this.bikeRef) {
          this.bikeRef = new BikeModel(this.lib);
          this.scene.add(this.bikeRef.root);
          if (this.track) this.bindGround(this.track);
        }
        await yieldFrame();
        mark('hero:bike');
        p.set(1, 2, 'rider');
        this.ensureHero();
        await yieldFrame();
        mark('hero:rider');
      });
      await run('lighting', async (p) => {
        p.detail('sky environment');
        this.ensureLighting();
        await yieldFrame();
        mark('lighting');
      });
      await run('postChain', async () => {
        void this.post;
        await yieldFrame();
        mark('post:create');
      });
      await run('materials', async (p) => {
        // Procedural materials in 12 ms slices (a 512² painter is 50–65 ms whole on a slow host).
        const n = this.lib.jobCount;
        while (this.lib.jobsDone < n) {
          p.set(this.lib.generateProgress * 100, 100, `${this.lib.currentJobName} ${this.lib.jobsDone + 1}/${n}`);
          this.lib.generateStep(12);
          await yieldFrame();
        }
        p.set(100, 100, `${n}/${n}`);
        this.textureGenMs = this.lib.generateMs;
        stepBytes = this.lib.textureBytes;
        mark('materials');
      });
      await run('heroModels', async (p) => {
        if (this.models.bikeModel === 'gltf' || this.models.riderModel === 'gltf') {
          p.detail(this.models.riderModel === 'gltf' && this.models.bikeModel === 'gltf' ? 'bike + rider' : this.models.riderModel === 'gltf' ? 'rider' : 'bike');
          await this.heroPending;
        }
        mark('hero:gltf');
      });
      await run('bootArt', async (p) => {
        await artP;
        stepBytes = this.art.bytesDelivered;
        p.detail(`${this.art.progress.done}/${this.art.progress.total} in`);
        mark('art:settled');
        await yieldFrame();
      });
      await run('shaders', async (p) => {
        // Compile what is in the scene (hero + the world if a track is set) in chunks.
        await this.compileMaterials(this.collectMaterials(this.scene), (d, n) => p.set(d, n, `${d}/${n} programs`));
        mark('shaders');
      });
      await run('firstFrame', async (p) => {
        // Two rows: the plain scene (shadow-depth programs + the GPU's first draw of every pipeline) and then
        // the composer (screen-quad shaders compileAsync cannot reach). On software GL these are the
        // seconds-long tasks — the driver JITs each pipeline at its first draw; no JS split exists.
        p.set(0, 2, 'world + shadows');
        this.renderer.info.autoReset = false;
        this.post.renderSceneOnly();
        await yieldFrame();
        mark('firstframe:world');
        p.set(1, 2, 'post chain');
        this.post.render();
        await yieldFrame();
        mark('firstframe:post');
      });
    };
    this.prepared = work().finally(() => {
      this.preparing = false;
      this.booted = true;
    });
    return this.prepared;
  }

  /** Every distinct material under `root` (array materials flattened). */
  private collectMaterials(root: THREE.Object3D): THREE.Material[] {
    const mats: THREE.Material[] = [];
    const seen = new Set<THREE.Material>();
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (!seen.has(mat)) {
        seen.add(mat);
        mats.push(mat);
      }
    });
    return mats;
  }

  /**
   * Compile `mats` in tasks of two materials (`compileAsync`; on a real driver a handful of ms
   * each, on software GL the first standard program is seconds and not splittable from JS),
   * against the tier's scene target (program parameters include the output colour space and
   * tone mapping, so a compile against the wrong target builds a variant the frame never uses).
   * Returns the summed task ms. `abort()` (round 14 entry) stops between tasks.
   */
  private async compileMaterials(mats: THREE.Material[], report?: (done: number, total: number) => void, abort?: () => boolean): Promise<number> {
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    if (!r.compileAsync) return 0;
    let ms = 0;
    const chunk = 2;
    for (let i = 0; i < mats.length; i += chunk) {
      if (abort?.()) break;
      const t0 = performance.now();
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
        this.renderer.setRenderTarget(this.post.sceneTarget);
        await r.compileAsync(this.scene, this.rig.camera);
      } finally {
        this.renderer.setRenderTarget(null);
        for (const o of hidden) o.visible = true;
      }
      ms += performance.now() - t0;
      report?.(Math.min(mats.length, i + chunk), mats.length);
      await yieldFrame();
    }
    return ms;
  }

  /** Textures a material set samples (maps + the scene background), each once. */
  private collectTextures(mats: THREE.Material[]): THREE.Texture[] {
    const out: THREE.Texture[] = [];
    const seen = new Set<THREE.Texture>();
    const add = (t: unknown): void => {
      if (t instanceof THREE.Texture && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    };
    for (const m of mats) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) add(v);
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const k of Object.keys(u)) add(u[k]!.value);
    }
    add(this.scene.background);
    return out;
  }

  /**
   * Round 14: the biome's GPU cost moved off the first draw. Uploads the world's textures and
   * compiles its materials in ≤ 16 ms tasks; a newer `setTrack` cancels the job. `whenReady()`
   * resolves after it; `render()` paints the placeholder until then (play mode).
   */
  private beginEntry(): void {
    const token = ++this.entryToken;
    const t0 = performance.now();
    const st = this.entryStats;
    st.biome = this.biome.id;
    st.programsBefore = this.renderer.info.programs?.length ?? 0;
    st.ms = st.compileMs = st.textureMs = st.warmMs = st.textures = st.texturesMB = st.materials = st.programs = 0;
    this.entering = true;
    const stale = (): boolean => token !== this.entryToken;
    const run = async (): Promise<void> => {
      if (!this.booted) {
        // Boot: `prepare()` compiles the whole scene (step 8) and uploads at its warm-up frame.
        await (this.prepared ?? Promise.resolve());
        if (stale()) return;
      }
      await yieldFrame();
      if (stale()) return;
      const world = this.world;
      if (!world) return;
      const mats = this.collectMaterials(world.group);
      st.materials = mats.length;
      // 1. Textures: `initTexture` uploads without a draw, ≤ 16 ms per task.
      const texs = this.collectTextures(mats);
      let t1 = performance.now();
      let bytes = 0;
      for (const t of texs) {
        if (stale()) return;
        const img = t.image as { width?: number; height?: number } | undefined;
        if (img?.width && img.height) bytes += img.width * img.height * 4 * 1.33;
        const ta = performance.now();
        this.renderer.initTexture(t);
        st.textureMs += performance.now() - ta;
        st.textures++;
        if (performance.now() - t1 > 12) {
          await yieldFrame();
          t1 = performance.now();
        }
      }
      st.texturesMB = +(bytes / 1048576).toFixed(1);
      // 2. Programs: the world's materials against the tier's target.
      st.compileMs = await this.compileMaterials(mats, undefined, stale);
      if (stale()) return;
      await yieldFrame();
      if (stale()) return;
      // 3. Warm-up: one scene pass into the tier's target with culling off — a driver that builds
      //    its pipelines at the first draw (SwiftShader; ANGLE's per-state pipeline objects) does
      //    it here, for every mesh, not on the countdown's first frame. On the bypass tier the
      //    target is the canvas: cleared to the placeholder before this task yields, so it is
      //    never composited.
      const culled: THREE.Object3D[] = [];
      world.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.frustumCulled) {
          o.frustumCulled = false;
          culled.push(o);
        }
      });
      const tw = performance.now();
      try {
        this.post.renderSceneOnly();
        this.finish(); // GPU-side completion (pipeline builds, uploads) belongs to the entry, not to the countdown's first frame
      } finally {
        for (const o of culled) o.frustumCulled = true;
        if (this.post.sceneTarget === null) this.placeholderFrame();
      }
      st.warmMs = +(performance.now() - tw).toFixed(1);
      st.programs = this.renderer.info.programs?.length ?? 0;
    };
    const p = run()
      .catch((err) => console.warn('[render] track entry failed', err))
      .then(() => {
        if (token !== this.entryToken) return;
        this.entering = false;
        st.ms = +(performance.now() - t0).toFixed(1);
        performance.mark?.('render:entry');
      });
    this.entryPending = p;
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
      this.artRequest = this.art.request(this.artIds, `${biome.id} (${(pending / (1024 * 1024)).toFixed(2)} MB)`).catch((err) => console.warn('[render] art request failed', err));
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
    PropBatch.CHUNK_M = this.tier === 'low' ? 80 : 40; // round 12: fewer chunk draws per riding frame on the phone tier
    const ribbons = buildRideSurfaces(track, this.biome, this.lib);
    const obstacles = buildObstacles(track, this.lib);
    const gates = buildGates(track, this.biome, this.lib, art);
    const kit = buildBiomeKit(track, this.biome, this.lib, art, this.tier);
    group.add(ribbons.group, ribbons.supports, obstacles.group, gates.group, kit.group);
    // One program variant for the whole world: every standard material gets the full map set.
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.lib.complete(m as THREE.MeshStandardMaterial);
    });
    harmonizeUv1(group);
    if (this.tier === 'low') shrinkTextures(group, 512, 256);
    this.scene.add(group);
    this.applyTierVisibility();
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
      lamps: kit.lamps,
      lampLights: [],
    };
    if (this.biome.lampLights && kit.lamps.length) {
      // Round 10 recipe: the sodium high-bays are a real second key. N spots (no shadow map; the
      // cone decal + puddle carry the volumetric read) sit on the N lamp heads nearest the camera
      // target every frame — a pure function of state, like the foundry melt lights.
      const L = this.biome.lampLights;
      for (let i = 0; i < (L.count ?? 2); i++) {
        const sl = new THREE.SpotLight(L.color, L.intensity, L.distance, L.angle, L.penumbra, 2);
        sl.castShadow = false;
        group.add(sl, sl.target);
        this.world.lampLights.push(sl);
      }
    }
    if (kit.fountains.length) {
      // Camera-following melt / fire lights (round 11: count + colour per biome, `Biome.meltLights`):
      // the N nearest pours / furnace mouths light the kit and the hero from below (no GI; the
      // emissive melt lights nothing by itself).
      const M = this.biome.meltLights ?? (this.biome.id === 'foundry' ? { color: 0xff7a22, intensity: 140, distance: 34, count: 2 } : null);
      if (M) {
        for (let i = 0; i < M.count; i++) {
          const pl = new THREE.PointLight(M.color, M.intensity, M.distance, 2);
          group.add(pl);
          this.world.meltLights.push(pl);
        }
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
    this.beginEntry();
  }

  onEvent(e: GameEvent): void {
    this.emitters.onEvent(e);
    if (e.type === 'finish') this.flashT = this.lastTSim;
    if (e.type === 'restart') {
      this.frames.invalidate();
      this.ghostFrames.invalidate();
      this.flashT = -1; // round 14: a restart is a time cut — the finish flash of the previous run must not follow it
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

  setBikeClass(c: BikeClass): void {
    this.bikeClass = c === 'pro' ? 'pro' : 'rookie';
    // The hero may not exist yet (built lazily by `ensureHero` / swapped by `applyModels`): both
    // paths read `bikeClass`, so a call before the first frame still lands.
    this.bikeRef?.setLivery(this.bikeClass);
    if (this.riderRef instanceof GltfRider) this.riderRef.setLivery(this.bikeClass);
  }

  setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.postRef?.setQuality(tier);
    this.lightingRig?.setQuality(tier);
    this.emitters.countScale = tier === 'low' ? 0.5 : 1;
    this.emitters.ambientEnabled = tier !== 'low';
    // Round 12: the tier owns the canvas resolution (low ≤ 1.0 DPR / 1600 px, medium ≤ 1.25, high ≤ 2).
    this.resize(this.width, this.height);
    // Round 13 (H3): the shadow map stays on for every tier — `low` runs the hero-only 512² map
    // (casters = bike + rider, receivers = the ride surfaces; `applyTierVisibility`). Three re-keys
    // a program on `receiveShadow`, so no material flag is needed.
    this.applyTierVisibility();
    // Round 13 (G3): the hero draws the LOD document on low / medium (rebuilt here when it differs).
    if (this.bikeRef && this.riderRef && (this.gltf.bike || this.gltf.rider)) this.applyModels();
    if (tier === 'low') {
      // Texture budget on low (≤ 40 MB): halve the hero atlases and the world's art / skins in
      // place. Not undone by a later step-up — the phone's medium runs on the same bitmaps, and a
      // desktop that probed down keeps them until the next track load / hero swap.
      // (`bikeRef`, not the getter: a phone sets `low` before `prepare()` has built the hero — that build must stay in the loader's chunked tasks.)
      if (this.bikeRef) shrinkTextures(this.bikeRef.root, 512, 256);
      if (this.riderRef) shrinkTextures(this.riderRef.root, 512, 256);
      if (this.world) shrinkTextures(this.world.group, 512, 256);
    }
  }

  /**
   * Round 12: per-tier visibility of the volumetric / scatter batches (`world/props.ts tierHides`).
   * Round 13 (H3): per-tier shadow roles for the world — on `low` nothing in the world casts (the
   * 512² map is the hero's) and only the ride surfaces (`deck:*`, `obstacles:*`, `ribbon:*`, not
   * the AO skirt) receive, so no other material samples the map. Reversible: the built flags are
   * remembered in `userData` and `medium` / `high` restore them.
   */
  private applyTierVisibility(): void {
    const low = this.tier === 'low';
    this.scene.traverse((o) => {
      if (!o.name) return;
      if (tierManaged(o.name)) o.visible = !tierHides(o.name, this.tier);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (HERO_SMALL.test(o.name)) {
        o.castShadow = !low;
        return;
      }
      const world = WORLD_MESH.test(o.name);
      if (!world) return;
      const ud = o.userData as { castHigh?: boolean; receiveHigh?: boolean };
      if (ud.castHigh === undefined) ud.castHigh = o.castShadow;
      if (ud.receiveHigh === undefined) ud.receiveHigh = o.receiveShadow;
      // Medium shadow casters (`tierCasts`): props by name; low: no world caster at all.
      o.castShadow = !low && ud.castHigh && (!o.name.startsWith('props:') || tierCasts(o.name, this.tier));
      o.receiveShadow = ud.receiveHigh && (!low || RIDE_SURFACE.test(o.name));
    });
  }


  camera(): CameraDebug {
    return this.rig.debug();
  }

  render(state: PhysicsState, alpha: number): number {
    const t0 = performance.now();
    if (!this.booted) {
      if (this.lazyBoot) {
        // Play mode: the boot plan owns `prepare()` (main.ts); draw a placeholder until it is done.
        // (This used to start prepare() itself with a no-op reporter — incident (a) in the task doc.)
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
    if (this.entering && this.lazyBoot) {
      // Round 14: the new world's programs are still compiling in `beginEntry`'s tasks; a draw now
      // would block on them (the black frames under the running HUD). Fog until `whenReady()`.
      this.placeholderFrame();
      return performance.now() - t0;
    }
    const f = this.frames.build(state, alpha);
    this.lastTSim = f.tSim;

    this.rig.update(f);
    const cam = this.rig.camera;
    if (this.lighting.isHeroShadow) this.lighting.follow(f.bikeX, f.bikeY, false);
    else this.lighting.follow(this.rig.targetX, this.rig.targetY, this.rig.distance > 20);

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
        // N nearest melt sources to the camera target (deterministic: pure function of state).
        const M = this.biome.meltLights ?? { intensity: 140 };
        nearestK(w.fountains, this.rig.targetX, w.meltLights.length, this.nearestScratch);
        for (let k = 0; k < w.meltLights.length; k++) {
          const pl = w.meltLights[k]!;
          const idx = this.nearestScratch[k]!;
          if (idx < 0) {
            pl.intensity = 0;
            continue;
          }
          const s = w.fountains[idx]!;
          pl.position.set(s.x, s.y + 1.2, s.z + 2.5);
          const flick = 1 + 0.12 * Math.sin(17 * f.tSim + idx) * Math.sin(5.1 * f.tSim);
          pl.intensity = M.intensity * flick;
        }
      }
      if (w.lampLights.length) {
        nearestK(w.lamps, this.rig.targetX, w.lampLights.length, this.nearestScratch);
        for (let k = 0; k < w.lampLights.length; k++) {
          const sl = w.lampLights[k]!;
          const idx = this.nearestScratch[k]!;
          if (idx < 0) {
            sl.intensity = 0;
            continue;
          }
          const l = w.lamps[idx]!;
          sl.position.set(l.x, l.y - 0.2, l.z);
          sl.target.position.set(l.x, l.y - 8, l.z + 0.6);
          sl.target.updateMatrixWorld();
          sl.intensity = this.biome.lampLights!.intensity;
        }
      }
      // Crowd: cheer for 3.5 s after GO and through the finish; sway otherwise.
      const cheer = this.phase === 'finished' || f.finished || (this.phase === 'riding' && this.runTime < 3.5) ? 1 : 0;
      w.gates.anim.uTime.value = f.tSim;
      w.gates.anim.uCheer.value = cheer;
    }
    this.post.setTime(f.tSim);
    // Particles.
    this.bike.toWorld(this.bike.exhaustTip.x, this.bike.exhaustTip.y, this.bike.exhaustTip.z, this.tmp);
    this.emitters.setViewport(this.height * this.pixelRatio, (cam.fov * Math.PI) / 180);
    this.emitters.update(f, this.tmp, this.rig.targetX);

    // Post dynamics: smear only above 9 m/s, along the screen-space travel direction. After the
    // line (round 9) speed effects are off: no smear, no chromatic aberration on the coasting hold.
    this.rig.bikeScreen(this.bikeUV); // round 12: no per-frame `debug()` object
    const speedFx = f.finished ? 0 : f.speed;
    const smear = Math.min(4, Math.max(0, (speedFx - 9) * 0.55)); // round 14: halved (was 8 px max) and rim-only in the composite
    const dl = Math.hypot(f.velX, f.velY) || 1;
    // Finish flash: 0.2 s from the finish, on the sim clock, forward only. Round 14: a replay of the
    // run just finished restarts `tSim` at 0 with `flashT` still at the finish time — the old
    // `1 − (tSim − flashT) / 0.2` made that `uFlash` 20–200 and the composite's `mix(col, 1, uFlash)`
    // painted the whole HDR frame white with cyan specks where a channel overshot negative (the
    // phone's replay viewer on `medium`). A clock behind the flash ends the flash.
    let flash = 0;
    if (this.flashT >= 0) {
      const since = f.tSim - this.flashT;
      if (since < 0 || since >= 0.2) this.flashT = -1;
      else flash = 1 - since / 0.2;
    }
    this.post.setDynamics(speedFx, this.bikeUV.x, this.bikeUV.y, smear, f.velX / dl, -f.velY / dl, flash);

    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.post.render();
    this.frameCount++;
    return performance.now() - t0;
  }

  /**
   * Round 14: programs a scene material holds but is not currently drawing with (compiled once by
   * `prepare()` / a rebuild under a texture-channel or target state the material no longer has).
   * Read-only census for `debugInfo()` — round 11's `pruneStalePrograms` destroyed these GL
   * programs and spliced `info.programs`, but three r186 also keeps a private cacheKey → program
   * map, so the destroyed wrapper stayed acquirable: the next material (an instanced prop, the
   * spoke material, the rebuilt LOD hero on a tier change) that hit that cacheKey was handed a
   * wrapper whose `program` was `undefined`, three bound no program, and every uniform / VAO
   * upload after it ran against corrupt state — `INVALID_OPERATION` in Chromium, and on the
   * phone (ANGLE on Metal) the skinned rider drew with stale attribute bindings: rigid arms in
   * the bind pose, hands off the grips, the torso facing backwards on `medium` / `low`. A dead
   * program costs memory only; nothing here releases one any more.
   */
  private staleProgramCount(): number {
    type Prog = { id: number };
    const seen = new Set<THREE.Material>();
    let n = 0;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        const p = this.renderer.properties.get(mat) as { programs?: Map<string, Prog>; currentProgram?: Prog } | undefined;
        if (!p?.programs || !p.currentProgram) continue;
        for (const prog of p.programs.values()) if (prog !== p.currentProgram) n++;
      }
    });
    return n;
  }

  finish(): void {
    // gl.finish() returns immediately in Chromium; a 1x1 readPixels blocks on raster.
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPixel);
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    if (pixelRatio !== undefined) this.devicePixelRatio = pixelRatio;
    this.width = width;
    this.height = height;
    // Round 12: the tier caps the host's ratio — low ≤ 1.0 and ≤ 1600 px wide, medium ≤ 1.25,
    // high ≤ 2 — and the canvas itself is sized by it (the browser upscales the canvas; the
    // composite no longer writes a full-DPR frame).
    const pr = tierPixelRatio(this.tier, this.devicePixelRatio, width);
    if (pr !== this.pixelRatio) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
    }
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

  /**
   * Round 10 evidence: instanced props whose instance origin is inside the view frustum and
   * within `maxDist` m of the camera (structure, decals, scatter and shadows excluded) — the
   * "lit props in frame" count of the industrial recipe, by batch.
   */
  propsInFrame(maxDist = 60): { total: number; byBatch: Record<string, number>; structure: number } {
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const skip = /^props:(truss|purlin|column|cranerail|chain|hangchain|catwalk|rail|railpost|lampcone|lampstreak|puddle|contactshadow|oilstain|paper|gravel|bolt|decal:.*|support-.*|edge-rock|worn|crowd.*|flag.*|barrier.*|strip.*)(:|$)/;
    const byBatch: Record<string, number> = {};
    let total = 0;
    let structure = 0;
    this.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !o.name.startsWith('props:')) return;
      const batch = o.name.split(':').slice(1, -1).join(':');
      const isStructure = skip.test(o.name);
      o.updateMatrixWorld();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
        if (p.distanceTo(camPos) > maxDist || !frustum.containsPoint(p)) continue;
        if (isStructure) structure++;
        else {
          total++;
          byBatch[batch] = (byBatch[batch] ?? 0) + 1;
        }
      }
    });
    return { total, byBatch, structure };
  }

  /** Extra diagnostics for the harness / perf report. */
  debugInfo(): {
    biome: string;
    zoom: string;
    phase: GamePhase;
    tier: QualityTier;
    /** Round 12 (`?perf=1` budget row): effective canvas pixel ratio, what the host passed, drawing-buffer size. */
    dpr: number;
    devicePixelRatio: number;
    canvasW: number;
    canvasH: number;
    /** Last frame's draw calls / triangles (all passes, `info.autoReset = false`). */
    calls: number;
    tris: number;
    /** Render-target pixels written per frame (Mpx) and the same in MB (colour + depth), shadow map included; `rtPasses` lists them. */
    rtMpx: number;
    rtMB: number;
    rtPasses: string;
    shadowMap: number;
    /** Round 13: hero triangles drawn at this tier, which documents (authored / lod), and the low map's mode. */
    heroTris: number;
    heroDoc: string;
    heroShadow: 'hero-only' | 'world';
    riderOutfit: RiderOutfit | null;
    trackCalls: number;
    trackTris: number;
    textureGenMs: number;
    passes: number;
    /** Round 14: programs held by scene materials that are not their current one (memory only; never released mid-session). */
    stalePrograms: number;
    /** Round 14: last track entry — wall ms from `setTrack` to ready, and its breakdown (`entryStats`). */
    entryMs: number;
    entry: ThreeRenderer['entryStats'];
    entering: boolean;
    art: { settled: boolean; ok: boolean; loadMs: number; deliveredMB: number; inWorld: boolean; trackComplete: boolean; trackIds: number; builtAtFrame: number; frames: number };
    prepare: { step: string; ms: number; bytes: number }[];
  } {
    const writes: PassWrite[] = this.postRef ? this.postRef.passWrites() : [];
    const shadowMap = this.renderer.shadowMap.enabled && this.lightingRig ? this.lightingRig.shadowMapSize : 0;
    if (shadowMap) writes.unshift({ name: 'shadow', width: shadowMap, height: shadowMap, bytesPerPixel: 8 });
    let px = 0;
    let bytes = 0;
    for (const w of writes) {
      px += w.width * w.height;
      bytes += w.width * w.height * w.bytesPerPixel;
    }
    return {
      prepare: this.prepareTimeline,
      biome: this.biome.id,
      zoom: this.rig.zoomState,
      phase: this.phase,
      tier: this.tier,
      dpr: +this.pixelRatio.toFixed(3),
      devicePixelRatio: this.devicePixelRatio,
      canvasW: this.renderer.domElement.width,
      canvasH: this.renderer.domElement.height,
      calls: this.renderer.info.render.calls,
      tris: this.renderer.info.render.triangles,
      rtMpx: +(px / 1e6).toFixed(2),
      rtMB: +(bytes / 1048576).toFixed(1),
      rtPasses: writes.map((w) => `${w.name} ${w.width}×${w.height}`).join(' | '),
      shadowMap,
      heroTris: (this.bikeRef?.triangles ?? 0) + (this.riderRef?.triangles ?? 0),
      heroDoc: `${this.bikeRef instanceof GltfBike ? (this.bikeRef.source === this.gltf.bikeLod ? 'bike-lod' : 'bike') : 'bike-proc'} ${this.riderRef instanceof GltfRider ? (this.riderRef.source === this.gltf.riderLod ? 'rider-lod' : 'rider') : 'rider-proc'}`,
      riderOutfit: this.riderRef instanceof GltfRider ? this.riderDocumentOutfit : null,
      heroShadow: this.lightingRig?.isHeroShadow ? 'hero-only' : 'world',
      trackCalls: this.world?.trackCalls ?? 0,
      trackTris: Math.round(this.world?.trackTris ?? 0),
      textureGenMs: this.textureGenMs,
      passes: this.postRef?.info.passes ?? 0,
      stalePrograms: this.staleProgramCount(),
      entryMs: this.entryStats.ms,
      entry: this.entryStats,
      entering: this.entering,
      art: { settled: this.art.settled, ok: this.art.ok, loadMs: Math.round(this.art.loadMs), deliveredMB: +(this.art.bytesDelivered / (1024 * 1024)).toFixed(2), inWorld: this.world?.withArt ?? false, trackComplete: this.art.requested(this.artIds), trackIds: this.artIds.length, builtAtFrame: this.world?.builtAtFrame ?? -1, frames: this.frameCount },
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
/** Indices of the `k` sources nearest `x` (ascending distance; −1 pads), insertion-sorted into `out`. */
function nearestK(src: { x: number }[], x: number, k: number, out: number[]): number[] {
  out.length = k;
  for (let i = 0; i < k; i++) out[i] = -1;
  for (let i = 0; i < src.length; i++) {
    const d = Math.abs(src[i]!.x - x);
    let j = k - 1;
    if (out[j]! >= 0 && Math.abs(src[out[j]!]!.x - x) <= d) continue;
    while (j > 0 && (out[j - 1]! < 0 || Math.abs(src[out[j - 1]!]!.x - x) > d)) {
      out[j] = out[j - 1]!;
      j--;
    }
    out[j] = i;
  }
  return out;
}

/**
 * Round 11 program census: three's program cache key includes `vertexUv1s` (does the geometry
 * carry a `uv1` attribute). AO-baked geometries have one, plain ones do not, and `lib.complete`
 * gives every standard material an `aoMap` — so the same world material compiled TWICE (b1: the
 * big standard+vertexColour variant, `deck:ao`, the light shafts, the lamp cones: 4 programs for
 * nothing). Every world geometry now carries `uv1` as an alias of `uv` (same BufferAttribute,
 * no memory), so one material is one program whatever it is drawn on.
 */
function harmonizeUv1(root: THREE.Object3D): void {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g || seen.has(g)) return;
    seen.add(g);
    if (!g.getAttribute('uv1')) {
      const uv = g.getAttribute('uv');
      if (uv) g.setAttribute('uv1', uv);
    }
  });
}

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
