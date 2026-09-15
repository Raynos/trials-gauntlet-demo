/**
 * Touch end-to-end: every tappable thing a phone player meets, tapped with a real emulated finger
 * (Playwright touchscreen, iPhone geometry, coarse pointer), asserting the screen that results and that
 * nothing from another screen is reachable.  The game runs from `dist/` (build first) with `?sw=0`.
 *
 *   pnpm harness:e2e            all flows, both geometries
 *   pnpm harness:e2e --only=run --geom=iphone15promax
 *
 * Rules the suite enforces (each is a past phone bug):
 *   R1  after a screen change, only the new screen's elements are hit-testable (visibility isolation);
 *   R2  a tap that changes screens never acts on the new screen (the same-gesture click);
 *   R3  every tappable target is ≥ 44 × 44 CSS px and no two tappables overlap;
 *   R4  the touch zones + pause/restart buttons are visible and take pointers during a run, and never outside it;
 *   R5  a scroll gesture on a scrollable screen (settings, track rows) never changes screen.
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { startServer } from '../lib/server';

type Geom = { name: string; width: number; height: number; dpr: number };
const GEOMS: Geom[] = [
  { name: 'iphone13', width: 844, height: 390, dpr: 3 },
  { name: 'iphone15promax', width: 932, height: 430, dpr: 3 },
];
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const only = args.get('only');
const geomFilter = args.get('geom');

interface Fail { flow: string; rule: string; detail: string }
const fails: Fail[] = [];
let checks = 0;
function expect(cond: unknown, flow: string, rule: string, detail: string): void {
  checks++;
  if (!cond) {
    fails.push({ flow, rule, detail });
    console.log(`  FAIL ${flow} ${rule}: ${detail}`);
  }
}

async function visibleScreens(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.screen')]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).pointerEvents !== 'none')
      .map((el) => (/(\w+)-screen/.exec(el.className) ?? [, el.className])[1] as string),
  );
}

/** Centre of the first visible match; null when absent / hidden. */
async function centre(page: Page, selector: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sel) => {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      // Touch-layer children are pointer-events: none by design (the layer root captures the finger and hit-tests its own zones).
      const inLayer = !!el.closest('.touch-layer.on');
      if (cs.visibility === 'hidden' || (!inLayer && cs.pointerEvents === 'none') || parseFloat(cs.opacity) < 0.5) continue;
      // Ancestors mid-fade (an overlay leaving, a screen arriving) make a target present but not yet honest to tap.
      let a: HTMLElement | null = el.parentElement, faded = false;
      while (a && a !== document.body) { if (parseFloat(getComputedStyle(a).opacity) < 0.5) { faded = true; break; } a = a.parentElement; }
      if (faded) continue;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, selector);
}

async function tap(page: Page, x: number, y: number): Promise<void> {
  await page.touchscreen.tap(x, y);
}

async function tapSel(page: Page, flow: string, selector: string): Promise<boolean> {
  // Poll: rise/fade animations mean a target can be present but not yet tappable for a few hundred ms.
  let c: { x: number; y: number } | null = null;
  const t0 = Date.now();
  while (!c && Date.now() - t0 < 6000) {
    c = await centre(page, selector);
    if (!c) await page.waitForTimeout(100);
  }
  expect(c, flow, 'present', `${selector} is not visible/tappable`);
  if (!c) return false;
  await tap(page, c.x, c.y);
  return true;
}

/** Every tappable on the current screen: size ≥ 44 and no overlap between distinct tappables. */
async function checkTargets(page: Page, flow: string): Promise<void> {
  const rects = await page.evaluate(() => {
    const out: { sel: string; x: number; y: number; w: number; h: number }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll<HTMLElement>('button, [role=button], .card, .tile, .menu-item, .backbtn, .tz-btn')) {
      if (seen.has(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || cs.display === 'none' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // Skip elements fully clipped by a scrolling ancestor (off-screen rows).
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      seen.add(el);
      const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.push({ sel: `${el.tagName.toLowerCase()}${cls}${el.dataset['id'] ? `[${el.dataset['id']}]` : ''}`, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  });
  for (const r of rects) expect(r.w >= 44 && r.h >= 44, flow, 'R3-size', `${r.sel} is ${r.w.toFixed(0)}×${r.h.toFixed(0)} (< 44)`);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!;
      // Nested tappables (a button inside a card) are one target, not an overlap.
      const nested = (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) || (b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h);
      if (nested) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(!(ox > 4 && oy > 4), flow, 'R3-overlap', `${a.sel} overlaps ${b.sel} by ${ox.toFixed(0)}×${oy.toFixed(0)}`);
    }
}

/** Points on a hidden screen's tappables must resolve (elementFromPoint) to something NOT inside that screen. */
async function checkIsolation(page: Page, flow: string): Promise<void> {
  const leaks = await page.evaluate(() => {
    const out: string[] = [];
    for (const scr of document.querySelectorAll<HTMLElement>('.screen:not(.show), .overlay:not(.show), .onboard:not(.show), .results:not(.show)')) {
      for (const el of scr.querySelectorAll<HTMLElement>('button, .card, .tile, .menu-item, .backbtn')) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && scr.contains(hit)) out.push(`${scr.className} > ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      }
    }
    return out;
  });
  for (const l of leaks) expect(false, flow, 'R1-isolation', `hidden ${l} is hit-testable`);
}

async function touchLayer(page: Page): Promise<{ on: boolean; visible: boolean; pauseVisible: boolean; restartVisible: boolean; zones: number; cls: string; zoneCss: string }> {
  // Evaluated from source text: tsx's keepNames would otherwise inject a `__name` helper the page lacks.
  return page.evaluate(`(() => {
    const tl = document.querySelector('.touch-layer');
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && el.getBoundingClientRect().width > 2; };
    return {
      on: !!(tl && tl.classList.contains('on')),
      visible: !!(tl && tl.classList.contains('visible')),
      pauseVisible: vis('.tz-pause'),
      restartVisible: vis('.tz-restart'),
      zones: [...document.querySelectorAll('.tz')].filter((z) => parseFloat(getComputedStyle(z).opacity) > 0.05).length,
      cls: tl ? tl.className : '(none)',
      zoneCss: [...document.querySelectorAll('.tz')].slice(0, 1).map((z) => { const cs = getComputedStyle(z); return cs.opacity + '/' + cs.visibility + '/' + cs.display + '/' + z.getBoundingClientRect().width; }).join(),
    };
  })()`) as Promise<{ on: boolean; visible: boolean; pauseVisible: boolean; restartVisible: boolean; zones: number; cls: string; zoneCss: string }>;
}

async function scrollGesture(ctx: BrowserContext, page: Page, x: number, y0: number, dy: number): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function boot(ctx: BrowserContext, url: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => expect(false, 'boot', 'pageerror', e.message));
  await page.goto(`${url}/?sw=0`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForTimeout(300);
  return page;
}

async function toMenu(page: Page, flow: string, g: Geom): Promise<void> {
  expect((await visibleScreens(page)).join() === 'title', flow, 'start', `expected title, got ${await visibleScreens(page)}`);
  await tap(page, g.width / 2, g.height / 2);
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'title→menu', `got ${await visibleScreens(page)}`);
}

async function menuItem(page: Page, flow: string, label: string): Promise<boolean> {
  const c = await page.evaluate((l) => {
    for (const b of document.querySelectorAll<HTMLButtonElement>('.menu-screen.show .menu-item')) {
      if (b.textContent?.trim().toLowerCase().startsWith(l.toLowerCase())) {
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }, label);
  expect(c, flow, 'present', `menu item ${label} not found`);
  if (!c) return false;
  await tap(page, c.x, c.y);
  await page.waitForTimeout(500);
  return true;
}

// ---------------------------------------------------------------------------------------------- flows

async function flowFront(ctx: BrowserContext, url: string, g: Geom): Promise<void> {
  const flow = `front@${g.name}`;
  const page = await boot(ctx, url);
  await toMenu(page, flow, g);
  await checkTargets(page, flow);
  await checkIsolation(page, flow);
  // R2: the tap that opened the menu must not have picked an item (menu is still the screen 500 ms later — asserted above).

  // Menu → Play → track select, and stay there.
  await menuItem(page, flow, 'Play');
  expect((await visibleScreens(page)).join() === 'tracks', flow, 'menu→tracks', `got ${await visibleScreens(page)}`);
  await page.waitForTimeout(600);
  expect((await visibleScreens(page)).join() === 'tracks', flow, 'R2-stay-tracks', `left tracks by itself: ${await visibleScreens(page)}`);
  await checkTargets(page, flow + ':tracks');
  await checkIsolation(page, flow + ':tracks');
  // R5: scroll the rows; still tracks.
  await scrollGesture(ctx, page, g.width * 0.35, g.height * 0.8, -g.height * 0.5);
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'tracks', flow, 'R5-scroll-tracks', `scroll changed screen to ${await visibleScreens(page)}`);
  // MENU pill → menu.
  await tapSel(page, flow, '.tracks-screen.show .backbtn');
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'tracks→menu(pill)', `got ${await visibleScreens(page)}`);

  // Menu → Settings → scroll → still settings → pill → menu.
  await menuItem(page, flow, 'Settings');
  expect((await visibleScreens(page)).join() === 'settings', flow, 'menu→settings', `got ${await visibleScreens(page)}`);
  await checkTargets(page, flow + ':settings');
  await checkIsolation(page, flow + ':settings');
  const labels = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.settings-screen.show .setting .lab')].map((l) => l.getBoundingClientRect().width > 20 && l.getBoundingClientRect().height > 8).filter(Boolean).length);
  expect(labels >= 5, flow, 'settings-labels', `only ${labels} visible row labels`);
  await scrollGesture(ctx, page, g.width * 0.3, g.height * 0.85, -g.height * 0.6);
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'settings', flow, 'R5-scroll-settings', `scroll changed screen to ${await visibleScreens(page)}`);
  await tapSel(page, flow, '.settings-screen.show .backbtn');
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'settings→menu(pill)', `got ${await visibleScreens(page)}`);

  // Garage and credits round-trips.
  await menuItem(page, flow, 'Garage');
  expect((await visibleScreens(page)).join() === 'garage', flow, 'menu→garage', `got ${await visibleScreens(page)}`);
  await checkTargets(page, flow + ':garage');
  await tapSel(page, flow, '.garage-screen.show .backbtn');
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'garage→menu(pill)', `got ${await visibleScreens(page)}`);
  await menuItem(page, flow, 'Credits');
  expect((await visibleScreens(page)).join() === 'credits', flow, 'menu→credits', `got ${await visibleScreens(page)}`);
  await tapSel(page, flow, '.credits-screen.show .backbtn');
  await page.waitForTimeout(500);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'credits→menu(pill)', `got ${await visibleScreens(page)}`);
  await page.close();
}

async function flowRun(ctx: BrowserContext, url: string, g: Geom): Promise<void> {
  const flow = `run@${g.name}`;
  const page = await boot(ctx, url);
  await toMenu(page, flow, g);
  const tl0 = await touchLayer(page);
  expect(!tl0.on, flow, 'R4-off-in-menus', `touch layer on in the menu`);
  await menuItem(page, flow, 'Play');
  // Tap the focused card (B1) — the first non-lab card.
  const ok = await tapSel(page, flow, '.tracks-screen.show .card.on');
  if (!ok) return page.close();
  // SwiftShader stalls the main thread for seconds on the run's first frames: wait for the handoff, don't time it.
  await page.waitForFunction(() => ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 60000 }).catch(() => undefined);
  expect((await visibleScreens(page)).length === 0, flow, 'card→run', `a front screen is still visible: ${await visibleScreens(page)}`);
  // First-ride onboarding card: tap GOT IT.
  const ob = await centre(page, '.onboard.show .btn');
  if (ob) {
    await tap(page, ob.x, ob.y);
    await page.waitForFunction(() => !document.querySelector('.onboard.show'), null, { timeout: 20000 }).catch(() => undefined);
  }
  await page.waitForFunction(() => { const z = document.querySelector('.tz'); return !!z && parseFloat(getComputedStyle(z).opacity) > 0.2; }, null, { timeout: 20000 }).catch(() => undefined);
  const tl = await touchLayer(page);
  expect(tl.on && tl.visible, flow, 'R4-on-in-run', `touch layer on=${tl.on} visible=${tl.visible}`);
  expect(tl.zones >= 4, flow, 'R4-zones', `${tl.zones} zones visible (layer '${tl.cls}', zone ${tl.zoneCss})`);
  expect(tl.pauseVisible && tl.restartVisible, flow, 'R4-buttons', `pause=${tl.pauseVisible} restart=${tl.restartVisible}`);
  await checkTargets(page, flow + ':run');
  await checkIsolation(page, flow + ':run');
  // Hold gas on the right for 1 s: the bike must move.
  const x0 = await page.evaluate(() => (window as unknown as { __trials?: { getState(): { bike: { pos: { x: number } } } } }).__trials?.getState().bike.pos.x ?? -1);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.width * 0.9, y: g.height * 0.6 }] });
  const moved = await page.waitForFunction((x) => ((window as unknown as { __trials?: { getState(): { bike: { pos: { x: number } } } } }).__trials?.getState().bike.pos.x ?? -1) > x + 1, x0, { timeout: 15000 }).then(() => true).catch(() => false);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  const x1 = await page.evaluate(() => (window as unknown as { __trials?: { getState(): { bike: { pos: { x: number } } } } }).__trials?.getState().bike.pos.x ?? -1);
  expect(moved, flow, 'gas-zone', `bike x ${x0.toFixed(1)} → ${x1.toFixed(1)} while holding the right half`);
  // Pause button → pause overlay, Resume → back riding, pause → Quit → menu.
  await tapSel(page, flow, '.tz-pause');
  await page.waitForFunction(() => !!document.querySelector('.pause-overlay.show'), null, { timeout: 10000 }).catch(() => undefined);
  const paused = await page.evaluate(() => !!document.querySelector('.pause-overlay.show'));
  expect(paused, flow, 'pause-btn', 'pause overlay not shown after tapping ❚❚');
  await page.waitForFunction(() => ![...document.querySelectorAll('.tz')].some((z) => parseFloat(getComputedStyle(z).opacity) > 0.05), null, { timeout: 5000 }).catch(() => undefined);
  const tlp = await touchLayer(page);
  expect(!tlp.pauseVisible && tlp.zones === 0, flow, 'R4-under-overlay', `zones/buttons still visible under the pause overlay (zones=${tlp.zones})`);
  await checkTargets(page, flow + ':pause');
  await tapSel(page, flow, '.pause-overlay.show .tile[data-id=resume]');
  await page.waitForFunction(() => !document.querySelector('.pause-overlay.show'), null, { timeout: 10000 }).catch(() => undefined);
  expect(await page.evaluate(() => !document.querySelector('.pause-overlay.show')), flow, 'resume', 'pause overlay still shown after Resume');
  await page.waitForTimeout(400);
  await tapSel(page, flow, '.tz-pause');
  await page.waitForFunction(() => !!document.querySelector('.pause-overlay.show'), null, { timeout: 10000 }).catch(() => undefined);
  await tapSel(page, flow, '.pause-overlay.show .tile[data-id=quit]');
  await page.waitForFunction(() => [...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  const after = await visibleScreens(page);
  expect(after.length === 1 && /menu|tracks/.test(after[0]!), flow, 'quit→front', `got ${after}`);
  expect(!(await touchLayer(page)).on, flow, 'R4-off-after-quit', 'touch layer still on after quit');
  await page.close();
}

// ---------------------------------------------------------------------------------------------- main

const server = await startServer({});
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const g of GEOMS) {
    if (geomFilter && g.name !== geomFilter) continue;
    const ctx = await browser.newContext({ viewport: { width: g.width, height: g.height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    console.log(`== ${g.name} ${g.width}×${g.height}`);
    if (!only || only === 'front') await flowFront(ctx, server.url, g);
    if (!only || only === 'run') await flowRun(ctx, server.url, g);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\ntouch e2e: ${checks - fails.length}/${checks} checks pass, ${fails.length} fail`);
for (const f of fails) console.log(`  ✗ ${f.flow} ${f.rule}: ${f.detail}`);
process.exit(fails.length ? 1 : 0);
