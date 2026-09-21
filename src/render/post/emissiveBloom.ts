/** Small emissive-only bloom for phone-high: sources at 1/8 resolution, threshold,
 * horizontal and vertical blur. The HDR composite adds this texture before grading.
 * Sources are not occluded by non-bloom geometry; this approximation needs clip review.
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

export class EmissiveBloom {
  private readonly src: THREE.WebGLRenderTarget;
  private readonly ping: THREE.WebGLRenderTarget;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly clear = new THREE.Color(0, 0, 0);
  private readonly savedLayers = new THREE.Layers();
  private readonly savedClear = new THREE.Color();
  private savedAlpha = 1;
  private w = 160;
  private h = 60;
  threshold = 1.6;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
    this.src = new THREE.WebGLRenderTarget(this.w, this.h, { ...opts, depthBuffer: true });
    this.ping = new THREE.WebGLRenderTarget(this.w, this.h, opts);
    this.blurMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(BLUR.uniforms), vertexShader: BLUR.vertexShader, fragmentShader: BLUR.fragmentShader, depthTest: false, depthWrite: false });

    this.quad = new FullScreenQuad(this.blurMat);
  }

  get texture(): THREE.Texture { return this.src.texture; }

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

  /** Sources → threshold + blur; the HDR composite consumes the linear texture before tone mapping. */
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
    //    is on; every blur quad fully overwrites its small target.
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
    r.setRenderTarget(null);
    r.autoClear = autoClear;
  }

  dispose(): void {
    this.src.dispose();
    this.ping.dispose();
    this.blurMat.dispose();
    this.quad.dispose();
  }
}
