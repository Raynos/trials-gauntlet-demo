/**
 * Lighting rig: sun (one shadow map that follows the camera target), hemisphere
 * fill, procedural HDR sky → PMREM environment, and the 3-tier + floor fog
 * shader chunk shared by every material.
 */
import * as THREE from 'three';
import type { Biome } from '../biomes';

// ---------------------------------------------------------------------------
// Fog: three-stop aerial perspective + exponential floor fog.
// Installed once by overriding the fog shader chunks; per-biome parameters
// travel through one shared uniform attached in `fogify()`.
// ---------------------------------------------------------------------------

export const fogUniforms = {
  /** x = h0 (floor fog base height), y = hs (scale height), z = density, w = mid distance. */
  uFogFloor: { value: new THREE.Vector4(0, 1, 0, 60) },
};

/**
 * Round 12 (mobile budget): on `low` the scene draws straight to the canvas — no HDR target, no
 * composite pass — and the composite's grade runs inside every material as three's
 * `CustomToneMapping` (renderer.toneMapping; three applies it only when the render target is the
 * canvas, so the HDR tiers are untouched and the composite keeps doing the grade there). The
 * per-biome grade travels through these shared uniforms, attached by `fogify()` next to the fog
 * one. Values are *deltas from neutral* so a material that misses the hook (three's own
 * background material) still gets plain ACES + exposure instead of a black frame.
 */
export const gradeUniforms = {
  /** lift.rgb, saturation − 1 */
  uGradeA: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** gain.rgb − 1, contrast − 1 */
  uGradeB: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** vignette, 1 / drawing-buffer width, 1 / height, flash */
  uGradeC: { value: new THREE.Vector4(0, 1 / 1280, 1 / 720, 0) },
};

let fogInstalled = false;
export function installFogChunks(): void {
  if (fogInstalled) return;
  fogInstalled = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWorldY;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef USE_INSTANCING
    vFogWorldY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
  #else
    vFogWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
  #endif
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec4 uFogFloor;
  varying float vFogDepth;
  varying float vFogWorldY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float trialsFogFactor() {
    #ifdef FOG_EXP2
      return 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      // Three stops: 0 at near, 0.5 at mid, 0.85 at far, → 1 beyond 1.6*far.
      float fMid = uFogFloor.w;
      float f0 = smoothstep( fogNear, fMid, vFogDepth ) * 0.5;
      float f1 = smoothstep( fMid, fogFar, vFogDepth ) * 0.35;
      float f2 = smoothstep( fogFar, fogFar * 1.6, vFogDepth ) * 0.15;
      float fogFactor = f0 + f1 + f2;
      // Floor fog: density falls off exponentially with height above h0.
      float floorF = uFogFloor.z * exp( - max( 0.0, vFogWorldY - uFogFloor.x ) / uFogFloor.y );
      floorF *= 1.0 - exp( - vFogDepth / fMid );
      return clamp( fogFactor + floorF, 0.0, 1.0 );
    #endif
  }
#endif`;
  // HDR tiers (render target, no tone mapping): fog where three puts it. Direct-to-canvas tier:
  // the fog is folded in *before* the tone map (below) so the two paths see the same linear mix.
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#if defined( USE_FOG ) && !defined( TONE_MAPPING )
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, trialsFogFactor() );
#endif`;
  THREE.ShaderChunk.tonemapping_fragment = /* glsl */ `
#if defined( TONE_MAPPING )
  #ifdef USE_FOG
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, trialsFogFactor() );
  #endif
  gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`;
  // The composite pass's ACES fit + grade, as the CustomToneMapping body (drawn to the canvas only).
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    /* glsl */ `
uniform vec4 uGradeA;
uniform vec4 uGradeB;
uniform vec4 uGradeC;
vec3 trialsAces( vec3 x ) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );
}
vec3 CustomToneMapping( vec3 color ) {
  vec3 col = trialsAces( color * toneMappingExposure );
  col = 0.18 * pow( max( col, vec3( 0.0 ) ) / 0.18, vec3( 1.0 + uGradeB.w ) );
  col = col * ( 1.0 + uGradeB.rgb ) + uGradeA.rgb * ( 1.0 - col );
  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( l ), col, 1.0 + uGradeA.w );
  vec2 c = gl_FragCoord.xy * uGradeC.yz - 0.5;
  col *= 1.0 - uGradeC.x * smoothstep( 0.45, 1.1, length( c ) * 1.4142 );
  col = mix( col, vec3( 1.0 ), clamp( uGradeC.w, 0.0, 1.0 ) );
  float n = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  col += ( n - 0.5 ) / 255.0;
  return clamp( col, 0.0, 1.0 );
}`,
  );
}

/** Attach the shared floor-fog + grade uniforms to a material (idempotent). */
export function fogify<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uFogFloor = fogUniforms.uFogFloor;
    shader.uniforms.uGradeA = gradeUniforms.uGradeA;
    shader.uniforms.uGradeB = gradeUniforms.uGradeB;
    shader.uniforms.uGradeC = gradeUniforms.uGradeC;
    prev?.call(m, shader, renderer);
  };
  return m;
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

function hex(c: number): [number, number, number] {
  const col = new THREE.Color(c);
  return [col.r, col.g, col.b];
}

const c0 = (y: number): number => y - 0.02; // cloud base shade helper (darker underside band)
/** Equirect HDR sky: zenith→horizon→ground gradient, sun disc, horizon haze, a few clouds. */
export function buildSkyTexture(b: Biome, width = 256, height = 128): THREE.DataTexture {
  const data = new Float32Array(width * height * 4);
  const zen = hex(b.skyZenith);
  const hor = hex(b.skyHorizon);
  const gnd = hex(b.skyGround);
  const sun = hex(b.sunColor);
  const [sx, sy, sz] = b.sunDir;
  // A few cumulus near the horizon (deterministic placement), lit by the sun on the sunward side.
  const clouds: { u: number; y: number; w: number; h: number; d: number }[] = [];
  if (b.clouds) {
    let st = 0x9e3779b9;
    const rnd = (): number => {
      st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
      return st / 4294967296;
    };
    const n = Math.round(9 * b.clouds);
    for (let i = 0; i < n; i++) clouds.push({ u: rnd(), y: 0.05 + rnd() * 0.22, w: 0.03 + rnd() * 0.07, h: 0.02 + rnd() * 0.05, d: 0.5 + rnd() * 0.5 });
  }
  for (let j = 0; j < height; j++) {
    const v = (j + 0.5) / height; // 0 = top
    // Row 0 of a DataTexture is v = 0 = nadir in three's equirect convention.
    const theta = v * Math.PI;
    const y = -Math.cos(theta);
    const rxz = Math.sin(theta);
    for (let i = 0; i < width; i++) {
      const u = (i + 0.5) / width;
      const phi = u * Math.PI * 2;
      // three's equirect convention: +x at u=0.5? Use standard: dir = (-sin(phi)*rxz, y, -cos(phi)*rxz)
      const dx = -Math.sin(phi) * rxz;
      const dz = -Math.cos(phi) * rxz;
      let r: number;
      let g: number;
      let bl: number;
      if (y >= 0) {
        const t = Math.pow(y, 0.55);
        r = hor[0] + (zen[0] - hor[0]) * t;
        g = hor[1] + (zen[1] - hor[1]) * t;
        bl = hor[2] + (zen[2] - hor[2]) * t;
      } else {
        const t = Math.pow(-y, 0.5);
        r = hor[0] + (gnd[0] - hor[0]) * t;
        g = hor[1] + (gnd[1] - hor[1]) * t;
        bl = hor[2] + (gnd[2] - hor[2]) * t;
      }
      // Horizon haze band (brighter, warmer) — the thing chrome picks up.
      const haze = Math.exp(-Math.abs(y) * 9) * 0.35;
      r += haze * hor[0];
      g += haze * hor[1];
      bl += haze * hor[2];
      // Sun disc + glow.
      const cosA = dx * sx + y * sy + dz * sz;
      const disc = cosA > 0.9994 ? 1 : 0;
      const glow = Math.pow(Math.max(0, cosA), 64) * 0.25 + Math.pow(Math.max(0, cosA), 8) * 0.06;
      const s = disc * b.sunDiscIntensity + glow * b.sunDiscIntensity * 0.15;
      r += sun[0] * s;
      g += sun[1] * s;
      bl += sun[2] * s;
      if (y > 0 && clouds.length) {
        let cov = 0;
        for (const c of clouds) {
          let du = Math.abs(u - c.u);
          du = Math.min(du, 1 - du);
          const dx = du / c.w;
          const dy = (y - c.y) / c.h;
          const q = dx * dx + dy * dy + 0.35 * Math.sin(u * 80 + y * 60) * Math.sin(u * 37);
          cov = Math.max(cov, (1 - Math.min(1, Math.max(0, q))) * c.d);
        }
        if (cov > 0) {
          const lit = 0.5 + 0.5 * Math.max(0, dx * sx + dz * sz + 0.3);
          const cr = hor[0] * 0.9 + 0.35 * lit;
          const cg = hor[1] * 0.9 + 0.35 * lit;
          const cb = hor[2] * 0.95 + 0.4 * lit;
          const under = 1 - 0.45 * (1 - Math.min(1, Math.max(0, (y - c0(y)) * 40)));
          r = r + (cr * under - r) * cov;
          g = g + (cg * under - g) * cov;
          bl = bl + (cb * under - bl) * cov;
        }
      }
      const k = (j * width + i) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = bl;
      data[k + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

export class LightingRig {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.DataTexture | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private readonly pmrem: THREE.PMREMGenerator;
  private shadowSize = 2048;
  /** Current shadow map edge (px); 0 when the renderer's shadow map is off. */
  get shadowMapSize(): number {
    return this.shadowSize;
  }
  private frustumW = 28;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  biome: Biome | null = null;
  private floorY = 0;

  /** World y of the ground floor under the track; the floor fog sits on it. */
  setFloor(y: number): void {
    this.floorY = y;
    const b = this.biome;
    if (!b) return;
    const ff = b.floorFog;
    fogUniforms.uFogFloor.value.set((ff?.h0 ?? 0) + y, ff?.hs ?? 1, ff?.density ?? 0, b.fogTiers[1]);
  }

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    installFogChunks();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 90;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0x000000, 30, 150);
  }

  /** Round 13 (H3): `low` runs a hero-only 512² map over a 4 m box around the bike (`follow(…, hero)`). */
  private heroOnly = false;
  get isHeroShadow(): boolean {
    return this.heroOnly;
  }

  setQuality(tier: 'low' | 'medium' | 'high'): void {
    // round 12: medium is the phone step-up tier — one 1024² cascade; round 13: low is the hero's own 512² map.
    const size = tier === 'high' ? 2048 : tier === 'medium' ? 1024 : 512;
    if (size !== this.shadowSize) {
      this.shadowSize = size;
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.heroOnly = tier === 'low';
    this.frustumW = 0; // force the frustum rebuild on the next follow
    this.sun.shadow.radius = tier === 'high' ? 3 : tier === 'medium' ? 1.5 : 1;
    // Texels: high 1.4 cm, medium 2.7 cm, low 0.8 cm (4 m / 512) — the bias scales with them.
    this.sun.shadow.bias = tier === 'low' ? -0.0002 : -0.0004;
    this.sun.shadow.normalBias = tier === 'low' ? 0.015 : 0.03;
  }

  apply(b: Biome): void {
    this.biome = b;
    this.sunDir.set(b.sunDir[0], b.sunDir[1], b.sunDir[2]).normalize();
    this.sun.color.setHex(b.sunColor);
    this.sun.intensity = b.sunIntensity;
    this.hemi.color.setHex(b.hemiSky);
    this.hemi.groundColor.setHex(b.hemiGround);
    this.hemi.intensity = b.hemiIntensity;

    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(b.fogColor);
    fog.near = b.fogTiers[0];
    fog.far = b.fogTiers[2];
    this.setFloor(this.floorY);

    this.sky?.dispose();
    this.envRT?.dispose();
    this.sky = buildSkyTexture(b);
    this.envRT = this.pmrem.fromEquirectangular(this.sky);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = b.envIntensity;
    this.scene.background = this.sky;
    this.scene.backgroundIntensity = 1;
  }

  /** Estimated bytes of the env textures (for stats). */
  get textureBytes(): number {
    return 256 * 128 * 16 + (this.envRT ? this.envRT.width * this.envRT.height * 8 : 0);
  }

  /**
   * Keep the shadow frustum centred on the camera target, snapped to texel
   * increments so edges do not crawl as the camera pans.
   */
  follow(targetX: number, targetY: number, wide: boolean): void {
    // Hero-only (low): a 4 x 4 m light-space box centred on the bike itself (the caller passes the
    // bike position, not the camera target) — the hero's shadow falls inside it whatever the sun's
    // elevation, because the box axis is the light direction.
    const w = this.heroOnly ? 4 : wide ? 48 : 28;
    const h = this.heroOnly ? 4 : wide ? 30 : 18;
    if (w !== this.frustumW || this.sun.shadow.camera.right !== w / 2) {
      this.frustumW = w;
      const sc = this.sun.shadow.camera;
      sc.left = -w / 2;
      sc.right = w / 2;
      sc.top = h / 2;
      sc.bottom = -h / 2;
      sc.updateProjectionMatrix();
    }
    const texel = this.frustumW / this.shadowSize;
    const tx = Math.round(targetX / texel) * texel;
    const ty = Math.round(targetY / texel) * texel;
    this.sun.target.position.set(tx, ty, 0);
    this.sun.position.set(tx + this.sunDir.x * 40, ty + this.sunDir.y * 40, this.sunDir.z * 40);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.sun.shadow.mapPass?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.mapPass = null;
    this.scene.remove(this.sun, this.sun.target, this.hemi);
    this.sky?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
