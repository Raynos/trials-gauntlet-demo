/**
 * One played clip of the world map (the level select; project/archive/WORLD_MAP.md), phone geometry, seeded 6 / 15:
 *   menu → PLAY → (opens on the current track: M1, the seeded next track, at region zoom) → drag-pan from the Industrial
 *   docks across into the Canyon → pinch out to the whole continent → into each of the five zones (tap the name, pinch in
 *   to fill the view with its plate, pinch back out) → tap Night City (flies to its nearest marker) → tap
 *   H1 (locked: shakes, its rule on the plate, the card, the gate, the pill) → the gate's plate → fly to B1 (the road
 *   back, one key per step) → RIDE → 3 s of throttle → pause → Quit → menu.
 *   npx tsx harness/e2e/worldmap-clip.mts --url=http://127.0.0.1:4178 --out=DIR [--engine=chromium|webkit] [--geom=932x430]
 * Writes <out>/<engine>-<geom>-clip.webm + a JSON of the timings (taps to B1, the camera at each step, plate bytes).
 * The drag and the pinch go through CDP touch events (Chromium); WebKit steps the markers with the keys instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const url = args.get('url') ?? 'http://127.0.0.1:4178';
const out = args.get('out') ?? path.join(process.cwd(), 'harness', 'out', 'worldmap');
const engine = args.get('engine') ?? 'chromium';
const [W, H] = (args.get('geom') ?? '932x430').split('x').map(Number) as [number, number];
fs.mkdirSync(out, { recursive: true });

const SEED = `(() => {
  const mk = (time, medal) => JSON.stringify({ time, faults: 0, medal });
  localStorage.setItem('rockhop.best.b1-first-ride', mk(41.2, 'gold'));
  localStorage.setItem('rockhop.best.b2-lean-back', mk(47.9, 'silver'));
  localStorage.setItem('rockhop.best.b3-kicker-row', mk(58.1, 'bronze'));
  localStorage.setItem('rockhop.best.e1-uphill-weight', mk(52.4, 'silver'));
  localStorage.setItem('rockhop.best.e2-rear-wheel-first', mk(66.8, 'bronze'));
  localStorage.setItem('rockhop.best.e3-stairway@pro', mk(61.3, 'silver'));
  localStorage.setItem('rockhop.onboarded', '1');
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
const cam = () => page.evaluate(() => { const s = document.querySelector<HTMLElement>('.wm-scene')!; return { zoom: Number(s.dataset['zoom']), x: Number(s.dataset['x']), y: Number(s.dataset['y']), far: s.dataset['far'] === '1', region: s.dataset['region'], focused: s.dataset['track'], plates: document.querySelectorAll('.wm-region.loaded').length }; });
/** Wait until the camera has held still for 400 ms (a fly is a 380 ms tween on rAF; SwiftShader frames can take 300 ms). */
const settle = async (): Promise<void> => { let last = JSON.stringify(await cam()); const t0 = Date.now(); while (Date.now() - t0 < 4000) { await page.waitForTimeout(400); const now = JSON.stringify(await cam()); if (now === last) return; last = now; } };
const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]): Promise<void> => { if (cdp) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) }); };
const drag = async (x0: number, y0: number, dx: number, dy: number, steps = 14): Promise<void> => { await touch('touchStart', [{ x: x0, y: y0 }]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }]); await page.waitForTimeout(16); } await touch('touchEnd', []); };
const pinch = async (cx: number, cy: number, s0: number, s1: number, steps = 14): Promise<void> => { const at = (sp: number) => [{ x: cx - sp / 2, y: cy }, { x: cx + sp / 2, y: cy }]; await touch('touchStart', at(s0)); for (let i = 1; i <= steps; i++) { await touch('touchMove', at(s0 + ((s1 - s0) * i) / steps)); await page.waitForTimeout(16); } await touch('touchEnd', []); };
/** One key per step, held across a frame: the app polls keys per frame, and a SwiftShader frame can outlast a press. */
const key = async (k: string, n = 1): Promise<void> => { for (let i = 0; i < n; i++) { await page.keyboard.down(k); await page.waitForTimeout(320); await page.keyboard.up(k); await page.waitForTimeout(420); } };
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
  await page.waitForFunction(() => document.querySelector('.wm-world')?.classList.contains('loaded'), null, { timeout: 20000 }).catch(() => undefined);
  mark('worldPlate');
  await page.waitForFunction(() => document.querySelectorAll('.wm-region.loaded').length >= 1, null, { timeout: 20000 }).catch(() => undefined);
  mark('regionPlate');
  await page.waitForTimeout(700);
  t['open'] = JSON.stringify(await cam());
  if (cdp) {
    // Drag-pan: from the docks up the road into the Canyon (two regions), a little inertia at the end.
    await drag(W * 0.55, H * 0.25, -40, 250);
    await settle();
    t['afterPan'] = JSON.stringify(await cam());
    await page.waitForTimeout(400);
    // Pinch out to the whole continent.
    await pinch(W * 0.5, H * 0.5, 320, 40);
    await pinch(W * 0.5, H * 0.5, 320, 40);
    await settle();
    t['afterPinchOut'] = JSON.stringify(await cam());
    await page.waitForTimeout(600);
    // Every zone: from the continent, a tap on the region's name flies to its nearest marker at region zoom, a pinch
    // in fills the view with that region's plate, then back out to the continent (the user judges every plate).
    for (const region of ['industrial', 'canyon', 'snow', 'nightCity', 'foundry']) {
      // Out to the continent first (a name only flies when the map is far; a pinch can be swallowed by a stalled frame).
      for (let i = 0; i < 4 && !(await cam()).far; i++) { await pinch(W * 0.5, H * 0.5, 330, 40); await settle(); }
      // The continent is taller than the phone's view: drag the region's name into the middle first, then tap it.
      for (let i = 0; i < 3; i++) {
        const c = await centre(`.wm-name[data-region=${region}]`);
        if (!c) break;
        const dx = Math.max(-W * 0.4, Math.min(W * 0.4, W / 2 - c.x)), dy = Math.max(-H * 0.4, Math.min(H * 0.4, H / 2 - c.y));
        if (Math.abs(dx) < 30 && Math.abs(dy) < 30) break;
        await drag(W / 2, H / 2, dx, dy, 10); await settle();
      }
      await tap(`.wm-name[data-region=${region}]`); taps++;
      await settle();
      await pinch(W * 0.42, H * 0.5, 60, 330);
      await settle();
      t[`zone:${region}`] = JSON.stringify(await cam());
      await page.waitForTimeout(700);
      await pinch(W * 0.5, H * 0.5, 330, 40);
      await pinch(W * 0.5, H * 0.5, 330, 40);
      await settle();
    }
    // Tap Night City: the nearest marker (H1) at region zoom.
    await tap('.wm-name[data-region=nightCity]'); taps++;
    await settle();
  } else {
    await key('ArrowRight', 6); // M1 → E1 E2 E3 M2 X1 H1
    await settle();
  }
  t['nightCity'] = JSON.stringify(await cam());
  await page.waitForTimeout(500);
  // H1 is focused and locked: a tap shakes it and states the rule everywhere.
  await tap('.wm-marker[data-track=h1-wheelie-wire] .wm-hit'); taps++;
  await page.waitForTimeout(500);
  t['lockedH1'] = JSON.stringify(await page.evaluate(() => ({ cardRule: document.querySelector('.wm-card .rule')?.textContent ?? null, plateRule: document.querySelector('.wm-marker[data-track=h1-wheelie-wire] .wm-rule')?.textContent ?? null, gate: document.querySelector('.wm-gate .wm-plate')?.textContent ?? null, ride: document.querySelector<HTMLButtonElement>('.wm-ride')?.textContent, rideDisabled: document.querySelector<HTMLButtonElement>('.wm-ride')?.disabled, screen: window.__rockhop?.app?.screen?.() })));
  // The gate's chevrons are a tap away: they focus the next unlock (H1 again) — then the road back to B1.
  await tap('.wm-gate .wm-hit'); taps++;
  await settle();
  const tapsBeforeLaunch = taps;
  await key('ArrowLeft', 9); // H1 → X1 M2 E3 E2 E1 M1 B3 B2 B1
  await settle();
  t['b1'] = JSON.stringify(await cam());
  const focused = await page.evaluate(() => document.querySelector<HTMLElement>('.wm-scene')!.dataset['track']);
  if (focused !== 'b1-first-ride' && cdp) {
    // Keys coalesced under load: from the continent, a tap where B1 stands flies to it (the nearest marker).
    await pinch(W * 0.5, H * 0.5, 330, 40); await pinch(W * 0.5, H * 0.5, 330, 40); await settle();
    await tap('.wm-marker[data-track=b1-first-ride] .wm-hit'); taps++; await settle();
  }
  await page.waitForTimeout(450);
  // RIDE.
  await tap('.wm-ride'); taps++;
  mark('tapRide');
  await page.waitForFunction(() => window.__rockhop?.app?.screen?.() === 'run' && ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 60000 });
  mark('runScreen');
  t['tapsMenuToB1'] = taps - tapsBeforeLaunch + 1; // PLAY + RIDE (+ the B1 tap when the keys were coalesced) — the pans, pinches and Night City were the demonstration, not the path
  await page.waitForFunction(() => window.__rockhop?.phase?.() === 'riding', null, { timeout: 60000 }).catch(() => undefined);
  mark('riding');
  t['track'] = await page.evaluate(() => window.__rockhop!.info().trackId);
  // Ride 3 s: hold the throttle zone (right half, right side).
  const gx = W * 0.88, gy = H * 0.7;
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gx, y: gy }] });
  else await page.touchscreen.tap(gx, gy);
  await page.waitForTimeout(3000);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  t['runTimeAfter3s'] = await page.evaluate(() => window.__rockhop!.runTime());
  t['bikeX'] = await page.evaluate(() => Math.round(window.__rockhop!.getState().bike.pos.x * 100) / 100);
  mark('rideEnd');
  // Back: pause → Quit (to the menu).
  await tap('.tz-pause'); taps++;
  await page.waitForFunction(() => !!document.querySelector('.pause-overlay.live'), null, { timeout: 10000 });
  await tap('.pause-overlay.live .tile[data-id=quit]'); taps++;
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 20000 });
  mark('backInMenu');
  t['taps'] = taps;
  t['plateBytes'] = JSON.stringify(await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\/art\/worldmap\//.test(e.name)).map((e) => ({ name: e.name.replace(/^.*\/art\/worldmap\//, ''), bytes: (e as PerformanceResourceTiming).encodedBodySize || (e as PerformanceResourceTiming).transferSize, ms: Math.round(e.duration) }))));
  t['navLog'] = JSON.stringify(await page.evaluate(() => window.__rockhop!.navLog?.().slice(-6) ?? null));
  await page.waitForTimeout(600);
} finally {
  await page.close();
  const v = page.video();
  const file = v ? await v.path() : null;
  await ctx.close();
  await browser.close();
  if (file) fs.renameSync(file, path.join(out, `${engine}-${W}x${H}-clip.webm`));
  t['engine'] = engine;
  t['geom'] = `${W}x${H}`;
  fs.writeFileSync(path.join(out, `${engine}-${W}x${H}-clip.json`), JSON.stringify(t, null, 1));
  console.log(JSON.stringify(t, null, 1));
}
