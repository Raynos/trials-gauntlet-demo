/**
 * Post chain: RenderPass (HalfFloat) → UnrealBloom (HDR threshold, point
 * sources only) → Composite (speed smear masked around the bike, ACES, per-
 * biome grade, saturation, vignette, chromatic aberration, flash, dither,
 * sRGB). Quality tiers scale resolution and switch bloom.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { QualityTier } from '../../core/types';
import type { Biome } from '../biomes';

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
    uniform vec3 uHaze;
    varying vec2 vUv;

    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    vec3 sampleScene(vec2 uv) {
      // Directional smear (background), masked out around the bike so it stays sharp.
      vec2 d = (uv - uBikeUV) * vec2(uAspect, 1.0);
      float mask = smoothstep(0.12, 0.34, length(d));
      vec2 s = uSmear * mask;
      if (dot(s, s) < 1e-12) return texture2D(tDiffuse, uv).rgb;
      vec3 acc = vec3(0.0);
      acc += texture2D(tDiffuse, uv - s * 1.0).rgb * 0.1;
      acc += texture2D(tDiffuse, uv - s * 0.5).rgb * 0.2;
      acc += texture2D(tDiffuse, uv).rgb * 0.4;
      acc += texture2D(tDiffuse, uv + s * 0.5).rgb * 0.2;
      acc += texture2D(tDiffuse, uv + s * 1.0).rgb * 0.1;
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
        vec2 off = c * uChroma * r2 * 4.0;
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
      // Flash (finish / impact).
      col = mix(col, vec3(1.0), uFlash);
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

export class PostChain {
  private composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private readonly ao: AOPass;
  readonly composite: ShaderPass;
  private tier: QualityTier = 'high';
  private width = 1280;
  private height = 720;
  private pixelRatio = 1;
  private target: THREE.WebGLRenderTarget;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    // On `high` the scene target carries a depth texture so the AO pass needs no second
    // geometry pass (attached in setQuality: a depth-texture attachment costs ≈80 % more
    // frame time on SwiftShader, so the other tiers keep a plain renderbuffer).
    this.target = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, this.target);
    this.renderPass = new RenderPass(scene, camera);
    this.ao = new AOPass(camera as THREE.PerspectiveCamera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.5, 0.3, 1.6);
    this.composite = new ShaderPass(COMPOSITE);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ao);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.composite);
    this.composite.uniforms.tAO!.value = this.ao.texture;
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
    this.ao.setCamera(camera as THREE.PerspectiveCamera);
  }

  setQuality(tier: QualityTier): void {
    this.tier = tier;
    this.bloom.enabled = tier !== 'low';
    const high = tier === 'high';
    this.ao.enabled = high;
    this.composite.uniforms.uAO!.value = high ? 1.0 : 0.0;
    // Attach / detach the depth texture on both composer buffers; dispose so three re-allocates them.
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (high === (rt.depthTexture !== null)) continue;
      rt.depthTexture = high ? new THREE.DepthTexture(rt.width, rt.height, THREE.UnsignedIntType) : (null as unknown as THREE.DepthTexture);
      rt.dispose();
    }
    this.bloom.resolution.set(tier === 'high' ? 640 : 480, tier === 'high' ? 360 : 270);
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    // low renders the scene at 0.75x and lets the composite upscale — the phone lever.
    const cap = this.tier === 'low' ? 0.75 : this.tier === 'medium' ? 1.5 : 2;
    const pr = Math.min(pixelRatio, cap);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);
    this.ao.setSize(Math.floor(width * pr), Math.floor(height * pr));
    this.composite.uniforms.uAspect!.value = width / height;
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
    (u.uHaze!.value as THREE.Vector3).set(b.heatHaze ?? 0, b.heatHazeV ?? 0.45, 0);
  }

  /** Simulated time for the shimmer clock (never the wall clock). */
  setTime(tSim: number): void {
    (this.composite.uniforms.uHaze!.value as THREE.Vector3).z = tSim;
  }

  /** Per-frame dynamics. `smearPx` is the background smear length in pixels along (dx, dy). */
  setDynamics(speed: number, bikeU: number, bikeV: number, smearPx: number, dirX: number, dirY: number, flash: number): void {
    const u = this.composite.uniforms;
    u.uChroma!.value = 0.006 * Math.min(1, Math.max(0, (speed - 8) / 8));
    (u.uBikeUV!.value as THREE.Vector2).set(bikeU, 1 - bikeV);
    const px = this.tier === 'low' ? 0 : smearPx;
    (u.uSmear!.value as THREE.Vector2).set((px * dirX) / this.width, (px * dirY) / this.height);
    u.uFlash!.value = flash;
  }

  render(): void {
    this.composer.render();
  }

  get info(): { passes: number } {
    return { passes: this.composer.passes.filter((p) => p.enabled).length };
  }

  dispose(): void {
    this.composer.dispose();
    this.target.dispose();
    this.ao.dispose();
    this.bloom.dispose();
    this.renderer.setRenderTarget(null);
  }
}
