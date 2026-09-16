/**
 * In-page instrumentation for the bench (`window.__bench`), installed as a plain script so the
 * tsx `__name` helper never leaks into `page.evaluate`.
 *
 * It wraps, once, the ThreeRenderer's private collaborators on the harness debug handle
 * `window.__render` (`frames.build`, `rig.update`, `bike.update` + `rider.update`,
 * `renderer.render`, `renderer.renderBufferDirect`, `renderer.shadowMap.render`) with timers.
 * Nothing in the render path changes: the wrappers call through and add `performance.now()`
 * deltas to a scratch struct. The per-frame records live in preallocated Float64Arrays, so the
 * measurement itself allocates nothing per frame (the heap delta is the game's, not ours).
 *
 * Split of one `render()` (ThreeRenderer.render, `src/render/index.ts`):
 *   build    FrameBuilder.build (state interpolation, per-frame derived fields)
 *   rig      CameraRig.update
 *   hero     bike.update + rider.update (pose, skinning matrices)
 *   shadow   WebGLShadowMap.render — CPU side of the shadow pass (its own traversal + caster draws)
 *   draws    renderBufferDirect outside the shadow pass (material/uniform setup + the GL draw call)
 *   traverse the scene pass' renderer.render minus shadow minus draws: projectObject, frustum
 *            cull, sort, light setup, program lookups
 *   post     every renderer.render call after the first one in a frame (composer quads)
 *   other    render − (build + rig + hero + scenePass + post): world updates, particles, uniforms
 *   game     the hook's render(false) total minus render(): Game.render (HUD DOM, audio, getState)
 */

export const FRAME_FIELDS = ['total', 'render', 'build', 'rig', 'hero', 'shadow', 'draws', 'traverse', 'post', 'other', 'game', 'physics', 'calls', 'tris', 'drawCount'] as const;
export type FrameField = (typeof FRAME_FIELDS)[number];

export interface CpuPassResult {
  frames: number;
  /** Flattened per-frame records: `frames × FRAME_FIELDS.length`, row-major. */
  data: number[];
  /** Frames whose `total` exceeded `blockedMs` (the GL command ring was full — SwiftShader back-pressure, not JS cost). */
  blocked: number;
  /** debugInfo samples (every `sampleEvery` frames): the fields the tables use. */
  samples: DebugSample[];
  programs: number;
  texturesMB: number;
  finalHash: string;
  finalTick: number;
}

export interface DebugSample {
  frame: number;
  calls: number;
  tris: number;
  rtMpx: number;
  rtMB: number;
  heroTris: number;
  shadowMap: number;
  passes: number;
  stalePrograms: number;
  canvasW: number;
  canvasH: number;
  dpr: number;
}

export interface GpuSample {
  tick: number;
  /** render() + finish (1×1 readPixels after the frame), queue drained before. */
  syncedMs: number;
  /** The CPU part of that (hook render total). */
  submitMs: number;
  /** = syncedMs − submitMs: what SwiftShader spent rasterising this one frame. */
  rasterMs: number;
  calls: number;
  tris: number;
}

export interface GpuPassResult {
  samples: GpuSample[];
  rtPasses: string;
  rtMpx: number;
  rtMB: number;
  passes: { name: string; width: number; height: number; bytesPerPixel: number }[];
  canvasW: number;
  canvasH: number;
  dpr: number;
  shadowMap: number;
  heroTris: number;
  heroDoc: string;
  programs: number;
  texturesMB: number;
  tier: string;
}

declare global {
  interface Window {
    __bench?: {
      install(): void;
      setTier(tier: string, w: number, h: number, dpr: number, device?: 'phone' | 'desktop'): void;
      warm(frames: number): void;
      cpuPass(inputs: unknown[], ticksPerFrame: number, frames: number, drainEvery: number, sampleEvery: number, blockedMs: number): CpuPassResult;
      gpuPass(inputs: unknown[], ticksPerFrame: number, sampleFrames: number[]): GpuPassResult;
      counters(): { drawCount: number };
    };
  }
}

export const PAGE_BENCH_SRC = `window.__bench = (function () {
  var T = function () { return window.__trials; };
  var R = function () { return window.__render; };
  var acc = { build: 0, rig: 0, hero: 0, shadow: 0, draws: 0, scene: 0, post: 0, render: 0, renderCalls: 0, drawCount: 0, inShadow: 0 };
  var FIELDS = ${JSON.stringify(FRAME_FIELDS)};
  function reset() { acc.build = acc.rig = acc.hero = acc.shadow = acc.draws = acc.scene = acc.post = acc.render = 0; acc.renderCalls = 0; acc.drawCount = 0; acc.inShadow = 0; }
  function install() {
    var r = R();
    if (!r || r.__benchWrapped) return;
    var fb = r.frames.build.bind(r.frames);
    r.frames.build = function (s, a) { var t0 = performance.now(); var f = fb(s, a); acc.build += performance.now() - t0; return f; };
    var ru = r.rig.update.bind(r.rig);
    r.rig.update = function (f) { var t0 = performance.now(); ru(f); acc.rig += performance.now() - t0; };
    var wrapHero = function (obj) {
      if (!obj || !obj.update || obj.__benchWrapped) return;
      var u = obj.update.bind(obj);
      obj.update = function (f) { var t0 = performance.now(); u(f); acc.hero += performance.now() - t0; };
      obj.__benchWrapped = true;
    };
    // bike / rider are getters over bikeRef / riderRef (rebuilt on a LOD swap): wrap on every frame.
    var rr = r.render.bind(r);
    r.render = function (s, a) {
      wrapHero(r.bikeRef); wrapHero(r.riderRef);
      var t0 = performance.now(); var ms = rr(s, a); acc.render += performance.now() - t0; return ms;
    };
    var gl = r.renderer;
    var glr = gl.render.bind(gl);
    gl.render = function (s, c) {
      var t0 = performance.now(); glr(s, c); var d = performance.now() - t0;
      if (acc.renderCalls === 0) acc.scene += d; else acc.post += d;
      acc.renderCalls++;
    };
    var rbd = gl.renderBufferDirect.bind(gl);
    gl.renderBufferDirect = function (a, b, c, d, e, f) { var t0 = performance.now(); rbd(a, b, c, d, e, f); var dt = performance.now() - t0; if (!acc.inShadow) acc.draws += dt; acc.drawCount++; };
    var sm = gl.shadowMap;
    var smr = sm.render.bind(sm);
    sm.render = function (a, b, c) { acc.inShadow = 1; var t0 = performance.now(); smr(a, b, c); acc.shadow += performance.now() - t0; acc.inShadow = 0; };
    r.__benchWrapped = true;
  }
  function setTier(tier, w, h, dpr, device) {
    var t = T(); var r = R();
    if (device && typeof r.setDeviceClass === 'function') r.setDeviceClass(device);
    t.setQuality(tier);
    r.resize(w, h, dpr);
  }
  function feed(inputs, from, to) {
    var t = T();
    for (var j = from; j < to; j++) { t.setInput(inputs[j]); t.step(1); }
  }
  function warm(frames) {
    var t = T(); var r = R();
    for (var i = 0; i < frames; i++) { t.step(1); t.render(false); }
    r.finish();
  }
  function sample(frame) {
    var d = R().debugInfo();
    return { frame: frame, calls: d.calls, tris: d.tris, rtMpx: d.rtMpx, rtMB: d.rtMB, heroTris: d.heroTris, shadowMap: d.shadowMap, passes: d.passes, stalePrograms: d.stalePrograms, canvasW: d.canvasW, canvasH: d.canvasH, dpr: d.dpr };
  }
  function cpuPass(inputs, tpf, frames, drainEvery, sampleEvery, blockedMs) {
    var t = T(); var r = R();
    var n = FIELDS.length;
    var data = new Float64Array(frames * n);
    var samples = [];
    var blocked = 0;
    var info = r.renderer.info;
    for (var i = 0; i < frames; i++) {
      var p0 = performance.now();
      feed(inputs, i * tpf, Math.min(inputs.length, (i + 1) * tpf));
      var physics = performance.now() - p0;
      reset();
      var total = t.render(false);
      var o = i * n;
      var scenePass = acc.scene;
      var traverse = Math.max(0, scenePass - acc.shadow - acc.draws);
      var other = Math.max(0, acc.render - acc.build - acc.rig - acc.hero - scenePass - acc.post);
      data[o] = total; data[o + 1] = acc.render; data[o + 2] = acc.build; data[o + 3] = acc.rig; data[o + 4] = acc.hero;
      data[o + 5] = acc.shadow; data[o + 6] = acc.draws; data[o + 7] = traverse; data[o + 8] = acc.post; data[o + 9] = other;
      data[o + 10] = Math.max(0, total - acc.render); data[o + 11] = physics; data[o + 12] = info.render.calls; data[o + 13] = info.render.triangles; data[o + 14] = acc.drawCount;
      if (total > blockedMs) blocked++;
      if ((i + 1) % sampleEvery === 0) samples.push(sample(i));
      if ((i + 1) % drainEvery === 0) r.finish();
    }
    var st = t.stats();
    return { frames: frames, data: Array.prototype.slice.call(data), blocked: blocked, samples: samples, programs: st.programs, texturesMB: st.texturesMB, finalHash: t.hashState(), finalTick: t.frame() };
  }
  function gpuPass(inputs, tpf, sampleFrames) {
    // A skipped frame (perf cut #1) resets info to 0 — the first sample follows a fresh step, so it always draws.
    var t = T(); var r = R();
    var out = [];
    var info = r.renderer.info;
    var fed = 0;
    for (var k = 0; k < sampleFrames.length; k++) {
      var f = sampleFrames[k];
      var to = Math.min(inputs.length, (f + 1) * tpf);
      feed(inputs, fed, to); fed = to;
      r.finish();
      var t0 = performance.now();
      var submit = t.render(false);
      r.finish();
      var synced = performance.now() - t0;
      out.push({ tick: t.frame(), syncedMs: synced, submitMs: submit, rasterMs: Math.max(0, synced - submit), calls: info.render.calls, tris: info.render.triangles });
    }
    var d = r.debugInfo();
    var st = t.stats();
    var passes = r.postRef ? r.postRef.passWrites() : [];
    if (d.shadowMap) passes.unshift({ name: 'shadow', width: d.shadowMap, height: d.shadowMap, bytesPerPixel: 8 });
    return { samples: out, rtPasses: d.rtPasses, rtMpx: d.rtMpx, rtMB: d.rtMB, passes: passes, canvasW: d.canvasW, canvasH: d.canvasH, dpr: d.dpr, shadowMap: d.shadowMap, heroTris: d.heroTris, heroDoc: d.heroDoc, programs: st.programs, texturesMB: st.texturesMB, tier: d.tier };
  }
  function counters() { return { drawCount: acc.drawCount }; }
  return { install: install, setTier: setTier, warm: warm, cpuPass: cpuPass, gpuPass: gpuPass, counters: counters };
})();`;
