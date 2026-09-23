// UI polish evidence (store release, UI polish owner): every front-end screen and both results variants, played not
// posed — the ride is held full gas to a real finish, the bailed run loops out on gas + lean back three times first.
// Silent and headless (navigator.webdriver: the game opens no AudioContext); one browser at a time.
//
//   TRIALS_BROWSER_BACKEND=metal pnpm exec tsx assets/brand/tools/polish-capture.mts --dist <built dist dir>
//        [--out docs/evidence/store-release/brand/polish/after] [--engines chromium,webkit]
//        [--sizes 932x430,844x390,1280x720] [--shots loading,menu,map,garage,settings,credits,pause,results,bailed,error,offline,rotate]
//
// Writes <out>/<engine>-<w>x<h>-<shot>.jpg. `--dist` is any built output (a `git archive` export's dist, so other
// builders' uncommitted work never lands in the evidence).
import fs from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import { webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { flagStr, parseArgs } from '../../../harness/lib/args';
import { launchBrowser } from '../../../harness/lib/browser';

const { flags } = parseArgs();
const dist = path.resolve(flagStr(flags, 'dist', 'dist'));
const out = path.resolve(flagStr(flags, 'out', 'docs/evidence/store-release/brand/polish/after'));
const engines = flagStr(flags, 'engines', 'chromium,webkit').split(',');
const sizes = flagStr(flags, 'sizes', '932x430,844x390,1280x720').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const want = new Set(flagStr(flags, 'shots', 'loading,menu,map,garage,settings,credits,pause,results,bailed,error,offline,rotate').split(','));
const track = flagStr(flags, 'track', 'c1-low-tide');
fs.mkdirSync(out, { recursive: true });

/** A played save: Low Tide holds a bronze, so the map shows a medal and the ticket a new best. */
const SEED = `(() => { try {
  localStorage.setItem('rockhop.onboarded', '1');
  localStorage.setItem('rockhop.best.${track}', JSON.stringify({ time: 60, faults: 3, medal: 'bronze' }));
} catch (e) {} })()`;

type Hook = { __rockhop: { phase(): string; app: { play(s: string): void; goto(s: string): void; quit(): void; togglePause(): void; screen(): string } }; __rockhopCrash?: { show(m: string, s?: string): void } };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function shots(page: Page, tag: string, url: string): Promise<void> {
  const shot = async (name: string): Promise<void> => {
    if (!want.has(name.replace(/-.*/, ''))) return;
    await page.screenshot({ path: path.join(out, `${tag}-${name}.jpg`), type: 'jpeg', quality: 78 });
    console.log(`  ${tag}-${name}.jpg`);
    await audit(name);
  };
  /**
   * Tap-target audit of the screen on show: every drawn, pointer-taking button under an iPhone's 34 px side safe areas
   * (the `--sal` / `--sar` tokens forced for the check, then restored) — its box must be ≥ 44 px both ways and clear of
   * both side strips. Appended to <out>/<tag>-audit.json.
   */
  const audits: Record<string, unknown> = {};
  const audit = async (name: string): Promise<void> => {
    if (!flags['audit']) return;
    audits[name] = await page.evaluate(async () => {
      const st = document.createElement('style');
      st.textContent = ':root { --sal: 34px !important; --sar: 34px !important; }';
      document.head.appendChild(st);
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 700));
      const W = innerWidth;
      const bad: string[] = [];
      let n = 0;
      for (const b of document.querySelectorAll<HTMLElement>('#ui button, #ui [role="button"]')) {
        const r = b.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cs = getComputedStyle(b);
        if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
        let o = 1;
        for (let e: HTMLElement | null = b; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
        if (o < 0.5) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 0 || cx > W || cy < 0 || cy > innerHeight) continue;
        const top = document.elementFromPoint(cx, cy);
        if (!top || !(b === top || b.contains(top))) continue; // covered: not tappable here
        n++;
        const label = `${b.className || b.tagName} "${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 28)}" ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`;
        if (Math.min(r.width, r.height) < 43.5) bad.push(`small: ${label}`);
        if (r.left < 34 || r.right > W - 34) bad.push(`safe area: ${label}`);
      }
      st.remove();
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 300));
      return { tappables: n, bad };
    });
  };
  const phase = (): Promise<string> => page.evaluate(() => (window as unknown as Hook).__rockhop.phase());
  const until = (p: string, ms: number): Promise<unknown> =>
    page.waitForFunction((x) => (window as unknown as Hook).__rockhop?.phase?.() === x, p, { timeout: ms }).catch(() => undefined);
  const go = async (s: string, settle = 1400): Promise<void> => {
    await page.evaluate((x) => (window as unknown as Hook).__rockhop.app.goto(x), s);
    await sleep(settle);
  };
  await page.goto(url);
  // The boot loader, mid-load: it stays up until the renderer's shaders are compiled.
  await page.waitForSelector('#loader', { timeout: 30_000 }).catch(() => undefined);
  await sleep(350);
  await shot('loading');
  await page.waitForSelector('.menu-screen.show', { timeout: 120_000 });
  await page.waitForFunction(() => { const l = document.getElementById('loader'); return !l || l.classList.contains('out') || getComputedStyle(l).display === 'none'; }, null, { timeout: 240_000 });
  await page.waitForFunction(() => document.querySelector('.menu-keyart')?.classList.contains('loaded'), null, { timeout: 30_000 }).catch(() => undefined);
  await sleep(1000);
  await shot('menu');
  await go('tracks', 2600);
  await shot('map');
  await go('garage', 4500);
  await shot('garage');
  await go('settings');
  await shot('settings');
  await go('credits');
  await shot('credits');
  await go('menu', 600);
  if (want.has('pause') || want.has('results') || want.has('bailed')) {
    await page.evaluate((id) => (window as unknown as Hook).__rockhop.app.play(id), track);
    await until('riding', 90_000);
    await sleep(1200);
    await page.evaluate(() => (window as unknown as Hook).__rockhop.app.togglePause());
    await sleep(900);
    await shot('pause');
    await page.evaluate(() => (window as unknown as Hook).__rockhop.app.togglePause());
    await sleep(400);
    // A clear: held full gas to the line (Low Tide clears on it).
    await page.keyboard.down('ArrowUp');
    await until('finished', 150_000);
    await page.keyboard.up('ArrowUp');
    await page.waitForSelector('.results.show', { timeout: 60_000 }).catch(() => console.log('  (no results panel)'));
    await sleep(2600);
    await shot('results');
    if (want.has('bailed')) {
      // The bailed run: RETRY, then loop out on gas + lean back three times (1 s auto-respawn each), then the gas to the line.
      await page.click('.results.live .tile[data-id="retry"]').catch(() => page.keyboard.press('r'));
      await until('riding', 60_000);
      for (let i = 0; i < 3; i++) {
        await page.keyboard.down('ArrowUp');
        await page.keyboard.down('ArrowLeft');
        await until('crashed', 20_000);
        await page.keyboard.up('ArrowLeft');
        await page.keyboard.up('ArrowUp');
        if (i === 0) {
          await sleep(250);
          await page.evaluate(() => (window as unknown as Hook).__rockhop.app.togglePause());
          await sleep(700);
          await shot('pause-bailed');
          await page.evaluate(() => (window as unknown as Hook).__rockhop.app.togglePause());
        }
        await until('riding', 10_000);
        await sleep(300);
      }
      await page.keyboard.down('ArrowUp');
      await until('finished', 150_000);
      await page.keyboard.up('ArrowUp');
      await page.waitForSelector('.results.show', { timeout: 60_000 }).catch(() => undefined);
      await sleep(2600);
      await shot('bailed');
      console.log(`  bailed run: ${await page.$eval('.results .faults b', (e) => e.textContent).catch(() => '?')} bails, phase ${await phase()}`);
    }
    await page.evaluate(() => (window as unknown as Hook).__rockhop.app.quit());
    await sleep(800);
  }
  if (want.has('error')) {
    await page.evaluate(() => (window as unknown as Hook).__rockhopCrash?.show('TypeError: cannot read properties of undefined (reading "x")', 'at step (game.ts:812)\nat frame (main.ts:420)'));
    await sleep(700);
    await shot('error');
  }
  if (flags['audit']) fs.writeFileSync(path.join(out, `${tag}-audit.json`), `${JSON.stringify(audits, null, 1)}\n`);
}

/** The offline page, in a fresh context (the service worker's navigation fallback would answer the game's own page). */
async function offline(browser: Browser, tag: string, url: string, w: number, h: number): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: h < 500 ? 2 : 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(new URL('offline.html', url).toString());
  await sleep(600);
  await page.screenshot({ path: path.join(out, `${tag}-offline.jpg`), type: 'jpeg', quality: 78 });
  console.log(`  ${tag}-offline.jpg`);
  await ctx.close();
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

const server = await preview({ configFile: false, root: path.dirname(dist), build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('preview: no url');
try {
  for (const engine of engines) {
    await withEngine(engine, async (browser) => {
      for (const [w, h] of sizes) {
        const phone = h < 500;
        const ctx: BrowserContext = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone && engine !== 'webkit' });
        await ctx.addInitScript(SEED);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
        try {
          await shots(page, `${engine}-${w}x${h}`, url);
        } catch (e) {
          console.error(`  ${engine} ${w}x${h} failed: ${e instanceof Error ? e.message : String(e)}`);
          await page.screenshot({ path: path.join(out, `${engine}-${w}x${h}-error-state.jpg`), type: 'jpeg', quality: 70 }).catch(() => undefined);
        }
        await ctx.close();
        if (want.has('offline')) await offline(browser, `${engine}-${w}x${h}`, url, w, h);
      }
      if (want.has('rotate')) {
        // The portrait prompt: a phone held upright (coarse pointer).
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: engine !== 'webkit' });
        await ctx.addInitScript(SEED);
        const page = await ctx.newPage();
        await page.goto(url);
        await sleep(2500);
        await page.screenshot({ path: path.join(out, `${engine}-390x844-rotate.jpg`), type: 'jpeg', quality: 78 });
        console.log(`  ${engine}-390x844-rotate.jpg`);
        await ctx.close();
      }
    });
  }
} finally {
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
