/**
 * Post chain: RenderPass (HalfFloat) → UnrealBloom (HDR threshold, point
 * sources only) → Composite (speed smear masked around the bike, ACES, per-
 * biome grade, saturation, vignette, chromatic aberration, flash, dither,
 * sRGB). Quality tiers scale resolution and switch bloom.
 *
 * Round 12 (mobile budget): `low` **bypasses the chain** — the scene draws straight to the
 * canvas at ≤ 1.0 DPR (≤ 1600 px wide) with three's CustomToneMapping carrying the grade
 * (`lighting/environment.ts gradeUniforms`); no HDR target, no bloom, no composite pass.
 * `medium` keeps the HDR chain at ≤ 1.25 DPR with the bloom mips at a quarter of the frame
 * and no SSAO. On every tier with bloom the bloom result is sampled *by the composite*
 * (`tBloom`) instead of UnrealBloomPass's full-resolution additive blend back into the HDR
 * buffer — one full-frame HalfFloat read + write fewer per frame, same maths.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { QualityTier } from '../../core/types';
import type { Biome } from '../biomes';
import { gradeUniforms } from '../lighting/environment';
import { EmissiveBloom } from './emissiveBloom';

const COMPOSITE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1.0 },
    uContrast: { value: 1.0 },
    uVignette: { value: 0.35 },
    uChroma: { value: 0.0 },
    uSmear: { value: new THREE.Vector2(0, 0) },
    uBikeUV: { value: new THREE.Vector2(0.3, 0.55) },
    uFlash: { value: 0.0 },
    uAspect: { value: 16 / 9 },
    tAO: { value: null as THREE.Texture | null },
    uAO: { value: 0.0 },
    /** Bloom mips composite (UnrealBloomPass's `renderTargetsHorizontal[0]`, strength baked in); black when bloom is off. */
    tBloom: { value: null as THREE.Texture | null },
    uBloom: { value: 0.0 },
    /** Heat haze: x = amplitude (uv), y = screen-v where it fades in (from the bottom), z = time. */
    uHaze: { value: new THREE.Vector3(0, 0.45, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uChroma;
    uniform vec2 uSmear;
    uniform vec2 uBikeUV;
    uniform float uFlash;
    uniform float uAspect;
    uniform sampler2D tAO;
    uniform float uAO;
    uniform sampler2D tBloom;
    uniform float uBloom;
    uniform vec3 uHaze;
    varying vec2 vUv;

    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    vec3 scene(vec2 uv) {
      // HDR scene + the bloom composite (was added into the HDR buffer by a full-res pass).
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (uBloom > 0.0) c += texture2D(tBloom, uv).rgb;
      // Round 14 guard: a non-finite or runaway texel (a half-float overflow, an undefined
      // sample) is dropped to black rather than allowed to paint the frame; 64× white is
      // already fully white after ACES, so the cap changes no visible frame.
#if __VERSION__ >= 300
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
#endif
      return clamp(c, 0.0, 64.0);
    }
    vec3 sampleScene(vec2 uv) {
      // Directional smear (background), masked out around the bike so it stays sharp. Round 14:
      // also confined to the outer frame (radial falloff from 0.3 to 0.7 of the half-diagonal) —
      // the bike and the near track are sharp at any speed; only the frame's rim streaks.
      vec2 d = (uv - uBikeUV) * vec2(uAspect, 1.0);
      float mask = smoothstep(0.12, 0.34, length(d)) * smoothstep(0.3, 0.7, length((uv - 0.5) * vec2(uAspect, 1.0)) * 1.1);
      vec2 s = uSmear * mask;
      if (dot(s, s) < 1e-12) return scene(uv);
      vec3 acc = vec3(0.0);
      acc += scene(uv - s * 1.0) * 0.1;
      acc += scene(uv - s * 0.5) * 0.2;
      acc += scene(uv) * 0.4;
      acc += scene(uv + s * 0.5) * 0.2;
      acc += scene(uv + s * 1.0) * 0.1;
      return acc;
    }
    void main() {
      vec2 uv = vUv;
      // Heat haze: a slow shimmer that grows toward the bottom of the frame (ground air / melt).
      if (uHaze.x > 0.0) {
        float band = smoothstep(uHaze.y + 0.25, uHaze.y - 0.2, uv.y);
        float t = uHaze.z;
        float w = sin(uv.y * 140.0 + t * 5.1 + sin(uv.x * 23.0 + t * 1.7) * 2.0) * sin(uv.x * 61.0 - t * 2.3);
        uv += vec2(w, sin(uv.x * 90.0 + t * 4.3) * 0.5) * uHaze.x * band;
      }
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (uChroma > 0.0) {
        // Round 14: the aberration is the frame's rim only (it read as every edge doubled at 12+ m/s).
        vec2 off = c * uChroma * r2 * 4.0 * smoothstep(0.35, 0.7, length(c * vec2(uAspect, 1.0)));
        col.r = sampleScene(uv + off).r;
        col.g = sampleScene(uv).g;
        col.b = sampleScene(uv - off).b;
      } else {
        col = sampleScene(uv);
      }
      if (uAO > 0.0) col *= mix(1.0, texture2D(tAO, uv).r, uAO);
      col *= uExposure;
      col = aces(col);
      // Contrast: power curve about 18 % grey (linear), before the sRGB encode.
      col = 0.18 * pow(max(col, vec3(0.0)) / 0.18, vec3(uContrast));
      // Grade: lift shadows, gain highlights, saturation.
      col = col * uGain + uLift * (1.0 - col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      // Vignette.
      float v = 1.0 - uVignette * smoothstep(0.45, 1.1, length(c) * 1.4142);
      col *= v;
      // Flash (finish / impact); the uniform is clamped on both sides (round 14).
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      // Triangular dither to kill banding in the fog.
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) / 255.0;
      gl_FragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
    }`,
};

// ---------------------------------------------------------------------------
// Depth-only SSAO (round 7, `high` only): half-res, normals reconstructed from
// the depth buffer, 8 hemisphere taps on a 4×4 interleaved rotation, then a
// depth-aware 4×4 blur. Reads the depth texture attached to the composer's
// scene target, so there is no extra geometry pass; the composite multiplies
// the result in before exposure. +2 draw calls, +2 programs.
// ---------------------------------------------------------------------------

const AO_SHADER = {
  uniforms: {
    tDepth: { value: null as THREE.Texture | null },
    uProj: { value: new THREE.Matrix4() },
    uInvProj: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
    uNear: { value: 0.1 },
    uFar: { value: 400 },
    uRadius: { value: 0.7 },
    uStrength: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform mat4 uProj;
    uniform mat4 uInvProj;
    uniform vec2 uTexel;
    uniform float uNear;
    uniform float uFar;
    uniform float uRadius;
    uniform float uStrength;
    varying vec2 vUv;
    vec3 viewPos(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewPos(vUv);
      // Normal from the smaller-difference depth neighbours (no derivative halos at silhouettes).
      vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0));
      vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0));
      vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y));
      vec3 pd = viewPos(vUv - vec2(0.0, uTexel.y));
      vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
      vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
      vec3 N = normalize(cross(dx, dy));
      // 4×4 interleaved rotation from the pixel position (deterministic).
      vec2 px = floor(gl_FragCoord.xy);
      float rot = mod(px.x * 4.0 + px.y * 7.0 + px.x * px.y * 3.0, 16.0) / 16.0 * 6.2831853;
      float cs = cos(rot), sn = sin(rot);
      vec3 T = normalize(abs(N.y) < 0.9 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0)));
      vec3 B = cross(N, T);
      float occ = 0.0;
      float R = uRadius;
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float a = fi * 0.7853982 + rot;
        float r = (0.25 + 0.75 * fract(fi * 0.618034 + 0.31)) * R;
        float el = 0.35 + 0.6 * fract(fi * 0.381966 + 0.17);
        vec3 dir = (T * cos(a) + B * sin(a)) * sqrt(1.0 - el * el) + N * el;
        vec3 S = P + dir * r;
        vec4 c = uProj * vec4(S, 1.0);
        vec2 suv = c.xy / c.w * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
        float sz = viewPos(suv).z;
        float diff = sz - S.z; // > 0: scene surface is in front of the sample
        float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-3));
        occ += (diff > 0.02 ? 1.0 : 0.0) * range;
      }
      float ao = 1.0 - uStrength * occ / 8.0;
      // Fade with distance so the far hall does not get a dirty haze.
      ao = mix(ao, 1.0, smoothstep(40.0, 90.0, -P.z));
      gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
    }`,
};

const AO_BLUR = {
  uniforms: {
    tAO: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
  },
  vertexShader: AO_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tAO;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float d0 = texture2D(tDepth, vUv).x;
      float sum = 0.0;
      float wsum = 0.0;
      for (int y = -2; y < 2; y++) {
        for (int x = -2; x < 2; x++) {
          vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * uTexel;
          float d = texture2D(tDepth, uv).x;
          float w = 1.0 / (1.0 + abs(d - d0) * 4000.0);
          sum += texture2D(tAO, uv).x * w;
          wsum += w;
        }
      }
      gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
    }`,
};

class AOPass extends Pass {
  private readonly aoTarget: THREE.WebGLRenderTarget;
  private readonly blurTarget: THREE.WebGLRenderTarget;
  private readonly aoMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  constructor(private camera: THREE.PerspectiveCamera) {
    super();
    this.needsSwap = false;
    const opts: THREE.RenderTargetOptions = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, format: THREE.RGBAFormat, type: THREE.UnsignedByteType };
    this.aoTarget = new THREE.WebGLRenderTarget(640, 360, opts);
    this.blurTarget = new THREE.WebGLRenderTarget(640, 360, opts);
    this.aoMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(AO_SHADER.uniforms), vertexShader: AO_SHADER.vertexShader, fragmentShader: AO_SHADER.fragmentShader, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(AO_BLUR.uniforms), vertexShader: AO_BLUR.vertexShader, fragmentShader: AO_BLUR.fragmentShader, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.aoMat);
  }
  get texture(): THREE.Texture {
    return this.blurTarget.texture;
  }
  setCamera(c: THREE.PerspectiveCamera): void {
    this.camera = c;
  }
  override setSize(w: number, h: number): void {
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    this.aoTarget.setSize(hw, hh);
    this.blurTarget.setSize(hw, hh);
    (this.aoMat.uniforms.uTexel!.value as THREE.Vector2).set(1 / hw, 1 / hh);
    (this.blurMat.uniforms.uTexel!.value as THREE.Vector2).set(1 / hw, 1 / hh);
  }
  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const depth = read.depthTexture;
    if (!depth) return;
    const u = this.aoMat.uniforms;
    u.tDepth!.value = depth;
    (u.uProj!.value as THREE.Matrix4).copy(this.camera.projectionMatrix);
    (u.uInvProj!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    u.uNear!.value = this.camera.near;
    u.uFar!.value = this.camera.far;
    this.quad.material = this.aoMat;
    renderer.setRenderTarget(this.aoTarget);
    this.quad.render(renderer);
    this.blurMat.uniforms.tAO!.value = this.aoTarget.texture;
    this.blurMat.uniforms.tDepth!.value = depth;
    this.quad.material = this.blurMat;
    renderer.setRenderTarget(this.blurTarget);
    this.quad.render(renderer);
  }
  override dispose(): void {
    this.aoTarget.dispose();
    this.blurTarget.dispose();
    this.aoMat.dispose();
    this.blurMat.dispose();
    this.quad.dispose();
  }
}

/**
 * UnrealBloomPass without its last step: the bright pass, the five blur mips and the mip
 * composite run as shipped, but the additive blend of the result back over the full-resolution
 * HDR buffer is skipped — the composite pass samples `texture` instead (identical maths, one
 * full-frame HalfFloat read + write fewer). `render` is the addon's body minus that blend.
 */
class BloomPass extends UnrealBloomPass {
  /** The mip composite (strength + radius applied), at half the bloom input size. */
  get texture(): THREE.Texture {
    return this.renderTargetsHorizontal[0]!.texture;
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    type Priv = { _fsQuad: FullScreenQuad; _oldClearColor: THREE.Color; _oldClearAlpha: number; highPassUniforms: Record<string, THREE.IUniform> };
    const self = this as unknown as Priv;
    const dirs = UnrealBloomPass as unknown as { BlurDirectionX: THREE.Vector2; BlurDirectionY: THREE.Vector2 };
    renderer.getClearColor(self._oldClearColor);
    self._oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    self.highPassUniforms.tDiffuse!.value = read.texture;
    self.highPassUniforms.luminosityThreshold!.value = this.threshold;
    self._fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    self._fsQuad.render(renderer);
    let input: THREE.WebGLRenderTarget = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i]!;
      self._fsQuad.material = blur;
      blur.uniforms.colorTexture!.value = input.texture;
      blur.uniforms.direction!.value = dirs.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]!);
      renderer.clear();
      self._fsQuad.render(renderer);
      blur.uniforms.colorTexture!.value = this.renderTargetsHorizontal[i]!.texture;
      blur.uniforms.direction!.value = dirs.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]!);
      renderer.clear();
      self._fsQuad.render(renderer);
      input = this.renderTargetsVertical[i]!;
    }
    self._fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength!.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius!.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors!.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]!);
    renderer.clear();
    self._fsQuad.render(renderer);
    renderer.setClearColor(self._oldClearColor, self._oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }
}

/** Pixel-ratio cap per tier: low ≤ 1.0 and ≤ 1600 px wide (a 2000-CSS-px phone renders 1600×736), medium ≤ 1.25, high ≤ 2. */
export function tierPixelRatio(tier: QualityTier, devicePixelRatio: number, cssWidth: number, phoneHigh = false): number {
  if (tier === 'low') return Math.min(devicePixelRatio, 1, 1600 / Math.max(1, cssWidth));
  if (phoneHigh) return Math.min(devicePixelRatio, 1.5); // perf cut #3: phone-high draws LDR at ≤ 1.5 (874 CSS px → 1311×495)
  if (tier === 'medium') return Math.min(devicePixelRatio, 1.25);
  return Math.min(devicePixelRatio, 2);
}

/** One render-target write of a frame (the fill-rate proxy that matters on a tile-based phone GPU). */
export interface PassWrite {
  name: string;
  width: number;
  height: number;
  /** Bytes written per pixel (colour + depth where the pass has one). */
  bytesPerPixel: number;
}

export class PostChain {
  private composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private bloom: BloomPass;
  private readonly ao: AOPass;
  readonly composite: ShaderPass;
  private tier: QualityTier = 'high';
  private width = 1280;
  private height = 720;
  private pixelRatio = 1;
  private target: THREE.WebGLRenderTarget;
  /** `low`: no chain at all — `render()` draws the scene to the canvas (three tone-maps + grades in-material). */
  bypass = false;
  /** Perf cut #3: `high` on a phone — the bypass path plus an emissive-only bloom (`post/emissiveBloom.ts`). */
  phoneHigh = false;
  private emissive: EmissiveBloom | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    // On `high` the scene target carries a depth texture so the AO pass needs no second
    // geometry pass (attached in setQuality: a depth-texture attachment costs ≈80 % more
    // frame time on SwiftShader, so the other tiers keep a plain renderbuffer).
    this.target = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, this.target);
    this.renderPass = new RenderPass(scene, camera);
    this.ao = new AOPass(camera as THREE.PerspectiveCamera);
    this.bloom = new BloomPass(new THREE.Vector2(640, 360), 0.5, 0.3, 1.6);
    this.bloom.needsSwap = false;
    this.composite = new ShaderPass(COMPOSITE);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ao);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.composite);
    this.composite.uniforms.tAO!.value = this.ao.texture;
    this.composite.uniforms.tBloom!.value = this.bloom.texture;
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
    this.ao.setCamera(camera as THREE.PerspectiveCamera);
  }

  setQuality(tier: QualityTier, phoneHigh = false): void {
    this.tier = tier;
    this.phoneHigh = phoneHigh && tier === 'high';
    this.bypass = tier === 'low' || this.phoneHigh;
    this.bloom.enabled = !this.bypass;
    this.composite.uniforms.uBloom!.value = this.bloom.enabled ? 1.0 : 0.0;
    if (this.phoneHigh && !this.emissive) this.emissive = new EmissiveBloom(this.renderer);
    const high = tier === 'high' && !this.phoneHigh;
    this.ao.enabled = high;
    this.composite.uniforms.uAO!.value = high ? 1.0 : 0.0;
    // Attach / detach the depth texture on both composer buffers; dispose so three re-allocates them.
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (high === (rt.depthTexture !== null)) continue;
      rt.depthTexture = high ? new THREE.DepthTexture(rt.width, rt.height, THREE.UnsignedIntType) : (null as unknown as THREE.DepthTexture);
      rt.dispose();
    }
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  /**
   * `pixelRatio` is the renderer's effective ratio for the tier (`tierPixelRatio`; the canvas is
   * already sized by it). The composer runs at the same ratio; on the bypass tier its buffers
   * shrink to 2×2 so no HDR memory sits behind a tier that never reads it.
   */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    const pw = Math.max(1, Math.floor(width * pixelRatio));
    const ph = Math.max(1, Math.floor(height * pixelRatio));
    if (this.bypass) {
      this.composer.setPixelRatio(1);
      this.composer.setSize(2, 2);
      this.emissive?.setSize(pw, ph);
    } else {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
      // EffectComposer.setSize hands every pass the full frame and UnrealBloomPass halves it for
      // mip 0 (the `resolution` it was built with is overwritten — the old "480×270 on medium" was
      // really 1500×690 on a phone). Bloom mips start at 1/2 of the frame on high, 1/4 on medium.
      if (this.tier === 'medium') this.bloom.setSize(Math.floor(pw / 2), Math.floor(ph / 2));
    }
    this.ao.setSize(pw, ph);
    this.composite.uniforms.uAspect!.value = width / height;
    (gradeUniforms.uGradeC.value as THREE.Vector4).y = 1 / pw;
    (gradeUniforms.uGradeC.value as THREE.Vector4).z = 1 / ph;
  }

  /**
   * Render-target writes of one frame at the current size / tier (shadow pass excluded — the
   * lighting rig owns it). Bytes: HalfFloat RGBA 8 + depth 4 for the scene target, 8 for the
   * bloom mips, 4 for the AO buffers, 4 colour + 4 depth for the canvas.
   */
  passWrites(): PassWrite[] {
    const out: PassWrite[] = [];
    const pw = Math.max(1, Math.floor(this.width * this.pixelRatio));
    const ph = Math.max(1, Math.floor(this.height * this.pixelRatio));
    if (this.bypass) {
      out.push({ name: 'scene→canvas', width: pw, height: ph, bytesPerPixel: 8 });
      if (this.phoneHigh && this.emissive) out.push(...this.emissive.passes, { name: 'bloom:add→canvas', width: pw, height: ph, bytesPerPixel: 4 });
      return out;
    }
    const rt = this.composer.renderTarget1;
    out.push({ name: 'scene:hdr', width: rt.width, height: rt.height, bytesPerPixel: 12 });
    if (this.ao.enabled) {
      const hw = Math.max(1, Math.floor(rt.width / 2));
      const hh = Math.max(1, Math.floor(rt.height / 2));
      out.push({ name: 'ao', width: hw, height: hh, bytesPerPixel: 4 }, { name: 'ao:blur', width: hw, height: hh, bytesPerPixel: 4 });
    }
    if (this.bloom.enabled) {
      const b = this.bloom;
      out.push({ name: 'bloom:bright', width: b.renderTargetBright.width, height: b.renderTargetBright.height, bytesPerPixel: 8 });
      for (let i = 0; i < b.nMips; i++) {
        const h = b.renderTargetsHorizontal[i]!;
        out.push({ name: `bloom:h${i}`, width: h.width, height: h.height, bytesPerPixel: 8 }, { name: `bloom:v${i}`, width: h.width, height: h.height, bytesPerPixel: 8 });
      }
      out.push({ name: 'bloom:composite', width: b.renderTargetsHorizontal[0]!.width, height: b.renderTargetsHorizontal[0]!.height, bytesPerPixel: 8 });
    }
    out.push({ name: 'composite→canvas', width: pw, height: ph, bytesPerPixel: 4 });
    return out;
  }

  applyBiome(b: Biome): void {
    const u = this.composite.uniforms;
    u.uExposure!.value = b.exposure;
    (u.uLift!.value as THREE.Vector3).set(b.gradeLift[0], b.gradeLift[1], b.gradeLift[2]);
    (u.uGain!.value as THREE.Vector3).set(b.gradeGain[0], b.gradeGain[1], b.gradeGain[2]);
    u.uSaturation!.value = b.saturation;
    u.uContrast!.value = b.contrast ?? 1.0;
    u.uVignette!.value = b.vignette;
    this.bloom.strength = b.bloomStrength;
    if (this.emissive) {
      this.emissive.strength = b.bloomStrength;
      this.emissive.exposure = b.exposure;
    }
    (u.uHaze!.value as THREE.Vector3).set(b.heatHaze ?? 0, b.heatHazeV ?? 0.45, 0);
    // Same grade for the direct-to-canvas tier (deltas from neutral, see `gradeUniforms`).
    this.renderer.toneMappingExposure = b.exposure;
    (gradeUniforms.uGradeA.value as THREE.Vector4).set(b.gradeLift[0], b.gradeLift[1], b.gradeLift[2], b.saturation - 1);
    (gradeUniforms.uGradeB.value as THREE.Vector4).set(b.gradeGain[0] - 1, b.gradeGain[1] - 1, b.gradeGain[2] - 1, (b.contrast ?? 1.0) - 1);
    (gradeUniforms.uGradeC.value as THREE.Vector4).x = b.vignette;
  }

  /** Simulated time for the shimmer clock (never the wall clock). */
  setTime(tSim: number): void {
    (this.composite.uniforms.uHaze!.value as THREE.Vector3).z = tSim;
  }

  /** Per-frame dynamics. `smearPx` is the background smear length in pixels along (dx, dy). */
  setDynamics(speed: number, bikeU: number, bikeV: number, smearPx: number, dirX: number, dirY: number, flash: number): void {
    const u = this.composite.uniforms;
    // Round 14: every per-frame uniform is finite and in range before it reaches a shader — a
    // NaN bike UV (the bike behind a replay camera) or a flash > 1 must never paint the frame.
    const fin = (v: number, lo: number, hi: number, d: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    u.uChroma!.value = 0.003 * fin((speed - 8) / 8, 0, 1, 0); // round 14: halved
    (u.uBikeUV!.value as THREE.Vector2).set(fin(bikeU, -2, 3, 0.5), fin(1 - bikeV, -2, 3, 0.5));
    const px = this.tier === 'low' ? 0 : fin(smearPx, 0, 64, 0);
    (u.uSmear!.value as THREE.Vector2).set(fin((px * dirX) / this.width, -0.1, 0.1, 0), fin((px * dirY) / this.height, -0.1, 0.1, 0));
    const fl = fin(flash, 0, 1, 0);
    u.uFlash!.value = fl;
    (gradeUniforms.uGradeC.value as THREE.Vector4).w = fl;
  }

  render(): void {
    if (this.bypass) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      if (this.phoneHigh && this.emissive) this.emissive.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }

  /**
   * Warm-up (round 9 `prepare`): the scene pass alone into the composer's HDR target — the
   * same programs the real frame uses (a draw to the canvas would compile a second, sRGB-output
   * variant of every material: +19 programs for nothing).
   */
  /** The target the real frame's scene pass draws into (bind it while pre-compiling so the programs match): the HDR target, or the canvas on the bypass tier. */
  get sceneTarget(): THREE.WebGLRenderTarget | null {
    return this.bypass ? null : this.composer.renderTarget1;
  }

  renderSceneOnly(): void {
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  get info(): { passes: number } {
    return { passes: this.bypass ? (this.phoneHigh ? 5 : 1) : this.composer.passes.filter((p) => p.enabled).length };
  }

  dispose(): void {
    this.composer.dispose();
    this.target.dispose();
    this.ao.dispose();
    this.bloom.dispose();
    this.emissive?.dispose();
    this.renderer.setRenderTarget(null);
  }
}
