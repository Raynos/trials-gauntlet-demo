/**
 * Touch end-to-end: every tappable thing a phone player meets, tapped with a real emulated finger
 * (Playwright touchscreen, iPhone geometry, coarse pointer), asserting the screen that results and that
 * nothing from another screen is reachable.  The game runs from `dist/` (build first) with `?sw=0`.
 *
 *   pnpm harness:e2e            all flows, both geometries (the transition grid on the first geometry; --grid=all for both)
 *   pnpm harness:e2e --only=run --geom=iphone15promax
 *   pnpm harness:e2e --only=grid
 *   pnpm harness:e2e --only=entry       track entry hold on e1 (canyon): no frame after GO with the placeholder, `?perf=1` overlay fields + rate
 *   pnpm harness:e2e --only=boot        the loading screen at LTE / 3G × SW × art pack (harness/e2e/boot.mts)
 *   pnpm harness:e2e --only=bench       `?bench=1&quick=1`: the on-device benchmark's instrument, report and toggles (harness/e2e/bench.mts)
 *   pnpm harness:e2e --only=benchfull   the whole eight-scenario list once (~4 min; the report to harness/out/bench/device-full.md)
 *   pnpm harness:e2e --only=desktop     keyboard + gamepad at 1280×720 / 1920×1080 in a desktop context (harness/e2e/desktop.mts)
 *   pnpm harness:e2e --jobs=N           wall-clock (round 12): the flows (boot, bench, desktop, front/run/entry/hitrects per
 *                                       geometry, the transition grid split by transition) run as parallel Playwright contexts,
 *                                       at most N at once (default (cores - 2) / 3 — a SwiftShader page is ~3 cores; --jobs=1 =
 *                                       the old serial order). The boot suite (throttled network, wall-clock freeze detection)
 *                                       runs alone before the pool. The check and failure totals do not depend on N; the
 *                                       per-flow lines interleave by completion.
 *   pnpm harness:e2e --only=review      the level reviewer: REVIEW tab → picker → segments / note / Copy review / pan / fly / ride (harness/e2e/review.mts)
 *
 * Rules the suite enforces (each is a past phone bug):
 *   R1  after a screen change, only the new screen's elements are hit-testable (visibility isolation);
 *   R2  a tap that changes screens never acts on the new screen (the same-gesture click);
 *   R3  every tappable target is ≥ 44 × 44 CSS px and no two tappables overlap;
 *   R4  the touch zones + pause/restart buttons are visible and take pointers during a run, and never outside it;
 *   R5  a scroll gesture on a scrollable screen (settings, track rows) never changes screen;
 *   R6  THE INVARIANT (docs/tasks/touch-navigation-invariant.md, src/ui/live.ts): across every phase transition, a tap
 *       changes the screen / phase only when its point is inside a `.live` element drawn at ≥ .5 opacity — a 12×6 grid
 *       at 0/50/100/200/400/800 ms after each transition — and every pause / restart hit rect equals its drawn rect;
 *   R7  the strip with keys (design/controls G): one band ≤ 13 % of the height on the bottom edge, four keys, held key solid in its
 *       colour (lean pair one neutral, brake red, gas green) + column wash, hidden under overlays; `--stills=<dir>` saves stills.
 */
import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { defaultBrowserJobs, loadLine, mapPool } from '../lib/pool';
import { startServer } from '../lib/server';
import { bootSuite } from './boot.mjs';
import { benchFull, benchSuite } from './bench.mjs';
import { desktopSuite } from './desktop.mjs';
import { reviewSuite } from './review.mjs';

type Geom = { name: string; width: number; height: number; dpr: number };
const GEOMS: Geom[] = [
  { name: 'iphone13', width: 844, height: 390, dpr: 3 },
  { name: 'iphone15promax', width: 932, height: 430, dpr: 3 },
];
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const only = args.get('only');
/** `--only=a,b` runs several flows. */
const onlyList = only ? only.split(',').filter(Boolean) : null;
const wants = (k: string): boolean => !onlyList || onlyList.includes(k);
const geomFilter = args.get('geom');
const gridScope = args.get('grid') ?? 'first';
/** Debug: cap the transition instances per transition (`--instances=2`) and log every establish step (`--verbose=1`). */
const gridInstances = Number(args.get('instances') ?? 0) || 0;
/** Parallel contexts (round 12): `--jobs=N`, default (cores - 2) / 3 — a SwiftShader page is ~3 cores. */
const jobs = defaultBrowserJobs(64, { ...(args.has('jobs') ? { jobs: args.get('jobs')! } : {}) });
const verbose = args.get('verbose') === '1';
const log = (m: string): void => { if (verbose) console.log(`    ${new Date().toISOString().slice(11, 23)} ${m}`); };

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
      .filter((el) => getComputedStyle(el).visibility !== 'hidden' && el.classList.contains('show'))
      .map((el) => /(\w+)-screen/.exec(el.className)?.[1] ?? el.className),
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
    for (const scr of document.querySelectorAll<HTMLElement>('.screen:not(.live), .overlay:not(.live), .onboard:not(.live), .results:not(.live)')) {
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

// ---------------------------------------------------------------------------------------------- R7: the strip with keys
//
// assets/design/controls/SPEC.md § Round 2 (G) + game.md §3: one band on the bottom edge (3.33rem + the home-indicator inset:
// 52 px at 932×430, 48 px at 844×390 — capped here at 13 % of the height + the inset), 40 % idle → 30 % settled, four key caps
// inside it; a held key goes solid in its colour (LEAN BACK and LEAN FWD one shared neutral, BRAKE red, GAS green), presses to
// .96 and its whole quarter column takes the wash; everything hides under an overlay with the zones. The strip is the layer
// root's ::before (not a hit rect), so it is read from the pseudo-element's computed style.

const STRIP_MAX_H = (g: Geom): number => g.height * 0.13 + 1;
/** Where to write the run-flow stills (`--stills=<dir>`; idle / held-back-gas / settled at each geometry). */
const stillsDir = args.get('stills');

interface StripInfo { w: number; h: number; top: number; bottom: number; op: number; keys: { id: string; w: number; h: number; top: number; bottom: number }[] }
/** Jump every running CSS transition to its end: under SwiftShader the animation clock advances per (slow) frame, so a computed style read 150 ms after a class flip is still the transition's start value. */
const FINISH = "document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} });";
async function strip(page: Page): Promise<StripInfo> {
  return page.evaluate(`(() => {
    ${FINISH}
    const tl = document.querySelector('.touch-layer');
    const cs = getComputedStyle(tl, '::before');
    const lr = tl.getBoundingClientRect();
    const h = parseFloat(cs.height) || 0, w = parseFloat(cs.width) || 0;
    const keys = [...document.querySelectorAll('.tz-zone .tz-key')].map((k) => { const r = k.getBoundingClientRect(); return { id: k.className.replace(/.*tz-key-(\\w+).*/, '$1'), w: r.width, h: r.height, top: r.top, bottom: r.bottom }; });
    return { w, h, top: lr.bottom - h, bottom: lr.bottom, op: parseFloat(cs.opacity), keys };
  })()`) as Promise<StripInfo>;
}

interface KeyState { held: boolean; bg: string; color: string; scale: number; wash: boolean; colBg: string }
/** Per zone: `.held`, the key's background colour, its transform scale, and whether the column carries the wash gradient. */
async function keyStates(page: Page): Promise<Record<'back' | 'fwd' | 'brake' | 'throttle', KeyState>> {
  return page.evaluate(`(() => {
    ${FINISH}
    const out = {};
    for (const z of ['back', 'fwd', 'brake', 'throttle']) {
      const col = document.querySelector('.tz-' + z);
      const key = col.querySelector('.tz-key');
      const ks = getComputedStyle(key), cs = getComputedStyle(col);
      const m = /matrix\\(([-\\d.]+),/.exec(ks.transform);
      out[z] = { held: col.classList.contains('held'), bg: ks.backgroundColor, color: ks.color, scale: m ? Math.round(parseFloat(m[1]) * 100) / 100 : 1, wash: cs.backgroundImage.includes('gradient'), colBg: cs.backgroundImage };
    }
    return out;
  })()`) as Promise<Record<'back' | 'fwd' | 'brake' | 'throttle', KeyState>>;
}

const rgb = (s: string): [number, number, number] | null => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m ? [+m[1]!, +m[2]!, +m[3]!] : null; };
const reddish = (s: string): boolean => { const c = rgb(s); return !!c && c[0] > 200 && c[1] < 140 && c[2] < 140; };
const greenish = (s: string): boolean => { const c = rgb(s); return !!c && c[1] > 200 && c[0] < 140 && c[2] < 200; };
/** A neutral: bright, and no channel more than 40 apart (a cool white / steel). */
const neutral = (s: string): boolean => { const c = rgb(s); return !!c && Math.min(...c) > 180 && Math.max(...c) - Math.min(...c) < 40; };

async function still(page: Page, g: Geom, name: string): Promise<void> {
  if (!stillsDir) return;
  const { mkdirSync } = await import('node:fs');
  mkdirSync(stillsDir, { recursive: true });
  await page.screenshot({ path: `${stillsDir}/${g.name}-${name}.png` });
}

async function scrollGesture(ctx: BrowserContext, page: Page, x: number, y0: number, dy: number, dx = 0, steps = 12, stepMs = 16): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
    await page.waitForTimeout(stepMs);
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

/** Boot lands on the main menu (the "Broadcast" screen; there is no title step): assert it, then prove the reveal invariant on PLAY. */
async function toMenu(page: Page, flow: string, g: Geom): Promise<void> {
  expect((await visibleScreens(page)).join() === 'menu', flow, 'start', `expected menu at boot, got ${await visibleScreens(page)}`);
  await waitFor(page, `!!document.querySelector('.menu-screen.live')`, 10000);
  expect(await page.evaluate(() => !!document.querySelector('.menu-screen.live')), flow, 'boot-menu-live', 'menu never went live after boot');
  await checkPlayReveal(page, flow, g);
}

/**
 * The invariant on the menu's primary control: re-enter the menu (credits → menu through the hook, the same `goto` a
 * pill tap takes) and, in the same evaluate as the goto, PLAY must NOT be live and a tap on it must not navigate; once
 * live.ts has seen the band drawn for 150 ms it IS live and the same tap opens track select.
 */
async function checkPlayReveal(page: Page, flow: string, g: Geom): Promise<void> {
  await page.evaluate(`window.__trials.app.goto('credits')`);
  await waitFor(page, `!!document.querySelector('.credits-screen.live')`, 10000);
  const before = await page.evaluate(`(() => {
    window.__trials.app.goto('menu');
    const play = document.querySelector('.menu-screen .menu-item[data-id=play]');
    const r = play.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const live = !!(hit && hit.closest('.live') && hit.closest('.menu-screen'));
    // A finger lands on whatever hit-testing resolves at the point (pointer-events: none until .live), never on PLAY itself.
    const init = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0 };
    if (hit) {
      hit.dispatchEvent(new PointerEvent('pointerdown', init));
      hit.dispatchEvent(new PointerEvent('pointerup', init));
      hit.dispatchEvent(new MouseEvent('click', init));
    }
    window.__trials.app.frame();
    return { live, screen: window.__trials.app.screen(), menuLive: !!document.querySelector('.menu-screen.live'), hit: hit ? hit.tagName + '.' + hit.className : '(none)', w: r.width, h: r.height };
  })()`) as { live: boolean; screen: string; menuLive: boolean; hit: string; w: number; h: number };
  expect(!before.live && !before.menuLive, flow, 'R6-play-not-live-before-reveal', `PLAY hit-testable as live right after goto(menu): ${JSON.stringify(before)}`);
  expect(before.screen === 'menu', flow, 'R6-play-dead-tap', `a tap on PLAY before its reveal navigated to ${before.screen}`);
  expect(before.w >= 88 && before.h >= 44, flow, 'R3-play-size', `PLAY tab is ${before.w.toFixed(0)}×${before.h.toFixed(0)} (< 88×44)`);
  await waitFor(page, `!!document.querySelector('.menu-screen.live')`, 10000);
  const after = await page.evaluate(`(() => {
    const play = document.querySelector('.menu-screen .menu-item[data-id=play]');
    const r = play.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    let o = 1;
    for (let e = hit; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); o *= parseFloat(cs.opacity) || 0; }
    return { live: !!(hit && hit.closest('.live') && play.contains(hit)), opacity: o, ticker: getComputedStyle(document.querySelector('.menu-ticker')).pointerEvents };
  })()`) as { live: boolean; opacity: number; ticker: string };
  expect(after.live && after.opacity >= 0.5, flow, 'R6-play-live-after-reveal', `PLAY not live once the menu is: ${JSON.stringify(after)}`);
  expect(after.ticker === 'none', flow, 'ticker-not-tappable', `ticker pointer-events = ${after.ticker}`);
  // The band is in the bottom quarter on every geometry (the thumb arc): PLAY's centre below 70 % of the height.
  const cy = await centre(page, '.menu-screen.live .menu-item[data-id=play]');
  expect(cy && cy.y > g.height * 0.7, flow, 'band-low', `PLAY centre at y=${cy?.y.toFixed(0)} of ${g.height}`);
  await page.waitForTimeout(300);
}

/** Tap a main-menu item once the menu is live (the invariant: not before it has been drawn 150 ms). */
async function menuItem(page: Page, flow: string, label: string): Promise<boolean> {
  await waitFor(page, `!!document.querySelector('.menu-screen.live')`, 10000);
  const c = await page.evaluate((l) => {
    for (const b of document.querySelectorAll<HTMLButtonElement>('.menu-screen.live .menu-item')) {
      if (b.textContent?.trim().toLowerCase().startsWith(l.toLowerCase())) {
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }, label);
  expect(c, flow, 'present', `menu item ${label} not found (menu not live?)`);
  if (!c) return false;
  await tap(page, c.x, c.y);
  await waitFor(page, `!document.querySelector('.menu-screen.show')`, 10000);
  await page.waitForTimeout(300);
  return true;
}

// ---------------------------------------------------------------------------------------------- flows

async function flowFront(ctx: BrowserContext, url: string, g: Geom): Promise<void> {
  const flow = `front@${g.name}`;
  const page = await boot(ctx, url);
  await toMenu(page, flow, g);
  await checkTargets(page, flow);
  await checkIsolation(page, flow);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'R2-stay-menu', `left the menu by itself: ${await visibleScreens(page)}`);

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
  await tapSel(page, flow, '.tracks-screen.live .backbtn');
  await waitFor(page, `!!document.querySelector('.menu-screen.show')`, 10000);
  await page.waitForTimeout(300);
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
  await tapSel(page, flow, '.settings-screen.live .backbtn');
  await waitFor(page, `!!document.querySelector('.menu-screen.show')`, 10000);
  await page.waitForTimeout(300);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'settings→menu(pill)', `got ${await visibleScreens(page)}`);

  // Garage (garage round: the model explorer — rail of tags left, hero centre, panel right) and credits round-trips.
  await menuItem(page, flow, 'Garage');
  expect((await visibleScreens(page)).join() === 'garage', flow, 'menu→garage', `got ${await visibleScreens(page)}`);
  await checkTargets(page, flow + ':garage');
  await checkIsolation(page, flow + ':garage');
  {
    // G1: the stage + orbit camera are up, the hero is ≥ 45 % of the height and no tappable overlaps its box.
    // Measured on an orbit frame: the rig adopts the orbit (fov 30°, the menu rig sits at 28°) on the first draw after the screen shows.
    await page.waitForFunction(`window.__render && Math.abs(window.__render.debug.rig.camera.fov - 30) < 0.01`, null, { timeout: 20000, polling: 200 }).catch(() => undefined);
    const g1 = await page.evaluate(`(function () {
      var r = window.__render; if (!r) return null; var T = r.debug.THREE; var cam = r.debug.rig.camera; var info = r.debugInfo();
      var box = new T.Box3(); var tmp = new T.Box3();
      [r.debug.bike.root, r.debug.rider.root].forEach(function (o) { if (o && o.visible) { tmp.setFromObject(o); box.union(tmp); } });
      var xs = [], ys = [];
      for (var i = 0; i < 8; i++) { var v = new T.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam); xs.push((v.x + 1) / 2 * innerWidth); ys.push((1 - v.y) / 2 * innerHeight); }
      var hero = { l: Math.min.apply(null, xs), r: Math.max.apply(null, xs), t: Math.min.apply(null, ys), b: Math.max.apply(null, ys) };
      var overlaps = [];
      document.querySelectorAll('.garage-screen button').forEach(function (el) { var q = el.getBoundingClientRect(); if (q.width < 2) return; var ox = Math.min(hero.r, q.right) - Math.max(hero.l, q.left); var oy = Math.min(hero.b, q.bottom) - Math.max(hero.t, q.top); if (ox > 4 && oy > 4) overlaps.push(el.className.split(' ')[0] + ' ' + Math.round(ox) + 'x' + Math.round(oy)); });
      return { on: info.garage.on, mode: info.occluder.override, share: (hero.b - hero.t) / innerHeight, overlaps: overlaps };
    })()`) as { on: boolean; mode: string | null; share: number; overlaps: string[] } | null;
    expect(g1 && g1.on && g1.mode === 'orbit', flow, 'G1-stage', `garage stage/orbit: ${JSON.stringify(g1)}`);
    expect(g1 && g1.share >= 0.45, flow, 'G1-hero-share', `hero is ${g1 ? (g1.share * 100).toFixed(0) : '?'} % of the height (< 45)`);
    expect(g1 && g1.overlaps.length === 0, flow, 'G1-hero-clear', `tappables over the hero: ${g1?.overlaps.join(', ')}`);
    // G2: a one-finger drag across the hero rotates the orbit and never leaves the screen; the tags still tap.
    // Let the first garage frames (the stage's programs compile on first draw — seconds under SwiftShader) go by:
    // a busy main thread coalesces touch moves away and the drag would arrive as a bare start/end.
    await page.waitForFunction(`new Promise(function (res) { var t0 = performance.now(); requestAnimationFrame(function () { var t1 = performance.now(); requestAnimationFrame(function () { res(performance.now() - t1 < 120 && t1 - t0 < 120); }); }); })`, null, { timeout: 20000, polling: 250 }).catch(() => undefined);
    const yaw0 = await page.evaluate(`window.__render.debug.rig.camera.position.x`);
    await page.evaluate(`(function(){ window.__pe = []; document.addEventListener('pointerdown', function(e){ window.__pe.push(e.target.className || e.target.tagName); }, true); })()`);
    // Up to three tries: under SwiftShader with parallel contexts the compositor's touch hit-test can lag the
    // `.live` flip by a frame or two and hand the first touchStart to the canvas under the screen (target logged).
    let yaw1 = yaw0 as number;
    for (let attempt = 0; attempt < 3 && Math.abs(yaw1 - (yaw0 as number)) <= 0.2; attempt++) {
      await scrollGesture(ctx, page, g.width * 0.5, g.height * 0.45, 0, g.width * 0.25, 20, 40);
      // The camera moves on the next drawn frame — a second away on a loaded SwiftShader.
      await page.waitForFunction(`Math.abs(window.__render.debug.rig.camera.position.x - (${yaw0 as number})) > 0.2`, null, { timeout: 6000 }).catch(() => undefined);
      yaw1 = (await page.evaluate(`window.__render.debug.rig.camera.position.x`)) as number;
    }
    expect((await visibleScreens(page)).join() === 'garage', flow, 'G2-drag-stays', `drag left the garage: ${await visibleScreens(page)}`);
    const pe = await page.evaluate(`'targets=' + window.__pe.join(',')`);
    expect(Math.abs(yaw1 - (yaw0 as number)) > 0.2, flow, 'G2-drag-rotates', `camera x ${yaw0} → ${yaw1} (${pe})`);
    await tapSel(page, flow, '.garage-screen.live button[data-outfit="street-openface"]');
    await page.waitForTimeout(300);
    expect((await visibleScreens(page)).join() === 'garage', flow, 'G2-tag-stays', `outfit tap left the garage: ${await visibleScreens(page)}`);
    await tapSel(page, flow, '.garage-screen.live button[data-bike="pro"]');
    await page.waitForTimeout(300);
    const pro = await page.evaluate(`document.querySelector('.garage-screen button[data-bike="pro"]').getAttribute('aria-pressed')`);
    expect(pro === 'true', flow, 'G2-bike-tap', `Pro tag aria-pressed ${pro}`);
    await tapSel(page, flow, '.garage-screen.live button[data-bike="rookie"]');
    await page.waitForTimeout(300);
  }
  await tapSel(page, flow, '.garage-screen.live .backbtn');
  await waitFor(page, `!!document.querySelector('.menu-screen.show')`, 10000);
  await page.waitForTimeout(300);
  expect((await visibleScreens(page)).join() === 'menu', flow, 'garage→menu(pill)', `got ${await visibleScreens(page)}`);
  {
    const off = await page.evaluate(`(function () { var r = window.__render; if (!r) return null; var i = r.debugInfo(); return { on: i.garage.on, mode: i.occluder.override }; })()`) as { on: boolean; mode: string | null } | null;
    expect(off && !off.on && off.mode === null, flow, 'G3-stage-off', `stage/orbit after leaving the garage: ${JSON.stringify(off)}`);
  }
  await menuItem(page, flow, 'Credits');
  expect((await visibleScreens(page)).join() === 'credits', flow, 'menu→credits', `got ${await visibleScreens(page)}`);
  await tapSel(page, flow, '.credits-screen.live .backbtn');
  await waitFor(page, `!!document.querySelector('.menu-screen.show')`, 10000);
  await page.waitForTimeout(300);
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
  // Tap the focused pin (B1, the opening focus on a fresh profile): the focused pin launches.
  const ok = await tapSel(page, flow, '.tracks-screen.live .tpin.on');
  if (!ok) return page.close();
  // SwiftShader stalls the main thread for seconds on the run's first frames: wait for the handoff, don't time it.
  await page.waitForFunction(() => ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 60000 }).catch(() => undefined);
  expect((await visibleScreens(page)).length === 0, flow, 'card→run', `a front screen is still visible: ${await visibleScreens(page)}`);
  // First-ride onboarding card: tap GOT IT.
  await waitFor(page, `!document.querySelector('.onboard.show') || !!document.querySelector('.onboard.live')`, 20000);
  const ob = await centre(page, '.onboard.live .btn');
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
  // R7 — the strip with keys (design/controls G): one band on the bottom edge, ≤ SPEC's height, four keys in their colours.
  const strip0 = await strip(page);
  expect(strip0.h > 0 && strip0.h <= STRIP_MAX_H(g) && strip0.bottom >= g.height - 1 && strip0.w >= g.width - 1, flow, 'R7-strip', `strip ${strip0.w.toFixed(0)}×${strip0.h.toFixed(0)} bottom ${strip0.bottom.toFixed(0)} (max height ${STRIP_MAX_H(g).toFixed(0)})`);
  expect(strip0.op >= 0.3 && strip0.op <= 0.5, flow, 'R7-strip-idle', `strip idle opacity ${strip0.op} (want .4)`);
  expect(strip0.keys.length === 4 && strip0.keys.every((k) => k.w > 0 && k.h <= strip0.h && k.top >= strip0.top - 1 && k.bottom <= strip0.bottom + 1), flow, 'R7-keys', `keys ${JSON.stringify(strip0.keys)} inside strip top ${strip0.top.toFixed(0)}`);
  await still(page, g, 'idle');
  // Hold gas on the right for 1 s: the bike must move.
  const x0 = await page.evaluate(() => (window as unknown as { __trials?: { getState(): { bike: { pos: { x: number } } } } }).__trials?.getState().bike.pos.x ?? -1);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.width * 0.9, y: g.height * 0.6, id: 1 }] });
  // Held GAS: the key lights green and its whole quarter carries the wash; the three idle keys do not.
  await page.waitForTimeout(150);
  const gasHeld = await keyStates(page);
  expect(gasHeld.throttle.held && greenish(gasHeld.throttle.bg) && !gasHeld.brake.held && !gasHeld.back.held && !gasHeld.fwd.held, flow, 'R7-gas-key', `held right quarter: ${JSON.stringify(gasHeld)}`);
  expect(gasHeld.throttle.wash && !gasHeld.brake.wash, flow, 'R7-gas-wash', `column wash gas=${gasHeld.throttle.wash} brake=${gasHeld.brake.wash} (${gasHeld.throttle.colBg})`);
  expect(gasHeld.throttle.scale < 1 && gasHeld.brake.scale === 1, flow, 'R7-gas-press', `press scale gas=${gasHeld.throttle.scale} brake=${gasHeld.brake.scale}`);
  const moved = await page.waitForFunction((x) => ((window as unknown as { __trials?: { getState(): { bike: { pos: { x: number } } } } }).__trials?.getState().bike.pos.x ?? -1) > x + 1, x0, { timeout: 15000 }).then(() => true).catch(() => false);
  // Second finger: LEAN BACK with GAS still down (the multi-touch P0) — both keys lit, then the still.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.width * 0.9, y: g.height * 0.6, id: 1 }, { x: g.width * 0.1, y: g.height * 0.6, id: 2 }] });
  await page.waitForTimeout(150);
  const both = await keyStates(page);
  expect(both.throttle.held && both.back.held && !both.fwd.held && !both.brake.held, flow, 'R7-two-keys', `back+gas: ${JSON.stringify(both)}`);
  await still(page, g, 'held-back-gas');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // LEAN FWD + BRAKE: the two lean keys' held colours are identical (one neutral scheme), brake is red.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.width * 0.4, y: g.height * 0.6, id: 3 }, { x: g.width * 0.6, y: g.height * 0.6, id: 4 }] });
  await page.waitForTimeout(150);
  const other = await keyStates(page);
  expect(other.fwd.held && other.brake.held && !other.back.held && !other.throttle.held, flow, 'R7-fwd-brake', `fwd+brake: ${JSON.stringify(other)}`);
  expect(other.fwd.bg === both.back.bg && neutral(other.fwd.bg), flow, 'R7-lean-neutral-equal', `lean held colours back=${both.back.bg} fwd=${other.fwd.bg}`);
  expect(reddish(other.brake.bg), flow, 'R7-brake-red', `brake held colour ${other.brake.bg}`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const released = await keyStates(page);
  expect(!released.fwd.held && !released.brake.held && !released.fwd.wash && released.fwd.scale === 1, flow, 'R7-release', `after release: ${JSON.stringify(released)}`);
  await cdp.detach();
  const x1 = await page.evaluate(() => (window as unknown as { __trials?: { getState(): { bike: { pos: { x: number } } } } }).__trials?.getState().bike.pos.x ?? -1);
  expect(moved, flow, 'gas-zone', `bike x ${x0.toFixed(1)} → ${x1.toFixed(1)} while holding the right half`);
  // Settled (3 s of riding): the strip drops to ~.3, the keys stay drawn.
  const settled = await waitFor(page, `document.querySelector('.touch-layer').classList.contains('settled')`, 20000);
  if (settled) await page.waitForTimeout(450);
  const strip1 = await strip(page);
  expect(settled && strip1.op >= 0.2 && strip1.op < strip0.op && strip1.keys.length === 4, flow, 'R7-settled', `settled=${settled} strip opacity ${strip0.op} → ${strip1.op}, keys ${strip1.keys.length}`);
  await still(page, g, 'settled');
  // Pause button → pause overlay, Resume → back riding, pause → Quit → menu.
  await waitFor(page, `document.querySelector('.touch-layer').classList.contains('live')`, 20000);
  await tapSel(page, flow, '.tz-pause');
  await page.waitForFunction(() => !!document.querySelector('.pause-overlay.show'), null, { timeout: 10000 }).catch(() => undefined);
  const paused = await page.evaluate(() => !!document.querySelector('.pause-overlay.show'));
  expect(paused, flow, 'pause-btn', 'pause overlay not shown after tapping ❚❚');
  await page.waitForFunction(() => ![...document.querySelectorAll('.tz')].some((z) => parseFloat(getComputedStyle(z).opacity) > 0.05), null, { timeout: 5000 }).catch(() => undefined);
  const tlp = await touchLayer(page);
  expect(!tlp.pauseVisible && tlp.zones === 0, flow, 'R4-under-overlay', `zones/buttons still visible under the pause overlay (zones=${tlp.zones})`);
  const stripP = await strip(page);
  expect(stripP.op <= 0.05, flow, 'R7-strip-under-overlay', `strip opacity ${stripP.op} under the pause overlay`);
  await checkTargets(page, flow + ':pause');
  await tapSel(page, flow, '.pause-overlay.live .tile[data-id=resume]');
  await page.waitForFunction(() => !document.querySelector('.pause-overlay.show'), null, { timeout: 10000 }).catch(() => undefined);
  expect(await page.evaluate(() => !document.querySelector('.pause-overlay.show')), flow, 'resume', 'pause overlay still shown after Resume');
  await waitFor(page, `document.querySelector('.touch-layer').classList.contains('live')`, 20000);
  await tapSel(page, flow, '.tz-pause');
  await page.waitForFunction(() => !!document.querySelector('.pause-overlay.show'), null, { timeout: 10000 }).catch(() => undefined);
  await tapSel(page, flow, '.pause-overlay.live .tile[data-id=quit]');
  await page.waitForFunction(() => [...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show')), null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  const after = await visibleScreens(page);
  expect(after.length === 1 && /menu|tracks/.test(after[0]!), flow, 'quit→front', `got ${after}`);
  expect(!(await touchLayer(page)).on, flow, 'R4-off-after-quit', 'touch layer still on after quit');
  await page.close();
}

// ---------------------------------------------------------------------------------------------- track entry hold
//
// docs/design/game.md § entry hold (render r14's request): entering a track whose biome is not the one on screen, the renderer
// compiles it behind a fog placeholder (`debugInfo().entering`) and the countdown waits for `whenReady()`. Proof, sampled every
// RAF through `hook.info()`: (a) the countdown never beats while `entering`; (b) NO frame after GO has the placeholder up;
// (c) `entryMs` is reported; (d) the HUD showed the "Loading canyon…" label while holding; (e) the `?perf=1` overlay writes ≤ 2/s.
async function flowEntry(ctx: BrowserContext, url: string, g: Geom): Promise<void> {
  const flow = `entry@${g.name}`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => expect(false, flow, 'pageerror', e.message));
  await page.addInitScript(() => { try { localStorage.setItem('trials.onboarded', '1'); } catch { /* none */ } });
  await page.goto(`${url}/?sw=0&perf=1`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await waitFor(page, `!!document.querySelector('.menu-screen.live')`, 20000);
  // Boot prepared the industrial hall (b1); e1 is canyon — a biome change, the case the phone showed.
  const track = 'e1-uphill-weight';
  await page.evaluate(`(() => {
    const w = window; const t = w.__trials; w.__entryLog = []; w.__perfWrites = [];
    const sample = () => {
      const i = t.info(); const r = i.render || {}; const hud = document.querySelector('.hud .entry');
      const ov = document.querySelector('.perf');
      w.__entryLog.push({ t: performance.now(), ph: t.phase(), en: r.entering === true, hold: i.entryHold === true, ms: r.entryMs, rt: t.runTime(),
        label: hud && hud.classList.contains('show') ? hud.textContent : null, banner: [...document.querySelectorAll('.banner')].some((b) => parseFloat(getComputedStyle(b).opacity) > 0.5 && /^[123]$/.test(b.textContent || '')),
        perf: ov ? ov.textContent : null });
      const riding = w.__entryLog.filter((e) => e.ph === 'riding' || e.ph === 'crashed').length;
      if (w.__entryLog.length < 6000 && riding < 90) requestAnimationFrame(sample); else w.__entryDone = true;
    };
    t.app.play('${track}');
    requestAnimationFrame(sample);
  })()`);
  const done = await waitFor(page, `window.__entryDone === true`, 120000);
  type Row = { t: number; ph: string; en: boolean; hold: boolean; ms: number; rt: number; label: string | null; banner: boolean; perf: string | null };
  const log = (await page.evaluate(`window.__entryLog`)) as Row[];
  const info = (await page.evaluate(`window.__trials.info()`)) as { render?: Record<string, unknown>; entryHold?: boolean; qualityWhy?: string; quality?: string };
  expect(done, flow, 'entry-sampled', `sampler did not finish: ${log.length} rows, last ${JSON.stringify(log.at(-1))}`);
  const held = log.filter((r) => r.hold);
  const afterGo = log.filter((r) => r.ph === 'riding' || r.ph === 'crashed' || r.ph === 'finished');
  const placeholderAfterGo = afterGo.filter((r) => r.en);
  const beatWhileEntering = log.filter((r) => r.en && r.banner);
  const goRow = log.find((r) => r.ph === 'riding');
  expect(afterGo.length >= 60, flow, 'entry-reached-go', `only ${afterGo.length} frames after GO (${log.length} sampled)`);
  expect(placeholderAfterGo.length === 0, flow, 'entry-no-placeholder-after-go', `${placeholderAfterGo.length} frames after GO with the placeholder up (first ${JSON.stringify(placeholderAfterGo[0])})`);
  expect(beatWhileEntering.length === 0, flow, 'entry-no-beat-while-entering', `${beatWhileEntering.length} frames showed a countdown digit while the renderer was entering`);
  const entryMs = Number(info.render?.['entryMs'] ?? goRow?.ms ?? 0);
  expect(entryMs > 0, flow, 'entry-ms-reported', `debugInfo().entryMs = ${entryMs}`);
  expect(held.length === 0 || held.some((r) => r.label && /loading canyon/i.test(r.label)), flow, 'entry-hud-label', `held ${held.length} frames; labels seen: ${JSON.stringify([...new Set(held.map((r) => r.label))].slice(0, 4))}`);
  expect(held.every((r) => r.rt === 0 && r.ph === 'countdown'), flow, 'entry-clock-at-zero', `run clock / phase moved during the hold: ${JSON.stringify(held.find((r) => r.rt !== 0 || r.ph !== 'countdown'))}`);
  // `?perf=1`: the overlay names the render fields and the governor decision; distinct texts over the riding stretch ≤ 2 per second.
  const ride = afterGo.filter((r) => r.perf);
  const distinct = ride.reduce((n, r, i) => (i > 0 && r.perf !== ride[i - 1]!.perf ? n + 1 : n), 0);
  const span = ride.length > 1 ? (ride.at(-1)!.t - ride[0]!.t) / 1000 : 0;
  const perfText = ride.at(-1)?.perf ?? '';
  expect(/RENDER \w+ · (phone|desktop)\/[\w-]+ · dpr [\d.]+ · \d+×\d+/.test(perfText) && /calls .* tris .* rt .* Mpx .* passes .* shadow \d+/.test(perfText) && /hero .* skipped \d+ .* stale \d+ .* entry \d+ ms/.test(perfText) && /governor|manual/.test(perfText), flow, 'perf-overlay-fields', `overlay text:\n${perfText}`);
  expect(span < 1 || distinct / span <= 2.05, flow, 'perf-overlay-rate', `${distinct} overlay text changes over ${span.toFixed(1)} s`);
  expect(typeof info.render?.['tier'] === 'string' && typeof info.render?.['calls'] === 'number' && typeof info.qualityWhy === 'string' && typeof info.entryHold === 'boolean', flow, 'hook-info-render', `hook.info(): ${JSON.stringify({ render: info.render, qualityWhy: info.qualityWhy, entryHold: info.entryHold })}`);
  console.log(`  entry ${g.name}: ${log.length} frames sampled, held ${held.length}, entering ${log.filter((r) => r.en).length}, after GO ${afterGo.length} (placeholder ${placeholderAfterGo.length}), entryMs ${entryMs}, label ${JSON.stringify(held.find((r) => r.label)?.label ?? null)}, perf changes ${distinct}/${span.toFixed(1)} s`);
  await page.close();
}

// ---------------------------------------------------------------------------------------------- R6: the transition grid
//
// docs/tasks/touch-navigation-invariant.md §4. For each transition — ride→crash, ride→finish, finish→results stage 0..5,
// pause open, pause close, results→menu, menu→tracks — a 12×6 grid of points is tapped at 0/50/100/200/400/800 ms after
// the transition. The screen / phase / pause state may change only when a tapped point was inside a `.live` element drawn
// at ≥ 0.5 opacity (the invariant, src/ui/live.ts). Transitions are driven through `window.__trials` (sim stepped in one
// evaluate, one synchronous app frame after the taps) so nothing here waits on SwiftShader's RAF cadence.
//
// Each transition instance serves six slots (one per offset); a slot taps GRID_PER_SLOT points in quick succession and then
// reads the state after one app frame. A change with no live tap among the slot's points is a violation (every point of the
// slot is reported); a change with a live tap is a legitimate navigation and the transition is re-established.
//
// Grid taps are dispatched in-page (`__e2eTap`: the browser's own hit-test via elementFromPoint, then pointerdown / pointerup /
// click at the point) so a slot is one round trip — a real-finger CDP tap waits ~300 ms on SwiftShader's main thread per
// event, which would put the 432-tap grid at 25 minutes per geometry. The R1–R5 flows keep real touchscreen taps.

const GRID_COLS = 12, GRID_ROWS = 6;
const GRID_OFFSETS = [0, 50, 100, 200, 400, 800];
const GRID_PER_SLOT = 3;

type Sig = { screen: string; phase: string; paused: boolean; results: string };
type Probe = { live: boolean; opacity: number; el: string };

/** Screen / phase group / pause: crashed and riding are one group (the 1 s auto-respawn is not a navigation), results stages are not part of the signature. */
function sigKey(s: Sig): string {
  const group = s.phase === 'crashed' || s.phase === 'riding' ? 'ride' : s.phase;
  return `${s.screen}|${group}|${s.paused ? 'paused' : '-'}`;
}

const SIG_SRC = `(() => { const t = window.__trials; const r = document.querySelector('.results'); return { screen: t.app.screen(), phase: t.phase(), paused: t.app.paused(), results: r ? r.className : '' }; })()`;

async function sig(page: Page): Promise<Sig> {
  return page.evaluate(SIG_SRC) as Promise<Sig>;
}

/** One synchronous app frame (input poll + live tick), then the state. */
async function frameSig(page: Page): Promise<Sig> {
  return page.evaluate(`(() => { window.__trials.app.frame(); return ${SIG_SRC}; })()`) as Promise<Sig>;
}

/**
 * In-page tap: the invariant's predicate at the point (hit element inside `.live`, effective opacity ≥ .5) and a
 * pointerdown / pointerup / click dispatched at that element. Installed once per page as a plain script.
 */
const E2E_TAP_SRC = `window.__e2eTap = function (x, y) {
  let el = document.elementFromPoint(x, y);
  if (!el) return { live: false, opacity: 0, el: '(none)' };
  // The touch layer hit-tests its own buttons (children are pointer-events: none): judge the button under the point, not the layer.
  if (el.classList.contains('touch-layer')) for (const b of el.querySelectorAll('.tz-btn')) { const r = b.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) el = b; }
  let o = 1;
  for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') { o = 0; break; } o *= parseFloat(cs.opacity) || 0; }
  const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
  const probe = { live: !!el.closest('.live') && o >= 0.5, opacity: Math.round(o * 100) / 100, el: el.tagName.toLowerCase() + cls + (el.dataset && el.dataset.id ? '[' + el.dataset.id + ']' : '') };
  const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, width: 10, height: 10 };
  el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, init, { buttons: 0 })));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 }));
  return probe;
};`;

/** One slot: tap every point in-page, run one app frame, read the state — a single round trip. */
async function tapSlot(page: Page, pts: { x: number; y: number }[]): Promise<{ probes: Probe[]; sig: Sig }> {
  return page.evaluate(`(() => { const probes = ${JSON.stringify(pts)}.map((p) => window.__e2eTap(p.x, p.y)); window.__trials.app.frame(); return { probes, sig: ${SIG_SRC} }; })()`) as Promise<{ probes: Probe[]; sig: Sig }>;
}

async function waitFor(page: Page, src: string, timeout = 30000): Promise<boolean> {
  return page.waitForFunction(src, null, { timeout, polling: 30 }).then(() => true).catch(() => false);
}

/** Drive the run to `phase` in one evaluate (flat-test: throttle = finish in 8.4 s of sim, throttle + lean back = crash in 0.75 s). */
const DRIVE = (crash: boolean) => `(() => { const t = window.__trials; t.restart(); t.skipCountdown(); t.setInput(${crash ? '{ throttle: 1, brake: 0, lean: -1 }' : '{ throttle: 1, brake: 0, lean: 0 }'}); let n = 0; while (t.phase() === 'riding' && n < 120 * 60) { t.step(1); n++; } t.setInput({ throttle: 0, brake: 0, lean: 0 }); t.app.frame(); return t.phase(); })()`;
/** Stage k of the results = RESULTS_DELAY (0.4 s) + the stage's age threshold, stepped in sim ticks then rendered (the HUD's stage clock is the render's sim time). */
const STAGE_AGE_S = [0, 0.15, 0.35, 0.6, 0.9, 1.1];
const TO_STAGE = (k: number) => `(() => { const t = window.__trials; const r = document.querySelector('.results'); let n = 0; while (!r.classList.contains('show') && n < 240) { t.step(1); n++; } t.step(${Math.ceil(STAGE_AGE_S[k]! * 120) + 1}); t.render(); t.app.frame(); return r.className; })()`;

interface Transition {
  name: string;
  /** Points per offset slot (default GRID_PER_SLOT); the two front-end transitions re-establish through a track load + a backdrop load (~20 s under SwiftShader) and take twice as many points per slot. */
  perSlot?: number;
  /** Perform the transition from wherever the page is; resolves when the new state is established. Returns false when it could not. */
  establish(): Promise<boolean>;
}

/** Whatever the page is in, get back to a live run on flat-test (riding, not paused). */
async function toRun(page: Page): Promise<boolean> {
  let s = await sig(page);
  log(`toRun from ${sigKey(s)}`);
  if (s.screen !== 'run') {
    await page.evaluate(`window.__trials.app.play('flat-test')`);
    if (!(await waitFor(page, `window.__trials.app.screen() === 'run' && window.__trials.phase() !== 'menu'`))) { log('toRun: play did not reach a run'); return false; }
    log('toRun: in run');
  }
  if (await page.evaluate(`!!document.querySelector('.onboard.show')`)) {
    if (!(await waitFor(page, `!!document.querySelector('.onboard.live')`))) { log('toRun: onboard never live'); return false; }
    const c = await centre(page, '.onboard.live .btn');
    if (c) await tap(page, c.x, c.y);
    if (!(await waitFor(page, `!document.querySelector('.onboard.show')`))) { log('toRun: onboard did not dismiss'); return false; }
    log('toRun: onboard dismissed');
  }
  s = await sig(page);
  if (s.paused) await page.evaluate(`window.__trials.app.togglePause(); window.__trials.app.frame()`);
  await page.evaluate(`(() => { const t = window.__trials; t.restart(); t.skipCountdown(); t.setInput({ throttle: 0, brake: 0, lean: 0 }); t.step(2); t.app.frame(); })()`);
  s = await sig(page);
  log(`toRun done: ${sigKey(s)}`);
  return s.phase === 'riding' && !s.paused;
}

function transitions(page: Page, g: Geom): Transition[] {
  const pauseBtn = async (): Promise<boolean> => {
    if (!(await waitFor(page, `document.querySelector('.touch-layer').classList.contains('live')`))) return false;
    const c = await centre(page, '.tz-pause');
    if (!c) return false;
    await tap(page, c.x, c.y);
    await page.evaluate(`window.__trials.app.frame()`);
    return (await sig(page)).paused;
  };
  const resultsLive = async (): Promise<boolean> => {
    if (!(await toRun(page))) return false;
    if ((await page.evaluate(DRIVE(false))) !== 'finished') return false;
    await page.evaluate(TO_STAGE(5));
    return waitFor(page, `!!document.querySelector('.results.live')`);
  };
  return [
    { name: 'ride→crash', establish: async () => (await toRun(page)) && (await page.evaluate(DRIVE(true))) === 'crashed' },
    { name: 'ride→finish', establish: async () => (await toRun(page)) && (await page.evaluate(DRIVE(false))) === 'finished' },
    ...[0, 1, 2, 3, 4, 5].map((k) => ({
      name: `finish→results stage ${k}`,
      establish: async () => {
        if (!(await toRun(page)) || (await page.evaluate(DRIVE(false))) !== 'finished') return false;
        const cls = (await page.evaluate(TO_STAGE(k))) as string;
        return cls.includes(`stage-${k}`);
      },
    })),
    { name: 'pause open', establish: async () => (await toRun(page)) && pauseBtn() },
    {
      name: 'pause close',
      establish: async () => {
        if (!(await toRun(page)) || !(await pauseBtn())) return false;
        if (!(await waitFor(page, `!!document.querySelector('.pause-overlay.live')`))) return false;
        const c = await centre(page, '.pause-overlay.live .tile[data-id=resume]');
        if (!c) return false;
        await tap(page, c.x, c.y);
        await page.evaluate(`window.__trials.app.frame()`);
        const s = await sig(page);
        return !s.paused && s.screen === 'run';
      },
    },
    {
      name: 'results→menu',
      perSlot: GRID_PER_SLOT * 2,
      establish: async () => {
        if (!(await resultsLive())) return false;
        const c = await centre(page, '.results.live .tile[data-id=menu]');
        if (!c) return false;
        await tap(page, c.x, c.y);
        await page.evaluate(`window.__trials.app.frame()`);
        return (await sig(page)).screen === 'menu';
      },
    },
    {
      name: 'menu→tracks',
      perSlot: GRID_PER_SLOT * 2,
      establish: async () => {
        if ((await sig(page)).screen !== 'menu') await page.evaluate(`window.__trials.app.goto('menu')`);
        if (!(await waitFor(page, `!!document.querySelector('.menu-screen.live')`))) return false;
        const c = await page.evaluate(() => {
          for (const b of document.querySelectorAll<HTMLButtonElement>('.menu-screen.live .menu-item')) {
            if (b.textContent?.trim().toLowerCase().startsWith('play')) { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
          }
          return null;
        });
        if (!c) return false;
        await tap(page, c.x, c.y);
        await page.evaluate(`window.__trials.app.frame()`);
        return (await sig(page)).screen === 'tracks';
      },
    },
  ].map((t) => ({ ...t, name: `${t.name}@${g.name}` }));
}

interface GridStats { taps: number; changes: number; legit: number; violations: number }

/** `shard` (round 12): run only the transitions with index % of === k, so the grid splits across contexts by transition. */
async function flowGrid(ctx: BrowserContext, url: string, g: Geom, shard: { k: number; of: number } = { k: 0, of: 1 }): Promise<GridStats> {
  const flow = `grid@${g.name}`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => expect(false, flow, 'pageerror', e.message));
  await page.goto(`${url}/?sw=0&track=flat-test`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await waitFor(page, `!!(window.__trials && window.__trials.app)`);
  await page.evaluate(E2E_TAP_SRC);
  const points: { x: number; y: number }[] = [];
  for (let j = 0; j < GRID_ROWS; j++) for (let i = 0; i < GRID_COLS; i++) points.push({ x: Math.round(((i + 0.5) / GRID_COLS) * g.width), y: Math.round(((j + 0.5) / GRID_ROWS) * g.height) });
  const stats: GridStats = { taps: 0, changes: 0, legit: 0, violations: 0 };
  for (const [ti, tr] of transitions(page, g).entries()) {
    if (ti % shard.of !== shard.k) continue;
    // Pairs (point, offset), each once; an instance serves one slot per offset with GRID_PER_SLOT points.
    const pairs: { p: number; o: number }[] = [];
    for (let o = 0; o < GRID_OFFSETS.length; o++) for (let p = 0; p < points.length; p++) pairs.push({ p: (p + o * 5) % points.length, o });
    const bySlot = GRID_OFFSETS.map((_, o) => pairs.filter((q) => q.o === o).map((q) => q.p));
    const perSlot = tr.perSlot ?? GRID_PER_SLOT;
    const instances = gridInstances > 0 ? Math.min(gridInstances, Math.ceil(points.length / perSlot)) : Math.ceil(points.length / perSlot);
    let established = 0, notEstablished = 0;
    const t0flow = Date.now();
    for (let inst = 0; inst < instances; inst++) {
      log(`${tr.name} instance ${inst}: establishing`);
      let ok = await tr.establish();
      log(`${tr.name} instance ${inst}: ${ok ? 'established' : 'NOT established'}`);
      if (!ok) { notEstablished++; expect(false, tr.name, 'R6-establish', `instance ${inst}: transition could not be established (state ${sigKey(await sig(page))})`); if (notEstablished > 2) break; continue; }
      established++;
      let t0 = Date.now();
      let before = await sig(page);
      for (let o = 0; o < GRID_OFFSETS.length; o++) {
        const slot = bySlot[o]!.slice(inst * perSlot, (inst + 1) * perSlot);
        if (slot.length === 0) continue;
        const wait = GRID_OFFSETS[o]! - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        const pts = slot.map((pi) => points[pi]!);
        const res = await tapSlot(page, pts);
        stats.taps += pts.length;
        const probes = res.probes.map((p, i) => ({ ...p, x: pts[i]!.x, y: pts[i]!.y }));
        const after = res.sig;
        log(`+${GRID_OFFSETS[o]} ms slot: ${probes.map((p) => `${p.x},${p.y} ${p.el} op${p.opacity}${p.live ? ' LIVE' : ''}`).join(' | ')} → ${sigKey(after)}`);
        if (sigKey(after) !== sigKey(before)) {
          stats.changes++;
          const live = probes.filter((p) => p.live);
          if (live.length > 0) stats.legit++;
          else {
            stats.violations++;
            for (const p of probes) expect(false, tr.name, 'R6-ghost-nav', `+${GRID_OFFSETS[o]} ms tap ${p.x},${p.y} on ${p.el} (opacity ${p.opacity}, not live) changed ${sigKey(before)} → ${sigKey(after)}`);
          }
          // The state moved on (legitimately or not): the rest of this instance's slots need a fresh transition.
          ok = await tr.establish();
          if (!ok) { expect(false, tr.name, 'R6-establish', `re-establish after ${sigKey(after)} failed`); break; }
          t0 = Date.now();
          before = await sig(page);
          continue;
        }
        before = after;
      }
    }
    console.log(`  ${tr.name}: ${established} instances (${notEstablished} failed) in ${((Date.now() - t0flow) / 1000).toFixed(0)} s — taps ${stats.taps} changes ${stats.changes} legit ${stats.legit} violations ${stats.violations}`);
    expect(established > 0, tr.name, 'R6-coverage', 'no instance of this transition was established');
  }
  await page.close();
  return stats;
}

/** Every pause / restart hit rect equals its drawn rect: inner corners act, points 6 px outside do not, and neither acts while the button is not drawn (overlay up). */
async function flowHitRects(ctx: BrowserContext, url: string, g: Geom): Promise<void> {
  const flow = `hitrects@${g.name}`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => expect(false, flow, 'pageerror', e.message));
  await page.goto(`${url}/?sw=0&track=flat-test`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await waitFor(page, `!!(window.__trials && window.__trials.app)`);
  if (!(await toRun(page))) { expect(false, flow, 'setup', 'no run'); return page.close(); }
  expect(await waitFor(page, `document.querySelector('.touch-layer').classList.contains('live')`), flow, 'layer-live', 'touch layer never went live');
  const rect = async (sel: string) => page.evaluate((s) => { const r = document.querySelector<HTMLElement>(s)!.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, op: getComputedStyle(document.querySelector<HTMLElement>(s)!).opacity }; }, sel);
  for (const [sel, kind] of [['.tz-pause', 'pause'], ['.tz-restart', 'restart']] as const) {
    const r = await rect(sel);
    expect(parseFloat(r.op) >= 0.5, flow, `${kind}-drawn`, `${sel} opacity ${r.op} while live`);
    const inner: [number, number][] = [[r.l + 2, r.t + 2], [r.r - 2, r.t + 2], [r.l + 2, r.b - 2], [r.r - 2, r.b - 2]];
    const outer: [number, number][] = [[r.l - 6, r.t + 10], [r.r + 6, r.t + 10], [(r.l + r.r) / 2, r.b + 6]];
    const acted = async (x: number, y: number): Promise<boolean> => {
      if (kind === 'pause') {
        // Pause is a tap (latched on pointerup): tap, then one app frame. After the previous tap's pause + resume the layer
        // is re-armed and `.live` lands only once ❚❚ has been drawn for 150 ms again (the invariant) — wait for it, don't race it.
        await waitFor(page, `document.querySelector('.touch-layer').classList.contains('live')`, 5000);
        await tap(page, x, y);
        const s = await frameSig(page);
        if (s.paused) await page.evaluate(`window.__trials.app.togglePause(); window.__trials.app.frame()`);
        return s.paused;
      }
      // Restart is a held input read by the frame poll: finger down, an app frame + a few ticks (a restart edge while
      // riding = one fault, checkpoint respawn), finger up. A frame never runs between a Playwright tap's down and up.
      const f0 = (await page.evaluate(`window.__trials.faults()`)) as number;
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.evaluate(`window.__trials.app.frame(); window.__trials.step(3); window.__trials.app.frame()`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.evaluate(`window.__trials.app.frame(); window.__trials.step(3)`);
      return ((await page.evaluate(`window.__trials.faults()`)) as number) > f0;
    };
    for (const [x, y] of inner) expect(await acted(x, y), flow, `${kind}-inner`, `tap ${x.toFixed(0)},${y.toFixed(0)} inside the drawn rect did not act`);
    for (const [x, y] of outer) expect(!(await acted(x, y)), flow, `${kind}-outer`, `tap ${x.toFixed(0)},${y.toFixed(0)} outside the drawn rect acted`);
  }
  // Under the pause overlay the buttons are not drawn: the pause rect must not resume, the restart rect must not restart.
  await page.evaluate(`window.__trials.app.togglePause(); window.__trials.app.frame()`);
  expect(await page.evaluate(`!document.querySelector('.touch-layer').classList.contains('live')`), flow, 'layer-dead-under-overlay', 'touch layer still live with the pause overlay up');
  await waitFor(page, `parseFloat(getComputedStyle(document.querySelector('.tz-pause')).opacity) < 0.5`, 5000); // the .25 s fade-out
  const rp = await rect('.tz-pause');
  expect(parseFloat(rp.op) < 0.5, flow, 'pause-hidden-under-overlay', `❚❚ opacity ${rp.op} under the overlay`);
  await tap(page, (rp.l + rp.r) / 2, (rp.t + rp.b) / 2);
  const s = await frameSig(page);
  expect(s.paused, flow, 'pause-rect-inert-under-overlay', 'a tap on the hidden ❚❚ rect resumed');
  await page.close();
}

// ---------------------------------------------------------------------------------------------- main

const gridTotals: GridStats[] = [];
const GRID_TRANSITIONS = 6; // transitions(page, g).length: the grid splits across this many contexts by transition
const server = await startServer({});
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0all = Date.now();
type Task = { name: string; run: () => Promise<void> };
const tasks: Task[] = [];
const phoneCtx = (g: Geom): Promise<BrowserContext> =>
  browser.newContext({ viewport: { width: g.width, height: g.height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
/** One phone flow in a context of its own (flows no longer share a context: they run next to each other). */
const phoneTask = (name: string, g: Geom, fn: (ctx: BrowserContext) => Promise<void>): Task => ({
  name,
  run: async () => {
    const ctx = await phoneCtx(g);
    try {
      await fn(ctx);
    } finally {
      await ctx.close();
    }
  },
});
// The loading screen a stranger boots through (docs/tasks/loading-progress-invariant.md): its own servers and browser.
// It measures a throttled network on the wall clock and flags main-thread freezes, so it runs ALONE, before the pool
// (next to 15 other pages it reported freezes that are the box's, not the loader's).
if (wants('boot')) {
  const t0 = Date.now();
  console.log('== boot');
  for (const r of await bootSuite({}, { stillsDir: 'harness/out/boot' })) {
    checks++;
    if (r.fails.length) {
      fails.push({ flow: 'boot', rule: `${r.config.net}/sw=${r.config.sw}/art=${r.config.art}`, detail: r.fails.join('; ') });
      console.log(`  FAIL boot ${r.config.net}/sw=${r.config.sw}/art=${r.config.art}: ${r.fails.join('; ')}`);
    }
  }
  console.log(`  flow boot: ${((Date.now() - t0) / 1000).toFixed(0)} s (alone)`);
}
if (wants('bench')) {
  tasks.push({
    name: 'bench',
    run: async () => {
      console.log('== bench (?bench=1&quick=1, iphone15promax)');
      const r = await benchSuite(browser, server.url, { verbose });
      checks += r.checks;
      for (const f of r.fails) fails.push({ flow: 'bench', rule: 'bench', detail: f });
      if (r.report) {
        fs.mkdirSync('harness/out/bench', { recursive: true });
        fs.writeFileSync('harness/out/bench/device-quick.md', r.text);
        fs.writeFileSync('harness/out/bench/device-quick.json', JSON.stringify(r.report, null, 1));
        console.log(`  bench quick run ${(r.ms / 1000).toFixed(1)} s → harness/out/bench/device-quick.{md,json}`);
      }
    },
  });
}
if (onlyList?.includes('benchfull')) {
  tasks.push({
    name: 'benchfull',
    run: async () => {
      console.log('== benchfull (?bench=1, all eight scenarios, iphone15promax)');
      const r = await benchFull(browser, server.url, { verbose });
      checks += r.checks;
      for (const f of r.fails) fails.push({ flow: 'benchfull', rule: 'benchfull', detail: f });
      if (r.report) {
        fs.mkdirSync('harness/out/bench', { recursive: true });
        fs.writeFileSync('harness/out/bench/device-full.md', r.text);
        fs.writeFileSync('harness/out/bench/device-full.json', JSON.stringify(r.report, null, 1));
        console.log(`  bench full run ${(r.ms / 1000).toFixed(1)} s → harness/out/bench/device-full.{md,json}`);
      }
    },
  });
}
if (wants('desktop')) {
  tasks.push({
    name: 'desktop',
    run: async () => {
      console.log('== desktop');
      const r = await desktopSuite(browser, server.url, { verbose });
      checks += r.checks;
      for (const f of r.fails) fails.push({ flow: 'desktop', rule: 'desktop', detail: f });
    },
  });
}
if (wants('review')) {
  tasks.push({
    name: 'review',
    run: async () => {
      console.log('== review');
      const r = await reviewSuite(browser, server.url, { verbose });
      checks += r.checks;
      for (const f of r.fails) fails.push({ flow: 'review', rule: 'review', detail: f });
    },
  });
}
const gridShards = new Map<string, GridStats[]>();
for (const g of GEOMS) {
  if (geomFilter && g.name !== geomFilter) continue;
  if (wants('front')) tasks.push(phoneTask(`front@${g.name}`, g, (ctx) => flowFront(ctx, server.url, g)));
  if (wants('run')) tasks.push(phoneTask(`run@${g.name}`, g, (ctx) => flowRun(ctx, server.url, g)));
  if ((wants('entry')) && g === GEOMS[0]) tasks.push(phoneTask(`entry@${g.name}`, g, (ctx) => flowEntry(ctx, server.url, g)));
  if (wants('hitrects')) tasks.push(phoneTask(`hitrects@${g.name}`, g, (ctx) => flowHitRects(ctx, server.url, g)));
  if ((wants('grid')) && (gridScope === 'all' || gridShards.size === 0)) {
    const shards: GridStats[] = [];
    gridShards.set(g.name, shards);
    const of = Math.max(1, Math.min(GRID_TRANSITIONS, jobs));
    for (let k = 0; k < of; k++) {
      tasks.push(phoneTask(`grid@${g.name} ${k + 1}/${of}`, g, async (ctx) => {
        shards.push(await flowGrid(ctx, server.url, g, { k, of }));
      }));
    }
  }
}
console.log(`e2e: ${tasks.length} flows on up to ${jobs} contexts (${tasks.map((t) => t.name).join(', ')}); ${loadLine()}`);
try {
  // Longest flows first (the grid shards, bench, boot) so the tail is short; a flow that throws is a FAIL row, not a crash.
  const longFirst = (t: Task): number => (/^(grid|review)/.test(t.name) ? 0 : /^(bench|desktop)/.test(t.name) ? 1 : 2);
  const ordered = jobs > 1 ? [...tasks].sort((a, b) => longFirst(a) - longFirst(b)) : tasks;
  await mapPool(ordered, jobs, async (t) => {
    const t0 = Date.now();
    try {
      await t.run();
    } catch (err) {
      expect(false, t.name, 'threw', err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
    console.log(`  flow ${t.name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  });
  for (const shards of gridShards.values()) {
    gridTotals.push(shards.reduce((a, b) => ({ taps: a.taps + b.taps, changes: a.changes + b.changes, legit: a.legit + b.legit, violations: a.violations + b.violations }), { taps: 0, changes: 0, legit: 0, violations: 0 }));
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`e2e wall ${((Date.now() - t0all) / 1000).toFixed(0)} s on up to ${jobs} contexts; ${loadLine()}`);
for (const t of gridTotals) console.log(`transition grid: ${t.taps} taps, ${t.changes} state changes (${t.legit} legitimate, ${t.violations} ghost)`);
console.log(`\ntouch e2e: ${checks - fails.length}/${checks} checks pass, ${fails.length} fail`);
for (const f of fails) console.log(`  ✗ ${f.flow} ${f.rule}: ${f.detail}`);
process.exit(fails.length ? 1 : 0);
