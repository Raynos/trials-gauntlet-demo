// Brand evidence captures (store release, Brand/UI owner): the home screen, the world map, an in-ride frame with
// its HUD call-outs, and the results ticket after a real, played finish (Low Tide on held full gas).
// Silent and headless (navigator.webdriver: the game opens no AudioContext); one browser at a time.
//
//   TRIALS_BROWSER_BACKEND=metal pnpm exec tsx assets/brand/tools/capture.mts [--out docs/evidence/store-release/brand/after]
//        [--engines chromium,webkit] [--sizes 932x430,844x390] [--track c1-low-tide] [--video]
//
// Serves dist/ (build first). Writes <out>/<engine>-<w>x<h>-<shot>.png (+ a results-reveal .webm with --video).
import fs from 'node:fs';
import path from 'node:path';
import { webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { flagStr, parseArgs } from '../../../harness/lib/args';
import { launchBrowser } from '../../../harness/lib/browser';
import { startServer } from '../../../harness/lib/server';

const { flags } = parseArgs();
const out = path.resolve(flagStr(flags, 'out', 'docs/evidence/store-release/brand/after'));
const engines = flagStr(flags, 'engines', 'chromium,webkit').split(',');
const sizes = flagStr(flags, 'sizes', '932x430,844x390').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const track = flagStr(flags, 'track', 'c1-low-tide');
const video = flags['video'] === true;
fs.mkdirSync(out, { recursive: true });

/** A played save: a couple of medals so the map and the ticket read like a real one. */
const SEED = `(() => { try {
  const mk = (time, faults, medal) => JSON.stringify({ time, faults, medal });
  localStorage.setItem('rockhop.onboarded', '1');
  localStorage.setItem('rockhop.best.${track}', mk(60, 3, 'bronze'));
} catch (e) {} })()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shots(page: Page, tag: string, url: string): Promise<void> {
  const shot = async (name: string): Promise<void> => {
    await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
    console.log(`  ${tag}-${name}.png`);
  };
  await page.goto(url);
  await page.waitForSelector('.menu-screen.show', { timeout: 120_000 });
  // The boot loader stays over the menu until the renderer's shaders are compiled: wait until it is gone.
  await page.waitForFunction(() => { const l = document.getElementById('loader'); return !l || l.classList.contains('out') || getComputedStyle(l).display === 'none'; }, null, { timeout: 240_000 });
  await page.waitForFunction(() => document.querySelector('.menu-keyart')?.classList.contains('loaded'), null, { timeout: 30_000 }).catch(() => undefined);
  await sleep(1200);
  await shot('menu');
  await page.evaluate((id) => (window as unknown as { __rockhop: { app: { play(s: string): void } } }).__rockhop.app.play(id), track);
  await page.waitForFunction(() => (window as unknown as { __rockhop: { phase(): string } }).__rockhop.phase() === 'countdown', null, { timeout: 60_000 });
  await sleep(700);
  await shot('countdown');
  await page.waitForFunction(() => (window as unknown as { __rockhop: { phase(): string } }).__rockhop.phase() === 'riding', null, { timeout: 90_000 });
  // Mid-ride: the HUD (timer + bails pill, marker strip) over the world.
  await sleep(1500);
  await shot('ride');
  // A played run: Low Tide clears on held full gas (Tracks, e5c1ce1a), so the key is held until the finish line.
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => (window as unknown as { __rockhop: { phase(): string } }).__rockhop.phase() === 'finished', null, { timeout: 150_000 }).catch(() => undefined);
  await page.keyboard.up('ArrowUp');
  const played = await page.evaluate(() => (window as unknown as { __rockhop: { phase(): string } }).__rockhop.phase());
  console.log(`  after the ride: phase=${played}`);
  await page.waitForSelector('.results.show', { timeout: 60_000 }).catch(() => console.log('  (no results panel)'));
  await sleep(2600);
  await shot('results');
  // The ticket's MAP: out of the run, onto the world map with this clear on it.
  await page.click('.results.live .tile[data-id="menu"]').catch(async () => page.evaluate(() => (window as unknown as { __rockhop: { app: { quit(): void; goto(s: string): void } } }).__rockhop.app.goto('tracks')));
  await sleep(3000);
  await shot('worldmap');
}

async function withEngine(engine: string, run: (b: Browser) => Promise<void>): Promise<void> {
  if (engine === 'chromium') {
    const l = await launchBrowser({ width: 932, height: 430 });
    console.log(`chromium: ${l.probe.renderer}`);
    try {
      await run(l.browser);
    } finally {
      await l.close();
    }
  } else {
    const b = await webkit.launch({ headless: true });
    console.log('webkit');
    try {
      await run(b);
    } finally {
      await b.close();
    }
  }
}

const server = await startServer({ freeze: true });
try {
  for (const engine of engines) {
    await withEngine(engine, async (browser) => {
      for (const [w, h] of sizes) {
        const ctx: BrowserContext = await browser.newContext({
          viewport: { width: w, height: h },
          deviceScaleFactor: 2,
          hasTouch: true,
          isMobile: engine !== 'webkit',
          ...(video ? { recordVideo: { dir: out, size: { width: w, height: h } } } : {}),
        });
        await ctx.addInitScript(SEED);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
        try {
          await shots(page, `${engine}-${w}x${h}`, server.url);
        } catch (e) {
          console.error(`  ${engine} ${w}x${h} failed: ${e instanceof Error ? e.message : String(e)}`);
          await page.screenshot({ path: path.join(out, `${engine}-${w}x${h}-error.png`) }).catch(() => undefined);
        }
        await ctx.close();
      }
    });
  }
} finally {
  await server.close();
}
