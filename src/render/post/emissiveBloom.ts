/**
 * Emissive-only bloom for the phone-high tier (docs/plans/PERF.md §3.1, cut #3).
 *
 * Desktop `high` blooms from a full-frame HalfFloat scene through a bright pass and five mips
 * (13 passes, 0.7 Mpx on the phone geometry). On a phone the scene is drawn LDR straight to the
 * canvas, so the bloom sources are drawn again — only the objects on `BLOOM_LAYER` (materials with
 * `emissiveIntensity ≥ BLOOM_EMISSIVE`, the spark / flame particles; `tagBloomers`) — into a
 * HalfFloat target at 1/8 of the canvas (≈ 160×60 px), thresholded exactly like the bright pass,
 * blurred once in each axis, and added back over the canvas by one full-screen quad. Four small
 * writes plus one trivial additive pass; no HDR scene target, no composite.
 *
 * Known approximation: the sources are not depth-tested against the rest of the world (a lamp
 * behind a container blooms through its edge, softly — 1/8-res blur). Judged by the clip.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const BLOOM_LAYER = 3;
/** Emissive intensity above which a material's mesh is a bloom source (bulbs 7, melt 4–5, gate lamps 4 lit, neon 2.4; the roof's 0.9 emissive map is not). */
export const BLOOM_EMISSIVE = 1.5;

/** Enable `BLOOM_LAYER` on every bloom source under `root` (idempotent). Returns the count. */
export function tagBloomers(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    let bloom = false;
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.emissiveIntensity >= BLOOM_EMISSIVE) bloom = true;
      // Additive point sprites (sparks, flame, embers) bloom; dust / smoke (normal blending) do not.
      if ((o as THREE.Points).isPoints && m.blending === THREE.AdditiveBlending) bloom = true;
    }
    if (bloom) {
      o.layers.enable(BLOOM_LAYER);
      n++;
    }
  });
  return n;
}

const BLUR = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uDir: { value: new THREE.Vector2(1, 0) }, uThreshold: { value: 1.6 }, uFirst: { value: 1.0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uThreshold; uniform float uFirst;
    varying vec2 vUv;
    vec3 tap(vec2 uv) {
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (uFirst > 0.5) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c *= max(0.0, l - uThreshold) / max(l, 1e-4); }
      return c;
    }
    void main() {
      vec3 s = tap(vUv) * 0.227;
      s += (tap(vUv + uDir) + tap(vUv - uDir)) * 0.316;
      s += (tap(vUv + 2.0 * uDir) + tap(vUv - 2.0 * uDir)) * 0.07;
      gl_FragColor = vec4(s, 1.0);
    }`,
};

const ADD = {
  uniforms: { tBloom: { value: null as THREE.Texture | null }, uStrength: { value: 0.6 }, uExposure: { value: 1.0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tBloom; uniform float uStrength; uniform float uExposure;
    varying vec2 vUv;
    // The canvas already holds tone-mapped sRGB; the bloom is linear HDR — tone-map + encode it the same way before the add.
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main() {
      vec3 b = texture2D(tBloom, vUv).rgb * uStrength * uExposure;
      vec3 c = aces(b);
      gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
    }`,
};

export class EmissiveBloom {
  private readonly src: THREE.WebGLRenderTarget;
  private readonly ping: THREE.WebGLRenderTarget;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly addMat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly clear = new THREE.Color(0, 0, 0);
  private readonly savedLayers = new THREE.Layers();
  private readonly savedClear = new THREE.Color();
  private savedAlpha = 1;
  private w = 160;
  private h = 60;
  strength = 0.6;
  threshold = 1.6;
  exposure = 1.0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
    this.src = new THREE.WebGLRenderTarget(this.w, this.h, { ...opts, depthBuffer: true });
    this.ping = new THREE.WebGLRenderTarget(this.w, this.h, opts);
    this.blurMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(BLUR.uniforms), vertexShader: BLUR.vertexShader, fragmentShader: BLUR.fragmentShader, depthTest: false, depthWrite: false });
    this.addMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(ADD.uniforms), vertexShader: ADD.vertexShader, fragmentShader: ADD.fragmentShader, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    this.quad = new FullScreenQuad(this.blurMat);
  }

  /** Canvas drawing-buffer size; the bloom runs at 1/8. */
  setSize(pw: number, ph: number): void {
    this.w = Math.max(8, Math.floor(pw / 8));
    this.h = Math.max(8, Math.floor(ph / 8));
    this.src.setSize(this.w, this.h);
    this.ping.setSize(this.w, this.h);
  }

  get passes(): { name: string; width: number; height: number; bytesPerPixel: number }[] {
    return [
      { name: 'bloom:src', width: this.w, height: this.h, bytesPerPixel: 12 },
      { name: 'bloom:h', width: this.w, height: this.h, bytesPerPixel: 8 },
      { name: 'bloom:v', width: this.w, height: this.h, bytesPerPixel: 8 },
    ];
  }

  /** After the scene has been drawn to the canvas: sources → threshold + blur → additive quad over the canvas. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    // 1. Sources only, HDR, no tone mapping (an off-screen target), into the 1/8 buffer.
    this.savedLayers.mask = camera.layers.mask;
    camera.layers.set(BLOOM_LAYER);
    const bg = scene.background;
    scene.background = this.clear;
    r.getClearColor(this.savedClear);
    this.savedAlpha = r.getClearAlpha();
    r.setRenderTarget(this.src);
    r.setClearColor(this.clear, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    r.setClearColor(this.savedClear, this.savedAlpha);
    scene.background = bg;
    camera.layers.mask = this.savedLayers.mask;
    // 2. Threshold + horizontal blur, then vertical. `renderer.render` clears its target when `autoClear`
    //    is on — the quads must not (the last one draws over the finished canvas).
    const autoClear = r.autoClear;
    r.autoClear = false;
    const u = this.blurMat.uniforms;
    u.uThreshold!.value = this.threshold;
    this.quad.material = this.blurMat;
    u.tDiffuse!.value = this.src.texture;
    (u.uDir!.value as THREE.Vector2).set(1 / this.w, 0);
    u.uFirst!.value = 1.0;
    r.setRenderTarget(this.ping);
    this.quad.render(r);
    u.tDiffuse!.value = this.ping.texture;
    (u.uDir!.value as THREE.Vector2).set(0, 1 / this.h);
    u.uFirst!.value = 0.0;
    r.setRenderTarget(this.src);
    this.quad.render(r);
    // 3. Add over the canvas.
    const a = this.addMat.uniforms;
    a.tBloom!.value = this.src.texture;
    a.uStrength!.value = this.strength;
    a.uExposure!.value = this.exposure;
    this.quad.material = this.addMat;
    r.setRenderTarget(null);
    this.quad.render(r);
    r.autoClear = autoClear;
  }

  dispose(): void {
    this.src.dispose();
    this.ping.dispose();
    this.blurMat.dispose();
    this.addMat.dispose();
    this.quad.dispose();
  }
}
