import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { PostChain, tierPixelRatio } from './chain';

// SMAA embeds two lookup images; geometry/lifetime tests never upload them to a GPU.
function fixture() {
  vi.stubGlobal('Image', class { src = ''; onload: (() => void) | null = null; });
  const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(640, 360), setRenderTarget: vi.fn() };
  const chain = new PostChain(renderer as unknown as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera());
  chain.setSize(800, 400, 1.5);
  return { chain, renderer };
}
afterEach(() => vi.unstubAllGlobals());

it('keeps HDR and final AA through desktop, phone and low transitions without retaining disabled large targets', () => {
  const { chain } = fixture();
  for (const [tier, phone] of [['high', false], ['high', true], ['low', false], ['medium', false], ['high', false]] as const) {
    chain.setQuality(tier, phone);
    expect(chain.bypass).toBe(false);
    expect(chain.sceneTarget?.texture.type).toBe(THREE.HalfFloatType);
    expect(chain.sceneTarget?.width).toBe(1200);
    expect(chain.sceneTarget?.height).toBe(600);
    const internal = chain as unknown as {
      bloom: { renderTargetBright: THREE.WebGLRenderTarget };
      aa: { _edgesRT: THREE.WebGLRenderTarget; _weightsRT: THREE.WebGLRenderTarget; _materialEdges: THREE.ShaderMaterial; _materialWeights: THREE.ShaderMaterial };
    };
    expect(internal.aa._edgesRT.width).toBe(1200);
    expect(internal.aa._weightsRT.height).toBe(600);
    const lowAA = tier !== 'high' || phone;
    expect(internal.aa._materialEdges.defines.SMAA_THRESHOLD).toBe(lowAA ? '0.15' : '0.1');
    expect(internal.aa._materialWeights.defines.SMAA_MAX_SEARCH_STEPS).toBe(lowAA ? '4' : '8');
    if (tier === 'low' || phone) expect(internal.bloom.renderTargetBright.width).toBeLessThanOrEqual(2);
    const writes = chain.passWrites();
    expect(writes.map(p => p.name).slice(-3)).toEqual(['smaa:edges', 'smaa:weights', 'smaa→canvas']);
    expect(writes.some(p => p.name === 'ao')).toBe(tier === 'high' && !phone);
    expect(writes.some(p => p.name === 'bloom:src')).toBe(phone);
    expect(writes.some(p => p.name === 'bloom:bright')).toBe(tier !== 'low' && !phone);
    expect(chain.sceneTarget?.depthTexture !== null).toBe(tier === 'high' && !phone);
  }
  chain.dispose();
});

it('disposes every owned pass including SMAA and lazy phone bloom', () => {
  const { chain, renderer } = fixture();
  chain.setQuality('high', true);
  const fields = chain as unknown as Record<string, { dispose(): void }>;
  const spies = ['composer', 'ao', 'bloom', 'composite', 'aa', 'emissive'].map(name => vi.spyOn(fields[name]!, 'dispose'));
  chain.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(renderer.setRenderTarget).toHaveBeenCalledWith(null);
});

it('uses mobile 1.5 DPR without exceeding the low-tier width budget or device resolution', () => {
  expect(tierPixelRatio('low', 3, 874)).toBe(1.5);
  expect(tierPixelRatio('low', 3, 2000)).toBe(0.8);
  expect(tierPixelRatio('medium', 3, 874)).toBe(1.5);
  expect(tierPixelRatio('high', 3, 874, true)).toBe(1.5);
  expect(tierPixelRatio('high', 3, 1280)).toBe(2);
  expect(tierPixelRatio('medium', 1, 874)).toBe(1);
});

// HDR adoption must not add racing distortion to tiers that previously only graded the scene.
it('keeps low and phone-high edges free of chromatic and motion smear', () => {
  const { chain } = fixture();
  for (const [tier, phone] of [['low', false], ['high', true], ['high', false]] as const) {
    chain.setQuality(tier, phone);
    chain.setDynamics(30, .4, .5, 32, 1, 0, 0);
    const clean = tier === 'low' || phone;
    expect(chain.composite.uniforms.uChroma!.value === 0).toBe(clean);
    expect((chain.composite.uniforms.uSmear!.value as THREE.Vector2).length() === 0).toBe(clean);
  }
  chain.dispose();
});
