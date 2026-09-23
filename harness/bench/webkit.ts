/**
 * Metal-path proxy: `pnpm exec tsx harness/bench/webkit.ts [--track b1] [--tiers low,medium,high] [--frames 240] [--geom phone]`
 *
 * Playwright WebKit on macOS runs WebGL through ANGLE-on-Metal on the real GPU — the same driver
 * family as iOS Safari, unlike the SwiftShader host bench. For each tier (phone device class at the
 * phone geometry) the golden is replayed and every frame is synced (`gl.finish` + a 1×1 readPixels),
 * so `frame` = JS submit + GPU time for one frame on this Mac's GPU. Not phone ms either — an M-series
 * GPU is ~3–6× an A17 — but the *ratios* between tiers are Metal ratios: what medium costs relative to
 * low here is close to what it costs relative to low on the phone, where low is measured (59.5 fps).
 *
 * Output: one line per tier (frame p50 / p95 ms, JS submit p50, calls, tris, rt Mpx, canvas) and
 * `harness/out/bench/webkit-latest.md`. The user will not run more device benchmarks; this is the
 * self-measured stand-in until the iOS simulator runtime lands.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webkit } from 'playwright';
import type { QualityTier } from '../../src/core/types';
import { expandFrames } from '../../src/core/replay';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { chooseGolden } from '../lib/golden';
import { PAGE_RUN_AS_SRC } from '../lib/hook';
import { loadRecording } from '../lib/recording';
import { ensureOut } from '../lib/report';
import { startServer } from '../lib/server';
import { GEOMETRIES, TRACKS } from './bench';

const RUN_SRC = `(function (ins, tier, w, h, dpr, device, tpf) {
  var t = window.__rockhop, R = window.__render;
  if (R.setDeviceClass) R.setDeviceClass(device);
  t.setQuality(tier); R.resize(w, h, dpr);
  var gl = R.renderer.getContext();
  var px = new Uint8Array(4);
  function sync() { gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  var frames = Math.floor(ins.length / tpf), fed = 0;
  for (var k = 0; k < 20; k++) { for (var j = 0; j < tpf; j++) { t.setInput(ins[fed++]); t.step(1); } t.render(false); }
  sync();
  var frame = [], submit = [];
  for (var i = 20; i < frames; i++) {
    for (var j2 = 0; j2 < tpf; j2++) { t.setInput(ins[fed++]); t.step(1); }
    var t0 = performance.now(); var s = t.render(false); sync(); frame.push(performance.now() - t0); submit.push(s);
  }
  frame.sort(function (a, b) { return a - b; }); submit.sort(function (a, b) { return a - b; });
  var d = R.debugInfo();
  var n = frame.length;
  return { n: n, frameP50: frame[n >> 1], frameP95: frame[Math.floor(n * 0.95)], frameMax: frame[n - 1], submitP50: submit[n >> 1], calls: d.calls, tris: d.tris, rtMpx: d.rtMpx, passes: d.rtPasses, canvas: d.canvasW + 'x' + d.canvasH, profile: d.profile, renderer: gl.getParameter(gl.RENDERER) };
})`;

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const track = flagStr(flags, 'track', 'b1');
  const trackId = TRACKS[track] ?? track;
  const tiers = flagStr(flags, 'tiers', 'low,medium,high').split(',') as QualityTier[];
  const frames = flagNum(flags, 'frames', 240);
  const geom = GEOMETRIES[flagStr(flags, 'geom', 'phone')] ?? GEOMETRIES.phone!;
  const device = geom.name === 'phone' ? 'phone' : 'desktop';
  const tpf = 2;
  const inputs = expandFrames(loadRecording(chooseGolden(trackId)!.file)).slice(0, frames * tpf);
  const server = await startServer({ freeze: true });
  const browser = await webkit.launch({ headless: true });
  const lines: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: geom.cssW, height: geom.cssH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    // `openGame` reads the heap over CDP (Chromium-only); WebKit gets the same navigation without it.
    const url = new URL(server.url);
    url.searchParams.set('harness', '1');
    await page.goto(url.toString(), { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__rockhop?.ready === true, undefined, { timeout: 120_000 });
    await page.evaluate(PAGE_RUN_AS_SRC);
    for (const tier of tiers) {
      await page.evaluate((id) => window.__rockhop!.loadTrack(id), trackId);
      const r = (await page.evaluate(`(${RUN_SRC})(${JSON.stringify(inputs)}, ${JSON.stringify(tier)}, ${geom.cssW}, ${geom.cssH}, ${geom.dpr}, ${JSON.stringify(device)}, ${tpf})`)) as {
        n: number; frameP50: number; frameP95: number; frameMax: number; submitP50: number; calls: number; tris: number; rtMpx: number; passes: string; canvas: string; profile: string; renderer: string;
      };
      const line = `| ${tier} (${r.profile}) | ${r.frameP50.toFixed(2)} / ${r.frameP95.toFixed(2)} / ${r.frameMax.toFixed(1)} | ${r.submitP50.toFixed(2)} | ${r.calls} | ${(r.tris / 1000).toFixed(0)}k | ${r.rtMpx} | ${r.canvas} | ${r.passes} |`;
      lines.push(line);
      console.log(`${tier.padEnd(7)} ${r.profile.padEnd(11)} frame p50 ${r.frameP50.toFixed(2)} p95 ${r.frameP95.toFixed(2)} max ${r.frameMax.toFixed(1)} ms | submit ${r.submitP50.toFixed(2)} | ${r.calls} calls ${(r.tris / 1000).toFixed(0)}k tris ${r.rtMpx} Mpx @ ${r.canvas} | ${r.renderer}`);
    }
    await ctx.close();
  } finally {
    await browser.close();
    await server.close();
  }
  const md = [`# WebKit (ANGLE-on-Metal, this Mac's GPU) — ${trackId} @ ${geom.cssW}×${geom.cssH}@${geom.dpr} ${device}, ${frames} frames, every frame synced, loadavg ${os.loadavg()[0]!.toFixed(0)}`, '', '| tier (profile) | frame p50 / p95 / max ms | JS submit p50 | calls | tris | rt Mpx | canvas | passes |', '|---|---|---|---|---|---|---|---|', ...lines, ''].join('\n');
  const file = path.join(ensureOut('bench'), 'webkit-latest.md');
  fs.writeFileSync(file, md);
  console.log(`wrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
