/**
 * `?bench=1` end-to-end (Rider on Glass G2): the on-device benchmark, driven headlessly on `dist/` at the phone
 * geometry with `&quick=1` (menu + garage, 3 s each). SwiftShader numbers are not phone numbers — this proves
 * the *instrument*: the START card goes live and a tap starts it, both scenarios run, the report panel renders,
 * the Copy button is `.live`, the JSON carries every field, and the toggles change the split (`&no=render` →
 * submit 0 in the garage; `&no=hud` → hud 0; the baseline garage has a non-zero submit and draw calls).
 *
 *   pnpm harness:e2e --only=bench
 */
import type { Browser, BrowserContext, Page } from 'playwright';

export interface BenchE2eResult {
  checks: number;
  fails: string[];
  /** The baseline run's report (for the round's evidence). */
  report: unknown;
  text: string;
  ms: number;
}

type ScenarioRow = {
  id: string;
  tier: string;
  cap: number;
  ticksPerFrame: number;
  fps: number;
  frames: number;
  rafHz: number;
  dropped: number;
  total: { p50: number };
  submit: { p50: number; max: number };
  hud: { p50: number; max: number };
  audio: { p50: number; max: number };
  physics: { p50: number };
  render: Record<string, unknown> | null;
};
type Report = { kind: string; v: number; scenarios: ScenarioRow[]; device: Record<string, unknown>; thermal: unknown; build: string; no: string[] };

const REPORT_FIELDS = ['kind', 'v', 'build', 'at', 'url', 'quick', 'no', 'capParam', 'device', 'physics', 'qualityWhy', 'scenarios', 'thermal'];
const DEVICE_FIELDS = ['ua', 'platform', 'viewport', 'screen', 'devicePixelRatio', 'deviceMemory', 'hardwareConcurrency', 'battery', 'reduceMotion', 'standalone', 'longTasksSupported'];
const SCENARIO_FIELDS = ['id', 'label', 'tier', 'cap', 'seconds', 'frames', 'fps', 'fpsFirst5', 'fpsLast5', 'dropped', 'worstMs', 'interval', 'raf', 'rafHz', 'total', 'poll', 'physics', 'ticksPerFrame', 'hud', 'audio', 'submit', 'other', 'longTasks', 'heapMB', 'hidden', 'render'];

async function runOnce(ctx: BrowserContext, url: string, query: string, log: (m: string) => void, quick = true): Promise<{ report: Report; text: string; page: Page; ms: number }> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`${url}/?sw=0&bench=1${quick ? '&quick=1' : ''}${query}`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('.bench-start.live'), null, { timeout: 15000 });
  const c = await page.evaluate(() => {
    const r = document.querySelector('.bench-start')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForFunction(() => (window as unknown as { __rockhop?: { bench?: { state(): { running: boolean } } } }).__rockhop?.bench?.state().running === true, null, { timeout: 5000 });
  log(`bench started (${query || 'baseline'})`);
  await page.waitForFunction(() => (window as unknown as { __rockhop: { bench: { state(): { done: boolean } } } }).__rockhop.bench.state().done, null, { timeout: quick ? 90000 : 600000 });
  const ms = Date.now() - t0;
  const report = (await page.evaluate(() => (window as unknown as { __rockhop: { bench: { report(): unknown } } }).__rockhop.bench.report())) as Report;
  const text = (await page.evaluate(() => (window as unknown as { __rockhop: { bench: { text(): string } } }).__rockhop.bench.text())) ?? '';
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  return { report, text, page, ms };
}

/**
 * `--only=benchfull`: the whole scenario list once (≈ 3 min of wall clock plus SwiftShader's frame times): eight
 * scenarios in order, the ride rows advanced physics (ticks per frame > 0), the forced tiers and the cap-60 row
 * took effect. Numbers are not asserted — they are this host's, not a phone's — the report is written for the round.
 */
export async function benchFull(browser: Browser, url: string, opts: { verbose?: boolean } = {}): Promise<BenchE2eResult> {
  const log = (m: string): void => {
    if (opts.verbose) console.log(`    ${m}`);
  };
  const fails: string[] = [];
  let checks = 0;
  const expect = (cond: unknown, detail: string): void => {
    checks++;
    if (!cond) {
      fails.push(detail);
      console.log(`  FAIL benchfull: ${detail}`);
    }
  };
  const ctx = await browser.newContext({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  let out: { report: Report; text: string; ms: number } | null = null;
  try {
    const r = await runOnce(ctx, url, '', log, false);
    out = r;
    const ids = r.report.scenarios.map((s) => s.id);
    expect(ids.join() === 'menu,garage,b1-start,b1-ride,b1-ride-low,b1-ride-medium,b1-ride-high,b1-ride-cap60', `scenario order: ${ids.join()}`);
    for (const s of r.report.scenarios) {
      expect(s.frames >= 3, `${s.id}: ${s.frames} frames`);
      if (s.id.startsWith('b1-ride')) expect(s.ticksPerFrame > 0, `${s.id}: physics advanced (ticks/frame ${s.ticksPerFrame})`);
      if (s.id.startsWith('b1-ride')) expect(s.submit.p50 > 0, `${s.id}: renders (submit p50 ${s.submit.p50})`);
    }
    const by = (id: string): ScenarioRow | undefined => r.report.scenarios.find((s) => s.id === id);
    const tiers = ['low', 'medium', 'high'].map((t) => by('b1-ride-' + t)?.tier);
    expect(tiers.join() === 'low,medium,high', `forced tiers: ${tiers.join()}`);
    expect(by('b1-ride-high')?.render?.['tier'] === 'high', `renderer tier on the high row: ${String(by('b1-ride-high')?.render?.['tier'])}`);
    expect(by('b1-ride-cap60')?.cap === 60, `cap-60 row cap ${by('b1-ride-cap60')?.cap}`);
    expect(by('b1-ride')?.cap === 30, `phone default cap on the ride row: ${by('b1-ride')?.cap}`);
    expect(r.report.thermal && (r.report.thermal as { scenario: string }).scenario === 'b1-ride-high', `thermal proxy from the high ride: ${JSON.stringify(r.report.thermal)}`);
    // Back on the menu with the tier / toggles restored, the report up.
    const after = await r.page.evaluate(() => ({ screen: (window as unknown as { __rockhop: { app: { screen(): string } } }).__rockhop.app.screen(), copy: !!document.querySelector('.bench-copy') }));
    expect(after.screen === 'menu' && after.copy, `ends on the menu with the report: ${JSON.stringify(after)}`);
    await r.page.close();
  } catch (e) {
    expect(false, `benchfull threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
  return { checks, fails, report: out?.report ?? null, text: out?.text ?? '', ms: out?.ms ?? 0 };
}

export async function benchSuite(browser: Browser, url: string, opts: { verbose?: boolean } = {}): Promise<BenchE2eResult> {
  const log = (m: string): void => {
    if (opts.verbose) console.log(`    ${m}`);
  };
  const fails: string[] = [];
  let checks = 0;
  const expect = (cond: unknown, detail: string): void => {
    checks++;
    if (!cond) {
      fails.push(detail);
      console.log(`  FAIL bench: ${detail}`);
    }
  };
  const ctx = await browser.newContext({
    viewport: { width: 932, height: 430 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  let baseline: { report: Report; text: string; ms: number } | null = null;
  try {
    // -- baseline: the instrument itself ---------------------------------------------------------------
    const b = await runOnce(ctx, url, '', log);
    baseline = b;
    const { report: r, text, page } = b;
    expect(r && r.kind === 'rockhop-bench' && r.v === 1, `report kind/v: ${JSON.stringify(r && { kind: r.kind, v: r.v })}`);
    for (const f of REPORT_FIELDS) expect(r && f in (r as unknown as Record<string, unknown>), `report field missing: ${f}`);
    for (const f of DEVICE_FIELDS) expect(r?.device && f in r.device, `device field missing: ${f}`);
    expect(r?.scenarios?.length === 2, `quick run has 2 scenarios, got ${r?.scenarios?.length}`);
    expect(r?.scenarios?.[0]?.id === 'menu' && r?.scenarios?.[1]?.id === 'garage', `scenario order menu, garage — got ${r?.scenarios?.map((s) => s.id).join(',')}`);
    for (const s of r?.scenarios ?? []) {
      for (const f of SCENARIO_FIELDS) expect(f in s, `scenario ${s.id} field missing: ${f}`);
      expect(s.frames >= 5, `scenario ${s.id} recorded ${s.frames} frames (SwiftShader host; ≥ 5 expected in 3 s)`);
      expect(s.rafHz > 0, `scenario ${s.id} rafHz ${s.rafHz}`);
    }
    const menu = r?.scenarios?.find((s) => s.id === 'menu');
    const garage = r?.scenarios?.find((s) => s.id === 'garage');
    // The menu covers the canvas: render off → submit 0 by construction; the garage renders the idle bike.
    expect(menu && menu.submit.max === 0, `menu submit max ${menu?.submit.max} (render is off under the covered canvas)`);
    expect(garage && garage.submit.p50 > 0, `garage submit p50 ${garage?.submit.p50} (expected > 0: the idle bike renders)`);
    expect(garage?.render && typeof garage.render['calls'] === 'number' && (garage.render['calls'] as number) > 0, `garage debugInfo calls: ${String(garage?.render?.['calls'])}`);
    expect(garage?.render && typeof garage.render['tier'] === 'string' && typeof garage.render['rtMpx'] === 'number', `garage debugInfo tier/rtMpx: ${JSON.stringify(garage?.render && { tier: garage.render['tier'], rtMpx: garage.render['rtMpx'] })}`);
    // The report string: markdown table + JSON block, the JSON parses back to the same object.
    expect(text.startsWith('## Trials bench'), 'report text starts with the markdown header');
    const m = /```json\n([\s\S]*?)\n```/.exec(text);
    expect(m, 'report text carries a ```json block');
    if (m) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(m[1]!);
      } catch {
        parsed = null;
      }
      expect(parsed && JSON.stringify(parsed) === JSON.stringify(r), 'the JSON block equals report()');
    }
    expect(text.includes('| menu |') && text.includes('| garage |'), 'markdown table has one row per scenario');
    // The panel: rendered, one row per scenario, Copy live (drawn ≥ 150 ms, live.ts), Share only when navigator.share exists.
    await page.waitForFunction(() => !!document.querySelector('.bench-copy.live'), null, { timeout: 5000 }).catch(() => undefined);
    const panel = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>('.bench-report');
      const copy = document.querySelector<HTMLElement>('.bench-copy');
      const cs = p ? getComputedStyle(p) : null;
      return {
        shown: !!p && !p.hidden && cs?.display !== 'none' && cs?.visibility !== 'hidden',
        rows: p ? p.querySelectorAll('tbody tr').length : 0,
        copyLive: !!copy?.classList.contains('live'),
        copyRect: copy ? copy.getBoundingClientRect().height : 0,
        status: document.querySelector<HTMLElement>('.bench-status')?.hidden,
        meter: document.querySelector('.fpsmeter')?.textContent ?? '',
        share: !!document.querySelector('.bench-share'),
        canShare: typeof navigator.share === 'function',
      };
    });
    expect(panel.shown, 'report panel is shown at the end');
    expect(panel.rows === 2, `report panel rows ${panel.rows}`);
    expect(panel.copyLive, 'Copy report button is .live');
    expect(panel.copyRect >= 44, `Copy button height ${panel.copyRect} (≥ 44)`);
    expect(panel.status === true, 'status line hidden after the run');
    expect(/fps/.test(panel.meter), `fps meter still present: "${panel.meter}"`);
    expect(panel.share === panel.canShare, `Share button iff navigator.share (${panel.share} vs ${panel.canShare})`);
    // The bench report also lands in the local telemetry (`rockhop.benchlog`) and in the run-log export.
    const stored = await page.evaluate(() => {
      try {
        const v = JSON.parse(localStorage.getItem('rockhop.benchlog') ?? '[]') as unknown[];
        return v.length;
      } catch {
        return -1;
      }
    });
    expect(stored === 1, `rockhop.benchlog holds ${stored} report(s)`);
    await page.screenshot({ path: 'harness/out/bench/report-panel.png' }).catch(() => undefined);
    await page.close();

    // -- toggles change the split -------------------------------------------------------------------------
    const nr = await runOnce(ctx, url, '&no=render', log);
    const g2 = nr.report.scenarios.find((s) => s.id === 'garage');
    expect(g2 && g2.submit.max === 0, `&no=render: garage submit max ${g2?.submit.max} (expected 0)`);
    expect(g2 && g2.frames >= 5, `&no=render: garage frames ${g2?.frames}`);
    expect(nr.report.no.join() === 'render', `&no=render recorded in report.no: ${nr.report.no.join()}`);
    await nr.page.close();
    const nh = await runOnce(ctx, url, '&no=hud,audio', log);
    const g3 = nh.report.scenarios.find((s) => s.id === 'garage');
    expect(g3 && g3.hud.max === 0, `&no=hud: garage hud max ${g3?.hud.max} (expected 0)`);
    expect(g3 && g3.audio.max === 0, `&no=audio: garage audio max ${g3?.audio.max} (expected 0)`);
    expect(g3 && g3.submit.p50 > 0, `&no=hud,audio: garage still renders (submit p50 ${g3?.submit.p50})`);
    await nh.page.close();
  } catch (e) {
    expect(false, `bench e2e threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
  return { checks, fails, report: baseline?.report ?? null, text: baseline?.text ?? '', ms: baseline?.ms ?? 0 };
}
