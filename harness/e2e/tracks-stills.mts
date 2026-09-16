/**
 * Headless stills + measurements of the diorama track select (Chromium or WebKit, 932×430 and 844×390): opening page, a snap, a locked-pin tap, the focused card, the island; per state the scroll axes, per-page vertical overflow, tappable sizes and overlaps, nodes per page. Evidence lives in docs/evidence/level-select/.
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
      const pages = [...document.querySelectorAll('.tpage')];
      const axes = [];
      for (const el of document.querySelectorAll('.tracks-screen *')) {
        const cs = getComputedStyle(el);
        const sx = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
        const sy = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
        if (sx) axes.push('x:' + el.className);
        if (sy) axes.push('y:' + el.className);
      }
      const overflowY = pages.map((p) => Math.max(0, p.scrollHeight - p.clientHeight));
      const tileOverflow = pages.map((p) => { const t = p.querySelector('.ttile'); const r = t.getBoundingClientRect(); const m = map.getBoundingClientRect(); return { top: Math.round(m.top - r.top), bottom: Math.round(r.bottom - m.bottom) }; });
      const targets = [...document.querySelectorAll('.tracks-screen button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 2 && r.right > 0 && r.left < innerWidth; }).map((b) => { const r = b.getBoundingClientRect(); return { sel: b.className.split(' ').slice(0, 2).join('.') + (b.dataset.track ? '[' + b.dataset.track + ']' : ''), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; });
      const small = targets.filter((t) => t.w < 44 || t.h < 44);
      const overlaps = [];
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) { const a = targets[i], b = targets[j]; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ox > 4 && oy > 4) overlaps.push(a.sel + ' x ' + b.sel + ' ' + ox + 'x' + oy); }
      const on = document.querySelector('.tpin.on');
      const nodes = pages.map((p) => p.querySelectorAll('*').length - p.querySelectorAll('.tpin, .tpin *').length);
      return { page: window.__trials.app && window.__trials.app.screen(), scrollLeft: map.scrollLeft, pageW: map.clientWidth, axes, overflowY, tileOverflow, targets: targets.length, small, overlaps, focused: on && on.dataset.track, nodesPerPage: nodes, totals: document.querySelector('.tracks-totals').textContent };
    })()`);
    const shot = async (name: string): Promise<void> => { await page.screenshot({ path: path.join(out, `${engine}-${g.name}-${name}.png`) }); };
    report[`open@${g.name}`] = await measure();
    await shot('1-open');
    // Snap to the next page with the miniature row (Canyon = page 2).
    await tapSel('.tmini .tm[data-p="2"]');
    await page.waitForTimeout(700);
    report[`snap@${g.name}`] = await measure();
    await shot('2-snap-canyon');
    // Locked pin: Night City page, tap its first pin.
    await tapSel('.tmini .tm[data-p="4"]');
    await page.waitForTimeout(700);
    await tapSel('.tpage[data-page=nightCity] .tpin');
    await page.waitForTimeout(150);
    await shot('3-locked-tap');
    report[`locked@${g.name}`] = await measure();
    // Focused card: back to Industrial, tap B2 (unfocused → focuses, card rises).
    await tapSel('.tmini .tm[data-p="1"]');
    await page.waitForTimeout(700);
    await tapSel('.tpin[data-track="b2-lean-back"]');
    await page.waitForTimeout(400);
    await shot('4-focused-card');
    report[`card@${g.name}`] = await measure();
    // Island page.
    await tapSel('.tmini .tm[data-p="0"]');
    await page.waitForTimeout(700);
    await shot('5-island');
    report[`island@${g.name}`] = await measure();
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(out, `${engine}-report.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
