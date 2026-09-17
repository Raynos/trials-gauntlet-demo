/**
 * Frame timing inside the world map (the level select, docs/plans/WORLD_MAP.md; Chromium / SwiftShader, so relative
 * not absolute): rAF intervals while the map idles (the cloud drift and the beacon are the only animations), during a
 * one-finger drag, through its inertia and during a pinch, plus the scene's node count, the main-thread cost of a
 * camera push (the transform + the counter-scales + the tier blend) and the plate bytes, sampled from the page.
 *   npx tsx harness/e2e/worldmap-frames.mts --url=http://127.0.0.1:4178 --out=DIR [--geom=932x430] [--engine=chromium|webkit]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const url = args.get('url') ?? 'http://127.0.0.1:4178';
const out = args.get('out') ?? path.join(process.cwd(), 'harness', 'out', 'worldmap');
const [W, H] = (args.get('geom') ?? '932x430').split('x').map(Number) as [number, number];
/** `--engine=webkit`: the iOS proxy. Playwright's WebKit has no multi-touch, so the drag and the pinch are synthetic pointer events dispatched in the page, one step per animation frame — the same handlers a finger reaches. */
const engine = args.get('engine') ?? 'chromium';
fs.mkdirSync(out, { recursive: true });
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) => cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) });
/** In-page gesture: pointer events on the map, one step per rAF, the rAF intervals sampled meanwhile (WebKit; also the cross-engine reference). */
const synthetic = (kind: 'drag' | 'pinch', steps: number) => page.evaluate(`(async () => {
  const W = ${W}, H = ${H}, steps = ${steps}, kind = ${JSON.stringify(kind)};
  const view = document.querySelector('.wm-view');
  const ev = (t, id, x, y) => new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 });
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const fr = []; let last = performance.now();
  const tick = () => { const t = performance.now(); fr.push(t - last); last = t; };
  if (kind === 'drag') {
    view.dispatchEvent(ev('pointerdown', 1, W * 0.55, H * 0.55));
    for (let i = 1; i <= steps; i++) { window.dispatchEvent(ev('pointermove', 1, W * 0.55 - i * 5, H * 0.55 + i * 3)); await raf(); tick(); }
    window.dispatchEvent(ev('pointerup', 1, W * 0.55 - steps * 5, H * 0.55 + steps * 3));
    for (let i = 0; i < 40; i++) { await raf(); tick(); }
  } else {
    const at = (sp) => [[W * 0.5 - sp / 2, H * 0.5], [W * 0.5 + sp / 2, H * 0.5]];
    let [a, b] = at(300);
    view.dispatchEvent(ev('pointerdown', 1, a[0], a[1])); view.dispatchEvent(ev('pointerdown', 2, b[0], b[1]));
    for (let i = 1; i <= steps; i++) { [a, b] = at(300 - i * 10); window.dispatchEvent(ev('pointermove', 1, a[0], a[1])); window.dispatchEvent(ev('pointermove', 2, b[0], b[1])); await raf(); tick(); }
    for (let i = 1; i <= steps; i++) { [a, b] = at(60 + i * 10); window.dispatchEvent(ev('pointermove', 1, a[0], a[1])); window.dispatchEvent(ev('pointermove', 2, b[0], b[1])); await raf(); tick(); }
    window.dispatchEvent(ev('pointerup', 1, a[0], a[1])); window.dispatchEvent(ev('pointerup', 2, b[0], b[1]));
  }
  return fr;
})()`) as Promise<number[]>;
const stats = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? 0; return { n: s.length, p50: q(0.5), p90: q(0.9), max: s[s.length - 1] ?? 0 }; };
try {
  await page.goto(`${url}/?sw=0`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const c = await page.evaluate(() => { const r = document.querySelector('.menu-screen.live .menu-item[data-id=play]')!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForFunction(() => !!document.querySelector('.tracks-screen.live'), null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.wm-region.loaded').length === 5, null, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  // A rAF sampler in the page: records intervals between frames into window.__fr until stopped.
  const start = () => page.evaluate(`(() => { window.__fr = []; let last = performance.now(); const f = (t) => { window.__fr.push(t - last); last = t; if (window.__on) requestAnimationFrame(f); }; window.__on = true; requestAnimationFrame(f); })()`);
  const stop = () => page.evaluate(`(() => { window.__on = false; return window.__fr; })()`) as Promise<number[]>;
  const r: Record<string, unknown> = { geom: `${W}x${H}`, engine: engine === 'webkit' ? 'webkit (playwright, software)' : 'chromium/swiftshader', gestures: cdp ? 'cdp touch' : 'synthetic pointer events, one step per rAF' };
  await start(); await page.waitForTimeout(2000); r['idleFrameMs'] = stats(await stop());
  if (cdp) {
    await start();
    await touch('touchStart', [{ x: W * 0.55, y: H * 0.55 }]);
    for (let i = 1; i <= 40; i++) { await touch('touchMove', [{ x: W * 0.55 - i * 5, y: H * 0.55 + i * 3 }]); await page.waitForTimeout(16); }
    r['dragFrameMs'] = stats(await stop());
    await start();
    await touch('touchEnd', []);
    await page.waitForTimeout(1200);
    r['inertiaFrameMs'] = stats(await stop());
    // A pinch out and back (the region plates cross-fade, the world plate rasterises at the new scale).
    await start();
    const at = (sp: number) => [{ x: W * 0.5 - sp / 2, y: H * 0.5 }, { x: W * 0.5 + sp / 2, y: H * 0.5 }];
    await touch('touchStart', at(300));
    for (let i = 1; i <= 24; i++) { await touch('touchMove', at(300 - i * 10)); await page.waitForTimeout(16); }
    for (let i = 1; i <= 24; i++) { await touch('touchMove', at(60 + i * 10)); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    r['pinchFrameMs'] = stats(await stop());
  } else {
    // Synthetic: 40 drag steps then the inertia frames in one sample, and the pinch out-and-back in another.
    const drag = await synthetic('drag', 40);
    r['dragFrameMs'] = stats(drag.slice(0, 40));
    r['inertiaFrameMs'] = stats(drag.slice(40));
    r['pinchFrameMs'] = stats(await synthetic('pinch', 24));
    r['fps30Proxy'] = { drag: (r['dragFrameMs'] as { p90: number }).p90 <= 33.4, pinch: (r['pinchFrameMs'] as { p90: number }).p90 <= 33.4 };
  }
  // Main-thread cost of one camera push: dispatch 200 synthetic pointer moves on the map and time them (the handler is the push).
  r['pushCamUs'] = await page.evaluate(`(() => { const m = document.querySelector('.wm-view'); const ev = (t, x, y) => new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }); m.dispatchEvent(ev('pointerdown', 400, 200)); const t0 = performance.now(); for (let i = 0; i < 200; i++) window.dispatchEvent(ev('pointermove', 400 + (i % 20), 200 + (i % 7))); const dt = performance.now() - t0; window.dispatchEvent(ev('pointerup', 420, 207)); return Math.round((dt / 200) * 1000); })()`);
  r['sceneNodes'] = await page.evaluate(() => document.querySelector('.wm-scene')!.querySelectorAll('*').length);
  r['markers'] = await page.evaluate(() => document.querySelectorAll('.wm-marker').length);
  r['layers'] = await page.evaluate(() => ({ scene: 1, tier: 1, clouds: 1, haze: 1, chrome: document.querySelectorAll('.wm-brand, .wm-progress, .wm-actions, .backbtn').length }));
  r['plateBytes'] = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/art/worldmap/')).map((e) => ({ file: e.name.split('/').pop(), bytes: (e as PerformanceResourceTiming).transferSize || (e as PerformanceResourceTiming).encodedBodySize })));
  fs.writeFileSync(path.join(out, `frames-${engine}-${W}x${H}.json`), JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r, null, 1));
} finally {
  await browser.close();
}
