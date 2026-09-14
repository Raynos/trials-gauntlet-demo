/**
 * Render contract + ThreeRenderer facade (CONTRACT.md §2.7).
 *
 * The renderer is a pure function of (state history, events, simulated time):
 * nothing in `render()` reads the wall clock to decide what to draw, so two
 * captures of one recording are pixel-identical. See docs/design/rendering.md.
 */
import * as THREE from 'three';
import type { CameraDebug, CompiledTrack, GameEvent, GamePhase, PhysicsState, QualityTier, RenderStats } from '../core/types';
import { biomeFor, type Biome } from './biomes';
import { BikeModel } from './bike/bikeModel';
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
}

export interface ThreeRendererOptions {
  antialias?: boolean;
  pixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  quality?: QualityTier;
}

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
  textureBytes: number;
  trackCalls: number;
  trackTris: number;
}

export class ThreeRenderer implements GameRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly lib: MaterialLibrary;
  private readonly lighting: LightingRig;
  private readonly rig = new CameraRig();
  private readonly bike: BikeModel;
  private readonly rider: RiderModel;
  private readonly emitters = new Emitters();
  private readonly post: PostChain;
  private readonly frames = new FrameBuilder();
  private world: World | null = null;
  private biome: Biome = biomeFor('industrial');
  private frameCount = 0;
  private tier: QualityTier;
  private height = 720;
  private pixelRatio: number;
  private phase: GamePhase = 'riding';
  private flashT = -1;
  private lastTSim = 0;
  private readonly rendererString: string;
  private readonly contextKind: string;
  private readonly syncPixel = new Uint8Array(4);
  private readonly tmp = new THREE.Vector3();
  private lastCheckpoint = -1;
  // Ghost (CONTRACT §2.7 setGhost): a second bike+rider with ghosted materials, no
  // shadow, no particles, no contact blobs; nothing else in the scene reads it.
  private ghost: { root: THREE.Group; bike: BikeModel; rider: RiderModel; mats: THREE.Material[] } | null = null;
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
    this.lighting = new LightingRig(this.renderer, this.scene);
    this.bike = new BikeModel(this.lib);
    this.rider = new RiderModel(this.lib);
    this.rider.attach(this.bike);
    this.scene.add(this.bike.root, this.rider.root, this.emitters.group);
    this.post = new PostChain(this.renderer, this.scene, this.rig.camera);
    this.tier = options.quality ?? 'high';
    this.post.setQuality(this.tier);
    this.lighting.setQuality(this.tier);
    this.lighting.apply(this.biome);
    this.post.applyBiome(this.biome);
    (window as unknown as { __render?: ThreeRenderer }).__render = this; // debug handle for the harness
  }

  /** Debug access for harness scripts (not part of the contract). */
  get debug(): { scene: THREE.Scene; renderer: THREE.WebGLRenderer; lighting: LightingRig; post: PostChain; lib: MaterialLibrary; rig: CameraRig; THREE: typeof THREE } {
    return { scene: this.scene, renderer: this.renderer, lighting: this.lighting, post: this.post, lib: this.lib, rig: this.rig, THREE };
  }

  get framesRendered(): number {
    return this.frameCount;
  }

  /** True once procedural textures exist and at least one lit frame has been drawn. */
  get ready(): boolean {
    return this.lib.hasTextures && this.frameCount > 0;
  }

  // -- contract -------------------------------------------------------------

  setTrack(track: CompiledTrack): void {
    this.clearWorld();
    this.biome = biomeFor(track.def.meta?.biome);
    this.lighting.apply(this.biome);
    this.lighting.setFloor(groundFloorY(track.def.profile, this.biome.interior));
    this.post.applyBiome(this.biome);
    this.rig.setKeys(track.def.meta?.camera);

    const group = new THREE.Group();
    group.name = 'world';
    const ribbons = buildRideSurfaces(track, this.biome, this.lib);
    const obstacles = buildObstacles(track, this.lib);
    const gates = buildGates(track, this.lib);
    const kit = buildBiomeKit(track, this.biome, this.lib);
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
      textureBytes: kit.textureBytes + gates.textureBytes,
      trackCalls: ribbons.drawCalls + obstacles.drawCalls,
      trackTris: ribbons.triangles + obstacles.triangles,
    };
    const profile = track.def.profile;
    this.bike.ground = (x) => {
      const y = profileY(profile, x);
      const dy = profileY(profile, x + 0.3) - profileY(profile, x - 0.3);
      return { y, angle: Math.atan2(dy, 0.6) };
    };
    const fy = track.def.profile.length ? track.def.profile[track.def.profile.length - 1]!.y : 0;
    this.emitters.setTrack(track.def.seed, gates.jets, track.def.finishX, fy, this.biome);
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
    const bike = new BikeModel(this.lib);
    const rider = new RiderModel(this.lib);
    rider.attach(bike);
    bike.root.remove(bike.rear.contact, bike.front.contact);
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
        g = std.isMeshStandardMaterial && std.name ? this.lib.derive(std.name) : fogify(src.clone());
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
    this.post.setQuality(tier);
    this.lighting.setQuality(tier);
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
    // Procedural textures are generated synchronously on the first render (after
    // installHook), so the frame they appear on is identical in every capture.
    if (!this.lib.hasTextures) {
      this.lib.generateTextures();
      this.textureGenMs = this.lib.generateMs;
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
      }
      for (let i = 0; i < w.flicker.length; i++) {
        w.flicker[i]!.emissiveIntensity = w.flickerBase[i]! * (1 + 0.15 * Math.sin(23 * f.tSim) * Math.sin(7.3 * f.tSim));
      }
    }
    // Particles.
    this.bike.toWorld(this.bike.exhaustTip.x, this.bike.exhaustTip.y, this.bike.exhaustTip.z, this.tmp);
    this.emitters.setViewport(this.height * Math.min(this.pixelRatio, this.tier === 'low' ? 1 : this.tier === 'medium' ? 1.5 : 2), (cam.fov * Math.PI) / 180);
    this.emitters.update(f, this.tmp, this.rig.targetX);

    // Post dynamics: smear only above 9 m/s, along the screen-space travel direction.
    const dbg = this.rig.debug();
    const smear = Math.min(8, Math.max(0, (f.speed - 9) * 1.1));
    const dl = Math.hypot(f.velX, f.velY) || 1;
    const flash = this.flashT >= 0 ? Math.max(0, 1 - (f.tSim - this.flashT) / 0.2) : 0;
    this.post.setDynamics(f.speed, dbg.bikeScreenX, dbg.bikeScreenY, smear, f.velX / dl, -f.velY / dl, flash);

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
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.rig.setAspect(width / height);
    this.post.setSize(width, height, this.pixelRatio);
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
      texturesMB: estimateTextureMB(this.scene) + this.lighting.textureBytes / (1024 * 1024),
      renderer: this.rendererString,
      contextKind: this.contextKind,
    };
  }

  /** Extra diagnostics for the harness / perf report. */
  debugInfo(): { biome: string; zoom: string; phase: GamePhase; tier: QualityTier; trackCalls: number; trackTris: number; textureGenMs: number; passes: number } {
    return {
      biome: this.biome.id,
      zoom: this.rig.zoomState,
      phase: this.phase,
      tier: this.tier,
      trackCalls: this.world?.trackCalls ?? 0,
      trackTris: Math.round(this.world?.trackTris ?? 0),
      textureGenMs: this.textureGenMs,
      passes: this.post.info.passes,
    };
  }

  dispose(): void {
    this.clearWorld();
    this.post.dispose();
    this.lighting.dispose();
    this.lib.dispose();
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

/** Rough GPU texture footprint: RGBA8 with a mip chain (x1.33), float textures by type. */
export function estimateTextureMB(scene: THREE.Scene): number {
  const seen = new Set<THREE.Texture>();
  let bytes = 0;
  const visit = (value: unknown): void => {
    if (value instanceof THREE.Texture && !seen.has(value)) {
      seen.add(value);
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
