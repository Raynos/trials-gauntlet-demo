/**
 * Headless stills + measurements of the world map (the level select; project/archive/WORLD_MAP.md) on Chromium or WebKit at
 * phone / desktop geometries: the opening camera (centred on the current track at region zoom), a drag-pan across two
 * regions, a pinch out to the whole continent, a tap into Night City, the locked H1 (its rule on the plate, the card,
 * the gate and the RIDE pill), the focused card on B1; per state the camera (zoom, bounds, focused track, markers on
 * screen, region plates decoded), the scroll axes (must be none — the map is a transform), page overflow, tappable
 * sizes and overlaps, nodes in the scene. Evidence lives in docs/evidence/world-map/round<N>/.
 *   npx tsx harness/e2e/worldmap-stills.mts --url=http://127.0.0.1:4178 --out=DIR [--engine=chromium|webkit] [--geom=932x430,844x390,1280x720] [--seed=1] [--last=b1-first-ride] [--states=open]
 * `--seed=1` writes the seeded state (6 / 15 cleared: B1 gold, B2 silver, B3 bronze, E1 silver, E2 bronze, E3 silver on Pro) before PLAY.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, type Page } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const url = args.get('url') ?? 'http://127.0.0.1:4178';
const out = args.get('out') ?? path.join(process.cwd(), 'caps');
const engine = args.get('engine') ?? 'chromium';
const geoms = (args.get('geom') ?? '932x430,844x390').split(',').map((g) => { const [w, h] = g.split('x').map(Number); return { name: g, width: w!, height: h! }; });
const seed = args.get('seed') === '1';
/** `--last=<track id>`: the last played track (the map opens on it when its tier is open). */
const last = args.get('last') ?? '';
/** `--states=open` limits the run to the opening still (the side-by-side against the mockup). */
const onlyOpen = args.get('states') === 'open';
fs.mkdirSync(out, { recursive: true });

export const SEED_JS = `(() => {
  const mk = (time, medal) => JSON.stringify({ time, faults: 0, medal });
  localStorage.setItem('trials.best.b1-first-ride', mk(41.2, 'gold'));
  localStorage.setItem('trials.best.b2-lean-back', mk(47.9, 'silver'));
  localStorage.setItem('trials.best.b3-kicker-row', mk(58.1, 'bronze'));
  localStorage.setItem('trials.best.e1-uphill-weight', mk(52.4, 'silver'));
  localStorage.setItem('trials.best.e2-rear-wheel-first', mk(66.8, 'bronze'));
  localStorage.setItem('trials.best.e3-stairway@pro', mk(61.3, 'silver'));
})()`;

async function boot(page: Page): Promise<void> {
  await page.goto(`${url}/?sw=0`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 60000 });
}

/** One-finger drag on the map (touch): `steps` moves over ~`ms`. */
async function drag(page: Page, x0: number, y0: number, dx: number, dy: number, steps = 12): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Two-finger pinch about (`cx`, `cy`): the fingers' span goes from `s0` to `s1` px. */
async function pinch(page: Page, cx: number, cy: number, s0: number, s1: number, steps = 12): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (s: number) => [{ x: cx - s / 2, y: cy, id: 0 }, { x: cx + s / 2, y: cy, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(s0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(s0 + ((s1 - s0) * i) / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Everything the harness reads off the world map (runs in the page). */
export const MEASURE_JS = `(() => {
  const view = document.querySelector('.wm-view');
  const scene = document.querySelector('.wm-scene');
  const axes = [];
  for (const el of document.querySelectorAll('.worldmap-screen *')) {
    const cs = getComputedStyle(el);
    const sx = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    const sy = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    if (sx) axes.push('x:' + el.className);
    if (sy) axes.push('y:' + el.className);
  }
  const m = view.getBoundingClientRect();
  const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 2 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
  const targets = [...document.querySelectorAll('.worldmap-screen button')].filter((b) => vis(b) && getComputedStyle(b).pointerEvents !== 'none' && getComputedStyle(b).visibility !== 'hidden').map((b) => { const r = b.getBoundingClientRect(); const wrap = b.closest('[data-track]'); return { sel: b.className.split(' ').slice(0, 2).join('.') + (wrap && wrap.dataset.track ? '[' + wrap.dataset.track + ']' : ''), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; });
  const small = targets.filter((t) => t.w < 44 || t.h < 44);
  const overlaps = [];
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) { const a = targets[i], b = targets[j]; const nested = (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) || (b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h); if (nested) continue; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ox > 4 && oy > 4) overlaps.push(a.sel + ' x ' + b.sel + ' ' + ox + 'x' + oy); }
  const on = document.querySelector('.wm-marker.on');
  const markersOnScreen = [...document.querySelectorAll('.wm-marker')].filter((p) => { const d = p.querySelector('.wm-hit').getBoundingClientRect(); const cx = d.left + d.width / 2, cy = d.top + d.height / 2; return cx >= m.left && cx <= m.right && cy >= m.top && cy <= m.bottom; }).map((p) => p.dataset.track);
  const rect = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const gate = document.querySelector('.wm-gate');
  const card = document.querySelector('.wm-card');
  const ride = document.querySelector('.wm-ride');
  const plates = [...document.querySelectorAll('.wm-region.loaded')].map((p) => p.dataset.region);
  return { page: window.__trials.app && window.__trials.app.screen(), region: scene.dataset.region, focused: scene.dataset.track, camera: { zoom: Number(scene.dataset.zoom), x: Number(scene.dataset.x), y: Number(scene.dataset.y), far: scene.dataset.far === '1' }, world: document.querySelector('.wm-world').classList.contains('loaded'), plates, tierOpacity: Number(document.querySelector('.wm-tier').style.opacity), viewBox: rect(m), axes, pageOverflow: Math.max(0, document.documentElement.scrollHeight - innerHeight) + Math.max(0, document.documentElement.scrollWidth - innerWidth), targets: targets.length, small, overlaps, focusedOn: on && on.dataset.track, markersOnScreen, gateOnScreen: !!gate && vis(gate.querySelector('.wm-hit')), gateText: gate && gate.textContent, card: rect(card.getBoundingClientRect()), cardText: card.textContent, cardRule: (card.querySelector('.rule') || {}).textContent || null, plateRule: on && on.querySelector('.wm-rule') ? on.querySelector('.wm-rule').textContent : null, ride: { text: ride.textContent, disabled: ride.disabled }, ghost: !document.querySelector('.wm-ghost').hidden, sceneNodes: scene.querySelectorAll('*').length, progress: document.querySelector('.wm-progress').textContent, names: [...document.querySelectorAll('.wm-name')].map((n) => n.textContent) };
})()`;

const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report: Record<string, unknown> = {};
try {
  for (const g of geoms) {
    const phone = g.width < 1100;
    const ctx = await browser.newContext({ viewport: { width: g.width, height: g.height }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone,
      ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}) });
    if (seed) await ctx.addInitScript(SEED_JS);
    if (last) await ctx.addInitScript(`localStorage.setItem('trials.lastTrack', ${JSON.stringify(last)})`);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
    await boot(page);
    const tapSel = async (sel: string): Promise<boolean> => {
      const c = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
      if (!c) return false;
      if (phone) await page.touchscreen.tap(c.x, c.y);
      else await page.mouse.click(c.x, c.y);
      return true;
    };
    // Menu → PLAY.
    await page.waitForTimeout(400);
    await tapSel('.menu-screen.live .menu-item[data-id=play]');
    await page.waitForFunction(() => !!document.querySelector('.worldmap-screen.live'), null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.wm-world')?.classList.contains('loaded'), null, { timeout: 20000 }).catch(() => undefined);
    await page.waitForFunction(() => !!document.querySelector('.wm-region.loaded'), null, { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const measure = () => page.evaluate(MEASURE_JS);
    const shot = async (name: string): Promise<void> => { await page.screenshot({ path: path.join(out, `${engine}-${g.name}-${name}.png`) }); };
    // A fly is a 380 ms tween on rAF; under SwiftShader a frame can take 300+ ms, so wait until the camera has held still for 400 ms (up to 4 s).
    const settle = async (): Promise<void> => {
      const cam = () => page.evaluate(() => { const s = document.querySelector<HTMLElement>('.wm-scene')!; return `${s.dataset['zoom']}/${s.dataset['x']}/${s.dataset['y']}`; });
      let last = await cam();
      const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        await page.waitForTimeout(400);
        const now = await cam();
        if (now === last) return;
        last = now;
      }
    };
    report[`open@${g.name}`] = await measure();
    await shot('1-open');
    if (onlyOpen) { await ctx.close(); continue; }
    if (engine === 'chromium' && phone) {
      // Drag-pan: one finger, from the Industrial docks up the road into the Canyon (two regions).
      await drag(page, g.width * 0.55, g.height * 0.3, -60, 260);
      await settle();
      report[`pan@${g.name}`] = await measure();
      await shot('2-pan');
      // Pinch out to the whole continent (the fit zoom): the plates fold away.
      await pinch(page, g.width * 0.5, g.height * 0.5, 300, 40);
      await pinch(page, g.width * 0.5, g.height * 0.5, 300, 40);
      await settle();
      report[`far@${g.name}`] = await measure();
      await shot('3-far');
      // A tap on Night City when far flies to its nearest marker at region zoom.
      await tapSel('.wm-name[data-region=nightCity]');
      await settle();
      await page.waitForTimeout(600);
      report[`nightcity@${g.name}`] = await measure();
      await shot('4-nightcity');
    } else {
      // WebKit / desktop: arrow keys step the markers along the road into Night City.
      for (let i = 0; i < 6; i++) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(160); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(260); } // M1 → E1 E2 E3 M2 X1 H1
      await settle();
      report[`nightcity@${g.name}`] = await measure();
      await shot('4-nightcity');
    }
    // Locked marker: a tap on H1 — it shakes and states its rule on its plate, the card, the gate and the pill.
    await tapSel('.wm-marker[data-track=h1-wheelie-wire] .wm-hit');
    await settle();
    await page.waitForTimeout(200);
    await shot('5-locked-h1');
    report[`locked@${g.name}`] = await measure();
    // Fly to B1: arrow keys walk the road back (a pause per press — the app polls keys per frame, and a SwiftShader frame is slow).
    for (let i = 0; i < 9; i++) { await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(160); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(260); }
    await settle();
    await page.waitForTimeout(400);
    await shot('6-focused-b1');
    report[`card@${g.name}`] = await measure();
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(out, `${engine}-report.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
