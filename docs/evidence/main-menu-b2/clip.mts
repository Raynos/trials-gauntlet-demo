/**
 * Played clip of the B2 "Strip" main menu (ask 42; evidence is played, never posed):
 *   cold boot → the title menu (the Nalati strip decodes over its tint) → PLAY → back → GARAGE → back → SETTINGS → back.
 * Every tap lands on the live tile through the touchscreen (the invariant: nothing is tappable before it is drawn 150 ms).
 * Also a leak audit on every return to the menu: the menu's rendered words must be the title and the five actions.
 *   npx tsx harness/out/main-menu-b2/clip.mts [--url=http://127.0.0.1:4178] --out=DIR [--geom=932x430]   (no --url: serves the frozen dist itself)
 * Writes <out>/chromium-<geom>-clip.webm + a JSON of the timings and the audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../lib/server';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const server = args.get('url') ? null : await startServer({});
const url = args.get('url') ?? server!.url;
const out = args.get('out') ?? path.join(process.cwd(), 'harness', 'out', 'main-menu-b2');
const [W, H] = (args.get('geom') ?? '932x430').split('x').map(Number) as [number, number];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: out, size: { width: W, height: H } },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(`localStorage.setItem('trials.onboarded', '1')`);
const page = await ctx.newPage();
const t: Record<string, unknown> = {};
const t0 = Date.now();
const mark = (k: string): void => { t[k] = Date.now() - t0; };
const centre = (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; }, sel);
const tap = async (sel: string): Promise<boolean> => { const c = await centre(sel); if (!c) return false; await page.touchscreen.tap(c.x, c.y); return true; };
// Evaluated from source text (tsx's keepNames would inject a `__name` helper the page lacks).
const AUDIT = `(() => {
  const stamp = (document.querySelector('.menu-build') || {}).textContent || '';
  const text = (document.querySelector('.menu-screen').innerText || '').toUpperCase().split(stamp.trim().toUpperCase()).join(' ').replace(/\\s+/g, ' ').trim();
  const tiles = {};
  for (const b of document.querySelectorAll('.menu-screen .menu-item:not(.minor)')) tiles[b.dataset.id] = Math.round(b.getBoundingClientRect().height);
  return { text, clean: text === 'TRIALS GAUNTLET PLAY GARAGE REVIEW SETTINGS CREDITS', tiles, plate: !!document.querySelector('.menu-keyart.loaded') };
})()`;
const audits: unknown[] = [];
const menuLive = async (k: string): Promise<void> => {
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 30000 });
  mark(k);
  audits.push({ at: k, ...(await page.evaluate(AUDIT) as object) });
  await page.waitForTimeout(700);
};
try {
  await page.goto(`${url}/?sw=0`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await menuLive('menuLive');
  await page.waitForFunction(() => !!document.querySelector('.menu-keyart.loaded'), null, { timeout: 30000 }).catch(() => undefined);
  mark('plateLoaded');
  await page.waitForTimeout(500);
  for (const [id, screen] of [['play', 'tracks'], ['garage', 'garage'], ['settings', 'settings']] as const) {
    await tap(`.menu-screen.live .menu-item[data-id=${id}]`);
    mark(`tap-${id}`);
    await page.waitForFunction((s) => !!document.querySelector(`.${s}-screen.live`), screen, { timeout: 30000 });
    mark(`${screen}Live`);
    await page.waitForTimeout(1200);
    await tap(`.${screen}-screen.live .backbtn`);
    mark(`back-from-${screen}`);
    await menuLive(`menuLive-after-${screen}`);
  }
  t['audits'] = audits;
  t['allClean'] = audits.every((a) => (a as { clean: boolean }).clean);
} finally {
  const video = page.video();
  await page.close();
  await ctx.close();
  await browser.close();
  await server?.close();
  const p = await video?.path();
  if (p) {
    const dst = path.join(out, `chromium-${W}x${H}-clip.webm`);
    fs.renameSync(p, dst);
    t['clip'] = dst;
  }
}
fs.writeFileSync(path.join(out, `chromium-${W}x${H}-clip.json`), JSON.stringify(t, null, 1));
console.log(JSON.stringify(t, null, 1));
