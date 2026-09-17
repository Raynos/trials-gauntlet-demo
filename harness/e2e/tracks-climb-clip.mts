/**
 * Played clip of the painted mountain (round 5, ask 44; evidence is played, never posed):
 *   menu → PLAY → two pinches out to the fit zoom (the whole mountain) → drag-pan up the climb (the camera rides up the
 *   trail past Canyon to Snow) → pinch in on Snow → tap M2 (focus) → tap M2 (launch) → ride 3 s → pause → Quit.
 * Same seed, same output shape as tracks-clip.mts (<out>/<engine>-<geom>-climb.webm + .json).
 *   npx tsx harness/e2e/tracks-climb-clip.mts --url=http://127.0.0.1:4178 --out=DIR [--geom=932x430]
 * (Older header, for the shared helpers:)
 *   menu → PLAY → (opens on the current track: M1, the seeded next track, its biome framed) → drag-pan → pinch-zoom out to the
 *   whole mountain → zoom back in (a tap on the map flies to the nearest pin) → NIGHT CITY rung → tap H1 (locked: shake + rule)
 *   → INDUSTRIAL rung → tap B1 (focus) → tap B1 (launch) → ride 3 s (throttle held) → pause → Quit (to the menu).
 * Seeded state = round 1's (Beginner + Easy medalled, 6 / 15); onboarding pre-dismissed so the ride is 3 s of riding.
 *   npx tsx harness/e2e/tracks-clip.mts --url=http://127.0.0.1:4178 --out=DIR [--engine=chromium|webkit] [--geom=932x430]
 * Writes <out>/<engine>-<geom>-clip.webm + a JSON of the timings (taps to B1, the camera at each step, restart latency read from the hook).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const url = args.get('url') ?? 'http://127.0.0.1:4178';
const out = args.get('out') ?? path.join(process.cwd(), 'harness', 'out', 'levelselect');
const engine = args.get('engine') ?? 'chromium';
const [W, H] = (args.get('geom') ?? '932x430').split('x').map(Number) as [number, number];
fs.mkdirSync(out, { recursive: true });

const SEED = `(() => {
  const mk = (time, medal) => JSON.stringify({ time, faults: 0, medal });
  localStorage.setItem('trials.best.b1-first-ride', mk(41.2, 'gold'));
  localStorage.setItem('trials.best.b2-lean-back', mk(47.9, 'silver'));
  localStorage.setItem('trials.best.b3-kicker-row', mk(58.1, 'bronze'));
  localStorage.setItem('trials.best.e1-uphill-weight', mk(52.4, 'silver'));
  localStorage.setItem('trials.best.e2-rear-wheel-first', mk(66.8, 'bronze'));
  localStorage.setItem('trials.best.e3-stairway@pro', mk(61.3, 'silver'));
  localStorage.setItem('trials.onboarded', '1');
})()`;

const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: out, size: { width: W, height: H } },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(SEED);
const page = await ctx.newPage();
const t: Record<string, number | string | boolean> = {};
const t0 = Date.now();
const mark = (k: string): void => { t[k] = Date.now() - t0; };
const centre = (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const tap = async (sel: string): Promise<boolean> => { const c = await centre(sel); if (!c) return false; await page.touchscreen.tap(c.x, c.y); return true; };
const cam = () => page.evaluate(() => { const s = document.querySelector<HTMLElement>('.tscene')!; return { zoom: Number(s.dataset['zoom']), x: Number(s.dataset['x']), y: Number(s.dataset['y']), far: s.classList.contains('far'), region: document.querySelector<HTMLElement>('.tm.on')?.dataset['id'], focused: document.querySelector<HTMLElement>('.tpin.on')?.dataset['track'] }; });
/** Wait until the camera has held still for 400 ms (a fly is a 380 ms tween on rAF; SwiftShader frames can take 300 ms). */
const settle = async (): Promise<void> => { let last = JSON.stringify(await cam()); const t0 = Date.now(); while (Date.now() - t0 < 4000) { await page.waitForTimeout(400); const now = JSON.stringify(await cam()); if (now === last) return; last = now; } };
const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]): Promise<void> => { if (cdp) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) }); };
const drag = async (x0: number, y0: number, dx: number, dy: number, steps = 14): Promise<void> => { await touch('touchStart', [{ x: x0, y: y0 }]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }]); await page.waitForTimeout(16); } await touch('touchEnd', []); };
const pinch = async (cx: number, cy: number, s0: number, s1: number, steps = 14): Promise<void> => { const at = (sp: number) => [{ x: cx - sp / 2, y: cy }, { x: cx + sp / 2, y: cy }]; await touch('touchStart', at(s0)); for (let i = 1; i <= steps; i++) { await touch('touchMove', at(s0 + ((s1 - s0) * i) / steps)); await page.waitForTimeout(16); } await touch('touchEnd', []); };
const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
let taps = 0;
try {
  await page.goto(`${url}/?sw=0`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 60000 });
  mark('menuLive');
  await page.waitForTimeout(600);
  await tap('.menu-screen.live .menu-item[data-id=play]'); taps++;
  await page.waitForFunction(() => !!document.querySelector('.tracks-screen.live'), null, { timeout: 20000 });
  mark('tracksLive');
  await page.waitForFunction(() => [...document.querySelectorAll('.ttile .tart')].every((p) => p.classList.contains('loaded')), null, { timeout: 20000 }).catch(() => undefined);
  await settle();
  t['opening'] = JSON.stringify(await cam());
  await page.waitForTimeout(500);
  // Zoom out to the whole mountain.
  await pinch(W * 0.5, H * 0.5, 280, 40);
  await pinch(W * 0.5, H * 0.5, 280, 40);
  await settle();
  t['far'] = JSON.stringify(await cam());
  t['pinsOnScreenFar'] = await page.evaluate(() => { const m = document.querySelector('.tmap')!.getBoundingClientRect(); return [...document.querySelectorAll<HTMLElement>('.tpin')].filter((p) => { const d = p.querySelector('.disc')!.getBoundingClientRect(); const cx = d.left + d.width / 2, cy = d.top + d.height / 2; return cx >= m.left && cx <= m.right && cy >= m.top && cy <= m.bottom; }).length; });
  t['artLoaded'] = await page.evaluate(() => `${document.querySelectorAll('.tseam.loaded').length}/5 seams · massif ${document.querySelector('.tmass.loaded') ? 'yes' : 'no'} · ${document.querySelectorAll('.tdress.loaded').length}/3 sprites`);
  await page.waitForTimeout(900);
  // Pan up the climb at a working zoom: zoom in on the apron first, then drag the world down (the camera rides up) in three strokes.
  const apron = await centre('.tregion[data-page=island]');
  await pinch(apron!.x, apron!.y, 60, 300);
  await pinch(apron!.x, apron!.y, 60, 260);
  await settle();
  t['foot'] = JSON.stringify(await cam());
  for (let i = 0; i < 3; i++) { await drag(W * 0.6, H * 0.35, -120, 220, 18); await page.waitForTimeout(500); }
  await settle();
  t['climbed'] = JSON.stringify(await cam());
  // Zoom into Snow: the rung frames it, then a pinch in on M2.
  await tap('.tmini .tm[data-id=snow]'); taps++;
  await settle();
  const m2 = await centre('.tpin[data-track=m2-drum-roll]');
  if (m2) await pinch(m2.x, m2.y, 80, 200);
  await settle();
  t['snow'] = JSON.stringify(await cam());
  const tapsBeforeLaunch = taps;
  await tap('.tpin[data-track=m2-drum-roll]'); taps++;
  await page.waitForTimeout(450);
  t['m2Focused'] = JSON.stringify(await cam());
  await tap('.tpin[data-track=m2-drum-roll]'); taps++;
  mark('tapM2');
  await page.waitForFunction(() => window.__trials?.app?.screen?.() === 'run' && ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 60000 });
  mark('runScreen');
  t['tapsMenuToM2'] = taps - tapsBeforeLaunch + 1; // PLAY + the two M2 taps (focus, launch) — the pinches, pans and rung tap were the demonstration, not the path
  await page.waitForFunction(() => window.__trials?.phase?.() === 'riding', null, { timeout: 60000 }).catch(() => undefined);
  mark('riding');
  t['track'] = await page.evaluate(() => window.__trials!.info().trackId);
  // Ride 3 s: hold the throttle zone (right half, right side).
  const gx = W * 0.88, gy = H * 0.7;
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gx, y: gy }] });
  else await page.touchscreen.tap(gx, gy);
  await page.waitForTimeout(3000);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  t['runTimeAfter3s'] = await page.evaluate(() => window.__trials!.runTime());
  t['bikeX'] = await page.evaluate(() => Math.round(window.__trials!.getState().bike.pos.x * 100) / 100);
  mark('rideEnd');
  // Back: pause → Quit (to the menu).
  await tap('.tz-pause'); taps++;
  await page.waitForFunction(() => !!document.querySelector('.pause-overlay.live'), null, { timeout: 10000 });
  await tap('.pause-overlay.live .tile[data-id=quit]'); taps++;
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 20000 });
  mark('backInMenu');
  t['taps'] = taps;
  t['navLog'] = JSON.stringify(await page.evaluate(() => window.__trials!.navLog?.().slice(-6) ?? null));
} finally {
  const video = page.video();
  await page.close();
  await ctx.close();
  await browser.close();
  const p = await video?.path();
  if (p) {
    const dst = path.join(out, `${engine}-${W}x${H}-climb.webm`);
    fs.renameSync(p, dst);
    t['clip'] = dst;
  }
}
fs.writeFileSync(path.join(out, `${engine}-${W}x${H}-climb.json`), JSON.stringify(t, null, 1));
console.log(JSON.stringify(t, null, 1));
