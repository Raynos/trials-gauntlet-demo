/**
 * Desktop end-to-end: the keyboard and a gamepad, at two desktop geometries, through every screen a desktop
 * player meets (menu → tracks → run → crash → restart → finish → results → next run, settings, pause), with a
 * real Playwright keyboard (`page.keyboard`) and a scripted `navigator.getGamepads()` pad. Runs from `dist/`
 * with `?sw=0`, in a desktop Chromium context (no touch, fine pointer, default UA).
 *
 *   pnpm harness:e2e --only=desktop
 *
 * What it asserts (each a desktop-only regression the phone suites cannot see):
 *   D1  exactly one front screen visible where expected, none during a run (touch.mts's `visibleScreens`);
 *   D2  the touch layer is never drawn (`.visible`, zones, pause / restart buttons) on a desktop context;
 *   D3  every front screen legend, the pause legend and the results legend show the ACTIVE device's glyphs:
 *       `<kbd>` (Enter / Esc) while the keyboard drives, `<i class="pad">` (A / B) once the pad has spoken;
 *   D4  the keys do what CONTRACT §2.8 says: ↑ gas moves the bike, Esc pauses / resumes, R held ≥ 0.6 s is a
 *       full restart (faults 0), Enter picks a results tile and a new run starts;
 *   D5  the pad (standard mapping): A confirms, RT (7) is gas, Start (9) pauses / resumes, B (1) held is a full
 *       restart, d-pad (14 / 15) moves the results tiles, A picks one.
 *
 * The crash and the finish are driven through the hook (`setInput` + `step`, touch.mts's DRIVE pattern): they
 * prove the flow around a crash / clear, not the physics. b1-first-ride is tried first at full throttle (it clears
 * that way today); should it stop doing so the finish half runs on `flat-test` and the verbose log says so.
 */
import type { Browser, BrowserContext, Page } from 'playwright';

type Geom = { name: string; width: number; height: number };
const GEOMS: Geom[] = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

/** Steps until the run leaves riding / crashed (auto-respawns ride on), full throttle, neutral lean; cap 90 s of sim. */
const FINISH_SRC = `(() => { const t = window.__trials; if (t.phase() === 'countdown') t.skipCountdown(); t.setInput({ throttle: 1, brake: 0, lean: 0 }); let n = 0; while ((t.phase() === 'riding' || t.phase() === 'crashed') && n < 120 * 90) { t.step(1); n++; } t.setInput({ throttle: 0, brake: 0, lean: 0 }); t.app.frame(); return { phase: t.phase(), n, x: t.getState().bike.pos.x }; })()`;
/** Gas + lean back from the start: the front wheel lifts and the bike loops — a crash within a couple of seconds of sim. */
const CRASH_SRC = `(() => { const t = window.__trials; if (t.phase() === 'countdown') t.skipCountdown(); t.setInput({ throttle: 1, brake: 0, lean: -1 }); let n = 0; while (t.phase() === 'riding' && n < 120 * 20) { t.step(1); n++; } t.setInput({ throttle: 0, brake: 0, lean: 0 }); t.app.frame(); return { phase: t.phase(), n, faults: t.faults() }; })()`;
/** Stage k of the results = RESULTS_DELAY (0.4 s) + the stage's age threshold, stepped in sim ticks then rendered (touch.mts's TO_STAGE). */
const STAGE_AGE_S = [0, 0.15, 0.35, 0.6, 0.9, 1.1];
const TO_STAGE = (k: number) => `(() => { const t = window.__trials; const r = document.querySelector('.results'); let n = 0; while (!r.classList.contains('show') && n < 240) { t.step(1); n++; } t.step(${Math.ceil(STAGE_AGE_S[k]! * 120) + 1}); t.render(); t.app.frame(); return r.className; })()`;
const STATE_SRC = `(() => { const t = window.__trials; return { phase: t.phase(), faults: t.faults(), x: t.getState().bike.pos.x, screen: t.app.screen(), paused: t.app.paused(), runTime: t.runTime() }; })()`;
/** Installed before the app boots: one connected standard-mapping pad, driven by `__padSet` / `__padAxis`. */
const PAD_INIT = `(() => {
  window.__pad = { id: 'e2e', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad, null, null, null] });
  window.__padSet = (btn, value) => { const b = window.__pad.buttons[btn]; b.pressed = value > 0.5; b.touched = value > 0; b.value = value; window.__pad.timestamp++; };
  window.__padAxis = (i, v) => { window.__pad.axes[i] = v; window.__pad.timestamp++; };
})()`;
const BTN = { A: 0, B: 1, Y: 3, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

interface RunState { phase: string; faults: number; x: number; screen: string; paused: boolean; runTime: number }

export async function desktopSuite(browser: Browser, url: string, opts: { verbose?: boolean } = {}): Promise<{ checks: number; fails: string[] }> {
  const verbose = !!opts.verbose;
  let checks = 0;
  const fails: string[] = [];
  const log = (m: string): void => { if (verbose) console.log(`    ${new Date().toISOString().slice(11, 23)} ${m}`); };

  for (const g of GEOMS) {
    for (const device of ['kb', 'pad'] as const) {
      const flow = `desktop ${device}@${g.name}`;
      const before = { checks, fails: fails.length };
      const ctx = await browser.newContext({ viewport: { width: g.width, height: g.height }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
      try {
        const f = new Flow(ctx, url, flow, device, log, (cond, rule, detail) => {
          checks++;
          if (!cond) {
            fails.push(`${flow} ${rule}: ${detail}`);
            console.log(`  FAIL ${flow} ${rule}: ${detail}`);
          }
        });
        await f.run();
      } catch (e) {
        checks++;
        fails.push(`${flow} threw: ${(e as Error).message}`);
        console.log(`  FAIL ${flow} threw: ${(e as Error).message}`);
      } finally {
        await ctx.close();
      }
      console.log(`  ${flow}: ${checks - before.checks} checks, ${fails.length - before.fails} fails`);
    }
  }
  return { checks, fails };
}

type Expect = (cond: unknown, rule: string, detail: string) => void;

class Flow {
  private page!: Page;
  constructor(
    private readonly ctx: BrowserContext,
    private readonly url: string,
    private readonly flow: string,
    private readonly device: 'kb' | 'pad',
    private readonly log: (m: string) => void,
    private readonly expect: Expect,
  ) {}

  // -- primitives -------------------------------------------------------------------------------------------

  private async waitFor(src: string, timeout = 30000): Promise<boolean> {
    return this.page.waitForFunction(src, null, { timeout, polling: 30 }).then(() => true).catch(() => false);
  }

  private async screens(): Promise<string[]> {
    return this.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.screen')]
        .filter((el) => getComputedStyle(el).visibility !== 'hidden' && el.classList.contains('show'))
        .map((el) => /(\w+)-screen/.exec(el.className)?.[1] ?? el.className),
    );
  }

  private async state(): Promise<RunState> {
    return this.page.evaluate(STATE_SRC) as Promise<RunState>;
  }

  /** D1: exactly the expected front screens are visible (`[]` during a run). */
  private async expectScreens(want: string[], rule: string): Promise<void> {
    const got = await this.screens();
    this.expect(got.join() === want.join(), rule, `expected screens [${want}] got [${got}]`);
  }

  /**
   * D2: the touch layer is never DRAWN on a desktop context. `.on` is the run's enabled state (a desktop with a
   * touchscreen may still tap it: pointer-events only); `.visible` is the drawn strip + zones + buttons, set only
   * when the active device is touch — so the assertion is no `.visible`, no zone / button above opacity 0.
   */
  private async expectNoTouch(rule: string): Promise<void> {
    const tl = await this.page.evaluate(`(() => { const tl = document.querySelector('.touch-layer'); if (!tl) return { cls: 'absent', drawn: 0 }; const drawn = [...document.querySelectorAll('.tz, .tz-btn')].filter((z) => parseFloat(getComputedStyle(z).opacity) > 0.05 && getComputedStyle(z).visibility !== 'hidden').length; return { cls: tl.className, drawn }; })()`) as { cls: string; drawn: number };
    this.expect(!/\bvisible\b/.test(tl.cls) && tl.drawn === 0, rule, `touch layer drawn on a desktop: '${tl.cls}', ${tl.drawn} zones/buttons visible`);
  }

  /** D3: a legend shows the active device's glyphs. */
  private async expectLegend(sel: string, rule: string, dev: 'kb' | 'pad' = this.device): Promise<void> {
    const info = await this.page.evaluate((s) => {
      const el = document.querySelector<HTMLElement>(s);
      if (!el) return null;
      return { kbd: el.querySelectorAll('kbd').length, pad: el.querySelectorAll('i.pad').length, padA: el.querySelectorAll('i.pad.a').length, text: el.textContent ?? '', html: el.innerHTML.slice(0, 200) };
    }, sel);
    if (!info) { this.expect(false, rule, `${sel} not found`); return; }
    if (dev === 'kb') this.expect(info.kbd > 0 && info.pad === 0 && /Enter|Esc/.test(info.text), rule, `${sel} should show keyboard glyphs: ${info.html}`);
    else this.expect(info.pad > 0 && info.padA > 0 && info.kbd === 0 && !/Enter|Esc/.test(info.text), rule, `${sel} should show pad glyphs: ${info.html}`);
  }

  /** One app input poll (the app's own rAF loop also polls; this makes an edge deterministic). */
  private async frame(): Promise<void> {
    await this.page.evaluate(`window.__trials.app.frame()`);
  }

  private async padSet(btn: number, value: number): Promise<void> {
    await this.page.evaluate(`window.__padSet(${btn}, ${value}); window.__trials.app.frame();`);
  }

  /** A confirm / back / pause / nav edge on the active device. */
  private async press(what: 'confirm' | 'back' | 'pause' | 'left' | 'right' | 'down' | 'up'): Promise<void> {
    if (this.device === 'kb') {
      const key = { confirm: 'Enter', back: 'Escape', pause: 'Escape', left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', up: 'ArrowUp' }[what];
      await this.page.keyboard.press(key);
      await this.frame();
    } else {
      const btn = { confirm: BTN.A, back: BTN.B, pause: BTN.START, left: BTN.LEFT, right: BTN.RIGHT, down: BTN.DOWN, up: BTN.UP }[what];
      await this.padSet(btn, 1);
      await this.page.waitForTimeout(60);
      await this.padSet(btn, 0);
    }
    this.log(`press ${what}`);
  }

  /** Hold / release gas (↑ / RT) and restart (R / B). */
  private async hold(what: 'gas' | 'restart', down: boolean): Promise<void> {
    if (this.device === 'kb') {
      const key = what === 'gas' ? 'ArrowUp' : 'KeyR';
      if (down) await this.page.keyboard.down(key);
      else await this.page.keyboard.up(key);
    } else {
      await this.padSet(what === 'gas' ? BTN.RT : BTN.B, down ? 1 : 0);
    }
    await this.frame();
    this.log(`${what} ${down ? 'down' : 'up'}`);
  }

  // -- the flow ---------------------------------------------------------------------------------------------

  async run(): Promise<void> {
    const { flow } = this;
    if (this.device === 'pad') await this.ctx.addInitScript(PAD_INIT);
    this.page = await this.ctx.newPage();
    this.page.on('pageerror', (e) => this.expect(false, 'pageerror', e.message));
    await this.page.goto(`${this.url}/?sw=0`);
    await this.page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
    await this.waitFor(`!!(window.__trials && window.__trials.app)`, 30000);
    await this.page.waitForTimeout(300);
    this.log(`${flow} booted`);

    // Boot: the menu, alone; no touch layer; a pad context sees the scripted pad.
    await this.expectScreens(['menu'], 'boot-menu');
    await this.expectNoTouch('D2-boot');
    if (this.device === 'pad') this.expect(await this.page.evaluate(`navigator.getGamepads()[0] && navigator.getGamepads()[0].mapping === 'standard'`), 'pad-injected', 'scripted pad not visible through navigator.getGamepads()');
    await this.waitFor(`!!document.querySelector('.menu-screen.live')`, 10000);
    await this.page.waitForTimeout(300); // SCREEN_GRACE_MS after the menu shows

    // Menu → Settings (two right, confirm) → legend shows this device → back → menu.
    await this.press('right');
    await this.page.waitForTimeout(80);
    await this.press('right');
    await this.page.waitForTimeout(80);
    const focused = await this.page.evaluate(`(document.querySelector('.menu-screen .menu-item.on') || { dataset: {} }).dataset.id || ''`) as string;
    this.expect(/settings/i.test(focused), 'menu-nav', `two nav-right presses should focus Settings, focused '${focused}'`);
    await this.press('confirm');
    this.expect(await this.waitFor(`!!document.querySelector('.settings-screen.show')`, 10000), 'menu→settings', 'settings screen did not show after confirm on Settings');
    await this.page.waitForTimeout(300);
    await this.expectScreens(['settings'], 'settings-alone');
    await this.expectLegend('.settings-screen .legend', 'D3-settings-legend');
    await this.expectNoTouch('D2-settings');
    await this.press('back');
    this.expect(await this.waitFor(`!!document.querySelector('.menu-screen.show') && !document.querySelector('.settings-screen.show')`, 10000), 'settings→menu', 'back from settings did not return to the menu');
    await this.page.waitForTimeout(350);
    await this.expectScreens(['menu'], 'menu-again');

    // Menu → Play (focus resets to Play on show) → tracks.
    const focusedPlay = await this.page.evaluate(`(document.querySelector('.menu-screen .menu-item.on') || { dataset: {} }).dataset.id || ''`) as string;
    this.expect(/play/i.test(focusedPlay), 'menu-focus-play', `menu should re-focus Play on show, focused '${focusedPlay}'`);
    await this.press('confirm');
    this.expect(await this.waitFor(`!!document.querySelector('.tracks-screen.show')`, 10000), 'menu→tracks', 'track select did not show after confirm on Play');
    await this.page.waitForTimeout(350);
    await this.expectScreens(['tracks'], 'tracks-alone');
    await this.expectLegend('.tracks-screen .legend', 'D3-tracks-legend');
    await this.expectNoTouch('D2-tracks');
    // The focused pin is the first campaign track (B1) on the Industrial page.
    await this.waitFor(`!!document.querySelector('.tracks-screen.live .tpin.on')`, 10000);
    const card = await this.page.evaluate(`(() => { const c = document.querySelector('.tracks-screen .tpin.on'); return c ? { text: c.textContent, disabled: c.disabled, cls: c.className } : null; })()`) as { text: string; disabled: boolean; cls: string } | null;
    this.expect(card && !card.disabled && !/locked/.test(card.cls), 'tracks-focus', `focused card ${JSON.stringify(card)}`);
    await this.press('confirm');
    // SwiftShader stalls the main thread for seconds on the run's first frames: wait for the handoff, don't time it.
    this.expect(await this.waitFor(`window.__trials.app.screen() === 'run' && ![...document.querySelectorAll('.screen')].some((el) => el.classList.contains('show'))`, 60000), 'card→run', `run did not start after confirm on the card: screens [${await this.screens()}]`);
    await this.expectScreens([], 'run-no-screens');
    const track0 = await this.page.evaluate(`window.__trials.info().trackId`) as string;
    this.log(`in run on ${track0}`);

    // First-launch onboarding card: confirm dismisses it.
    if (await this.waitFor(`!!document.querySelector('.onboard.show')`, 5000)) {
      await this.page.waitForTimeout(200);
      await this.press('confirm');
      this.expect(await this.waitFor(`!document.querySelector('.onboard.show')`, 10000), 'onboard-dismiss', 'onboarding card did not dismiss on confirm');
    } else this.expect(false, 'onboard-shown', 'first-launch onboarding card never showed in a fresh context');
    await this.expectNoTouch('D2-run');

    // Gas: the bike must move once the countdown is over.
    this.expect(await this.waitFor(`['countdown','riding'].includes(window.__trials.phase()) && !window.__trials.app.paused()`, 30000), 'run-live', `run never went live: ${JSON.stringify(await this.state())}`);
    await this.page.evaluate(`window.__trials.skipCountdown()`);
    const x0 = (await this.state()).x;
    await this.hold('gas', true);
    const moved = await this.waitFor(`window.__trials.getState().bike.pos.x > ${x0} + 1`, 20000);
    await this.hold('gas', false);
    const s1 = await this.state();
    this.expect(moved, 'D4-gas-moves', `bike x ${x0.toFixed(2)} → ${s1.x.toFixed(2)} while holding gas (${JSON.stringify(s1)})`);
    // The active device is now this one: the HUD's results legend (hidden, but already re-rendered) follows.
    await this.expectLegend('.results .legend', 'D3-hud-legend');

    // Pause (Esc / Start) → overlay with this device's legend → same key resumes.
    await this.press('pause');
    this.expect(await this.waitFor(`!!document.querySelector('.pause-overlay.show') && window.__trials.app.paused()`, 10000), 'D4-pause', 'pause overlay did not show');
    await this.expectLegend('.pause-overlay .legend', 'D3-pause-legend');
    await this.expectScreens([], 'pause-no-screens');
    await this.expectNoTouch('D2-pause');
    await this.page.waitForTimeout(300);
    await this.press('pause');
    this.expect(await this.waitFor(`!document.querySelector('.pause-overlay.show') && !window.__trials.app.paused()`, 10000), 'D4-resume', 'pause overlay still up after the second press');
    if (this.device === 'pad') {
      // B while paused = back = resume too.
      await this.press('pause');
      await this.waitFor(`!!document.querySelector('.pause-overlay.show')`, 10000);
      await this.page.waitForTimeout(300);
      await this.press('back');
      this.expect(await this.waitFor(`!document.querySelector('.pause-overlay.show') && !window.__trials.app.paused()`, 10000), 'D5-b-resumes', 'B did not resume from the pause overlay');
    }

    // Crash through the hook (gas + lean back), then the auto-respawn: riding again with a fault.
    const crash = await this.page.evaluate(CRASH_SRC) as { phase: string; n: number; faults: number };
    this.expect(crash.phase === 'crashed', 'crash', `expected crashed after gas+lean back, got ${JSON.stringify(crash)}`);
    this.expect(await this.waitFor(`window.__trials.phase() === 'riding' && window.__trials.faults() >= 1`, 15000), 'respawn', `no auto-respawn with a fault: ${JSON.stringify(await this.state())}`);

    // Full restart: R / B held ≥ 0.6 s → faults 0, countdown / riding from the start.
    await this.hold('restart', true);
    const restarted = await this.waitFor(`window.__trials.faults() === 0 && ['countdown','riding'].includes(window.__trials.phase())`, 10000);
    await this.hold('restart', false);
    const s2 = await this.state();
    this.expect(restarted && s2.faults === 0, 'D4-hold-restart', `held restart should reset the run: ${JSON.stringify(s2)}`);
    await this.page.waitForTimeout(300);

    // Finish through the hook. b1 at full throttle first; else flat-test (a lab track anyone can clear flat out).
    let fin = await this.page.evaluate(FINISH_SRC) as { phase: string; n: number; x: number };
    let finishTrack = track0;
    if (fin.phase !== 'finished') {
      // FINISH fallback: b1-first-ride was not cleared by full throttle + neutral lean (see the report); flat-test is.
      this.log(`${track0} not cleared flat out (${JSON.stringify(fin)}); switching to flat-test`);
      await this.page.evaluate(`window.__trials.app.play('flat-test')`);
      this.expect(await this.waitFor(`window.__trials.app.screen() === 'run' && window.__trials.info().trackId === 'flat-test' && ['countdown','riding'].includes(window.__trials.phase())`, 60000), 'flat-test-load', 'flat-test did not load for the finish half');
      if (await this.page.evaluate(`!!document.querySelector('.onboard.show')`)) await this.press('confirm');
      await this.page.waitForTimeout(200);
      fin = await this.page.evaluate(FINISH_SRC) as { phase: string; n: number; x: number };
      finishTrack = 'flat-test';
    }
    this.expect(fin.phase === 'finished', 'finish', `run did not finish on ${finishTrack}: ${JSON.stringify(fin)}`);

    // Results: stage 3+ (tiles up), the device's legend, ←/→ moves the focus, confirm picks → a new run.
    const cls = await this.page.evaluate(TO_STAGE(3)) as string;
    this.expect(await this.waitFor(`/\\bstage-[345]\\b/.test(document.querySelector('.results').className) && document.querySelector('.results').classList.contains('show')`, 10000), 'results-stage3', `results never reached stage 3: '${cls}' → '${await this.page.evaluate(`document.querySelector('.results').className`)}'`);
    await this.expectLegend('.results .legend', 'D3-results-legend');
    await this.expectScreens([], 'results-no-screens');
    await this.expectNoTouch('D2-results');
    const tiles = () => this.page.evaluate(`[...document.querySelectorAll('.results .tile')].map((t) => t.dataset.id + (t.classList.contains('on') ? '*' : '') + (t.disabled ? '-' : ''))`) as Promise<string[]>;
    const t0 = await tiles();
    const nextEnabled = t0.some((t) => t.startsWith('next') && !t.endsWith('-'));
    this.expect(t0.some((t) => t.includes('*')), 'results-focus', `a results tile should be focused: ${t0}`);
    await this.press('right');
    await this.page.waitForTimeout(60);
    const t1 = await tiles();
    this.expect(t1.join() !== t0.join(), 'D4-results-nav-right', `nav right should move the tile focus: ${t0} → ${t1}`);
    await this.press('left');
    await this.page.waitForTimeout(60);
    const t2 = await tiles();
    this.expect(t2.join() === t0.join(), 'D4-results-nav-left', `nav left should move it back: ${t1} → ${t2}`);
    // Land on NEXT (or RETRY when next is disabled) and pick it.
    const target = nextEnabled ? 'next' : 'retry';
    for (let i = 0; i < 4 && !(await tiles()).includes(`${target}*`); i++) { await this.press('right'); await this.page.waitForTimeout(60); }
    this.expect((await tiles()).includes(`${target}*`), 'results-target', `could not focus ${target}: ${await tiles()}`);
    await this.press('confirm');
    this.expect(await this.waitFor(`!document.querySelector('.results.show') && window.__trials.app.screen() === 'run' && ['countdown','riding'].includes(window.__trials.phase())`, 60000), 'D4-results-pick', `${target} did not start a new run: ${JSON.stringify(await this.state())} results='${await this.page.evaluate(`document.querySelector('.results').className`)}'`);
    const track1 = await this.page.evaluate(`window.__trials.info().trackId`) as string;
    if (target === 'next') this.expect(track1 !== finishTrack, 'next-track', `NEXT should load a different track (was ${finishTrack}, now ${track1})`);
    else this.expect(track1 === finishTrack, 'retry-track', `RETRY should re-run ${finishTrack}, got ${track1}`);
    await this.expectScreens([], 'new-run-no-screens');
    await this.expectNoTouch('D2-new-run');
    await this.page.close();
  }
}
