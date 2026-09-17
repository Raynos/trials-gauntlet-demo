/**
 * Played clip of the world-map track select (evidence is played, never posed):
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
  t['pinsOnScreenAtOpen'] = await page.evaluate(() => { const m = document.querySelector('.tmap')!.getBoundingClientRect(); return [...document.querySelectorAll<HTMLElement>('.tpin')].filter((p) => { const d = p.querySelector('.disc')!.getBoundingClientRect(); const cx = d.left + d.width / 2, cy = d.top + d.height / 2; return cx >= m.left && cx <= m.right && cy >= m.top && cy <= m.bottom; }).map((p) => p.dataset['track']).join(','); });
  t['totals'] = await page.evaluate(() => document.querySelector('.tracks-totals')?.textContent ?? '');
  await page.waitForTimeout(500);
  // Drag-pan: one finger, up the trail (the mountain climbs up-right).
  await drag(W * 0.55, H * 0.55, -170, 130);
  await settle();
  t['afterPan'] = JSON.stringify(await cam());
  // Pinch-zoom out to the whole mountain (twice: the fit zoom is ~0.2 from 1.3).
  await pinch(W * 0.5, H * 0.5, 280, 40);
  await pinch(W * 0.5, H * 0.5, 280, 40);
  await settle();
  t['afterPinchOut'] = JSON.stringify(await cam());
  t['zoomRange'] = await page.evaluate(() => { const s = document.querySelector<HTMLElement>('.tscene')!; return `min ${s.dataset['zoom']} (fit) · open 1.3 · max 2`; });
  await page.waitForTimeout(600);
  // Zoom back in: a tap on the map when zoomed out flies to the nearest pin at the opening zoom.
  await tap('.tregion[data-page=snow]'); taps++;
  await settle();
  t['afterZoomIn'] = JSON.stringify(await cam());
  // H1 (locked): the NIGHT CITY rung, then a tap on the pin — it shakes and the card states the rule.
  await tap('.tmini .tm[data-id=nightCity]'); taps++;
  await settle();
  await tap('.tpin[data-track=h1-wheelie-wire]'); taps++;
  await page.waitForTimeout(500);
  t['lockedH1'] = await page.evaluate(() => `${document.querySelector('.tcard .tc-rule')?.textContent} · pin: ${document.querySelector('.tpin[data-track=h1-wheelie-wire] .rule')?.textContent} · ride: ${document.querySelector<HTMLButtonElement>('.tcard .tc-ride')?.textContent}/${document.querySelector<HTMLButtonElement>('.tcard .tc-ride')?.disabled}`);
  t['gateText'] = await page.evaluate(() => document.querySelector('.gate')?.textContent ?? '');
  // Back to Industrial, B1: the first tap focuses (the card rises), the second launches.
  await tap('.tmini .tm[data-id=industrial]'); taps++;
  await settle();
  const tapsBeforeLaunch = taps;
  await tap('.tpin[data-track=b1-first-ride]'); taps++;
  await page.waitForTimeout(450);
  t['b1Focused'] = JSON.stringify(await cam());
  await tap('.tpin[data-track=b1-first-ride]'); taps++;
  mark('tapB1');
  await page.waitForFunction(() => window.__trials?.app?.screen?.() === 'run' && ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 60000 });
  mark('runScreen');
  t['tapsMenuToB1'] = taps - tapsBeforeLaunch + 1; // PLAY + the two B1 taps (focus, launch) — the pans, pinches and rung taps were the demonstration, not the path; with B1 last played it is PLAY + one tap
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
    const dst = path.join(out, `${engine}-${W}x${H}-clip.webm`);
    fs.renameSync(p, dst);
    t['clip'] = dst;
  }
}
fs.writeFileSync(path.join(out, `${engine}-${W}x${H}-clip.json`), JSON.stringify(t, null, 1));
console.log(JSON.stringify(t, null, 1));
