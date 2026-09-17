/**
 * In-page A/B of a render cut behind a harness switch: `pnpm exec tsx harness/bench/ab.ts [--switch skinArray|merge] [--track b1] [--tiers high,medium,low] [--geom phone|desktop] [--ticks 400,800,1200] [--build]`
 *
 * Same page, same golden: the switch off, the track built, captures at the sample ticks; the switch on, the
 * track rebuilt, the same captures. Prints calls / tris / GL error per tick and the pixel diff (pixels differing,
 * pixels beyond 8/255, max delta, bbox) — the comparator PERF.md rows 5 and 6 quote. The tier and device class are
 * set BEFORE each build (chunk size and detail follow the tier) and again after (the low texture shrink).
 * Switches: `skinArray` (`window.__setSkinArray`, cut #4b), `merge` (`window.__setMerge`, cut #4a).
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { QualityTier } from '../../src/core/types';
import { expandFrames } from '../../src/core/replay';
import { flagBool, flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { chooseGolden } from '../lib/golden';
import { HookClient, openGame } from '../lib/hook';
import { loadRecording } from '../lib/recording';
import { ensureOut } from '../lib/report';
import { startServer } from '../lib/server';
import { GEOMETRIES, TRACKS } from './bench';

const { flags } = parseArgs();
const sw = flagStr(flags, 'switch', 'skinArray');
const setter = sw === 'merge' ? '__setMerge' : '__setSkinArray';
const track = flagStr(flags, 'track', 'b1');
const trackId = TRACKS[track] ?? track;
const tiers = flagStr(flags, 'tiers', 'high,medium,low').split(',');
const geomName = flagStr(flags, 'geom', 'phone');
const geom = GEOMETRIES[geomName] ?? GEOMETRIES.phone!;
const ticks = flagStr(flags, 'ticks', '400,800,1200').split(',').map(Number);
const outDir = path.join(ensureOut('bench'), 'ab', `${sw}-${track}-${geomName}`);
fs.mkdirSync(outDir, { recursive: true });
const golden = chooseGolden(trackId);
if (!golden) throw new Error(`no golden for ${trackId}`);
const inputs = expandFrames(loadRecording(golden.file)).slice(0, Math.max(...ticks));
const server = await startServer({ forceBuild: flagBool(flags, 'build'), freeze: true });
const launched = await launchBrowser({ width: geom.cssW, height: geom.cssH });
console.log('loadavg', os.loadavg().map((x) => x.toFixed(1)).join(' '), 'geom', geom, 'ticks', ticks.join(','));
try {
  for (const tier of tiers) {
    const page = await launched.context.newPage();
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 200)); });
    await openGame(page, server.url);
    const hook = new HookClient(page);
    type Render = { setDeviceClass?(c: string): void; whenReady?(): Promise<void>; resize(w: number, h: number, d: number): void; debugInfo(): { calls: number; tris: number }; renderer: { getContext(): WebGL2RenderingContext }; canvas: HTMLCanvasElement };
    const setTier = () => page.evaluate(([t, w, h, d, dc]) => { const R = (window as unknown as { __render: Render }).__render; R.setDeviceClass?.(dc as string); window.__trials!.setQuality(t as QualityTier); R.resize(w as number, h as number, d as number); return R.whenReady?.(); }, [tier, geom.cssW, geom.cssH, geom.dpr, geom.cssW < 1000 ? 'phone' : 'desktop'] as const);
    const pass = async (on: boolean) => {
      await page.evaluate(([name, on]) => (window as unknown as Record<string, (v: boolean) => void>)[name as string]!(on as boolean), [setter, on] as const);
      // Tier + device class BEFORE the build (chunk size / detail follow the tier), then the build, then the tier again (the low texture shrink).
      await setTier();
      await hook.loadTrack(trackId);
      await setTier();
      return await page.evaluate(([ins, ts]) => {
        const t = window.__trials!; const R = (window as unknown as { __render: Render }).__render;
        type Inp = Parameters<typeof t.setInput>[0];
        const res: { tick: number; calls: number; tris: number; glError: number; w: number; h: number; png: string }[] = []; let fed = 0;
        for (const target of ts as number[]) {
          for (; fed < target && fed < (ins as Inp[]).length; fed++) { t.setInput((ins as Inp[])[fed]!); t.step(1); }
          t.render(false);
          const d = R.debugInfo();
          const gl = R.renderer.getContext(); const err = gl.getError();
          const c = R.canvas;
          res.push({ tick: t.frame(), calls: d.calls, tris: d.tris, glError: err, w: c.width, h: c.height, png: c.toDataURL('image/png') });
        }
        return res;
      }, [inputs, ticks] as const);
    };
    const a = await pass(false);
    const b = await pass(true);
    for (let i = 0; i < ticks.length; i++) {
      const A = a[i]!, B = b[i]!;
      fs.writeFileSync(path.join(outDir, `${tier}-t${A.tick}-off.png`), Buffer.from(A.png.split(',')[1]!, 'base64'));
      fs.writeFileSync(path.join(outDir, `${tier}-t${B.tick}-on.png`), Buffer.from(B.png.split(',')[1]!, 'base64'));
      const diff = (await page.evaluate(`(async function (a, b) {
        var load = function (s) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.src = s; }); };
        var ims = await Promise.all([load(a), load(b)]); var ia = ims[0], ib = ims[1];
        var c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; var ctx = c.getContext('2d');
        ctx.drawImage(ia, 0, 0); var da = ctx.getImageData(0, 0, c.width, c.height).data;
        ctx.drawImage(ib, 0, 0); var db = ctx.getImageData(0, 0, c.width, c.height).data;
        var px = 0, maxd = 0, big = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (var k = 0; k < da.length; k += 4) { var d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2])); if (d) { px++; if (d > maxd) maxd = d; if (d > 8) { big++; var pi = k >> 2, x = pi % c.width, y = (pi / c.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } }
        return { total: c.width * c.height, px: px, over8: big, maxDelta: maxd, bbox: [x0, y0, x1, y1] };
      })(${JSON.stringify(A.png)}, ${JSON.stringify(B.png)})`)) as { total: number; px: number; over8: number; maxDelta: number; bbox: number[] };
      console.log(`${sw} ${track} ${geomName} ${tier} t${A.tick} ${A.w}x${A.h}: calls ${A.calls} → ${B.calls}, tris ${A.tris} → ${B.tris}, glErr ${A.glError}/${B.glError}; diff px ${diff.px}/${diff.total} over8 ${diff.over8} max ${diff.maxDelta} bbox ${diff.bbox.join(',')}`);
    }
    if (errors.length) console.log('console:', [...new Set(errors)].slice(0, 6).join(' | '));
    await page.close();
  }
} finally {
  await launched.close();
  await server.close();
}
console.log('loadavg', os.loadavg().map((x) => x.toFixed(1)).join(' '), 'stills:', outDir);
