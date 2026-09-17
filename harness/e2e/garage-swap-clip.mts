/**
 * Garage swap latency clip (ask 50 — "outfit swaps are slow on the iPhone"): one WebKit page at the user's phone
 * geometry (874×330 CSS px, DPR 3, touch), recorded — boot → GARAGE → every outfit × bike combination tapped, the
 * whole set twice (round 1 = first taps, round 2 = repeat taps: the cache's turn). Per tap:
 *   - the network: every model request the tap caused (logical name, bytes, ms from the tap, cache hit or not);
 *   - `installMs`: tap → the first rendered frame whose hero is the new document (the renderer's installed outfit /
 *     class and `heroLoading` back to 0, watched per rAF);
 *   - `settleMs`: tap → the UI status line settled;
 *   - `longestGapMs`: the longest rAF gap from the tap until 500 ms after the install (the hitch the finger feels)
 *     and the count of gaps ≥ 34 ms (two dropped 60 fps frames);
 *   - `heroSwap`: whatever `debugInfo().heroSwap` reports (the render owner's phase breakdown, e.g. fetch / parse /
 *     prepare / upload / compile ms) — null until that hook exists.
 *   npx tsx harness/e2e/garage-swap-clip.mts [--out=DIR] [--engine=webkit|chromium] [--geom=874x330] [--dpr=3] [--rounds=2] [--hold-ms=900]
 * Writes <out>/clip.{webm,mp4}, sheet.jpg, log.json (`taps[]`), table.md (the per-tap table for the evidence README).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, webkit, type Page } from 'playwright';
import { startServer } from '../lib/server';
import { REPO_ROOT } from '../lib/paths';
import { resolveFfmpeg } from '../lib/ffmpeg';
import { AVAILABLE_RIDER_PRESETS } from '../../src/core/riderPresets';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const out = path.resolve(args.get('out') ?? path.join(REPO_ROOT, 'harness', 'out', 'garage-swap-clip'));
const engine = args.get('engine') ?? 'webkit';
const [W, H] = (args.get('geom') ?? '874x330').split('x').map(Number) as [number, number];
const DPR = Number(args.get('dpr') ?? 3);
const rounds = Number(args.get('rounds') ?? 2);
const holdMs = Number(args.get('hold-ms') ?? 900);
fs.mkdirSync(out, { recursive: true });

interface ModelReq { name: string; bytes: number | null; status: number | null; fromCache: boolean; startMs: number; endMs: number | null }
interface Sample { ms: number; outfit: string | null; cls: string | null; loading: number; heroDoc: string; status: string }
interface Tap { round: number; n: number; kind: 'outfit' | 'bike'; target: string; combo: string; tapMs: number; installMs: number | null; settleMs: number | null; longestGapMs: number; gapsOver34: number; gapAtInstall: number | null; requests: ModelReq[]; bytes: number; heroSwap: unknown; heroDoc: string; calls: number; tris: number; heroTris: number; tier: string }

const server = await startServer({ freeze: true });
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, recordVideo: { dir: out, size: { width: W, height: H } },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(() => { localStorage.setItem('trials.onboarded', '1'); });
const page: Page = await ctx.newPage();
let timeOrigin = 0;
const requests: ModelReq[] = [];
// Keyed by the Request object: the same URL is fetched twice per swap (the twin's prefetch, then its parse).
const pending = new Map<import('playwright').Request, ModelReq>();
page.on('request', (r) => { const m = /\/models\/[0-9a-f]+\/(.+?)-[0-9a-f]{16}\.glb$/.exec(r.url()); if (!m) return; const req: ModelReq = { name: `${m[1]}.glb`, bytes: null, status: null, fromCache: false, startMs: Date.now(), endMs: null }; requests.push(req); pending.set(r, req); });
page.on('response', (r) => { const req = pending.get(r.request()); if (!req) return; req.status = r.status(); req.fromCache = r.fromServiceWorker() || /HIT|memory|disk/i.test(r.headers()['x-cache'] ?? ''); void r.body().then((b) => { req.bytes = b.length; }).catch(() => undefined).finally(() => { req.endMs = Date.now(); pending.delete(r.request()); }); });
page.on('requestfinished', (r) => { const req = pending.get(r); if (req && req.endMs === null) req.endMs = Date.now(); });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error ${m.text()}`); });
const centre = (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const tap = async (sel: string): Promise<void> => { const c = await centre(sel); if (!c) throw new Error(`no element for ${sel}`); await page.touchscreen.tap(c.x, c.y); };

/** Per-rAF probe of the installed hero: the renderer's document outfit / class, in-flight loads, heroDoc, the UI status. */
const PROBE_SRC = `window.__swapProbe = (function () {
  var samples = [], on = true, last = -1, gaps = [];
  function snap(now) {
    var r = window.__render, d = r.debugInfo();
    if (last >= 0) gaps.push({ ms: Math.round(now), gap: Math.round((now - last) * 10) / 10 });
    last = now;
    samples.push({ ms: Math.round(now), outfit: r.riderDocumentOutfit || null, cls: r.bikeDocumentClass || null, loading: r.heroLoading || 0, heroDoc: d.heroDoc, status: (document.querySelector('.outfit-current') || {}).textContent || '' });
    if (on) requestAnimationFrame(snap);
  }
  requestAnimationFrame(snap);
  return { stop: function () { on = false; var d = window.__render.debugInfo(); return { samples: samples, gaps: gaps, heroSwap: d.heroSwap === undefined ? null : d.heroSwap, heroDoc: d.heroDoc, calls: d.calls, tris: d.tris, heroTris: d.heroTris, tier: d.tier }; } };
})();`;

const taps: Tap[] = [];
const log: Record<string, unknown> = { engine, geom: `${W}x${H}@${DPR}`, rounds, holdMs, sha: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim() };
let cls: 'rookie' | 'pro' = 'rookie', outfit = 'street-mustard';
async function swap(round: number, kind: 'outfit' | 'bike', target: string): Promise<void> {
  const reqFrom = requests.length;
  await page.evaluate(PROBE_SRC);
  const tapAt = Date.now();
  await tap(kind === 'outfit' ? `button[data-outfit="${target}"]` : `button[data-bike="${target}"]`);
  if (kind === 'outfit') outfit = target; else cls = target as 'rookie' | 'pro';
  // Installed: the renderer's document is the target and nothing is in flight; then hold so the probe sees the tail.
  await page.waitForFunction(({ o, c }) => { const r = (window as unknown as { __render: { riderDocumentOutfit: string | null; bikeDocumentClass: string | null; heroLoading: number } }).__render; return r.riderDocumentOutfit === o && r.bikeDocumentClass === c && r.heroLoading === 0; }, { o: outfit, c: cls }, { timeout: 60_000 });
  await page.waitForTimeout(holdMs);
  const r = await page.evaluate(() => (window as unknown as { __swapProbe: { stop(): { samples: Sample[]; gaps: { ms: number; gap: number }[]; heroSwap: unknown; heroDoc: string; calls: number; tris: number; heroTris: number; tier: string } } }).__swapProbe.stop());
  const tapPage = tapAt - timeOrigin;
  const installed = r.samples.find((s) => s.ms >= tapPage && s.outfit === outfit && s.cls === cls && s.loading === 0 && !/proc/.test(s.heroDoc));
  const settled = r.samples.find((s) => s.ms >= tapPage && !/Loading/.test(s.status) && s.outfit === outfit && s.cls === cls);
  const installMs = installed ? Math.round(installed.ms - tapPage) : null;
  const window_ = r.gaps.filter((g) => g.ms >= tapPage && g.ms <= tapPage + (installMs ?? 0) + 500);
  const longest = window_.reduce((m, g) => Math.max(m, g.gap), 0);
  const reqs = requests.slice(reqFrom).map((q) => ({ ...q, startMs: Math.round(q.startMs - tapAt), endMs: q.endMs === null ? null : Math.round(q.endMs - tapAt) }));
  // `debugInfo().heroSwap` (render owner, ask 50) is a cumulative log: `loads[]` (fetch / parse / prepare per file) and
  // `swaps[]` (build / first frame / programs per hero swap), each stamped `at` (page ms). Keep this tap's entries only.
  const hs = r.heroSwap as { loads?: { at: number }[]; swaps?: { at: number }[] } | null;
  const heroSwap = hs ? { loads: (hs.loads ?? []).filter((l) => l.at >= tapPage - 5), swaps: (hs.swaps ?? []).filter((w) => w.at >= tapPage - 5) } : null;
  const t: Tap = { round, n: taps.length + 1, kind, target, combo: `${outfit} × ${cls}`, tapMs: Math.round(tapPage), installMs, settleMs: settled ? Math.round(settled.ms - tapPage) : null, longestGapMs: longest, gapsOver34: window_.filter((g) => g.gap >= 34).length, gapAtInstall: installed ? (r.gaps.find((g) => g.ms === installed.ms)?.gap ?? null) : null, requests: reqs, bytes: reqs.reduce((n, q) => n + (q.bytes ?? 0), 0), heroSwap, heroDoc: r.heroDoc, calls: r.calls, tris: r.tris, heroTris: r.heroTris, tier: r.tier };
  taps.push(t);
  console.log(`r${round} #${t.n} ${kind} ${target} → ${t.combo}: install ${installMs} ms, settle ${t.settleMs} ms, longest gap ${longest} ms (${t.gapsOver34} ≥ 34), ${reqs.length} req / ${(t.bytes / 1e6).toFixed(2)} MB${reqs.length ? ` [${reqs.map((q) => `${q.name.replace(/\.glb$/, '')} ${q.endMs} ms`).join(', ')}]` : ''}, heroDoc ${r.heroDoc}${heroSwap && (heroSwap.swaps.length || heroSwap.loads.length) ? ` heroSwap ${JSON.stringify(heroSwap)}` : ''}`);
}

try {
  await page.goto(`${server.url}?sw=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 180_000 });
  timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.waitForTimeout(800);
  await tap('.menu-screen.live .menu-item[data-id=garage]');
  const tapped = await page.waitForSelector('.garage-screen.live', { timeout: 10_000 }).then(() => true, () => false);
  if (!tapped) { log['garageEntry'] = 'the GARAGE tile tap did not open the garage within 10 s; opened through app.goto (a finding for the menu, not this clip)'; await page.evaluate(() => (window as unknown as { __trials: { app: { goto(s: string): void } } }).__trials.app.goto('garage')); await page.waitForSelector('.garage-screen.live', { timeout: 30_000 }); }
  await page.evaluate(async () => { await (window as unknown as { __render: { whenReady(): Promise<void> } }).__render.whenReady(); });
  await page.waitForTimeout(1500);
  log['garageBoot'] = await page.evaluate(() => { const r = (window as unknown as { __render: { debugInfo(): Record<string, unknown>; riderDocumentOutfit: string; bikeDocumentClass: string } }).__render; const d = r.debugInfo(); return { outfit: r.riderDocumentOutfit, cls: r.bikeDocumentClass, heroDoc: d['heroDoc'], tier: d['tier'], profile: d['profile'], dpr: d['dpr'], calls: d['calls'], tris: d['tris'], heroSwapHook: d['heroSwap'] !== undefined }; });
  // The boot's own hero loads (the resident pool): the cumulative hook up to garage entry.
  log['bootHeroSwap'] = await page.evaluate(() => (window as unknown as { __render: { debugInfo(): { heroSwap?: unknown } } }).__render.debugInfo().heroSwap ?? null);
  log['bootRequests'] = requests.map((q) => ({ name: q.name, bytes: q.bytes }));
  // The 10 combinations, in the rail's order, on each bike class: outfit taps on the current class, then the class toggled.
  for (let round = 1; round <= rounds; round++) {
    for (const bike of ['rookie', 'pro'] as const) {
      if (cls !== bike) await swap(round, 'bike', bike);
      for (const preset of AVAILABLE_RIDER_PRESETS) if (outfit !== preset.id || taps.length === 0) await swap(round, 'outfit', preset.id);
    }
  }
} catch (e) {
  log['failure'] = e instanceof Error ? e.message : String(e);
  console.error(log['failure']);
} finally {
  log['taps'] = taps;
  log['errors'] = errors;
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
      if (spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', dst, '-vf', `fps=1/1.5,crop=${Math.round(W * 0.64)}:${H}:0:0,scale=${Math.round(W * 0.5)}:-2,tile=6x8:padding=3:margin=3:color=0x101418`, '-frames:v', '1', '-q:v', '3', path.join(out, 'sheet.jpg')], { encoding: 'utf8' }).status === 0) log['sheet'] = path.join(out, 'sheet.jpg');
    } catch (e) { log['ffmpeg'] = e instanceof Error ? e.message : String(e); }
  }
  // The per-tap table (markdown) for the evidence README.
  const swapCell = (h: unknown): string => {
    const x = h as { loads: { url: string; fetchMs: number; parseMs: number; prepareMs: number }[]; swaps: Record<string, number | string>[] } | null;
    if (!x || (!x.loads.length && !x.swaps.length)) return '—';
    const ms = (v: unknown): string => (typeof v === 'number' ? v.toFixed(1) : String(v));
    const sw = x.swaps.map((w) => Object.entries(w).filter(([k]) => k !== 'at' && k !== 'what').map(([k, v]) => `${k.replace(/Ms$/, '')} ${ms(v)}`).join(' / ')).join('; ');
    const ld = x.loads.map((l) => `${l.url.replace(/^.*\//, '').replace(/-[0-9a-f]{16}\.glb$/, '')} fetch ${ms(l.fetchMs)} parse ${ms(l.parseMs)} prep ${ms(l.prepareMs)}`).join('; ');
    return [sw, ld].filter(Boolean).join(' · ');
  };
  const rows = ['| # | round | tap | combination after | install ms | settle ms | longest rAF gap ms | gaps ≥ 34 ms | requests (ms from tap) | MB | heroSwap |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...taps.map((t) => `| ${t.n} | ${t.round} | ${t.kind} ${t.target} | ${t.combo} | ${t.installMs ?? '-'} | ${t.settleMs ?? '-'} | ${t.longestGapMs} | ${t.gapsOver34} | ${t.requests.length ? t.requests.map((q) => `${q.name.replace(/\.glb$/, '')} ${q.endMs ?? '?'}`).join(', ') : '—'} | ${(t.bytes / 1e6).toFixed(2)} | ${swapCell(t.heroSwap)} |`)];
  const byRound = [1, 2].map((rd) => { const s = taps.filter((t) => t.round === rd); const med = (xs: number[]): number => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : 0; }; return s.length ? `round ${rd}: ${s.length} taps, install median ${med(s.map((t) => t.installMs ?? 0))} ms / max ${Math.max(...s.map((t) => t.installMs ?? 0))} ms, longest gap median ${med(s.map((t) => t.longestGapMs))} ms / max ${Math.max(...s.map((t) => t.longestGapMs))} ms, ${s.reduce((n, t) => n + t.requests.length, 0)} requests / ${(s.reduce((n, t) => n + t.bytes, 0) / 1e6).toFixed(1)} MB` : ''; }).filter(Boolean);
  fs.writeFileSync(path.join(out, 'table.md'), `${rows.join('\n')}\n\n${byRound.join('\n')}\n`);
  log['summary'] = byRound;
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  console.log(byRound.join('\n'));
  console.log(JSON.stringify({ garageBoot: log['garageBoot'], errors, failure: log['failure'], clip: log['mp4'] ?? log['clip'], sheet: log['sheet'] }, null, 1));
  if (log['failure'] || errors.length) process.exitCode = 1;
}
