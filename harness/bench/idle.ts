/**
 * Idle-screen scenarios: the menu and the garage on the front page, in an emulated phone context
 * (932×430, coarse pointer, iPhone UA → `isPhone()`: 30 fps cap, `low` by default), at every tier.
 *
 * Why first: on 2026-09-14 the user's iPhone read 24–30 fps at the 30 cap with a 66 ms worst frame
 * in the GARAGE — a frame that moves nothing. That is the fixed per-frame cost every riding frame
 * pays before any action is drawn: scene traversal + draw submission over the whole world, the hero
 * shadow map redrawn each frame, Game.render (HUD DOM), the app shell's per-frame work.
 *
 * Two measurements per screen × tier:
 *   live   the app's own RAF loop for 2.5 s, every callback timed by a `requestAnimationFrame` shim
 *          installed before the page boots; rendered callbacks (renderer `frameCount` advanced) are
 *          the CPU cost of a real frame on this host. Short on purpose: SwiftShader's raster queue
 *          holds ~60 frames before it back-pressures the main thread.
 *   held   the RAF loop held (callbacks queued, released after), the frame decomposed by hand:
 *          `app.frame()` (input poll + flow), `render(false)` (Game.render: HUD + renderer, split by
 *          `page.ts`), `info().lastRender.hudMs`, six isolated synced frames (GPU proxy), heap delta
 *          over 200 frames with a forced GC either side, and a mesh census of the scene.
 */
import os from 'node:os';
import type { Browser, Page } from 'playwright';
import type { QualityTier } from '../../src/core/types';
import { percentile } from '../lib/report';
import { effectiveMpx, gpuWork, phoneEstimate } from './model';
import { PAGE_BENCH_SRC } from './page';
import type { LedgerRow } from './report';

const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const RAF_SHIM = `(() => {
  var orig = window.requestAnimationFrame.bind(window);
  var log = []; var held = [];
  window.__rafLog = log; window.__rafHold = false;
  window.__rafRelease = function () { window.__rafHold = false; var cbs = held.splice(0); for (var i = 0; i < cbs.length; i++) orig(cbs[i]); };
  window.requestAnimationFrame = function (cb) {
    return orig(function (t) {
      if (window.__rafHold) { held.push(cb); return; }
      var r = window.__render; var f0 = r ? r.frameCount : -1;
      var t0 = performance.now(); cb(t); var ms = performance.now() - t0;
      log.push({ ms: ms, rendered: r ? r.frameCount !== f0 : false, at: t });
      if (log.length > 4000) log.shift();
    });
  };
})();`;

declare global {
  interface Window {
    __rafLog?: { ms: number; rendered: boolean; at: number }[];
    __rafHold?: boolean;
    __rafRelease?: () => void;
  }
}

interface HeldResult {
  n: number;
  app: number[];
  total: number[];
  render: number[];
  hud: number[];
  split: Record<string, number[]>;
  synced: { submit: number; synced: number; raster: number; calls: number; tris: number }[];
  debug: { calls: number; tris: number; rtMpx: number; rtMB: number; rtPasses: string; shadowMap: number; heroTris: number; canvasW: number; canvasH: number; dpr: number; tier: string; passes: number };
  passes: { name: string; width: number; height: number; bytesPerPixel: number }[];
  programs: number;
  texturesMB: number;
  meshes: number;
  visibleMeshes: number;
  objects: number;
}

const HELD_SRC = `(function (n, w, h, dpr) {
  var t = window.__rockhop; var r = window.__render; var b = window.__bench;
  b.install();
  // CPU loop on a quarter canvas (submit cost is pixel-independent; SwiftShader's raster would otherwise pace it).
  r.resize(Math.round(w / 4), Math.round(h / 4), dpr);
  var FIELDS = ['build','rig','hero','shadow','draws','traverse','post','other'];
  var split = {}; FIELDS.forEach(function (f) { split[f] = []; });
  var app = [], total = [], render = [], hud = [];
  // warm
  for (var i = 0; i < 10; i++) { t.app.frame(); t.render(false); }
  r.finish();
  for (var i = 0; i < n; i++) {
    var a0 = performance.now(); t.app.frame(); app.push(performance.now() - a0);
    var rec = b.cpuPass([], 2, 1, 1e9, 1e9, 1e9);
    var d = rec.data;
    total.push(d[0]); render.push(d[1]);
    split.build.push(d[2]); split.rig.push(d[3]); split.hero.push(d[4]); split.shadow.push(d[5]); split.draws.push(d[6]); split.traverse.push(d[7]); split.post.push(d[8]); split.other.push(d[9]);
    hud.push(t.info().lastRender.hudMs);
    if (i % 30 === 29) r.finish();
  }
  r.resize(w, h, dpr);
  for (var i = 0; i < 3; i++) t.render(false);
  var synced = [];
  var info = r.renderer.info;
  for (var k = 0; k < 6; k++) {
    r.finish();
    var s0 = performance.now(); var sub = t.render(false); r.finish(); var sy = performance.now() - s0;
    synced.push({ submit: sub, synced: sy, raster: Math.max(0, sy - sub), calls: info.render.calls, tris: info.render.triangles });
  }
  var dbg = r.debugInfo();
  var st = t.stats();
  var passes = r.postRef ? r.postRef.passWrites() : [];
  if (dbg.shadowMap) passes.unshift({ name: 'shadow', width: dbg.shadowMap, height: dbg.shadowMap, bytesPerPixel: 8 });
  var meshes = 0, visible = 0, objects = 0;
  r.scene.traverse(function (o) { objects++; if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) { meshes++; if (o.visible) visible++; } });
  return { n: n, app: app, total: total, render: render, hud: hud, split: split, synced: synced,
    debug: { calls: dbg.calls, tris: dbg.tris, rtMpx: dbg.rtMpx, rtMB: dbg.rtMB, rtPasses: dbg.rtPasses, shadowMap: dbg.shadowMap, heroTris: dbg.heroTris, canvasW: dbg.canvasW, canvasH: dbg.canvasH, dpr: dbg.dpr, tier: dbg.tier, passes: dbg.passes },
    passes: passes, programs: st.programs, texturesMB: st.texturesMB, meshes: meshes, visibleMeshes: visible, objects: objects };
})`;

function stats(v: number[]): { p50: number; p95: number; max: number } {
  const s = [...v].sort((a, b) => a - b);
  return { p50: percentile(s, 50), p95: percentile(s, 95), max: s[s.length - 1] ?? 0 };
}

async function forcedHeap(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Performance.enable');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

export interface IdleOptions {
  screens: ('menu' | 'garage')[];
  tiers: QualityTier[];
  liveMs: number;
  heldFrames: number;
  sha: string;
  dirty: boolean;
  label: string;
  verbose: boolean;
}

export interface IdleResult {
  row: LedgerRow;
  raw: { live: { ms: number; rendered: boolean; at: number }[]; held: HeldResult; heapDeltaMB: number };
}

export async function runIdle(browser: Browser, url: string, opts: IdleOptions, log: (l: string) => void): Promise<IdleResult[]> {
  const ctx = await browser.newContext({ viewport: { width: 874, height: 330 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
  const out: IdleResult[] = [];
  try {
    await ctx.addInitScript(RAF_SHIM);
    const page = await ctx.newPage();
    if (opts.verbose) page.on('console', (m) => console.log(`[page:${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => log(`[idle pageerror] ${e.message}`));
    await page.goto(`${url}/?sw=0`);
    await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180_000 });
    await page.waitForFunction(() => !!window.__rockhop?.app && !!(window as unknown as { __render?: unknown }).__render, null, { timeout: 60_000 });
    await page.waitForTimeout(800);
    await page.evaluate(PAGE_BENCH_SRC);
    const phone = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, tier: (window as unknown as { __render: { debugInfo(): { tier: string } } }).__render.debugInfo().tier }));
    log(`idle: front page up (coarse=${phone.coarse} ${phone.w}×${phone.h} tier=${phone.tier})`);
    for (const screen of opts.screens) {
      await page.evaluate((s) => window.__rockhop!.app!.goto(s), screen);
      await page.waitForTimeout(1500);
      for (const tier of opts.tiers) {
        const load0 = os.loadavg()[0]!;
        await page.evaluate((q) => window.__rockhop!.setQuality(q), tier);
        // The app's resize/fit path owns the canvas size; force the phone DPR through the renderer like the device would (dprCap → 3 → tier cap).
        await page.evaluate(() => (window as unknown as { __render: { resize(w: number, h: number, d: number): void } }).__render.resize(innerWidth, innerHeight, 3));
        // Render round 4: a tier change may load the tier's hero pair; the row is that pair's only once it is installed.
        await page.evaluate(async () => { await (window as unknown as { __render: { whenReady?(): Promise<void> } }).__render.whenReady?.(); });
        await page.waitForTimeout(600);
        await page.evaluate(() => (window.__rafLog!.length = 0));
        await page.waitForTimeout(opts.liveMs);
        const live = await page.evaluate(() => window.__rafLog!.slice());
        await page.evaluate(() => (window.__rafHold = true));
        await page.waitForTimeout(100);
        const heap0 = await forcedHeap(page);
        const held = (await page.evaluate(`(${HELD_SRC})(${opts.heldFrames}, innerWidth, innerHeight, 3)`)) as HeldResult;
        const heap1 = await forcedHeap(page);
        await page.evaluate(() => window.__rafRelease!());
        const rendered = live.filter((l) => l.rendered).map((l) => l.ms);
        const skipped = live.filter((l) => !l.rendered).map((l) => l.ms);
        const raf = stats(rendered);
        const sp = (f: string): number => stats(held.split[f]!).p50;
        const calls = Math.round(stats(held.synced.map((s) => s.calls)).p50);
        const tris = Math.round(stats(held.synced.map((s) => s.tris)).p50);
        const work = gpuWork(held.passes, calls, tris);
        const est = phoneEstimate(effectiveMpx(held.passes), calls, tris, held.texturesMB);
        const raster = stats(held.synced.map((s) => s.raster));
        const row: LedgerRow = {
          sha: opts.sha,
          dirty: opts.dirty,
          label: opts.label,
          at: new Date().toISOString(),
          repeat: 1,
          key: `idle-${screen}-${tier}-phone`,
          tier,
          track: screen,
          geom: 'phone',
          frames: held.n,
          loadavg: +os.loadavg()[0]!.toFixed(1),
          submitP50: +stats(held.render).p50.toFixed(3),
          submitP95: +stats(held.render).p95.toFixed(3),
          totalP50: +stats(held.total).p50.toFixed(3),
          gameP50: +(stats(held.total).p50 - stats(held.render).p50).toFixed(3),
          buildP50: +sp('build').toFixed(3),
          rigP50: +sp('rig').toFixed(3),
          heroP50: +sp('hero').toFixed(3),
          shadowP50: +sp('shadow').toFixed(3),
          drawsP50: +sp('draws').toFixed(3),
          traverseP50: +sp('traverse').toFixed(3),
          postP50: +sp('post').toFixed(3),
          otherP50: +sp('other').toFixed(3),
          physicsP50: 0,
          rasterP50: +raster.p50.toFixed(1),
          rasterP95: +raster.max.toFixed(1),
          calls,
          tris,
          programs: held.programs,
          texMB: +held.texturesMB.toFixed(1),
          rtMpx: held.debug.rtMpx,
          rtMB: held.debug.rtMB,
          heroTris: held.debug.heroTris,
          shadowMap: held.debug.shadowMap,
          canvas: `${held.debug.canvasW}×${held.debug.canvasH}`,
          heapMB: +(((heap1 - heap0) / 1048576) * (600 / held.n)).toFixed(2),
          blocked: 0,
          weightedMB: +work.weightedMB.toFixed(1),
          modelGpuMs: +work.msGpu.toFixed(2),
          phoneMs: +est.ms.toFixed(1),
          finalHash: '',
          rafP50: +raf.p50.toFixed(3),
          rafP95: +raf.p95.toFixed(3),
          rafMax: +raf.max.toFixed(2),
          appFrameP50: +stats(held.app).p50.toFixed(3),
          hudP50: +stats(held.hud).p50.toFixed(3),
          meshes: held.visibleMeshes,
        };
        out.push({ row, raw: { live, held, heapDeltaMB: (heap1 - heap0) / 1048576 } });
        log(
          `idle ${screen.padEnd(6)} ${tier.padEnd(6)} raf ${rendered.length} rendered / ${skipped.length} skipped cb in ${opts.liveMs} ms: p50 ${raf.p50.toFixed(2)} p95 ${raf.p95.toFixed(2)} max ${raf.max.toFixed(1)} ms (skipped p50 ${stats(skipped).p50.toFixed(3)}) | render ${row.submitP50} (draws ${row.drawsP50} trav ${row.traverseP50} shadow ${row.shadowP50} hero ${row.heroP50} post ${row.postP50} other ${row.otherP50}) game ${row.gameP50} hud ${row.hudP50} app ${row.appFrameP50} | raster ${raster.p50.toFixed(0)} ms @ ${row.canvas} | calls ${calls} tris ${(tris / 1000).toFixed(0)}k meshes ${held.visibleMeshes}/${held.meshes} objs ${held.objects} rt ${row.rtMpx} Mpx | model phone ${row.phoneMs} | heap/600 ${row.heapMB} MB | load ${load0.toFixed(0)}→${row.loadavg}`,
        );
      }
    }
  } finally {
    await ctx.close();
  }
  return out;
}
