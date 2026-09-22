/**
 * Ask 84 evidence: the "new build" pill and the crash screen, played in a headless browser against a BUILT dist.
 *
 *   npx vite build
 *   GIT_DIR=/nonexistent VERCEL_GIT_COMMIT_SHA=<40 hex> npx vite build --outDir <next> --emptyOutDir   # "the next deploy"
 *   npx tsx docs/evidence/cd-update-error/verify.mts --dist=dist --next=<next> --out=docs/evidence/cd-update-error [--engines=webkit,chromium]
 *
 * One static server whose root can be switched from `dist` to `next` mid-test (= a deploy landing while the app is
 * open), with the production headers (COOP/COEP, no-store on version.json / index.html / sw.js, immutable assets).
 * Per engine (WebKit 932×430 phone, Chromium 1280×720 desktop), each a recorded context:
 *
 *   update   (a) version.json == running build  (b) deploy → the pill lights on the menu, stays on the world map,
 *            is gone for the whole run (a check fired mid-run too), back on the menu, tap → the page is the new build
 *   sw       the same tap with the service worker in control: the waiting worker is adopted (handOver) and the
 *            page reloads onto the new build (skipped where the engine has no service worker)
 *   crash    (c) ?crash=play → ride → the sheet over the run; its stack is parsed for readable names
 *   clean    (d) cold boot → ride → bike crash (gas + lean back) → Enter restart → ride: no sheet, no pill, no page error
 *   boot / reject (Chromium): ?crash=boot and ?crash=reject reach the same sheet
 *
 * Silent by rule: every game URL carries `?audio=0` (NullAudio; WebKit has no mute flag) and Chromium runs `--mute-audio`.
 * The update tap keeps the query (the cache-bust only adds `b=`; the worker hand-over reloads the same URL).
 *
 * Writes <out>/<engine>-<flow>.webm (+ .mp4 when ffmpeg exists), numbered stills, and <out>/results.json.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const DIST = path.resolve(args.get('dist') ?? 'dist');
const NEXT = path.resolve(args.get('next') ?? '');
const OUT = path.resolve(args.get('out') ?? 'docs/evidence/cd-update-error');
const ENGINES = (args.get('engines') ?? 'webkit,chromium').split(',');
const FLOWS = (args.get('flows') ?? 'update,sw,crash,clean,boot,reject,portrait').split(',');
/** Raw webm recordings (large): outside the evidence folder; the mp4 lands in <out>. */
const SCRATCH = path.resolve(args.get('scratch') ?? path.join(OUT, '..', '..', '..', 'harness', 'out', 'cd-update-error'));
if (!fs.existsSync(path.join(NEXT, 'version.json'))) throw new Error('--next=<dir> must be a second build (see the header)');
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- server
let root = DIST;
let versionHits = 0;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.map': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  if (p === '/version.json') versionHits++;
  const noStore = /^\/(version\.json|index\.html|sw\.js|load-manifest\.json|offline\.html)$/.test(p);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': noStore ? 'no-store' : /^\/(assets|models)\//.test(p) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const buildOf = (dir: string): string => (JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')) as { build: string }).build;
const OLD = buildOf(DIST);
const NEW = buildOf(NEXT);
console.log(`serving ${URL0}  old=${OLD} next=${NEW}`);

// ---------------------------------------------------------------- helpers
const SEED = `(() => { try { localStorage.setItem('trials.onboarded', '1'); } catch {} })()`;
type Rec = Record<string, unknown>;
const results: Record<string, Rec> = {};

interface Geo { W: number; H: number; phone: boolean }
const GEO: Record<string, Geo> = { webkit: { W: 932, H: 430, phone: true }, chromium: { W: 1280, H: 720, phone: false } };

async function launch(engine: string): Promise<Browser> {
  return engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

async function context(browser: Browser, engine: string, flow: string): Promise<BrowserContext> {
  const g = GEO[engine]!;
  const dir = path.join(SCRATCH, `${engine}-${flow}`);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: g.W, height: g.H },
    deviceScaleFactor: g.phone ? 2 : 1,
    ...(g.phone ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}),
    recordVideo: { dir, size: { width: g.W, height: g.H } },
  });
  await ctx.addInitScript(SEED);
  return ctx;
}

/** Close the context and move its one video to <out>/<engine>-<flow>.webm (+ mp4). */
async function finish(ctx: BrowserContext, page: Page, engine: string, flow: string): Promise<void> {
  const v = page.video();
  await ctx.close();
  if (!v) return;
  const src = await v.path();
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-movflags', '+faststart', path.join(OUT, `${engine}-${flow}.mp4`)]);
  } catch {
    fs.copyFileSync(src, path.join(OUT, `${engine}-${flow}.webm`)); // no ffmpeg: the webm is the evidence
  }
}

let shotN = 0;
async function shot(page: Page, name: string): Promise<string> {
  // JPEG, CSS-pixel scale: a 2× PNG of a game frame is 2.5 MB; this is ~0.3 MB and the sheet's text still reads.
  const f = `${String(++shotN).padStart(2, '0')}-${name}.jpg`;
  await page.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 75, scale: 'css' });
  return f;
}

async function tap(page: Page, engine: string, sel: string): Promise<void> {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error(`no ${sel}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (GEO[engine]!.phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function bootToMenu(page: Page, url: string): Promise<number> {
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('loader') && !!document.querySelector('.menu-screen.live'), null, { timeout: 240000 });
  return Date.now() - t0;
}

/** Menu → PLAY → world map → RIDE → riding. */
async function ride(page: Page, engine: string): Promise<void> {
  await page.waitForTimeout(500);
  await tap(page, engine, '.menu-screen.live .menu-item[data-id=play]');
  await page.waitForFunction(() => !!document.querySelector('.tracks-screen.live'), null, { timeout: 30000 });
  await page.waitForTimeout(900);
  await tap(page, engine, '.wm-ride');
  await page.waitForFunction(() => (window as unknown as { __trials?: { phase(): string } }).__trials?.phase() === 'riding', null, { timeout: 60000 });
}

const pillState = (page: Page) =>
  page.evaluate(() => {
    const p = document.querySelector<HTMLElement>('.update-pill');
    const s = (window as unknown as { __trialsUpdate?: { state(): Rec } }).__trialsUpdate?.state() ?? null;
    if (!p) return { mounted: false, on: false, visible: false, state: s, box: null, hitAtCentre: false };
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { mounted: true, on: p.classList.contains('on'), visible: cs.visibility === 'visible' && Number(cs.opacity) > 0, state: s, box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, hitAtCentre: !!hit && p.contains(hit), text: p.textContent };
  });

/** Fire the page's own visibilitychange listener (the resume-from-background path on iOS). */
const resume = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

const screenOf = (page: Page) => page.evaluate(() => (window as unknown as { __trials?: { app?: { screen(): string } } }).__trials?.app?.screen() ?? null);

// ---------------------------------------------------------------- flows
async function flowUpdate(browser: Browser, engine: string): Promise<Rec> {
  root = DIST;
  const r: Rec = {};
  const ctx = await context(browser, engine, 'update');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    r['bootMs'] = await bootToMenu(page, `${URL0}/?sw=0&audio=0`);
    await page.waitForFunction(() => !!(window as unknown as { __trialsUpdate?: unknown }).__trialsUpdate, null, { timeout: 10000 });
    await page.waitForTimeout(800);
    // (a) the server's version.json names the running build.
    r['versionJson'] = await page.evaluate(() => fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' }).then((x) => x.json()));
    r['running'] = await page.evaluate(() => (window as unknown as { __trialsUpdate: { state(): { running: string } } }).__trialsUpdate.state().running);
    r['a_versionMatchesRunning'] = (r['versionJson'] as { build: string }).build === r['running'];
    r['pillBeforeDeploy'] = await pillState(page);
    r['shotMenuBefore'] = await shot(page, `${engine}-update-menu-current-build`);
    // Deploy lands while the app is open; the player comes back to it (visibilitychange).
    root = NEXT;
    const hitsBefore = versionHits;
    await resume(page);
    await page.waitForFunction(() => document.querySelector('.update-pill')?.classList.contains('on'), null, { timeout: 10000 });
    r['versionFetchesOnResume'] = versionHits - hitsBefore;
    // A frame sequence of the pill arriving (240 ms fade).
    r['shotPillSeq'] = [await shot(page, `${engine}-update-pill-arrives-0`)];
    await page.waitForTimeout(300);
    (r['shotPillSeq'] as string[]).push(await shot(page, `${engine}-update-pill-lit-menu`));
    r['pillOnMenu'] = await pillState(page);
    // World map: still a menu screen.
    await tap(page, engine, '.menu-screen.live .menu-item[data-id=play]');
    await page.waitForFunction(() => !!document.querySelector('.tracks-screen.live'), null, { timeout: 30000 });
    await page.waitForTimeout(900);
    r['pillOnWorldMap'] = await pillState(page);
    r['shotWorldMap'] = await shot(page, `${engine}-update-pill-world-map`);
    // Ride: gone for the whole run, including a check fired mid-run.
    await tap(page, engine, '.wm-ride');
    await page.waitForFunction(() => (window as unknown as { __trials?: { phase(): string } }).__trials?.phase() === 'riding', null, { timeout: 60000 });
    const during: Rec[] = [];
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 6; i++) {
      if (i === 2) await resume(page);
      await page.waitForTimeout(400);
      during.push({ t: i, phase: await page.evaluate(() => (window as unknown as { __trials: { phase(): string } }).__trials.phase()), ...(await pillState(page)) });
      if (i === 3) r['shotRiding'] = await shot(page, `${engine}-update-riding-no-pill`);
    }
    await page.keyboard.up('ArrowUp');
    r['pillDuringRun'] = during;
    r['b_hiddenMidRun'] = during.every((d) => !d['on'] && !d['visible'] && !d['hitAtCentre']);
    // Back to the menu: pause → Quit.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !!document.querySelector('.pause-overlay.live'), null, { timeout: 10000 });
    r['pillOnPause'] = await pillState(page);
    await tap(page, engine, '.pause-overlay.live .tile[data-id=quit]');
    await page.waitForFunction(() => !!document.querySelector('.menu-screen.live') || !!document.querySelector('.tracks-screen.live'), null, { timeout: 20000 });
    await page.waitForTimeout(600);
    r['screenAfterQuit'] = await screenOf(page);
    r['pillAfterQuit'] = await pillState(page);
    r['shotAfterQuit'] = await shot(page, `${engine}-update-pill-back-after-run`);
    // Tap it.
    const nav = page.waitForEvent('framenavigated', { timeout: 20000 });
    await tap(page, engine, '.update-pill.on');
    r['shotTapped'] = await shot(page, `${engine}-update-tapped`).catch(() => null);
    await nav;
    r['reloadedTo'] = page.url().replace(URL0, '');
    r['bootMsNew'] = await (async () => {
      const t0 = Date.now();
      await page.waitForFunction(() => !document.getElementById('loader') && !!document.querySelector('.menu-screen.live'), null, { timeout: 240000 });
      return Date.now() - t0;
    })();
    await page.waitForFunction(() => !!(window as unknown as { __trialsUpdate?: unknown }).__trialsUpdate, null, { timeout: 10000 });
    await page.waitForTimeout(1200);
    r['runningAfter'] = await page.evaluate(() => (window as unknown as { __trialsUpdate: { state(): { running: string } } }).__trialsUpdate.state().running);
    r['menuStampAfter'] = await page.evaluate(() => document.querySelector('.menu-build')?.textContent ?? null);
    r['pillAfterUpdate'] = await pillState(page);
    r['shotNewBuild'] = await shot(page, `${engine}-update-new-build-menu`);
    r['b_updatedToNext'] = r['runningAfter'] === NEW && !(r['pillAfterUpdate'] as { on: boolean }).on;
    r['b_pillOnMenus'] = (r['pillOnMenu'] as { visible: boolean; hitAtCentre: boolean }).visible && (r['pillOnMenu'] as { hitAtCentre: boolean }).hitAtCentre && (r['pillOnWorldMap'] as { visible: boolean }).visible && !(r['pillOnPause'] as { visible: boolean }).visible && (r['pillAfterQuit'] as { visible: boolean }).visible;
    r['crashSheet'] = await page.evaluate(() => !!document.getElementById('crash'));
  } catch (e) {
    r['error'] = String(e);
    r['shotError'] = await shot(page, `${engine}-update-error`).catch(() => null);
  }
  r['pageErrors'] = errors;
  await finish(ctx, page, engine, 'update');
  return r;
}

async function flowSw(browser: Browser, engine: string): Promise<Rec> {
  root = DIST;
  const r: Rec = {};
  const ctx = await context(browser, engine, 'sw');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    r['hasServiceWorker'] = await (async () => {
      await page.goto(`${URL0}/offline.html`);
      return page.evaluate(() => 'serviceWorker' in navigator);
    })();
    if (!r['hasServiceWorker']) {
      r['skipped'] = `${engine}: no navigator.serviceWorker in this headless build`;
      await finish(ctx, page, engine, 'sw');
      return r;
    }
    r['bootMs'] = await bootToMenu(page, `${URL0}/?audio=0`);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    r['controllerBefore'] = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
    await page.waitForFunction(() => !!(window as unknown as { __trialsUpdate?: unknown }).__trialsUpdate, null, { timeout: 10000 });
    r['runningBefore'] = await page.evaluate(() => (window as unknown as { __trialsUpdate: { state(): { running: string } } }).__trialsUpdate.state().running);
    // version.json must not be answered by the worker (network-only): switch the server and ask again.
    root = NEXT;
    const viaWorker = await page.evaluate(() => fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' }).then((x) => x.json()));
    r['versionThroughWorker'] = viaWorker;
    r['versionNetworkOnly'] = (viaWorker as { build: string }).build === NEW;
    await resume(page);
    await page.waitForFunction(() => document.querySelector('.update-pill')?.classList.contains('on'), null, { timeout: 10000 });
    await page.waitForTimeout(300);
    r['shotPill'] = await shot(page, `${engine}-sw-pill-lit`);
    const t0 = Date.now();
    const nav = page.waitForEvent('framenavigated', { timeout: 30000 });
    await tap(page, engine, '.update-pill.on');
    await page.waitForTimeout(150);
    r['shotUpdating'] = await shot(page, `${engine}-sw-updating`).catch(() => null);
    await nav;
    await page.waitForFunction(() => !document.getElementById('loader') && !!document.querySelector('.menu-screen.live'), null, { timeout: 240000 });
    await page.waitForFunction(() => !!(window as unknown as { __trialsUpdate?: unknown }).__trialsUpdate, null, { timeout: 10000 });
    r['tapToNewMenuMs'] = Date.now() - t0;
    r['runningAfter'] = await page.evaluate(() => (window as unknown as { __trialsUpdate: { state(): { running: string } } }).__trialsUpdate.state().running);
    r['workerBuildAfter'] = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const c = navigator.serviceWorker.controller;
          if (!c) return resolve(null);
          const ch = new MessageChannel();
          ch.port1.onmessage = (e) => resolve((e.data as { build?: string }).build ?? null);
          c.postMessage({ type: 'VERSION' }, [ch.port2]);
          setTimeout(() => resolve('timeout'), 8000);
        }),
    );
    r['shotAfter'] = await shot(page, `${engine}-sw-new-build-menu`);
    r['pillAfter'] = await pillState(page);
    r['sw_adopted'] = r['runningAfter'] === NEW && String(r['workerBuildAfter']).startsWith(NEW);
  } catch (e) {
    r['error'] = String(e);
    r['shotError'] = await shot(page, `${engine}-sw-error`).catch(() => null);
  }
  r['pageErrors'] = errors;
  await finish(ctx, page, engine, 'sw');
  return r;
}

/**
 * Frames out of a stack (V8 `at name (url:l:c)`, JSC `name@url:l:c`) with the script each runs in. `bundle` = the
 * game's entry chunk (`/assets/index-*.js`), the code this ask un-mangled. Frames in the page itself are the inline
 * loader (index.html, esbuild-minified under its 8 KB budget): reported, not judged.
 */
function frames(stack: string): { name: string; bundle: boolean }[] {
  const out: { name: string; bundle: boolean }[] = [];
  for (const line of stack.split('\n')) {
    const v8 = /^\s*at (?:async )?(?:(.+?) \()?(\S+?):\d+:\d+\)?$/.exec(line);
    const jsc = /^(?:async )?([^@\s]*)@(\S+?):\d+:\d+$/.exec(line.trim());
    const m = v8 ?? jsc;
    if (m) out.push({ name: m[1] || '(anonymous)', bundle: /\/assets\/index-[\w-]+\.js$/.test(m[2]!) });
  }
  return out;
}

async function flowCrash(browser: Browser, engine: string, mode: 'play' | 'reject' | 'boot'): Promise<Rec> {
  root = DIST;
  const r: Rec = {};
  const flow = mode === 'play' ? 'crash' : mode;
  const ctx = await context(browser, engine, flow);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${URL0}/?sw=0&audio=0&crash=${mode}`);
    if (mode !== 'boot') {
      await page.waitForFunction(() => !document.getElementById('loader') && !!document.querySelector('.menu-screen.live'), null, { timeout: 240000 });
      await ride(page, engine);
      await page.keyboard.down('ArrowUp');
      r['shotRiding'] = await shot(page, `${engine}-${flow}-riding`);
      await page.waitForSelector('#crash', { timeout: 30000 });
      await page.keyboard.up('ArrowUp');
    } else {
      await page.waitForSelector('#crash', { timeout: 240000 });
    }
    r['shotSheetSeq'] = [await shot(page, `${engine}-${flow}-sheet-0ms`)];
    await page.waitForTimeout(600);
    (r['shotSheetSeq'] as string[]).push(await shot(page, `${engine}-${flow}-sheet`));
    const sheet = await page.evaluate(() => ({
      msg: document.querySelector('#crash .msg')?.textContent ?? '',
      stack: document.querySelector('#crash pre.stack')?.textContent ?? '',
      meta: document.querySelector('#crash pre.meta')?.textContent ?? '',
      count: document.querySelector('#crash .n')?.textContent ?? '',
      sheets: document.querySelectorAll('#crash').length,
      loaderShown: !!document.getElementById('loader'),
      loaderFailed: document.getElementById('loader')?.classList.contains('failed') ?? false,
      buttons: [...document.querySelectorAll('#crash button')].map((b) => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height) })),
      fits: (() => {
        const s = document.querySelector('#crash .sheet')!.getBoundingClientRect();
        const row = document.querySelector('#crash .row')!.getBoundingClientRect();
        return s.top >= 0 && s.bottom <= innerHeight + 0.5 && row.bottom <= innerHeight + 0.5;
      })(),
    }));
    Object.assign(r, sheet);
    const fr = frames(sheet.stack);
    r['frames'] = fr.map((f) => `${f.name}${f.bundle ? '' : ' [inline loader]'}`);
    // Readable = no frame of the game bundle has a 1–2 character name, the test's own frame is named, and the
    // frames around it are the game's own by name (the loop in play, `bootFront` in the boot).
    const named = fr.filter((f) => f.bundle && f.name !== '(anonymous)').map((f) => f.name);
    r['shortNames'] = named.filter((n) => n.replace(/^.*\./, '').length <= 2);
    const has = (re: RegExp): boolean => named.some((n) => re.test(n));
    r['c_readable'] = (r['shortNames'] as string[]).length === 0 && (mode === 'boot' ? has(/crashTestBoot/) && has(/bootFront/) : has(/crashTestSetRun/) && (mode === 'reject' || has(/tickFrame/)));
    r['pillOverSheet'] = await pillState(page);
    // COPY REPORT (the clipboard may refuse in headless: the label says which).
    await tap(page, engine, '#crash button.copy');
    await page.waitForTimeout(400);
    r['copyLabel'] = await page.evaluate(() => document.querySelector('#crash button.copy')?.textContent);
    r['shotCopied'] = await shot(page, `${engine}-${flow}-copy`);
  } catch (e) {
    r['error'] = String(e);
    r['shotError'] = await shot(page, `${engine}-${flow}-error`).catch(() => null);
  }
  r['pageErrors'] = errors;
  await finish(ctx, page, engine, flow);
  return r;
}

async function flowClean(browser: Browser, engine: string): Promise<Rec> {
  root = DIST;
  const r: Rec = {};
  const ctx = await context(browser, engine, 'clean');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    r['bootMs'] = await bootToMenu(page, `${URL0}/?sw=0&audio=0`);
    await ride(page, engine);
    r['shotRiding'] = await shot(page, `${engine}-clean-riding`);
    // Loop out: full gas + lean back until the bike faults.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    const t0 = Date.now();
    await page.waitForFunction(() => {
      const t = (window as unknown as { __trials: { phase(): string; faults(): number } }).__trials;
      return t.phase() === 'crashed' || t.faults() > 0;
    }, null, { timeout: 60000 });
    r['msToBikeCrash'] = Date.now() - t0;
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
    r['shotCrashed'] = await shot(page, `${engine}-clean-bike-crashed`);
    r['faultsAfterCrash'] = await page.evaluate(() => (window as unknown as { __trials: { faults(): number } }).__trials.faults());
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (window as unknown as { __trials: { phase(): string } }).__trials.phase() === 'riding', null, { timeout: 20000 });
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowUp');
    r['shotRestarted'] = await shot(page, `${engine}-clean-restarted-riding`);
    r['phaseAfterRestart'] = await page.evaluate(() => (window as unknown as { __trials: { phase(): string } }).__trials.phase());
    r['crashSheet'] = await page.evaluate(() => !!document.getElementById('crash'));
    r['pill'] = await pillState(page);
    r['d_clean'] = !r['crashSheet'] && !(r['pill'] as { on: boolean }).on && errors.length === 0;
  } catch (e) {
    r['error'] = String(e);
    r['shotError'] = await shot(page, `${engine}-clean-error`).catch(() => null);
  }
  r['pageErrors'] = errors;
  await finish(ctx, page, engine, 'clean');
  return r;
}

/** Portrait phone (430×932, WebKit): the rotate prompt is up; the pill sits over it, and a boot crash sheet fits. */
async function flowPortrait(browser: Browser): Promise<Rec> {
  root = DIST;
  const r: Rec = {};
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  try {
    await page.goto(`${URL0}/?sw=0&audio=0`);
    await page.waitForFunction(() => !document.getElementById('loader') && !!(window as unknown as { __trialsUpdate?: unknown }).__trialsUpdate, null, { timeout: 240000 });
    root = NEXT;
    await resume(page);
    await page.waitForFunction(() => document.querySelector('.update-pill')?.classList.contains('on'), null, { timeout: 10000 });
    await page.waitForTimeout(400);
    r['rotatePromptUp'] = await page.evaluate(() => getComputedStyle(document.querySelector('.rotate')!).display !== 'none');
    r['pill'] = await pillState(page);
    r['shotPill'] = await shot(page, 'webkit-portrait-pill-over-rotate-prompt');
    root = DIST;
    await page.goto(`${URL0}/?sw=0&audio=0&crash=boot`);
    await page.waitForSelector('#crash', { timeout: 240000 });
    await page.waitForTimeout(500);
    r['sheetFits'] = await page.evaluate(() => {
      const row = document.querySelector('#crash .row')!.getBoundingClientRect();
      return row.bottom <= innerHeight + 0.5 && row.right <= innerWidth + 0.5;
    });
    r['shotSheet'] = await shot(page, 'webkit-portrait-boot-crash-sheet');
    r['portrait_ok'] = !!r['rotatePromptUp'] && (r['pill'] as { visible: boolean; hitAtCentre: boolean }).visible && (r['pill'] as { hitAtCentre: boolean }).hitAtCentre && !!r['sheetFits'];
  } catch (e) {
    r['error'] = String(e);
  }
  await ctx.close();
  return r;
}

// ---------------------------------------------------------------- run
for (const engine of ENGINES) {
  const browser = await launch(engine);
  try {
    if (engine === 'webkit' && FLOWS.includes('portrait')) results['webkit.portrait'] = await flowPortrait(browser);
    if (FLOWS.includes('clean')) results[`${engine}.clean`] = await flowClean(browser, engine);
    if (FLOWS.includes('update')) results[`${engine}.update`] = await flowUpdate(browser, engine);
    if (FLOWS.includes('sw')) results[`${engine}.sw`] = await flowSw(browser, engine);
    if (FLOWS.includes('crash')) results[`${engine}.crash`] = await flowCrash(browser, engine, 'play');
    if (engine === 'chromium' && FLOWS.includes('boot')) results[`${engine}.boot`] = await flowCrash(browser, engine, 'boot');
    if (engine === 'chromium' && FLOWS.includes('reject')) results[`${engine}.reject`] = await flowCrash(browser, engine, 'reject');
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).filter(([k]) => k.startsWith(engine))), null, 1));
}
server.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ old: OLD, next: NEW, results }, null, 2) + '\n');
const verdict = Object.entries(results).map(([k, v]) => `${k}: ${Object.entries(v).filter(([kk]) => /^(a|b|c|d|sw|portrait)_/.test(kk)).map(([kk, vv]) => `${kk}=${String(vv)}`).join(' ') || (v['skipped'] ? 'skipped' : '')}${v['error'] ? ` ERROR ${String(v['error']).slice(0, 160)}` : ''}`);
console.log(verdict.join('\n'));
