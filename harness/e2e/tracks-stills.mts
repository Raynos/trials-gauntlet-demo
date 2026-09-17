/**
 * Headless stills + measurements of the world-map track select (Chromium or WebKit, 932×430 and 844×390): the opening
 * camera (centred on the current track at the opening zoom), a drag-pan, a pinch-zoom out to the whole mountain, a zoom
 * back in, a locked-pin tap (H1, its rule), the focused card on B1, the apron; per state the camera (zoom, bounds, pins
 * on screen), the scroll axes (must be none — the map is a transform), tappable sizes and overlaps, nodes in the scene.
 * Evidence lives in docs/evidence/level-select/round4/.
 *   npx tsx harness/e2e/tracks-stills.mts --url=http://127.0.0.1:4178 --out=DIR [--engine=chromium|webkit] [--geom=932x430,844x390] [--seed=1]
 * `--seed=1` writes the round-1 seeded state (6 / 15 cleared: B1 gold, B2 silver, B3 bronze, E1 silver, E2 bronze, E3 silver on Pro) before PLAY.
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
fs.mkdirSync(out, { recursive: true });

const SEED_JS = `(() => {
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

const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report: Record<string, unknown> = {};
try {
  for (const g of geoms) {
    const ctx = await browser.newContext({ viewport: { width: g.width, height: g.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    if (seed) await ctx.addInitScript(SEED_JS);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
    await boot(page);
    const tapSel = async (sel: string): Promise<boolean> => {
      const c = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
      if (!c) return false;
      await page.touchscreen.tap(c.x, c.y);
      return true;
    };
    // Menu → PLAY.
    await page.waitForTimeout(400);
    await tapSel('.menu-screen.live .menu-item[data-id=play]');
    await page.waitForFunction(() => !!document.querySelector('.tracks-screen.live'), null, { timeout: 20000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.ttile .tart')].every((p) => p.classList.contains('loaded')), null, { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const measure = () => page.evaluate(`(() => {
      const map = document.querySelector('.tmap');
      const scene = document.querySelector('.tscene');
      const axes = [];
      for (const el of document.querySelectorAll('.tracks-screen *')) {
        const cs = getComputedStyle(el);
        const sx = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
        const sy = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
        if (sx) axes.push('x:' + el.className);
        if (sy) axes.push('y:' + el.className);
      }
      const m = map.getBoundingClientRect();
      const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 2 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
      const targets = [...document.querySelectorAll('.tracks-screen button')].filter((b) => vis(b) && getComputedStyle(b).pointerEvents !== 'none').map((b) => { const r = b.getBoundingClientRect(); return { sel: b.className.split(' ').slice(0, 2).join('.') + (b.dataset.track ? '[' + b.dataset.track + ']' : '') + (b.dataset.id ? '[' + b.dataset.id + ']' : ''), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; });
      const small = targets.filter((t) => t.w < 44 || t.h < 44);
      const overlaps = [];
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) { const a = targets[i], b = targets[j]; const nested = (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) || (b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h); if (nested) continue; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ox > 4 && oy > 4) overlaps.push(a.sel + ' x ' + b.sel + ' ' + ox + 'x' + oy); }
      const on = document.querySelector('.tpin.on');
      // Pins whose disc centre is inside the map box.
      const pinsOnScreen = [...document.querySelectorAll('.tpin')].filter((p) => { const d = p.querySelector('.disc').getBoundingClientRect(); const cx = d.left + d.width / 2, cy = d.top + d.height / 2; return cx >= m.left && cx <= m.right && cy >= m.top && cy <= m.bottom; }).map((p) => p.dataset.track);
      const safe = { alt: document.querySelector('.tmini').getBoundingClientRect(), card: document.querySelector('.tcard').getBoundingClientRect(), menu: document.querySelector('.tracks-screen .backbtn').getBoundingClientRect() };
      const rect = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
      const gate = document.querySelector('.gate');
      return { page: window.__trials.app && window.__trials.app.screen(), region: document.querySelector('.tm.on') && document.querySelector('.tm.on').dataset.id, camera: { zoom: Number(scene.dataset.zoom), x: Number(scene.dataset.x), y: Number(scene.dataset.y), far: scene.classList.contains('far') }, mapBox: rect(m), axes, pageOverflow: Math.max(0, document.documentElement.scrollHeight - innerHeight) + Math.max(0, document.documentElement.scrollWidth - innerWidth), targets: targets.length, small, overlaps, focused: on && on.dataset.track, pinsOnScreen, gateOnScreen: !!gate && vis(gate), gateText: gate && gate.textContent, altimeter: rect(safe.alt), card: rect(safe.card), menuPill: rect(safe.menu), sceneNodes: scene.querySelectorAll('*').length, totals: document.querySelector('.tracks-totals').textContent };
    })()`);
    const shot = async (name: string): Promise<void> => { await page.screenshot({ path: path.join(out, `${engine}-${g.name}-${name}.png`) }); };
    // A fly is a 380 ms tween on rAF; under SwiftShader a frame can take 300+ ms, so wait until the camera has held still for 400 ms (up to 4 s).
    const settle = async (): Promise<void> => {
      const cam = () => page.evaluate(() => { const s = document.querySelector<HTMLElement>('.tscene')!; return `${s.dataset['zoom']}/${s.dataset['x']}/${s.dataset['y']}`; });
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
    // The drag and the pinch go through CDP touch events (Chromium only; Playwright's WebKit has no multi-touch).
    if (engine === 'chromium') {
      // Drag-pan: one finger, up and to the left (the mountain climbs up-right, so this looks up the trail).
      await drag(page, g.width * 0.55, g.height * 0.55, -160, 120);
      await settle();
      report[`pan@${g.name}`] = await measure();
      await shot('2-pan');
      // Pinch out to the whole mountain (the fit zoom): the pins fold to dots.
      await pinch(page, g.width * 0.5, g.height * 0.5, 260, 40);
      await pinch(page, g.width * 0.5, g.height * 0.5, 260, 40);
      await settle();
      report[`far@${g.name}`] = await measure();
      await shot('3-far');
      // Zoom back in: a tap on the map when far flies to the nearest pin at the opening zoom.
      await tapSel('.tregion[data-page=canyon]');
      await settle();
      report[`near@${g.name}`] = await measure();
      await shot('4-near');
    } else {
      // WebKit: the Canyon rung flies there (a region frame), the same camera the far tap lands on.
      await tapSel('.tmini .tm[data-id=canyon]');
      await settle();
      report[`near@${g.name}`] = await measure();
      await shot('4-near');
    }
    // Locked pin: the altimeter's Night City rung, then a tap on H1 — it shakes and states its rule.
    await tapSel('.tmini .tm[data-id=nightCity]');
    await settle();
    await tapSel('.tpin[data-track=h1-wheelie-wire]');
    await page.waitForTimeout(150);
    await shot('5-locked-tap');
    report[`locked@${g.name}`] = await measure();
    // Focused card: the Industrial rung, tap B1 (unfocused → focuses, card rises).
    await tapSel('.tmini .tm[data-id=industrial]');
    await settle();
    await tapSel('.tpin[data-track="b1-first-ride"]');
    await settle();
    await shot('6-focused-b1');
    report[`card@${g.name}`] = await measure();
    // The apron (Lab + pads).
    await tapSel('.tmini .tm[data-id=island]');
    await settle();
    await shot('7-island');
    report[`island@${g.name}`] = await measure();
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(out, `${engine}-report.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
