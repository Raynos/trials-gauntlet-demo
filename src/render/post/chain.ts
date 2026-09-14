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
import type { QualityTier } from '../../core/types';
import type { Biome } from '../biomes';

const COMPOSITE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1.0 },
    uVignette: { value: 0.35 },
    uChroma: { value: 0.0 },
    uSmear: { value: new THREE.Vector2(0, 0) },
    uBikeUV: { value: new THREE.Vector2(0.3, 0.55) },
    uFlash: { value: 0.0 },
    uAspect: { value: 16 / 9 },
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
    uniform float uVignette;
    uniform float uChroma;
    uniform vec2 uSmear;
    uniform vec2 uBikeUV;
    uniform float uFlash;
    uniform float uAspect;
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
      col *= uExposure;
      col = aces(col);
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

export class PostChain {
  private composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private bloom: UnrealBloomPass;
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
    this.target = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, this.target);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.5, 0.3, 1.25);
    this.composite = new ShaderPass(COMPOSITE);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.composite);
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
  }

  setQuality(tier: QualityTier): void {
    this.tier = tier;
    this.bloom.enabled = tier !== 'low';
    this.bloom.resolution.set(tier === 'high' ? 640 : 480, tier === 'high' ? 360 : 270);
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    const cap = this.tier === 'low' ? 1 : this.tier === 'medium' ? 1.5 : 2;
    const pr = Math.min(pixelRatio, cap);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);
    this.composite.uniforms.uAspect!.value = width / height;
  }

  applyBiome(b: Biome): void {
    const u = this.composite.uniforms;
    u.uExposure!.value = b.exposure;
    (u.uLift!.value as THREE.Vector3).set(b.gradeLift[0], b.gradeLift[1], b.gradeLift[2]);
    (u.uGain!.value as THREE.Vector3).set(b.gradeGain[0], b.gradeGain[1], b.gradeGain[2]);
    u.uSaturation!.value = b.saturation;
    u.uVignette!.value = b.vignette;
    this.bloom.strength = b.bloomStrength;
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
    this.bloom.dispose();
    this.renderer.setRenderTarget(null);
  }
}
