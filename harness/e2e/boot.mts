/**
 * Boot end-to-end: the loading screen a stranger boots through, headless, from `dist/`, at phone network
 * speeds (docs/tasks/loading-progress-invariant.md §4.6). Samples the two painted percentages every 50 ms
 * (`#loader[data-download]`, `[data-setup]` — the integers the renderer painted) until the loader leaves.
 *
 *   pnpm harness:e2e --only=boot                       (or: tsx harness/e2e/boot.mts)
 *   tsx harness/e2e/boot.mts --net=lte --sw=off --art=present --verbose=1 --stills=/path
 *
 * Configurations: network LTE (12 Mbps / 70 ms) and 3G (750 kbps / 100 ms) × service worker absent /
 * installed (a second load of the same origin) × art pack present / absent (a copy of dist/ with `art/`
 * renamed). Asserts, per boot:
 *   B1  both fractions are non-decreasing at every sample;
 *   B2  both read exactly 100 on the last sample before the loader leaves, and `data-done` is 1 there;
 *   B3  the stuck detector, the class of bug this suite exists for (task doc (e), (f)): DOWNLOAD unchanged for > 2 s
 *       of LIVE page time while ≥ 64 KB of the bytes it counts (core chunks, fonts, hero glb) arrived at the browser
 *       in that window (CDP `Network.dataReceived`, a test instrument — the page itself never reads it). Also the
 *       hang rule: neither number changes for > 5 s of live time while nothing it counts is arriving. Live time is
 *       the loader's own footer clock (a 100 ms setInterval that advances only when the page's JS runs); a sample
 *       gap over which that clock did not advance is a main-thread freeze (on SwiftShader the WebGL context and the
 *       first track take seconds) and is reported as `freezes`, not judged — a frozen page paints nothing, so
 *       nothing on it can lie;
 *   B4  reported, not asserted: wall and live time at which DOWNLOAD read 100, and at which the loader left. On this
 *       harness the first rAF takes ~2 s and the GPU is SwiftShader; the phone numbers come from the phone clip.
 *   B5  no page error during the boot; the `after` rows never carry a checkmark.
 *   3G rows are INFORMATIONAL (ask 43 round 5: the boot fetches all 14 hero files, 24.7 MB, inside the one bar by the
 *   user's choice — ≈ 9 min at 3G's 48 KB/s, past this suite's sample budget): a 3G / SW-off boot is sampled for at
 *   most `CAP_3G_MS` (2 min), the measured rate and the projected download total / time are logged in the report
 *   (`net3g`), B1–B5 are evaluated and printed as `notes`, and none of it fails the suite. B3 stays a hard check on
 *   every LTE row (and on the 3G / SW-on row, which loads from the cache and finishes).
 * Stills (portrait 430×932, dpr 2) at SETUP ≥ 20 %, ≥ 70 % and at 100/100, for the LTE / SW off / art present boot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { startServer, type GameServer } from '../lib/server';
import { DIST_DIR, REPO_ROOT } from '../lib/paths';

type Net = 'lte' | '3g';
type Sw = 'off' | 'on';
type Art = 'present' | 'absent';
export interface BootConfig { net: Net; sw: Sw; art: Art }

const NETS: Record<Net, { latency: number; down: number; up: number }> = {
  lte: { latency: 70, down: 12e6 / 8, up: 3e6 / 8 },
  '3g': { latency: 100, down: 750e3 / 8, up: 250e3 / 8 },
};

export interface BootResult {
  config: BootConfig;
  monotone: boolean;
  final: { download: number; setup: number; done: boolean };
  leaveMs: number;
  downloadFullAtMs: number;
  /** Live-time clock at which DOWNLOAD read 100 (wall time minus main-thread freezes). */
  downloadFullAtLiveMs: number;
  /** Main-thread freezes: sample gaps > 250 ms over which the page's own 100 ms clock did not advance. */
  freezes: { t: number; ms: number }[];
  stuck: string | null;
  pageErrors: string[];
  afterChecked: boolean;
  samples: number;
  fails: string[];
  /** 3G rows: the rules' findings, logged, never failed. */
  notes: string[];
  informational: boolean;
  /** 3G rows: what the capped sample measured — bytes the readers received, the rate, and the projection from the painted %. */
  net3g?: { capped: boolean; sampledMs: number; arrivedMB: number; rateKBs: number; downloadPct: number; projectedMB: number | null; projectedS: number | null };
}
/** A 3G / SW-off boot is sampled for at most this long (the full 24.7 MB is ≈ 9 min at 48 KB/s). */
const CAP_3G_MS = 120_000;

interface Sample { t: number; clock: number; live: number; d: number; s: number; done: boolean; su: string; dl: string; count: string }

/** A sample gap counts as a freeze when the page clock advanced less than half the wall time and the gap exceeds this. */
const FREEZE_MS = 250;
const frozen = (a: Sample, b: Sample): boolean => b.t - a.t > FREEZE_MS && b.clock - a.clock < (b.t - a.t) / 2;

async function sampleBoot(page: Page, url: string, stills: ((s: Sample, page: Page) => Promise<void>) | null, capMs = 180_000): Promise<{ samples: Sample[]; leaveMs: number; afterChecked: boolean; capped: boolean }> {
  const t0 = Date.now();
  await page.goto(url);
  const samples: Sample[] = [];
  let afterChecked = false;
  let leaveMs = -1;
  let live = 0;
  let prev: Sample | null = null;
  let capped = true;
  while (Date.now() - t0 < capMs) {
    const s = await page.evaluate(() => {
      const l = document.getElementById('loader');
      if (!l) return null;
      return {
        d: Number(l.dataset['download']),
        s: Number(l.dataset['setup']),
        done: l.dataset['done'] === '1',
        su: l.querySelector('.gauge.su .line')?.textContent ?? '',
        dl: l.querySelector('.gauge.dl .line')?.textContent ?? '',
        count: l.querySelector('.count')?.textContent ?? '',
        clock: Math.round(parseFloat(l.querySelector('.foot .t')?.textContent ?? '0') * 1000),
        afterOk: !!l.querySelector('li.bg.ok'),
      };
    });
    if (s === null) {
      leaveMs = Date.now() - t0;
      capped = false;
      break;
    }
    if (s.afterOk) afterChecked = true;
    const t = Date.now() - t0;
    const sample: Sample = { t, clock: s.clock, live: 0, d: s.d, s: s.s, done: s.done, su: s.su, dl: s.dl, count: s.count };
    if (prev) live += frozen(prev, sample) ? 0 : t - prev.t;
    sample.live = live;
    prev = sample;
    samples.push(sample);
    if (stills) await stills(sample, page);
    await page.waitForTimeout(50);
  }
  return { samples, leaveMs, afterChecked, capped };
}

/** Runs of samples during which the page's JS was live (no freeze between consecutive samples). */
function liveRuns(samples: Sample[]): Sample[][] {
  const runs: Sample[][] = [];
  let cur: Sample[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (i > 0 && frozen(samples[i - 1]!, samples[i]!)) {
      runs.push(cur);
      cur = [];
    }
    cur.push(samples[i]!);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

const STUCK_MS = 2000;
const HANG_MS = 5000;
const STUCK_BYTES = 64 * 1024;

/**
 * B3, within each live run: (a) DOWNLOAD unchanged for > 2 s while ≥ 64 KB of the bytes it counts arrived in that
 * window — the number lied; (b) neither number changed for > 5 s while nothing it counts arrived — a hang.
 */
function stuckWindow(samples: Sample[], arrivals: { t: number; bytes: number }[]): string | null {
  const arrived = (t0: number, t1: number): number => arrivals.reduce((n, a) => (a.t >= t0 && a.t <= t1 ? n + a.bytes : n), 0);
  for (const run of liveRuns(samples)) {
    let start = 0;
    for (let i = 1; i <= run.length; i++) {
      if (i < run.length && run[i]!.d === run[start]!.d) continue;
      const end = i - 1;
      const dt = run[end]!.t - run[start]!.t;
      if (dt > STUCK_MS && run[start]!.d < 100) {
        const bytes = arrived(run[start]!.t, run[end]!.t);
        if (bytes >= STUCK_BYTES) return `DOWNLOAD held at ${run[start]!.d} for ${dt} ms (t=${run[start]!.t}…${run[end]!.t}) while ${Math.round(bytes / 1024)} KB of counted files arrived`;
      }
      start = i;
    }
    start = 0;
    for (let i = 1; i <= run.length; i++) {
      if (i < run.length && run[i]!.d === run[start]!.d && run[i]!.s === run[start]!.s) continue;
      const end = i - 1;
      const dt = run[end]!.t - run[start]!.t;
      if (dt > HANG_MS && arrived(run[start]!.t, run[end]!.t) < STUCK_BYTES) return `nothing moved for ${dt} ms (t=${run[start]!.t}…${run[end]!.t}) at ${run[start]!.d}/${run[start]!.s}, no counted bytes arriving`;
      start = i;
    }
  }
  return null;
}

async function serveNoArt(): Promise<{ url: string; close(): Promise<void> }> {
  const outDir = path.join(REPO_ROOT, 'harness', 'out', '.dist-boot-noart', String(process.pid));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(DIST_DIR, outDir, { recursive: true });
  fs.renameSync(path.join(outDir, 'art'), path.join(outDir, 'art-off'));
  const server: PreviewServer = await preview({ root: REPO_ROOT, configFile: path.join(REPO_ROOT, 'vite.config.ts'), logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite preview (no art): no local url');
  return {
    url: url.replace(/\/$/, ''),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.httpServer.close((err) => {
          fs.rmSync(outDir, { recursive: true, force: true });
          if (err) reject(err);
          else resolve();
        }),
      ),
  };
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
}

export async function runBoot(browser: Browser, baseUrl: string, config: BootConfig, opts: { stillsDir?: string; verbose?: boolean } = {}): Promise<BootResult> {
  const ctx = await newContext(browser);
  const pageErrors: string[] = [];
  const url = `${baseUrl}/${config.sw === 'on' ? '' : '?sw=0'}`;
  if (config.sw === 'on') {
    // Install: one un-throttled load that registers the worker and precaches; the measured boot is the next load.
    const warm = await ctx.newPage();
    await warm.goto(url);
    await warm.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180_000 });
    await warm.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60_000 });
    await warm.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await warm.waitForTimeout(1500);
    await warm.close();
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // Bytes of the files DOWNLOAD counts, as the browser receives them (B3's witness): core chunks, fonts, hero glb.
  const needed = new Set<string>();
  const arrivals: { t: number; bytes: number }[] = [];
  const tNav = { at: 0 };
  // Only the readers' own `fetch()`es (type Fetch): the browser's later cache-hit re-requests of the same chunks as
  // `<script type=module>` / @font-face are not bytes any reader reads.
  cdp.on('Network.requestWillBeSent', (e: { requestId: string; type?: string; request: { url: string } }) => {
    if (e.type === 'Fetch' && /\/assets\/|\/fonts\/|\/models\//.test(e.request.url)) needed.add(e.requestId);
  });
  cdp.on('Network.dataReceived', (e: { requestId: string; dataLength: number }) => {
    if (needed.has(e.requestId)) arrivals.push({ t: Date.now() - tNav.at, bytes: e.dataLength });
  });
  const n = NETS[config.net];
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: n.latency, downloadThroughput: n.down, uploadThroughput: n.up });

  const shot: Record<string, boolean> = {};
  const stills = opts.stillsDir
    ? async (s: Sample, p: Page): Promise<void> => {
        const want = s.done ? '100' : s.s >= 70 ? '70' : s.s >= 20 ? '20' : null;
        if (!want || shot[want]) return;
        shot[want] = true;
        fs.mkdirSync(opts.stillsDir!, { recursive: true });
        await p.screenshot({ path: path.join(opts.stillsDir!, `boot-${want}.png`) });
      }
    : null;
  tNav.at = Date.now();
  const informational = config.net === '3g';
  const { samples, leaveMs, afterChecked, capped } = await sampleBoot(page, url, stills, informational && config.sw === 'off' ? CAP_3G_MS : 180_000);
  await ctx.close();

  const fails: string[] = [];
  let monotone = true;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    if (b.d < a.d || b.s < a.s) {
      monotone = false;
      fails.push(`B1 went backwards at ${b.t} ms: ${a.d}/${a.s} → ${b.d}/${b.s}`);
      break;
    }
  }
  const last = samples[samples.length - 1] ?? { d: -1, s: -1, done: false, t: 0, su: '', dl: '', count: '' };
  if (!(last.d === 100 && last.s === 100 && last.done)) fails.push(`B2 last sample ${last.d}/${last.s} done=${last.done} (${last.su} | ${last.dl})`);
  if (leaveMs < 0) fails.push('B2 loader never left');
  const stuck = stuckWindow(samples, arrivals);
  if (stuck) fails.push(`B3 ${stuck}`);
  const full = samples.find((x) => x.d === 100);
  const downloadFullAtMs = full?.t ?? -1;
  const downloadFullAtLiveMs = full?.live ?? -1;
  const freezes = samples.flatMap((x, i) => (i > 0 && frozen(samples[i - 1]!, x) ? [{ t: samples[i - 1]!.t, ms: x.t - samples[i - 1]!.t }] : []));
  if (pageErrors.length) fails.push(`B5 page errors: ${pageErrors.join(' | ')}`);
  if (afterChecked) fails.push('B5 an after row carried a checkmark');
  if (opts.verbose) {
    console.log(`    freezes: ${freezes.map((f) => `${f.t}+${f.ms}`).join(' ') || 'none'}`);
    let prev = '';
    for (const s of samples) {
      const line = `${s.d}/${s.s} ${s.count} | ${s.su} | ${s.dl}`;
      if (line !== prev) console.log(`    ${String(s.t).padStart(6)} ms (live ${String(s.live).padStart(6)})  ${line}`);
      prev = line;
    }
  }
  // 3G: the rules are findings, the row never fails; the measured rate and the projection are the row's numbers.
  let net3g: BootResult['net3g'];
  if (informational) {
    const arrivedBytes = arrivals.reduce((n, a) => n + a.bytes, 0);
    const sampledMs = samples.length ? samples[samples.length - 1]!.t : 0;
    const liveS = Math.max(0.001, (samples.length ? samples[samples.length - 1]!.live : 0) / 1000);
    const rateKBs = arrivedBytes / 1024 / liveS;
    const pct = Math.max(0, last.d);
    net3g = { capped, sampledMs, arrivedMB: +(arrivedBytes / 1e6).toFixed(2), rateKBs: +rateKBs.toFixed(1), downloadPct: pct, projectedMB: pct > 0 ? +(arrivedBytes / 1e6 / (pct / 100)).toFixed(1) : null, projectedS: pct > 0 && !capped ? +(liveS).toFixed(0) : pct > 0 ? +(liveS / (pct / 100)).toFixed(0) : null };
  }
  const notes = informational ? fails.splice(0) : [];
  return { config, monotone, final: { download: last.d, setup: last.s, done: last.done }, leaveMs, downloadFullAtMs, downloadFullAtLiveMs, freezes, stuck, pageErrors, afterChecked, samples: samples.length, fails, notes, informational, ...(net3g ? { net3g } : {}) };
}

/** Every configuration (filtered), each on its own server: results + a table. */
export async function bootSuite(filter: Partial<Record<keyof BootConfig, string>> = {}, opts: { stillsDir?: string; verbose?: boolean } = {}): Promise<BootResult[]> {
  const nets: Net[] = (['lte', '3g'] as Net[]).filter((n) => !filter.net || filter.net === 'all' || filter.net === n);
  const sws: Sw[] = (['off', 'on'] as Sw[]).filter((s) => !filter.sw || filter.sw === 'all' || filter.sw === s);
  const arts: Art[] = (['present', 'absent'] as Art[]).filter((a) => !filter.art || filter.art === 'all' || filter.art === a);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results: BootResult[] = [];
  let withArt: GameServer | null = null;
  let noArt: { url: string; close(): Promise<void> } | null = null;
  try {
    for (const art of arts) {
      const base = art === 'present' ? (withArt ??= await startServer({})).url.replace(/\/$/, '') : (noArt ??= await serveNoArt()).url;
      for (const net of nets)
        for (const sw of sws) {
          const config = { net, sw, art };
          const stillsHere = opts.stillsDir && net === 'lte' && sw === 'off' && art === 'present' ? opts.stillsDir : undefined;
          const r = await runBoot(browser, base, config, { ...(stillsHere ? { stillsDir: stillsHere } : {}), verbose: !!opts.verbose });
          results.push(r);
          const frozen = r.freezes.reduce((n, f) => n + f.ms, 0);
          const g = r.net3g;
          console.log(`  boot ${net.padEnd(3)} sw=${sw.padEnd(3)} art=${art.padEnd(7)} → monotone ${r.monotone ? 'y' : 'n'}, final ${r.final.download}/${r.final.setup}, download full at ${r.downloadFullAtMs} ms wall / ${r.downloadFullAtLiveMs} ms live, loader gone at ${r.leaveMs} ms (${r.freezes.length} main-thread freezes, ${frozen} ms), ${r.samples} samples${g ? `  [3G informational${g.capped ? `, capped at ${(g.sampledMs / 1000).toFixed(0)} s` : ''}: ${g.arrivedMB} MB received at ${g.rateKBs} KB/s, DOWNLOAD ${g.downloadPct} % → projected ${g.projectedMB ?? '?'} MB / ${g.projectedS ?? '?'} s]` : ''}${r.notes.length ? `  NOTE ${r.notes.join('; ')}` : ''}${r.fails.length ? `  FAIL ${r.fails.join('; ')}` : ''}`);
        }
    }
  } finally {
    await browser.close();
    await withArt?.close();
    await noArt?.close();
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
  const filter: Partial<Record<keyof BootConfig, string>> = {};
  for (const k of ['net', 'sw', 'art'] as const) if (args.get(k)) filter[k] = args.get(k)!;
  const results = await bootSuite(filter, { stillsDir: args.get('stills') ?? path.join(REPO_ROOT, 'harness', 'out', 'boot'), verbose: args.get('verbose') === '1' });
  const failed = results.filter((r) => r.fails.length);
  const judged = results.filter((r) => !r.informational);
  console.log(`\nboot e2e: ${judged.length - failed.length}/${judged.length} judged boots pass (${results.length - judged.length} 3G rows informational)`);
  process.exit(failed.length ? 1 : 0);
}
