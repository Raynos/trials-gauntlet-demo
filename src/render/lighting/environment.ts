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
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
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
    fogFactor = clamp( fogFactor + floorF, 0.0, 1.0 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

/** Attach the shared floor-fog uniform to a material (idempotent). */
export function fogify<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uFogFloor = fogUniforms.uFogFloor;
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

/** Equirect HDR sky: zenith→horizon→ground gradient, sun disc, horizon haze. */
export function buildSkyTexture(b: Biome, width = 256, height = 128): THREE.DataTexture {
  const data = new Float32Array(width * height * 4);
  const zen = hex(b.skyZenith);
  const hor = hex(b.skyHorizon);
  const gnd = hex(b.skyGround);
  const sun = hex(b.sunColor);
  const [sx, sy, sz] = b.sunDir;
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

  setQuality(tier: 'low' | 'medium' | 'high'): void {
    const size = tier === 'low' ? 1024 : 2048;
    if (size !== this.shadowSize) {
      this.shadowSize = size;
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.radius = tier === 'low' ? 1.5 : 3;
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
    const w = wide ? 48 : 28;
    const h = wide ? 30 : 18;
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
    this.sky?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
