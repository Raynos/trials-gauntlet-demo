/**
 * Level reviewer e2e (docs/design/game.md §21) — `pnpm harness:e2e --only=review`.
 *
 * Phone (932×430 + 844×390, emulated finger): menu → REVIEW pill → the picker (a row per track, `n / 6 noted`)
 * → tap "First Ride" → the review UI: six segment buttons, tap 4 → segment 4 current; type a comment, rate 4 ★,
 * tag `too hard`; Copy review → the clipboard holds the markdown + the JSON (`segments[3]` carries the note); a
 * one-finger drag on the stage pans (the probe x and the camera x move); RIDE drops the bike and a held gas zone
 * moves it; ‹ Tracks returns to the picker, ‹ Menu to the menu; `?review=b1-first-ride` deep-links to the same UI.
 * Desktop (1280×720, mouse): drag pans, wheel zooms. Stills to harness/out/review/.
 */
import fs from 'node:fs';
import type { Browser, BrowserContext, Page } from 'playwright';

type Expect = (cond: unknown, rule: string, detail: string) => void;

const TRACK = 'b1-first-ride';
const COMMENT = 'kicker lands short, hold gas';

async function boot(ctx: BrowserContext, url: string, query: string, expect: Expect): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => expect(false, 'pageerror', e.message));
  await page.goto(`${url}/?sw=0${query}`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForTimeout(300);
  return page;
}

async function centre(page: Page, selector: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sel) => {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      const inLayer = !!el.closest('.touch-layer.on'); // zone children are pointer-events: none by design (the layer root hit-tests them)
      if (cs.visibility === 'hidden' || (!inLayer && cs.pointerEvents === 'none') || parseFloat(cs.opacity) < 0.5) continue;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, selector);
}

async function waitLive(page: Page, selector: string, timeout = 8000): Promise<boolean> {
  return page.waitForFunction((sel) => !!document.querySelector(sel), selector, { timeout, polling: 30 }).then(() => true).catch(() => false);
}

async function tapSel(page: Page, selector: string, expect: Expect, touch: boolean): Promise<boolean> {
  let c: { x: number; y: number } | null = null;
  const t0 = Date.now();
  while (!c && Date.now() - t0 < 6000) {
    c = await centre(page, selector);
    if (!c) await page.waitForTimeout(100);
  }
  expect(c, 'present', `${selector} is not visible / tappable`);
  if (!c) return false;
  if (touch) await page.touchscreen.tap(c.x, c.y);
  else await page.mouse.click(c.x, c.y);
  return true;
}

const VIEW = `window.__trials.review.view()`;
type View = { trackId: string; seg: number; x: number; dist: number; flying: boolean; riding: boolean; segments: { i: number; from: number; to: number; label: string; kinds: Record<string, number> }[] };
const view = (page: Page): Promise<View> => page.evaluate(VIEW) as Promise<View>;
const camX = (page: Page): Promise<number> => page.evaluate(`window.__trials.camera().pos.x`) as Promise<number>;
/** The camera moves only when a frame renders: wait for one rendered frame (SwiftShader next to 15 other pages starves rAF for seconds), then read it. */
async function camXRendered(page: Page, timeout = 10000): Promise<number> {
  const n0 = (await page.evaluate(`window.__trials.renderedFrames()`)) as number;
  await page.waitForFunction((n) => (window as unknown as { __trials: { renderedFrames(): number } }).__trials.renderedFrames() > n, n0, { timeout, polling: 30 }).catch(() => undefined);
  return camX(page);
}
/** The camera x once it has followed the pan past `c0 + 0.5` (a rendered frame after the pan), else its value at the timeout — the assertion stays `> c0 + 0.5`. */
async function camXMoved(page: Page, c0: number, timeout = 10000): Promise<number> {
  await page.waitForFunction((c) => (window as unknown as { __trials: { camera(): { pos: { x: number } } } }).__trials.camera().pos.x > c + 0.5, c0, { timeout, polling: 30 }).catch(() => undefined);
  return camX(page);
}

/** A CDP touch drag: touchStart, N moves, touchEnd (Playwright's touchscreen only taps). */
async function touchDrag(ctx: BrowserContext, page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function holdTouch(ctx: BrowserContext, page: Page, at: { x: number; y: number }, ms: number): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

export async function reviewSuite(browser: Browser, url: string, opts: { verbose?: boolean; stillsDir?: string } = {}): Promise<{ checks: number; fails: string[] }> {
  let checks = 0;
  const fails: string[] = [];
  const stills = opts.stillsDir ?? 'harness/out/review';
  fs.mkdirSync(stills, { recursive: true });
  const geoms = [
    { name: 'iphone15promax', width: 932, height: 430 },
    { name: 'iphone13', width: 844, height: 390 },
  ];
  for (const g of geoms) {
    const flow = `review@${g.name}`;
    const expect: Expect = (cond, rule, detail) => {
      checks++;
      if (!cond) {
        fails.push(`${flow} ${rule}: ${detail}`);
        console.log(`  FAIL ${flow} ${rule}: ${detail}`);
      }
    };
    const ctx = await browser.newContext({ viewport: { width: g.width, height: g.height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    try {
      await phoneFlow(ctx, url, g, expect, stills);
    } catch (e) {
      expect(false, 'threw', (e as Error).message);
    } finally {
      await ctx.close();
    }
    console.log(`  ${flow}: ${checks} checks so far, ${fails.length} fails`);
  }
  {
    const flow = 'review@desktop1280';
    const expect: Expect = (cond, rule, detail) => {
      checks++;
      if (!cond) {
        fails.push(`${flow} ${rule}: ${detail}`);
        console.log(`  FAIL ${flow} ${rule}: ${detail}`);
      }
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    try {
      await desktopFlow(ctx, url, expect, stills);
    } catch (e) {
      expect(false, 'threw', (e as Error).message);
    } finally {
      await ctx.close();
    }
  }
  return { checks, fails };
}

async function phoneFlow(ctx: BrowserContext, url: string, g: { name: string; width: number; height: number }, expect: Expect, stills: string): Promise<void> {
  const page = await boot(ctx, url, '', expect);
  const still = (name: string): Promise<unknown> => page.screenshot({ path: `${stills}/${g.name}-${name}.png` });

  // Menu → REVIEW pill (a top-level tab, no ?dev=1) → the picker.
  expect(await waitLive(page, '.menu-screen.live'), 'menu-live', 'menu never went live');
  const pill = await centre(page, '.menu-screen.live .menu-item[data-id=review]');
  expect(pill, 'review-pill', 'no REVIEW tab on the main menu');
  const tabsFit = await page.evaluate(() => {
    const band = document.querySelector('.menu-band')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.menu-item')].every((b) => b.getBoundingClientRect().right <= band.right + 1 && b.getBoundingClientRect().width >= 44);
  });
  expect(tabsFit, 'tabs-fit', 'five menu tabs overflow the band');
  if (!pill) return;
  await page.touchscreen.tap(pill.x, pill.y);
  expect(await waitLive(page, '.review-pick-screen.show.live'), 'picker-live', 'the picker did not show / go live');
  const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rvp-row')].map((r) => ({ id: r.dataset['track'], noted: r.querySelector('.noted')?.textContent ?? '' })));
  expect(rows.length >= 15, 'picker-rows', `only ${rows.length} rows`);
  expect(rows.some((r) => r.id === TRACK), 'picker-has-b1', 'no First Ride row');
  expect(rows.every((r) => /^\d \/ 6 noted$/.test(r.noted)), 'picker-noted', `noted column: ${rows.map((r) => r.noted).join(',')}`);
  // Only the picker is hit-testable: the menu's PLAY is dead behind it.
  expect(await page.evaluate(() => !document.querySelector('.menu-screen.live')), 'menu-dead', 'the menu is still live under the picker');
  await still('picker');

  // Pick First Ride → the review UI.
  await tapSel(page, `.review-pick-screen.live .rvp-row[data-track="${TRACK}"]`, expect, true);
  expect(await waitLive(page, '.review-ui.show.live', 20000), 'review-live', 'the review UI did not show / go live');
  expect(await page.evaluate(() => document.querySelectorAll('.review-ui .rv-seg').length) === 6, 'six-segments', 'strip is not six buttons');
  let v = await view(page);
  expect(v.trackId === TRACK && v.seg === 0 && !v.riding, 'opened-seg1', `view ${JSON.stringify({ t: v.trackId, seg: v.seg, riding: v.riding })}`);
  expect(v.segments.length === 6 && v.segments[5]!.to > v.segments[0]!.from, 'segments-span', JSON.stringify(v.segments.map((s) => [s.from, s.to])));
  // The strip and the card keep the track centre clear.
  const clear = await page.evaluate(() => {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const at = document.elementFromPoint(cx, cy);
    return at ? at.className : 'none';
  });
  expect(/rv-stage|touch-layer|^$/.test(clear), 'centre-clear', `track centre is under ${clear}`);

  // Segment 4.
  await tapSel(page, '.review-ui.live .rv-seg[data-seg="4"]', expect, true);
  await page.waitForTimeout(250);
  v = await view(page);
  expect(v.seg === 3, 'seg4', `seg ${v.seg}`);
  expect(v.x >= v.segments[3]!.from && v.x < v.segments[3]!.to, 'seg4-x', `x ${v.x} not in segment 4 [${v.segments[3]!.from}, ${v.segments[3]!.to})`);
  expect(await page.evaluate(() => document.querySelector('.rv-seg.on')?.getAttribute('data-seg')) === '4', 'seg4-lit', 'segment 4 not highlighted');
  const title = await page.evaluate(() => document.querySelector('.rv-seg-title')?.textContent ?? '');
  expect(title.trim().startsWith('4'), 'seg4-title', `card title "${title}"`);
  await still('segment-strip');

  // A note: rating 4, tag too hard, a comment.
  await tapSel(page, '.review-ui.live .rv-star[data-k="4"]', expect, true);
  await tapSel(page, '.review-ui.live .rv-tag[data-tag="too hard"]', expect, true);
  await tapSel(page, '.review-ui.live .rv-comment', expect, true);
  await page.keyboard.type(COMMENT);
  await page.waitForTimeout(600); // the 400 ms debounce
  await still('comment-box');
  expect(await page.evaluate(() => document.querySelectorAll('.rv-star.on').length) === 4, 'rated-4', 'four stars not lit');
  expect(await page.evaluate(() => document.querySelector('.rv-tag[data-tag="too hard"]')?.classList.contains('on')), 'tag-on', 'tag not lit');
  expect(await page.evaluate(() => document.querySelector('.rv-seg[data-seg="4"]')?.classList.contains('noted')), 'seg4-noted-dot', 'segment 4 has no noted dot');

  // Copy review → the clipboard: markdown table + JSON.
  await tapSel(page, '.review-ui.live .rv-copy', expect, true);
  await page.waitForTimeout(400);
  const clip = (await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')) as string;
  const text = clip || ((await page.evaluate(`window.__trials.review.export().text`)) as string);
  expect(clip.length > 0, 'clipboard', 'clipboard empty after Copy review (falling back to export())');
  expect(text.includes('| # | Range | Segment | Rating | Tags | Comment |'), 'md-table', 'no markdown table');
  const fenced = /```json\n(.*)\n```/.exec(text);
  expect(fenced, 'json-fence', 'no JSON fence');
  if (fenced) {
    const data = JSON.parse(fenced[1]!) as { track: string; build: string; at: string; segments: { i: number; from: number; to: number; rating: number; tags: string[]; comment: string }[] };
    expect(data.track === TRACK, 'json-track', data.track);
    expect(typeof data.build === 'string' && data.build.length > 0, 'json-build', data.build);
    expect(data.segments.length === 6, 'json-six', String(data.segments.length));
    const s4 = data.segments[3]!;
    expect(s4.i === 4 && s4.rating === 4 && s4.tags.includes('too hard') && s4.comment === COMMENT, 'json-seg4', JSON.stringify(s4));
    expect(/^\d{4}-\d\d-\d\dT/.test(data.at), 'json-at', data.at);
    if (g.name === 'iphone15promax') fs.writeFileSync(`${stills}/sample-review.md`, text);
  }
  // The note survives a reload of the same segment (localStorage).
  expect((await page.evaluate(() => localStorage.getItem('trials.review.b1-first-ride')))?.includes(COMMENT), 'stored', 'note not in localStorage');

  // Pan: a one-finger drag to the left moves the probe (and the camera) to +x.
  const x0 = (await view(page)).x;
  const c0 = await camXRendered(page);
  await touchDrag(ctx, page, { x: g.width * 0.7, y: g.height * 0.5 }, { x: g.width * 0.4, y: g.height * 0.5 });
  await page.waitForTimeout(500);
  const x1 = (await view(page)).x;
  const c1 = await camXMoved(page, c0);
  expect(x1 > x0 + 1, 'pan-probe', `probe x ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
  expect(c1 > c0 + 0.5, 'pan-camera', `camera x ${c0.toFixed(2)} → ${c1.toFixed(2)}`);
  // Fly: the probe advances on its own.
  await tapSel(page, '.review-ui.live .rv-fly', expect, true);
  await page.waitForTimeout(800);
  await still('fly');
  const xf = (await view(page)).x;
  expect((await view(page)).flying || xf >= x1 + 2, 'fly', `x ${x1.toFixed(2)} → ${xf.toFixed(2)} after 0.8 s`);
  await tapSel(page, '.review-ui.live .rv-fly', expect, true);
  await page.waitForTimeout(100);
  // Ride: the bike drops at the probe and a held gas zone moves it.
  const xp = (await view(page)).x;
  await tapSel(page, '.review-ui.live .rv-ride', expect, true);
  await page.waitForTimeout(300);
  v = await view(page);
  expect(v.riding, 'riding', 'RIDE did not start a ride');
  expect(await page.evaluate(() => document.querySelector('.touch-layer')?.classList.contains('on')), 'strip-on', 'touch strip not enabled while riding');
  const bx0 = (await page.evaluate(`window.__trials.getState().bike.pos.x`)) as number;
  expect(Math.abs(bx0 - xp) < 3, 'ride-drop', `bike dropped at ${bx0.toFixed(2)}, probe was ${xp.toFixed(2)}`);
  // The strip draws for the touch device; typing the comment made the keyboard the active device (a real phone stays on
  // touch), so the first finger on the layer flips it back — then the drawn gas zone is held.
  const gasRect = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.touch-layer.on .tz-throttle');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  expect(gasRect, 'gas-zone-rect', 'no gas zone in the enabled touch layer');
  if (gasRect) await holdTouch(ctx, page, gasRect, 200);
  await page.waitForTimeout(500);
  const gas = await centre(page, '.touch-layer.on.visible .tz-throttle');
  expect(gas, 'gas-zone', 'gas zone not drawn after a touch');
  if (gas) {
    await holdTouch(ctx, page, gas, 1500);
    const bx1 = (await page.evaluate(`window.__trials.getState().bike.pos.x`)) as number;
    expect(bx1 > bx0 + 1, 'ride-moves', `bike x ${bx0.toFixed(2)} → ${bx1.toFixed(2)} after 1.5 s of gas`);
  }
  await still('ride');
  await tapSel(page, '.review-ui.live .rv-ride', expect, true); // Park
  await page.waitForTimeout(200);
  expect(!(await view(page)).riding, 'parked', 'Park did not stop the ride');

  // ‹ Tracks → the picker (row now 1 / 6 noted) → ‹ Menu → the menu.
  await tapSel(page, '.review-ui.live .rv-exit', expect, true);
  expect(await waitLive(page, '.review-pick-screen.show.live', 20000), 'back-to-picker', 'exit did not return to the picker');
  expect(await page.evaluate(() => !document.querySelector('.review-ui.show')), 'review-hidden', 'review UI still shown over the picker');
  const noted = await page.evaluate((id) => document.querySelector(`.rvp-row[data-track="${id}"] .noted`)?.textContent, TRACK);
  expect(noted === '1 / 6 noted', 'picker-count', `row reads "${noted}"`);
  await tapSel(page, '.review-pick-screen.live .backbtn', expect, true);
  expect(await waitLive(page, '.menu-screen.show.live'), 'back-to-menu', 'picker back did not return to the menu');
  await page.close();

  // Deep link.
  const deep = await boot(ctx, url, `&review=${TRACK}`, expect);
  expect(await waitLive(deep, '.review-ui.show.live', 20000), 'deep-link', '?review= did not open the review UI');
  expect((await view(deep)).trackId === TRACK, 'deep-link-track', 'wrong track');
  await deep.close();
}

async function desktopFlow(ctx: BrowserContext, url: string, expect: Expect, stills: string): Promise<void> {
  const page = await boot(ctx, url, `&review=${TRACK}`, expect);
  expect(await waitLive(page, '.review-ui.show.live', 20000), 'review-live', 'the review UI did not show / go live');
  const x0 = (await view(page)).x;
  const c0 = await camXRendered(page);
  await page.mouse.move(900, 360);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(900 - i * 30, 360);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const x1 = (await view(page)).x;
  const c1 = await camXMoved(page, c0);
  expect(x1 > x0 + 1, 'mouse-pan-probe', `probe x ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
  expect(c1 > c0 + 0.5, 'mouse-pan-camera', `camera x ${c0.toFixed(2)} → ${c1.toFixed(2)}`);
  const d0 = (await view(page)).dist;
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(100);
  const d1 = (await view(page)).dist;
  expect(d1 > d0, 'wheel-zoom', `dist ${d0} → ${d1}`);
  await page.keyboard.press('Escape');
  expect(await waitLive(page, '.review-pick-screen.show.live', 20000), 'esc-to-picker', 'Esc did not return to the picker');
  await page.screenshot({ path: `${stills}/desktop-picker.png` });
  await page.close();
}
