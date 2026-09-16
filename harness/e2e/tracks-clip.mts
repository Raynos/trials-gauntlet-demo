/**
 * Played clip of the diorama track select (evidence is played, never posed):
 *   menu → PLAY → (opens on M1, the seeded next track) → snap to Canyon → snap back → tap M1 → ride 3 s (throttle held) → pause → Quit (to the menu).
 * Seeded state = round 1's (Beginner + Easy medalled, 6 / 15); onboarding pre-dismissed so the ride is 3 s of riding.
 *   npx tsx harness/e2e/tracks-clip.mts --url=http://127.0.0.1:4178 --out=DIR [--engine=chromium|webkit] [--geom=932x430]
 * Writes <out>/<engine>-<geom>-clip.webm + a JSON of the timings (taps to launch, snap count, restart latency read from the hook).
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
  t['opening'] = await page.evaluate(() => `${document.querySelector<HTMLElement>('.tm.on')?.dataset['id']} / ${document.querySelector<HTMLElement>('.tpin.on')?.dataset['track']}`);
  t['totals'] = await page.evaluate(() => document.querySelector('.tracks-totals')?.textContent ?? '');
  await page.waitForTimeout(700);
  // Snap: Canyon, then back to Industrial (the miniature row).
  await tap('.tmini .tm[data-id=canyon]'); taps++;
  await page.waitForTimeout(900);
  t['afterSnap'] = await page.evaluate(() => `${document.querySelector<HTMLElement>('.tm.on')?.dataset['id']} / ${document.querySelector<HTMLElement>('.tpin.on')?.dataset['track']} @ ${Math.round(document.querySelector('.tmap')!.scrollLeft)}`);
  await tap('.tmini .tm[data-id=industrial]'); taps++;
  await page.waitForTimeout(900);
  // M1 is the page's focus (UP NEXT): one tap launches.
  const tapsBeforeLaunch = taps;
  await tap('.tpin[data-track=m1-hop-up]'); taps++;
  mark('tapM1');
  await page.waitForFunction(() => window.__trials?.app?.screen?.() === 'run' && ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 60000 });
  mark('runScreen');
  t['tapsMenuToM1'] = taps - tapsBeforeLaunch + 1; // PLAY + the M1 tap (the two snaps were the demonstration, not the path)
  await page.waitForFunction(() => window.__trials?.phase?.() === 'riding', null, { timeout: 60000 }).catch(() => undefined);
  mark('riding');
  t['track'] = await page.evaluate(() => window.__trials!.info().trackId);
  // Ride 3 s: hold the throttle zone (right half, right side).
  const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
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
