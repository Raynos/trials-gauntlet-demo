/**
 * Played phone-tier boot clip (ask 43 round 4 — the hero twin streams after `ready`): one WebKit page at the user's
 * phone geometry (874×330 CSS px, DPR 3, touch), recorded start to finish —
 *   cold boot → menu (held: the twin's window) → b1 launched → ridden on the throttle zone (a touch hold, real time;
 *   the game's own auto-respawn on a crash) → finish → results → menu → GARAGE.
 * Three logs make the clip a proof (`log.json`):
 *   - `requests`: every model / chunk fetch with its start / end relative to navigation, bytes, and the app phase at
 *     the time — boot must fetch only the drawn pair (`*-lod.glb` on the phone), the authored twin after `ready`,
 *     nothing at garage entry;
 *   - `docs`: the renderer's hero-document slots (`bike / bikeLod / rider / riderLod`) and `twinPending`, sampled
 *     every rAF, with the phase each time a slot fills — the twin must be parsed on the menu / a finish / a crash,
 *     never while riding;
 *   - `hitches`: every rAF gap ≥ 40 ms with the phase and the doc slots that changed across it — a spike on the
 *     menu is the twin parse (fine), a spike mid-run is a finding.
 *   npx tsx harness/e2e/hero-boot-clip.mts [--out=DIR] [--engine=webkit|chromium] [--geom=874x330] [--dpr=3] [--track=b1-first-ride] [--ride-s=70]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, webkit, type Page } from 'playwright';
import { startServer } from '../lib/server';
import { REPO_ROOT } from '../lib/paths';
import { resolveFfmpeg } from '../lib/ffmpeg';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const out = path.resolve(args.get('out') ?? path.join(REPO_ROOT, 'harness', 'out', 'hero-boot-clip'));
const engine = args.get('engine') ?? 'webkit';
const [W, H] = (args.get('geom') ?? '874x330').split('x').map(Number) as [number, number];
const DPR = Number(args.get('dpr') ?? 3);
const track = args.get('track') ?? 'b1-first-ride';
const rideS = Number(args.get('ride-s') ?? 70);
fs.mkdirSync(out, { recursive: true });

interface Req { name: string; kind: 'model' | 'chunk' | 'other'; startMs: number; endMs: number | null; bytes: number | null; status: number | null; phaseAtStart: string; screenAtStart: string; afterReady: boolean | null }
interface DocSample { ms: number; phase: string; screen: string; bike: boolean; bikeLod: boolean; rider: boolean; riderLod: boolean; twinPending: boolean; heroDoc: string }
interface Hitch { ms: number; gapMs: number; phase: string; screen: string; heroDoc: string; docsBefore: string; docsAfter: string }

const server = await startServer({ freeze: true });
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, recordVideo: { dir: out, size: { width: W, height: H } },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(() => { localStorage.setItem('rockhop.onboarded', '1'); });
// The in-page probe: rAF gaps, hero document slots, phase — from the first frame of the document.
await ctx.addInitScript(`(function () {
  var P = { t0: performance.timeOrigin, docs: [], hitches: [], last: -1, lastDocs: '', readyAt: null };
  window.__bootProbe = P;
  P.state = function () { return state(); };
  function state() {
    var w = window, t = w.__rockhop, r = w.__render, g = r && r.gltf;
    var phase = t && typeof t.phase === 'function' ? t.phase() : 'boot';
    var screen = t && t.app && typeof t.app.screen === 'function' ? t.app.screen() : (document.getElementById('loader') ? 'loader' : 'boot');
    var d = r && typeof r.debugInfo === 'function' ? r.debugInfo() : null;
    return { phase: phase, screen: screen, bike: !!(g && g.bike), bikeLod: !!(g && g.bikeLod), rider: !!(g && g.rider), riderLod: !!(g && g.riderLod), twinPending: !!(r && r.twinPending), heroDoc: d ? d.heroDoc : '-' };
  }
  function key(s) { return (s.bike ? 'B' : '-') + (s.bikeLod ? 'b' : '-') + (s.rider ? 'R' : '-') + (s.riderLod ? 'r' : '-') + (s.twinPending ? '+' : ''); }
  function tick(now) {
    var s = state(), k = key(s), ms = Math.round(now);
    if (P.readyAt === null && s.screen !== 'boot' && s.screen !== 'loader') P.readyAt = ms;
    if (P.last >= 0 && now - P.last >= 40) P.hitches.push({ ms: ms, gapMs: Math.round(now - P.last), phase: s.phase, screen: s.screen, heroDoc: s.heroDoc, docsBefore: P.lastDocs, docsAfter: k });
    if (k !== P.lastDocs || !P.docs.length) P.docs.push({ ms: ms, phase: s.phase, screen: s.screen, bike: s.bike, bikeLod: s.bikeLod, rider: s.rider, riderLod: s.riderLod, twinPending: s.twinPending, heroDoc: s.heroDoc });
    P.last = now; P.lastDocs = k;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();`);
const page: Page = await ctx.newPage();
const navStart = { at: 0 };
const requests: Req[] = [];
const pending = new Map<string, Req>();
const kindOf = (u: string): Req['kind'] => (/\.glb(\?|$)/.test(u) ? 'model' : /\/assets\/.*\.js(\?|$)/.test(u) ? 'chunk' : 'other');
const phaseNow = async (): Promise<{ phase: string; screen: string; ready: boolean | null }> => page.evaluate(() => { const P = (window as unknown as { __bootProbe?: { readyAt: number | null; state(): { phase: string; screen: string } } }).__bootProbe; const d = P?.state(); return { phase: d?.phase ?? 'boot', screen: d?.screen ?? 'boot', ready: P ? P.readyAt !== null : null }; }).catch(() => ({ phase: '?', screen: '?', ready: null }));
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(server.url)) return; const k = kindOf(u); if (k === 'other') return; const req: Req = { name: u.slice(server.url.length).replace(/^\/+/, ''), kind: k, startMs: Date.now(), endMs: null, bytes: null, status: null, phaseAtStart: '?', screenAtStart: '?', afterReady: null }; requests.push(req); pending.set(u, req); void phaseNow().then((p) => { req.phaseAtStart = p.phase; req.screenAtStart = p.screen; req.afterReady = p.ready; }); });
page.on('response', (r) => { const req = pending.get(r.url()); if (!req) return; req.status = r.status(); void r.body().then((b) => { req.bytes = b.length; }).catch(() => undefined).finally(() => { req.endMs = Date.now(); }); });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || /twin/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
const marks: Record<string, number> = {};
const mark = (k: string): void => { marks[k] = Date.now(); };
const centre = (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const tap = async (sel: string): Promise<void> => { const c = await centre(sel); if (!c) throw new Error(`no element for ${sel}`); await page.touchscreen.tap(c.x, c.y); };
const log: Record<string, unknown> = { engine, geom: `${W}x${H}@${DPR}`, track, sha: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim() };
try {
  navStart.at = Date.now();
  await page.goto(`${server.url}?sw=0`, { waitUntil: 'commit' });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 180_000 });
  mark('menuLive');
  // Hold the menu: the twin's prefetch + parse window.
  await page.waitForTimeout(6000);
  mark('menuHeld');
  log['menuDocs'] = await page.evaluate(() => (window as unknown as { __bootProbe: { docs: unknown[] } }).__bootProbe.docs.at(-1));
  // Launch b1 through the flow (the map's pan / zoom is the level-select clip's business, not this one's).
  await page.evaluate((id) => (window as unknown as { __rockhop: { app: { play(id: string): void } } }).__rockhop.app.play(id), track);
  await page.waitForFunction(() => (window as unknown as { __rockhop: { phase(): string } }).__rockhop.phase() === 'riding', null, { timeout: 60_000 });
  mark('riding');
  // Ride: a finger on the GAS zone; a crash plays out the game's own auto-respawn under the held finger.
  const gas = await centre('.tz-throttle');
  if (!gas) throw new Error('no throttle zone');
  // A held pointer on the zone (the pad takes any pointer type, button 0; WebKit's headless touchscreen has no hold).
  await page.mouse.move(gas.x, gas.y);
  await page.mouse.down();
  const tRide = Date.now();
  let finished = false;
  while (Date.now() - tRide < rideS * 1000) {
    await page.waitForTimeout(500);
    const ph = await page.evaluate(() => (window as unknown as { __rockhop: { phase(): string } }).__rockhop.phase());
    if (ph === 'finished') { finished = true; break; }
  }
  await page.mouse.up();
  mark(finished ? 'finished' : 'rideTimeout');
  log['ride'] = await page.evaluate(() => { const t = (window as unknown as { __rockhop: { runTime(): number; faults(): number; finishTime(): number | null; getState(): { bike: { pos: { x: number } } } } }).__rockhop; return { runTime: t.runTime(), faults: t.faults(), finishTime: t.finishTime(), x: Math.round(t.getState().bike.pos.x * 10) / 10 }; });
  await page.waitForTimeout(4000);
  mark('resultsHeld');
  // Results → MENU (the results tile when it is live, else the flow), then the GARAGE tile.
  if (await page.$('.results.live .tile[data-id=menu]')) await tap('.results.live .tile[data-id=menu]');
  else await page.evaluate(() => (window as unknown as { __rockhop: { app: { goto(s: string): void } } }).__rockhop.app.goto('menu'));
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const reqBeforeGarage = requests.length;
  await tap('.menu-screen.live .menu-item[data-id=garage]');
  const tapped = await page.waitForSelector('.garage-screen.live', { timeout: 10_000 }).then(() => true, () => false);
  if (!tapped) { log['garageEntry'] = 'tap on the GARAGE tile did not open the garage within 10 s; opened through app.goto'; await page.evaluate(() => (window as unknown as { __rockhop: { app: { goto(s: string): void } } }).__rockhop.app.goto('garage')); await page.waitForSelector('.garage-screen.live', { timeout: 30_000 }); }
  await page.evaluate(async () => { await (window as unknown as { __render: { whenReady(): Promise<void> } }).__render.whenReady(); });
  mark('garageLive');
  await page.waitForTimeout(2500);
  log['garage'] = await page.evaluate(() => { const r = (window as unknown as { __render: { debugInfo(): Record<string, unknown> } }).__render; const d = r.debugInfo(); return { heroDoc: d['heroDoc'], tier: d['tier'], calls: d['calls'], tris: d['tris'], heroTris: d['heroTris'] }; });
  log['garageFetches'] = requests.slice(reqBeforeGarage).map((r) => r.name);
} catch (e) {
  log['failure'] = e instanceof Error ? e.message : String(e);
  console.error(log['failure']);
} finally {
  const probe = await page.evaluate(() => { const P = (window as unknown as { __bootProbe: { readyAt: number | null; docs: DocSample[]; hitches: Hitch[] } }).__bootProbe; return { readyAt: P.readyAt, docs: P.docs, hitches: P.hitches, timeOrigin: performance.timeOrigin }; }).catch(() => null);
  await new Promise((r) => setTimeout(r, 300));
  // One clock: the page's navigation start (performance.timeOrigin, epoch ms) — request and mark times are converted onto it.
  const t0 = probe?.timeOrigin ?? navStart.at;
  for (const r of requests) { r.startMs = Math.round(r.startMs - t0); if (r.endMs !== null) r.endMs = Math.round(r.endMs - t0); }
  for (const k of Object.keys(marks)) marks[k] = Math.round(marks[k]! - t0);
  log['marks'] = marks;
  log['readyAtMs'] = probe?.readyAt ?? null;
  log['requests'] = requests;
  log['docs'] = probe?.docs ?? [];
  log['hitches'] = probe?.hitches ?? [];
  log['errors'] = errors;
  // Verdicts the clip is judged with.
  const models = requests.filter((r) => r.kind === 'model');
  const readyAt = probe?.readyAt ?? Infinity;
  const bootModels = models.filter((r) => r.startMs < readyAt);
  const lateModels = models.filter((r) => r.startMs >= readyAt);
  const docs = (probe?.docs ?? []) as DocSample[];
  const fills = docs.filter((d, i) => i > 0 && ((d.bike && !docs[i - 1]!.bike) || (d.rider && !docs[i - 1]!.rider) || (d.bikeLod && !docs[i - 1]!.bikeLod) || (d.riderLod && !docs[i - 1]!.riderLod)));
  const midRunFill = fills.filter((d) => d.phase === 'riding' || d.phase === 'countdown');
  const midRunHitch = ((probe?.hitches ?? []) as Hitch[]).filter((h) => h.phase === 'riding' && h.gapMs >= 100);
  log['verdict'] = {
    bootFetchedOnlyLod: bootModels.length > 0 && bootModels.every((r) => /-lod-[0-9a-f]+\.glb$/.test(r.name)),
    bootModels: bootModels.map((r) => `${r.name.replace(/^models\/[0-9a-f]+\//, '')} ${r.bytes ?? '?'} B @${r.startMs}→${r.endMs} ms`),
    twinAfterReady: lateModels.map((r) => `${r.name.replace(/^models\/[0-9a-f]+\//, '')} ${r.bytes ?? '?'} B @${r.startMs}→${r.endMs} ms (${r.phaseAtStart}/${r.screenAtStart})`),
    docFills: fills.map((d) => `${d.ms} ms ${d.phase}/${d.screen}: ${d.bike ? 'B' : '-'}${d.bikeLod ? 'b' : '-'}${d.rider ? 'R' : '-'}${d.riderLod ? 'r' : '-'} heroDoc ${d.heroDoc}`),
    midRunFill: midRunFill.length,
    midRunHitchesOver100ms: midRunHitch.length,
    garageFetches: (log['garageFetches'] as string[] | undefined)?.length ?? null,
  };
  const video = page.video();
  await page.close();
  await ctx.close();
  await browser.close();
  await server.close();
  const p = await video?.path();
  if (p) {
    const dst = path.join(out, 'clip.webm');
    fs.renameSync(p, dst);
    log['clip'] = dst;
    try {
      const ffmpeg = resolveFfmpeg();
      if (spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', dst, '-c:v', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'clip.mp4')], { encoding: 'utf8' }).status === 0) log['mp4'] = path.join(out, 'clip.mp4');
      if (spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', dst, '-vf', `fps=1/2,scale=${Math.round(W * 0.5)}:-2,tile=6x10:padding=3:margin=3:color=0x101418`, '-frames:v', '1', '-q:v', '3', path.join(out, 'sheet.jpg')], { encoding: 'utf8' }).status === 0) log['sheet'] = path.join(out, 'sheet.jpg');
    } catch (e) { log['ffmpeg'] = e instanceof Error ? e.message : String(e); }
  }
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ marks, readyAtMs: log['readyAtMs'], verdict: log['verdict'], ride: log['ride'], garage: log['garage'], hitches: (log['hitches'] as Hitch[]).map((h) => `${h.ms} ms +${h.gapMs} ${h.phase}/${h.screen} ${h.docsBefore}→${h.docsAfter}`), errors, failure: log['failure'] }, null, 1));
  const v = log['verdict'] as { bootFetchedOnlyLod: boolean; midRunFill: number; midRunHitchesOver100ms: number; garageFetches: number | null };
  if (log['failure'] || !v.bootFetchedOnlyLod || v.midRunFill || v.midRunHitchesOver100ms || v.garageFetches) process.exitCode = 1;
}
