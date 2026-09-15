/**
 * Headless stills of the main menu (the boot screen) at the three judged geometries, for the parent to judge against
 * `assets/design/menu/B-broadcast.jpg`. Built page from `dist/` with `?sw=0`; waits for the menu to be live and the
 * key art to have decoded (`.menu-keyart.loaded`) so the still is the settled screen, not the fade.
 *
 *   tsx harness/e2e/menu-stills.mts --out=/path/to/dir
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../lib/server';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const out = args.get('out') ?? path.join(process.cwd(), 'harness', 'out', 'menu-stills');
fs.mkdirSync(out, { recursive: true });

const GEOMS = [
  { name: '932x430', width: 932, height: 430, mobile: true },
  { name: '844x390', width: 844, height: 390, mobile: true },
  { name: '1280x720', width: 1280, height: 720, mobile: false },
];

const server = await startServer({});
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const g of GEOMS) {
    const ctx = await browser.newContext({
      viewport: { width: g.width, height: g.height },
      deviceScaleFactor: 2,
      isMobile: g.mobile,
      hasTouch: g.mobile,
      ...(g.mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}),
    });
    const page = await ctx.newPage();
    await page.goto(`${server.url}/?sw=0`);
    await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
    await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 30000 });
    await page.waitForFunction(() => !!document.querySelector('.menu-keyart.loaded'), null, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    // Evaluated from source text: tsx's keepNames would otherwise inject a `__name` helper the page lacks.
    const info = await page.evaluate(`(() => {
      const q = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect() : null; };
      const r = (d) => (d ? d.left.toFixed(0) + ',' + d.top.toFixed(0) + ' ' + d.width.toFixed(0) + 'x' + d.height.toFixed(0) : '(none)');
      const txt = (s) => { const el = document.querySelector(s); return el ? el.textContent : ''; };
      return {
        stamp: txt('.menu-build'),
        chip: txt('.menu-chip'),
        ticker: txt('.menu-ticker-track').slice(0, 120),
        tickerScroll: !!document.querySelector('.menu-ticker.scroll'),
        keyart: !!document.querySelector('.menu-keyart.loaded'),
        band: r(q('.menu-band')),
        tabs: [...document.querySelectorAll('.menu-item')].map((b) => b.dataset.id + ' ' + r(b.getBoundingClientRect())),
        badge: r(q('.menu-plate')),
      };
    })()`);
    const file = path.join(out, `menu-${g.name}.png`);
    await page.screenshot({ path: file });
    console.log(`${g.name}: ${file}\n  ${JSON.stringify(info)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
