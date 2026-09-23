/**
 * Determinism pair for a render cut: `pnpm exec tsx harness/bench/det.ts [--track b1] [--tiers high,low] [--every 100] [--to 1500] [--geom desktop|phone] [--out dir]`
 *
 * Replays the track's golden in two fresh pages and captures the canvas (PNG data URL → md5) at
 * every `every`-th tick up to `to`, per tier. Passes when every hash matches its twin; writes the
 * hash lists and the PNG at the first / middle / last sample to `harness/out/bench/det/<label>/`
 * so a cut's still can sit next to the previous cut's. Same method as the r12 / r13 rounds' det.mts.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { QualityTier } from '../../src/core/types';
import { expandFrames } from '../../src/core/replay';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { chooseGolden } from '../lib/golden';
import { HookClient, openGame } from '../lib/hook';
import { loadRecording } from '../lib/recording';
import { ensureOut } from '../lib/report';
import { startServer } from '../lib/server';
import { GEOMETRIES, TRACKS } from './bench';

async function capturePass(page: Page, url: string, trackId: string, tier: QualityTier, inputs: unknown[], ticks: number[], geom: { cssW: number; cssH: number; dpr: number }): Promise<{ hashes: string[]; pngs: Map<number, Buffer> }> {
  await openGame(page, url);
  const hook = new HookClient(page);
  await hook.loadTrack(trackId);
  await page.evaluate(([t, w, h, d, dc]) => { const R = (window as unknown as { __render: { resize(w: number, h: number, d: number): void; setDeviceClass?(c: string): void } }).__render; R.setDeviceClass?.(dc as string); window.__rockhop!.setQuality(t as QualityTier); R.resize(w as number, h as number, d as number); }, [tier, geom.cssW, geom.cssH, geom.dpr, geom.cssW < 1000 ? 'phone' : 'desktop'] as const);
  const out = (await page.evaluate(
    ([ins, ts]) => {
      const t = window.__rockhop!;
      const R = (window as unknown as { __render: { canvas: HTMLCanvasElement } }).__render;
      const res: { tick: number; url: string }[] = [];
      let fed = 0;
      for (const target of ts as number[]) {
        for (; fed < target && fed < (ins as unknown[]).length; fed++) {
          t.setInput((ins as Parameters<typeof t.setInput>[0][])[fed]!);
          t.step(1);
        }
        t.render(false);
        res.push({ tick: t.frame(), url: R.canvas.toDataURL('image/png') });
      }
      return res;
    },
    [inputs, ticks] as const,
  )) as { tick: number; url: string }[];
  const hashes: string[] = [];
  const pngs = new Map<number, Buffer>();
  for (const r of out) {
    const buf = Buffer.from(r.url.split(',')[1]!, 'base64');
    hashes.push(createHash('md5').update(buf).digest('hex'));
    pngs.set(r.tick, buf);
  }
  return { hashes, pngs };
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const track = flagStr(flags, 'track', 'b1');
  const trackId = TRACKS[track] ?? track;
  const tiers = flagStr(flags, 'tiers', 'high,low').split(',') as QualityTier[];
  const every = flagNum(flags, 'every', 100);
  const to = flagNum(flags, 'to', 1500);
  const geom = GEOMETRIES[flagStr(flags, 'geom', 'desktop')] ?? GEOMETRIES.desktop!;
  const label = flagStr(flags, 'label', 'det');
  const ticks: number[] = [];
  for (let k = every; k <= to; k += every) ticks.push(k);
  const golden = chooseGolden(trackId);
  if (!golden) throw new Error(`no golden for ${trackId}`);
  const inputs = expandFrames(loadRecording(golden.file)).slice(0, to);
  const outDir = path.join(ensureOut('bench'), 'det', label);
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startServer({ forceBuild: flagBool(flags, 'build'), freeze: true });
  const launched = await launchBrowser({ width: geom.cssW, height: geom.cssH });
  let ok = true;
  try {
    for (const tier of tiers) {
      const runs = [];
      for (let i = 0; i < 2; i++) {
        const page = await launched.context.newPage();
        try {
          runs.push(await capturePass(page, server.url, trackId, tier, inputs, ticks, geom));
        } finally {
          await page.close();
        }
      }
      const [a, b] = runs as [Awaited<ReturnType<typeof capturePass>>, Awaited<ReturnType<typeof capturePass>>];
      const same = a.hashes.every((h, i) => h === b.hashes[i]);
      ok &&= same;
      fs.writeFileSync(path.join(outDir, `${track}-${tier}.hashes.txt`), ticks.map((t, i) => `${t} ${a.hashes[i]} ${b.hashes[i]}`).join('\n') + '\n');
      for (const t of [ticks[0]!, ticks[ticks.length >> 1]!, ticks[ticks.length - 1]!]) fs.writeFileSync(path.join(outDir, `${track}-${tier}-t${t}.png`), a.pngs.get(t) ?? Buffer.alloc(0));
      console.log(`${same ? 'PASS' : 'FAIL'} ${trackId} ${tier} ${geom.cssW}×${geom.cssH}@${geom.dpr}: ${ticks.length} frames, ${a.hashes.filter((h, i) => h === b.hashes[i]).length} identical; t${ticks[ticks.length >> 1]} md5 ${a.hashes[ticks.length >> 1]} / ${b.hashes[ticks.length >> 1]}`);
    }
  } finally {
    await launched.close();
    await server.close();
  }
  console.log(`stills + hashes: ${outDir}`);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
