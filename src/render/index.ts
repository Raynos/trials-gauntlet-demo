/**
 * Render contract + scaffold implementation.
 *
 * `ThreeRenderer` draws the physics snapshot as placeholder geometry (frame
 * box, two wheel discs, rider capsule, ground ribbon) with a following camera.
 * The real art pipeline replaces the meshes; the interface and stats stay.
 */
import * as THREE from 'three';
import type { PhysicsState, RenderStats, TrackDef } from '../core/types';

export interface GameRenderer {
  readonly canvas: HTMLCanvasElement;
  setTrack(track: TrackDef): void;
  /** Draw one frame. Returns render time in ms (performance.now delta). */
  render(state: PhysicsState, alpha: number): number;
  /** Block until the GPU has finished the last frame (1x1 readPixels). */
  finish(): void;
  resize(width: number, height: number, pixelRatio?: number): void;
  stats(): RenderStats;
  readonly framesRendered: number;
  dispose(): void;
}

export interface ThreeRendererOptions {
  antialias?: boolean;
  pixelRatio?: number;
  /** Force a specific context for diagnostics. Defaults to auto (webgl2). */
  preserveDrawingBuffer?: boolean;
}

interface Placeholder {
  root: THREE.Group;
  frame: THREE.Mesh;
  rear: THREE.Mesh;
  front: THREE.Mesh;
  rider: THREE.Mesh;
}

export class ThreeRenderer implements GameRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly placeholder: Placeholder;
  private ground: THREE.Mesh | null = null;
  private finishGate: THREE.Mesh | null = null;
  private checkpointGates: THREE.Mesh[] = [];
  private frames = 0;
  private readonly rendererString: string;
  private readonly contextKind: string;
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private cameraPrimed = false;

  constructor(parent: HTMLElement, options: ThreeRendererOptions = {}) {
    this.canvas = document.createElement('canvas');
    parent.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: options.antialias ?? true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const gl = this.renderer.getContext();
    this.contextKind = gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl';
    this.rendererString = describeRenderer(gl);

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 500);
    this.scene.background = new THREE.Color(0x10141a);
    this.scene.fog = new THREE.Fog(0x10141a, 40, 140);

    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30241a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(-8, 14, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.placeholder = this.buildPlaceholder();
    this.scene.add(this.placeholder.root);
  }

  private readonly sun: THREE.DirectionalLight;

  private buildPlaceholder(): Placeholder {
    const root = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xe0442c, roughness: 0.45, metalness: 0.25 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 });
    const riderMat = new THREE.MeshStandardMaterial({ color: 0x2a6df2, roughness: 0.7 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.3), frameMat);
    frame.castShadow = true;
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 24);
    wheelGeo.rotateX(Math.PI / 2);
    const rear = new THREE.Mesh(wheelGeo, wheelMat);
    const front = new THREE.Mesh(wheelGeo, wheelMat);
    rear.castShadow = front.castShadow = true;
    const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.6, 4, 8), riderMat);
    rider.castShadow = true;
    root.add(frame, rear, front, rider);
    return { root, frame, rear, front, rider };
  }

  get framesRendered(): number {
    return this.frames;
  }

  setTrack(track: TrackDef): void {
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
    }
    for (const g of this.checkpointGates) {
      this.scene.remove(g);
      g.geometry.dispose();
    }
    this.checkpointGates = [];
    if (this.finishGate) {
      this.scene.remove(this.finishGate);
      this.finishGate.geometry.dispose();
    }

    // Ground ribbon extruded from the profile: a triangle strip 6 units deep.
    const depth = 6;
    const pts = track.profile;
    const positions = new Float32Array(pts.length * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      positions.set([p.x, p.y, -depth / 2], i * 6);
      positions.set([p.x, p.y, depth / 2], i * 6 + 3);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x59605a, roughness: 0.95 });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const gateGeo = new THREE.BoxGeometry(0.15, 3, 0.15);
    const cpMat = new THREE.MeshStandardMaterial({ color: 0xffc23d, emissive: 0x6b4e00 });
    for (const cp of track.checkpoints) {
      const gate = new THREE.Mesh(gateGeo, cpMat);
      gate.position.set(cp.x, 1.5 + cp.spawn.pos.y, -depth / 2 - 0.2);
      this.scene.add(gate);
      this.checkpointGates.push(gate);
    }
    const finMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 });
    this.finishGate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), finMat);
    this.finishGate.position.set(track.finishX, 2, -depth / 2 - 0.2);
    this.scene.add(this.finishGate);
    this.cameraPrimed = false;
  }

  render(state: PhysicsState, _alpha: number): number {
    const t0 = performance.now();
    const ph = this.placeholder;
    ph.frame.position.set(state.bike.pos.x, state.bike.pos.y, 0);
    ph.frame.rotation.z = state.bike.angle;
    ph.rear.position.set(state.wheels.rear.pos.x, state.wheels.rear.pos.y, 0);
    ph.rear.rotation.z = -state.wheels.rear.spin;
    ph.front.position.set(state.wheels.front.pos.x, state.wheels.front.pos.y, 0);
    ph.front.rotation.z = -state.wheels.front.spin;
    ph.rider.position.set(
      state.bike.pos.x + state.rider.lean * 0.35 - Math.sin(state.bike.angle) * 0.6,
      state.bike.pos.y + 0.75 - state.rider.crouch * 0.25 + Math.cos(state.bike.angle) * 0.1,
      0,
    );
    ph.rider.rotation.z = state.bike.angle + state.rider.torsoPitch;

    // Camera: side-on with slight yaw, leading the bike by velocity.
    const lead = Math.max(-2, Math.min(4, state.bike.vel.x * 0.25));
    this.camTarget.set(state.bike.pos.x + lead, state.bike.pos.y + 1.0, 0);
    this.camPos.set(this.camTarget.x - 3.5, this.camTarget.y + 3.5, 14);
    if (!this.cameraPrimed) {
      this.camera.position.copy(this.camPos);
      this.cameraPrimed = true;
    } else {
      // Deterministic smoothing: the harness renders at a fixed cadence, so
      // this lerp is reproducible frame-for-frame.
      this.camera.position.lerp(this.camPos, 0.18);
    }
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(state.bike.pos.x - 8, 14, 12);
    this.sun.target.position.set(state.bike.pos.x, state.bike.pos.y, 0);

    this.renderer.render(this.scene, this.camera);
    this.frames++;
    return performance.now() - t0;
  }

  private readonly syncPixel = new Uint8Array(4);

  finish(): void {
    // gl.finish() returns immediately in Chromium's WebGL (it only flushes the
    // command buffer to the GPU process). A 1x1 readPixels is the reliable way
    // to block until the frame has actually been rasterized.
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPixel);
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    if (pixelRatio !== undefined) this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
      texturesMB: estimateTextureMB(this.scene),
      renderer: this.rendererString,
      contextKind: this.contextKind,
    };
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
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

/** Rough GPU texture footprint: RGBA8 with a mip chain (x1.33). */
export function estimateTextureMB(scene: THREE.Scene): number {
  const seen = new Set<THREE.Texture>();
  let bytes = 0;
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture && !seen.has(value)) {
          seen.add(value);
          const img = value.image as { width?: number; height?: number } | undefined;
          const w = img?.width ?? 0;
          const h = img?.height ?? 0;
          bytes += w * h * 4 * (value.generateMipmaps ? 1.333 : 1);
        }
      }
    }
  });
  return bytes / (1024 * 1024);
}
