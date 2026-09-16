import type { HeroHarnessWindow } from './hero-browser';
/** Round gate against a frozen build: real models, full production replay bytes, crash, restart. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium, webkit, type Browser } from 'playwright';
import { decodeJSON, iterateFrames } from '../src/core/replay';
import { encodeSnapshot } from '../src/game/hook';
import { createProductionSim } from './lib/production-sim';

// Usage: tsx harness/hero-ship.mts frozen-build recording fresh-output [metal|swiftshader|webkit]
const [buildArg, inputFile, output, backend = 'metal'] = process.argv.slice(2);
if (!buildArg || !inputFile || !output || !['metal', 'swiftshader', 'webkit'].includes(backend)) throw new Error('frozen-build recording fresh-output [metal|swiftshader|webkit] required');
const build = path.resolve(buildArg);
await mkdir(output, { recursive: false });
const sha = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
async function inventory(dir = build, files: Record<string, string> = {}): Promise<Record<string, string>> {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await inventory(file, files);
    else files[path.relative(build, file)] = sha(await readFile(file));
  }
  return files;
}
const buildFiles = await inventory();
const compiledSourceHashes: Record<string, string> = {};
for (const file of Object.keys(buildFiles).filter(file => file.endsWith('.js.map'))) {
  const map = JSON.parse(await readFile(path.join(build, file), 'utf8')) as { sources: string[]; sourcesContent?: (string | null)[] };
  map.sources.forEach((source, i) => {
    const start = source.indexOf('/src/'), content = map.sourcesContent?.[i];
    if (start >= 0 && content !== null && content !== undefined) compiledSourceHashes[source.slice(start + 1)] = sha(content);
  });
}
const catalog = JSON.parse(await readFile(path.join(build, 'model-catalog.json'), 'utf8')) as { models: { logical: string; url: string; bytes: number; sha256: string }[] };
const models = catalog.models.filter(m => /models\/(bike|rider-street)(-lod)?\.glb$/.test(m.logical));
if (models.length !== 4) throw new Error('Missing full/LOD Street and bike catalog');
for (const m of models) {
  const bytes = await readFile(path.join(build, m.url));
  if (sha(bytes) !== m.sha256 || bytes.length !== m.bytes) throw new Error(`Catalog mismatch: ${m.logical}`);
}
const inputBytes = await readFile(inputFile), rec = decodeJSON(inputBytes.toString());
if (rec.header.physics !== 'v2' || rec.header.physicsHz !== 120) throw new Error('A V2/120Hz recording is required');
const sim = createProductionSim(rec.header.trackId, rec.header.bike ?? 'rookie', rec.header.seed, rec.header.physicsHz);
const frames = [...iterateFrames(rec)], expected: string[] = [];
for (const frame of frames) { sim.step(frame); const snap = sim.snap(); expected.push(encodeSnapshot(snap.physics, snap.counters)); }
if (!sim.game.cleared()) throw new Error('Input does not clear on the current source');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const servedFiles: Record<string, string> = {};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, 'http://localhost'), relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(build, `.${relative}`);
    if (!file.startsWith(build + path.sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(file); servedFiles[path.relative(build, file)] = sha(bytes);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const args = backend === 'webkit' ? [] : [`--use-angle=${backend}`, ...(backend === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []), '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'];
let browser: Browser | null = null;
try {
  browser = await (backend === 'webkit' ? webkit : chromium).launch({ headless: true, args });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(45_000);
  const errors: string[] = [], warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') {
      warnings.push(m.text());
      if (!/GPU stall due to ReadPixels|KHR_parallel_shader_compile extension not supported|\[render\] track budget:/.test(m.text())) errors.push(m.text());
    }
  });
  await page.addInitScript(() => {
    const proof = { hashes: {} as Record<string, string>, pending: [] as Promise<void>[], errors: [] as string[] };
    (window as unknown as HeroHarnessWindow).__assetProof = proof;
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch(...args), url = new URL(response.url);
      if (url.pathname.endsWith('.glb')) proof.pending.push(response.clone().arrayBuffer().then(async bytes => {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        proof.hashes[url.pathname.slice(1)] = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      }).catch(error => { proof.errors.push(String(error)); }));
      return response;
    };
  });
  const bootAt = performance.now();
  await page.goto(`${url}?harness=1&physics=v2&hz=120&outfit=street&rider=gltf&bike=gltf`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trials?.ready);
  await page.evaluate(async header => {
    const t = window.__trials!, renderer = (window as unknown as HeroHarnessWindow).__render;
    await renderer.whenReady(); t.setBike!(header.bike ?? 'rookie'); await renderer.whenReady();
    if (!await t.loadTrack(header.trackId, header.seed)) throw new Error('Track failed to load');
    t.skipCountdown(); await (window as unknown as HeroHarnessWindow).__render.whenReady(); t.render(true);
    const info = t.info(), r = (window as unknown as HeroHarnessWindow).__render.debug;
    if (info.physicsHz !== header.physicsHz || info.modules?.physics !== 'createBikePhysicsV2' || info.bike !== (header.bike ?? 'rookie') || info.seed !== header.seed) throw new Error('Replay metadata mismatch');
    if (!r.rider.source?.scene || !r.bike.source?.scene) throw new Error('Procedural model fallback');
  }, rec.header);
  const coldBootMs = performance.now() - bootAt;
  const renderer = await page.evaluate(() => window.__trials!.stats().renderer);
  if ((backend === 'metal' && !renderer.includes('Metal')) || (backend === 'swiftshader' && !renderer.includes('SwiftShader'))) throw new Error(`Wrong backend: ${renderer}`);
  // Compare every tick, including complete Game counters. No old expected golden is repinned.
  let mismatchedTick: number | null = null;
  for (let start = 0; start < frames.length; start += 600) {
    const states = await page.evaluate(batch => {
      const t = window.__trials!;
      return batch.map((frame, i) => {
        t.setInput(frame); t.step(1);
        if (i % 2 === 1) {
          t.render(true);
          if ((window as unknown as HeroHarnessWindow).__render.debug.renderer.getContext().getError() !== 0) throw new Error('GL error during clear');
        }
        return t.snapshot();
      });
    }, frames.slice(start, start + 600));
    for (let i = 0; i < states.length; i++) if (states[i] !== expected[start + i] && mismatchedTick === null) mismatchedTick = start + i + 1;
  }
  const clear = await page.evaluate(() => {
    const t = window.__trials!;
    t.render(true); // A finish on an odd tick still gets a presented-state render.
    if ((window as unknown as HeroHarnessWindow).__render.debug.renderer.getContext().getError() !== 0) throw new Error('GL error on finish');
    return { cleared: t.cleared(), time: t.runTime(), faults: t.faults() };
  });
  if (!clear.cleared || mismatchedTick !== null) throw new Error(`Production replay disagreement at ${mismatchedTick}, clear=${clear.cleared}`);
  const restart = await page.evaluate(async () => {
    const t = window.__trials!, renderer = (window as unknown as HeroHarnessWindow).__render;
    t.setBike!('rookie'); await renderer.whenReady();
    if (!await t.loadTrack('flat-test', 1)) throw new Error('Crash track unavailable');
    await renderer.whenReady(); t.skipCountdown();
    t.setInput({ throttle: 1, lean: -1 });
    let crashTick = 0;
    while (t.phase() !== 'crashed' && crashTick < 1200) { t.step(1); crashTick++; if (crashTick % 2 === 0) t.render(true); }
    if (t.phase() !== 'crashed') throw new Error('Crash probe did not crash');
    t.render(true);
    const faults = t.faults(), start = performance.now();
    t.setInput({ restart: true }); t.step(1);
    const commandMs = performance.now() - start, state = t.getState(), phase = t.phase();
    t.render(true);
    const frameMs = performance.now() - start;
    t.setInput({ restart: false, throttle: 1, lean: 0 });
    let movesAfterTicks = 0;
    while (t.getState().bike.vel.x <= 0 && movesAfterTicks < 120) { t.step(1); movesAfterTicks++; }
    return { crashTick, crashToRestartTicks: 1, restartStateTick: state.tick, restartPhase: phase, faultsBefore: faults, faultsAfter: t.faults(),
      commandMs, frameMs, movesAfterTicks, glError: renderer.debug.renderer.getContext().getError(), heroDoc: renderer.debugInfo().heroDoc };
  });
  const assetProof = await page.evaluate(async () => {
    const p = (window as unknown as HeroHarnessWindow).__assetProof!; await Promise.all(p.pending); return { hashes: p.hashes, errors: p.errors };
  });
  for (const m of models) if (assetProof.hashes[m.url] !== m.sha256) errors.push(`Consumed asset mismatch: ${m.logical}`);
  errors.push(...assetProof.errors);
  for (const [file, digest] of Object.entries(servedFiles)) if (buildFiles[file] !== digest) errors.push(`Served build mismatch: ${file}`);
  const unchanged = JSON.stringify(await inventory()) === JSON.stringify(buildFiles);
  const pass = restart.restartStateTick === 0 && restart.restartPhase === 'riding' && restart.faultsAfter === restart.faultsBefore
    && restart.movesAfterTicks <= 1 && restart.commandMs < 16.7 && restart.glError === 0 && errors.length === 0 && unchanged;
  const report = { pass, browser: backend === 'webkit' ? 'webkit' : 'chromium', browserVersion: browser.version(), backend,
    renderer, build, buildFiles, compiledSourceHashes, servedFiles, models, assetProof, unchanged,
    inputFile, inputSha256: createHash('sha256').update(inputBytes).digest('hex'), inputTicks: frames.length, mismatchedTick, coldBootMs,
    clear, restart, errors, warnings, snapshotScope: 'Every physics F64/U8 byte and serialized complete Game counter; counters use existing JSON wire representation.',
    renderCadence: 'Full clear and crash prefix rendered every 2 ticks at 120 Hz using production interpolation; no fixed-alpha override.',
    note: 'Headless desktop browser; frameMs is CPU submission latency, not GPU completion or actual iOS presentation. Played capture is separate.' };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ pass, backend, clear, restart, inputTicks: frames.length, mismatchedTick, coldBootMs, errors }));
  if (!pass) throw new Error('Round boot/clear/crash/restart gate failed; inspect report');
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ pass: false, backend, build, buildFiles, compiledSourceHashes,
    inputFile, inputSha256: sha(inputBytes), error: error instanceof Error ? error.stack : String(error) }, null, 2) + '\n');
  throw error;
} finally { await browser?.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
