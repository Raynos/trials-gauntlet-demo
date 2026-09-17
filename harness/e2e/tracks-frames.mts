/**
 * Frame timing inside the world-map track select (Chromium / SwiftShader, so relative not absolute): rAF intervals
 * while the map idles, during a one-finger drag, and through its inertia, plus the scene's node count and the
 * main-thread cost of a camera push (the transform + the pin shading), sampled from the page.
 *   npx tsx harness/e2e/tracks-frames.mts --url=http://127.0.0.1:4178 --out=DIR [--geom=932x430]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const url = args.get('url') ?? 'http://127.0.0.1:4178';
const out = args.get('out') ?? path.join(process.cwd(), 'harness', 'out', 'levelselect');
const [W, H] = (args.get('geom') ?? '932x430').split('x').map(Number) as [number, number];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) });
const stats = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? 0; return { n: s.length, p50: q(0.5), p90: q(0.9), max: s[s.length - 1] ?? 0 }; };
try {
  await page.goto(`${url}/?sw=0`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const c = await page.evaluate(() => { const r = document.querySelector('.menu-screen.live .menu-item[data-id=play]')!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForFunction(() => !!document.querySelector('.tracks-screen.live'), null, { timeout: 20000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.ttile .tart')].every((p) => p.classList.contains('loaded')), null, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  // A rAF sampler in the page: records intervals between frames into window.__fr until stopped.
  const start = () => page.evaluate(`(() => { window.__fr = []; let last = performance.now(); const f = (t) => { window.__fr.push(t - last); last = t; if (window.__on) requestAnimationFrame(f); }; window.__on = true; requestAnimationFrame(f); })()`);
  const stop = () => page.evaluate(`(() => { window.__on = false; return window.__fr; })()`) as Promise<number[]>;
  const r: Record<string, unknown> = { geom: `${W}x${H}`, engine: 'chromium/swiftshader' };
  await start(); await page.waitForTimeout(2000); r['idleFrameMs'] = stats(await stop());
  await start();
  await touch('touchStart', [{ x: W * 0.55, y: H * 0.55 }]);
  for (let i = 1; i <= 40; i++) { await touch('touchMove', [{ x: W * 0.55 - i * 5, y: H * 0.55 + i * 3 }]); await page.waitForTimeout(16); }
  r['dragFrameMs'] = stats(await stop());
  await start();
  await touch('touchEnd', []);
  await page.waitForTimeout(1200);
  r['inertiaFrameMs'] = stats(await stop());
  // Main-thread cost of one camera push: dispatch 200 synthetic pointer moves on the map and time them (the handler is the push).
  r['pushCamUs'] = await page.evaluate(`(() => { const m = document.querySelector('.tmap'); const ev = (t, x, y) => new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }); m.dispatchEvent(ev('pointerdown', 400, 200)); const t0 = performance.now(); for (let i = 0; i < 200; i++) window.dispatchEvent(ev('pointermove', 400 + (i % 20), 200 + (i % 7))); const dt = performance.now() - t0; window.dispatchEvent(ev('pointerup', 420, 207)); return Math.round((dt / 200) * 1000); })()`);
  r['sceneNodes'] = await page.evaluate(() => document.querySelector('.tscene')!.querySelectorAll('*').length);
  r['pins'] = await page.evaluate(() => document.querySelectorAll('.tpin').length);
  r['plateBytes'] = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/art/tiles/')).map((e) => ({ file: e.name.split('/').pop(), bytes: (e as PerformanceResourceTiming).transferSize || (e as PerformanceResourceTiming).encodedBodySize })));
  fs.writeFileSync(path.join(out, `frames-${W}x${H}.json`), JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r, null, 1));
} finally {
  await browser.close();
}
