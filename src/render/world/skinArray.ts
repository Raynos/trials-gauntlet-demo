/**
 * Perf cut #4b (docs/plans/PERF.md §3.2 #4, ledger row 6): N same-size skins → ONE texture, so the
 * batches that only differed by their skin share one material and `buildBatches` bakes them into one
 * draw per chunk (the hall's eight container skins were 8 materials → 8 InstancedMesh draws per chunk).
 *
 * A `DataArrayTexture` (WebGL2 `sampler2DArray`), not a flat atlas: `containerGeometry` repeats its
 * u across [0, 2] (RepeatWrapping), so a flat 2048² atlas would need `fract()` in the fragment shader
 * plus tile padding, and would bleed the neighbour tile through the bilinear filter at every wrap seam.
 * An array keeps hardware repeat and per-layer mips — the sample the fragment takes is the one the
 * separate texture gave it. Same bytes as the separate skins (8 × 1024 × 512 × 4 × 1.33).
 *
 * Per-vertex `aSkin` (a constant per skin clone of the geometry, `withSkinIndex`) picks the layer:
 * it survives `buildBatches`' bake (matrices into positions, colours into vertex colours, `aSkin`
 * along for the ride) and the un-merged instanced path alike — no `InstancedBufferAttribute` needed.
 *
 * The material's shadow-pass twin needs the same care: three copies `material.map` onto the depth
 * material every shadow draw, which would bind the array through a `sampler2D` (GL error, caster
 * gone). `materialKinds.stabilizePrograms` asks `depthPatchFor()` and strips the map from the depth
 * program instead — the containers have no alphaTest, so the depth pass never needed the sample.
 */
import * as THREE from 'three';

const depthPatches = new WeakMap<THREE.Material, (depth: THREE.Material) => void>();

/** The depth-material patch registered for a material (`stabilizePrograms` applies it to the caster's `customDepthMaterial`). */
export function depthPatchFor(m: THREE.Material): ((depth: THREE.Material) => void) | undefined {
  return depthPatches.get(m);
}

/** A per-kind clone of an array-textured material (`materialKinds.cloneForKind`) keeps the depth patch. */
export function inheritDepthPatch(src: THREE.Material, clone: THREE.Material): void {
  const p = depthPatches.get(src);
  if (p) depthPatches.set(clone, p);
}

/**
 * One `DataArrayTexture` from same-size opaque canvases (layer i = canvases[i]). Rows are copied
 * bottom-up so `flipY = false` lands the canvas's top at v = 1 like a `CanvasTexture` does.
 * Filtering / wrap / colour space / anisotropy follow `like` (a `canvasTex.tex()` texture).
 */
export function skinArrayTexture(canvases: HTMLCanvasElement[], like: THREE.Texture): THREE.DataArrayTexture {
  const w = canvases[0]!.width;
  const h = canvases[0]!.height;
  const depth = canvases.length;
  const data = new Uint8Array(w * h * 4 * depth);
  const row = w * 4;
  for (let i = 0; i < depth; i++) {
    const c = canvases[i]!;
    if (c.width !== w || c.height !== h) throw new Error(`skinArrayTexture: layer ${i} is ${c.width}x${c.height}, expected ${w}x${h}`);
    const px = c.getContext('2d')!.getImageData(0, 0, w, h).data;
    const base = i * w * h * 4;
    for (let y = 0; y < h; y++) data.set(px.subarray(y * row, (y + 1) * row), base + (h - 1 - y) * row);
  }
  const t = new THREE.DataArrayTexture(data, w, h, depth);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = like.colorSpace;
  t.wrapS = like.wrapS;
  t.wrapT = like.wrapT;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = like.anisotropy;
  t.flipY = false;
  t.unpackAlignment = 4;
  t.needsUpdate = true;
  return t;
}

/** A clone of `g` carrying `aSkin = i` on every vertex (the layer the fragment samples). */
export function withSkinIndex(g: THREE.BufferGeometry, i: number): THREE.BufferGeometry {
  const c = g.clone();
  const n = c.getAttribute('position').count;
  c.setAttribute('aSkin', new THREE.BufferAttribute(new Float32Array(n).fill(i), 1));
  return c;
}

/**
 * Make `m` sample its `map` as a `sampler2DArray` at layer `aSkin`. Chains after the material's
 * existing compile hook (the fog / grade uniforms) and gives the material its own program key —
 * one program for every skin, as before, just a different one.
 */
export function applySkinArray(m: THREE.MeshStandardMaterial, array: THREE.DataArrayTexture): THREE.MeshStandardMaterial {
  m.map = array;
  m.needsUpdate = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSkin;\nvarying float vSkin;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSkin = aSkin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#ifdef USE_MAP\nuniform highp sampler2DArray map;\nvarying float vSkin;\n#endif')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\nvec4 sampledDiffuseColor = texture( map, vec3( vMapUv, vSkin ) );\ndiffuseColor *= sampledDiffuseColor;\n#endif');
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `skinArray|${prevKey.call(m)}`;
  // Shadow pass: no map sample at all (three would otherwise bind the array through `sampler2D map`).
  depthPatches.set(m, (depth) => {
    const prevDepth = depth.onBeforeCompile;
    depth.onBeforeCompile = (shader, renderer) => {
      prevDepth?.call(depth, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', '').replace('#include <map_fragment>', '');
    };
    const prevDepthKey = depth.customProgramCacheKey;
    depth.customProgramCacheKey = () => `skinArrayDepth|${prevDepthKey.call(depth)}`;
  });
  return m;
}

/**
 * The `low` texture budget (`hero/gltf.ts shrinkTextures`) for an array: every layer downsampled
 * through a canvas exactly like a skin canvas is (same filter, same bytes in), as a NEW texture —
 * three's immutable `texStorage3D` allocation cannot change size in place. Null when already ≤ max.
 */
export function shrinkSkinArray(t: THREE.DataArrayTexture, max: number): THREE.DataArrayTexture | null {
  const { width: w, height: h, depth } = t.image;
  if (!w || !h || Math.max(w, h) <= max) return null;
  const k = max / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * k));
  const nh = Math.max(1, Math.round(h * k));
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const dst = document.createElement('canvas');
  dst.width = nw;
  dst.height = nh;
  const sg = src.getContext('2d');
  const dg = dst.getContext('2d');
  if (!sg || !dg) return null;
  dg.imageSmoothingEnabled = true;
  dg.imageSmoothingQuality = 'high';
  const data = t.image.data as Uint8Array;
  const out = new Uint8Array(nw * nh * 4 * depth);
  for (let i = 0; i < depth; i++) {
    const layer = new Uint8ClampedArray(w * h * 4);
    layer.set(data.subarray(i * w * h * 4, (i + 1) * w * h * 4));
    sg.putImageData(new ImageData(layer, w, h), 0, 0);
    dg.clearRect(0, 0, nw, nh);
    dg.drawImage(src, 0, 0, nw, nh);
    out.set(dg.getImageData(0, 0, nw, nh).data, i * nw * nh * 4);
  }
  const s = new THREE.DataArrayTexture(out, nw, nh, depth);
  s.format = t.format;
  s.type = t.type;
  s.colorSpace = t.colorSpace;
  s.wrapS = t.wrapS;
  s.wrapT = t.wrapT;
  s.magFilter = t.magFilter;
  s.minFilter = t.minFilter;
  s.generateMipmaps = t.generateMipmaps;
  s.anisotropy = t.anisotropy;
  s.flipY = t.flipY;
  s.unpackAlignment = t.unpackAlignment;
  s.needsUpdate = true;
  return s;
}

/**
 * `applyQuality('low')`'s texture budget for the world's array textures (the canvas skins go through
 * `hero/gltf.ts shrinkTextures`, which skips data textures): every material under `root` holding an
 * array wider than `max` gets the shrunk copy; materials that shared the old texture share the new one.
 */
export function shrinkSkinArrays(root: THREE.Object3D, max: number): number {
  const shrunk = new Map<THREE.Texture, THREE.DataArrayTexture | null>();
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      const t = std.map as THREE.DataArrayTexture | null;
      if (!t || !t.isDataArrayTexture) continue;
      let s = shrunk.get(t);
      if (s === undefined) shrunk.set(t, (s = shrinkSkinArray(t, max)));
      if (!s) continue;
      std.map = s;
      n++;
    }
  });
  for (const [old, s] of shrunk) if (s) old.dispose();
  return n;
}
