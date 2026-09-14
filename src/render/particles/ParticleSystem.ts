/**
 * GPU-integrated particle pools. Each system is one THREE.Points whose vertex
 * shader integrates ballistics + drag analytically from `uTime = tSim`, so no
 * per-particle CPU work happens after the spawn write. Spawning is seeded by
 * the caller (track seed ^ tick) and therefore identical across captures.
 */
import * as THREE from 'three';
import type { Rng } from '../../core/rng';

export interface Burst {
  x: number;
  y: number;
  z: number;
  count: number;
  life: [number, number];
  size: [number, number];
  /** Mean velocity. */
  vx: number;
  vy: number;
  vz: number;
  /** Isotropic velocity jitter (m/s). */
  spread: number;
  /** Positional jitter (m). */
  jitter: number;
  color: THREE.Color | number;
  /** Colour jitter 0..1 (luminance). */
  colorJitter?: number;
  /** Per-burst gravity/drag override multipliers (default 1). */
  gravityScale?: number;
}

const VERT = /* glsl */ `
attribute vec3 aPos0;
attribute vec3 aVel0;
attribute float aBirth;
attribute float aLife;
attribute vec2 aSize;
attribute vec3 aColor;
attribute float aGrav;
uniform float uTime;
uniform float uGravity;
uniform float uDrag;
uniform float uScale;
varying float vU;
varying vec3 vColor;
void main() {
  float t = uTime - aBirth;
  float u = aLife > 0.0 ? t / aLife : 2.0;
  vU = u;
  vColor = aColor;
  if (t < 0.0 || u > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  // Velocity with linear drag: v(t) = v0 e^{-kt}; x(t) = x0 + v0 (1 - e^{-kt}) / k
  float k = max(uDrag, 1e-3);
  float e = (1.0 - exp(-k * t)) / k;
  vec3 p = aPos0 + aVel0 * e + vec3(0.0, uGravity * aGrav * 0.5 * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(aSize.x, aSize.y, u);
  gl_PointSize = clamp(size * uScale / max(0.5, -mv.z), 1.0, 512.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uFadeIn;
uniform float uOpacity;
varying float vU;
varying vec3 vColor;
void main() {
  vec4 tex = texture2D(map, gl_PointCoord);
  float a = smoothstep(0.0, uFadeIn, vU) * pow(1.0 - vU, 1.4) * tex.a * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * tex.rgb, a);
  // Round 12: on the direct-to-canvas tier three tone-maps + sRGB-encodes here (no-ops into the HDR target).
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function puffTexture(kind: 'soft' | 'spark' | 'flake'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  if (kind === 'flake') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 8);
    g.lineTo(52, 40);
    g.lineTo(12, 40);
    g.closePath();
    g.fill();
  } else {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (kind === 'soft') {
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.2, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly pos0: THREE.BufferAttribute;
  private readonly vel0: THREE.BufferAttribute;
  private readonly birth: THREE.BufferAttribute;
  private readonly life: THREE.BufferAttribute;
  private readonly size: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  private readonly grav: THREE.BufferAttribute;
  private head = 0;
  private readonly tmpColor = new THREE.Color();

  constructor(
    readonly capacity: number,
    map: THREE.Texture,
    opts: { additive?: boolean; gravity?: number; drag?: number; fadeIn?: number; opacity?: number; depthTest?: boolean } = {},
  ) {
    const geo = new THREE.BufferGeometry();
    const n = capacity;
    // three needs a `position` attribute for bounds; keep it at the origin and disable culling.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.pos0 = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.vel0 = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.birth = new THREE.BufferAttribute(new Float32Array(n).fill(-1e9), 1);
    this.life = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.size = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
    this.color = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.grav = new THREE.BufferAttribute(new Float32Array(n), 1);
    for (const a of [this.pos0, this.vel0, this.birth, this.life, this.size, this.color, this.grav]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos0', this.pos0);
    geo.setAttribute('aVel0', this.vel0);
    geo.setAttribute('aBirth', this.birth);
    geo.setAttribute('aLife', this.life);
    geo.setAttribute('aSize', this.size);
    geo.setAttribute('aColor', this.color);
    geo.setAttribute('aGrav', this.grav);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        map: { value: map },
        uTime: { value: 0 },
        uGravity: { value: opts.gravity ?? -9.81 },
        uDrag: { value: opts.drag ?? 1.5 },
        uScale: { value: 500 },
        uFadeIn: { value: opts.fadeIn ?? 0.08 },
        uOpacity: { value: opts.opacity ?? 1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest ?? true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.additive ? 20 : 10;
  }

  /** Point size scale so `size` is in world metres: viewportHeightPx / (2 tan(fov/2)). */
  setViewport(heightPx: number, fovRad: number): void {
    this.material.uniforms.uScale!.value = heightPx / (2 * Math.tan(fovRad / 2));
  }

  setTime(tSim: number): void {
    this.material.uniforms.uTime!.value = tSim;
  }

  /** Kill everything (restart). */
  clear(): void {
    (this.birth.array as Float32Array).fill(-1e9);
    this.birth.needsUpdate = true;
    this.lastDeath = -1e9;
  }

  /** Hide the points while nothing is alive (pure function of simulated time). */
  cull(tSim: number): void {
    this.points.visible = tSim <= this.lastDeath;
  }

  /** Multiplies burst counts (quality tiers). */
  countScale = 1;
  /** Simulated time after which every emitted particle is dead — the draw is skipped past it (round 12: six idle 2048-point draws per frame were free on desktop, not on a phone). */
  private lastDeath = -1e9;

  emit(b: Burst, tSim: number, rng: Rng): void {
    const base = this.tmpColor.set(b.color as THREE.ColorRepresentation);
    const cj = b.colorJitter ?? 0.15;
    const n = Math.max(1, Math.round(b.count * this.countScale));
    for (let i = 0; i < n; i++) {
      const k = this.head;
      this.head = (this.head + 1) % this.capacity;
      const j = b.jitter;
      this.pos0.setXYZ(k, b.x + rng.range(-j, j), b.y + rng.range(-j, j), b.z + rng.range(-j, j));
      const s = b.spread;
      this.vel0.setXYZ(k, b.vx + rng.range(-s, s), b.vy + rng.range(-s, s), b.vz + rng.range(-s, s) * 0.7);
      this.birth.setX(k, tSim + rng.range(0, 0.02));
      const lifeK = rng.range(b.life[0], b.life[1]);
      this.life.setX(k, lifeK);
      if (tSim + 0.02 + lifeK > this.lastDeath) this.lastDeath = tSim + 0.02 + lifeK;
      const sz = rng.range(0.8, 1.2);
      this.size.setXY(k, b.size[0] * sz, b.size[1] * sz);
      const l = 1 + rng.range(-cj, cj);
      this.color.setXYZ(k, base.r * l, base.g * l, base.b * l);
      this.grav.setX(k, b.gravityScale ?? 1);
    }
    this.pos0.needsUpdate = true;
    this.vel0.needsUpdate = true;
    this.birth.needsUpdate = true;
    this.life.needsUpdate = true;
    this.size.needsUpdate = true;
    this.color.needsUpdate = true;
    this.grav.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
