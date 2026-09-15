// Headless lifecycle regression: actual rapid class/track/quality transitions, no GPU delay.
// tsx harness/e2e/render-retirement.mts BUILD NEW_OUTPUT [metal|swiftshader|webkit] [repeats]
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ThreeRenderer } from '../../src/render';
import type { BikeClass, QualityTier } from '../../src/core/types';

const [buildArg, outputArg, backend = 'metal', repetitions = '3'] = process.argv.slice(2);
if (!buildArg || !outputArg || !['metal', 'swiftshader', 'webkit'].includes(backend)) throw new Error('BUILD NEW_OUTPUT [metal|swiftshader|webkit] [repeats]');
const repeat = Number(repetitions);
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('repeats must be 1..10');
const build = path.resolve(buildArg), output = path.resolve(outputArg);
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('output directory must be empty');
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function inventory(dir: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const walk = async (parent: string): Promise<void> => {
    for (const entry of (await readdir(parent, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(parent, entry.name);
      if (entry.isDirectory()) await walk(file);
      else hashes[path.relative(dir, file)] = sha(await readFile(file));
    }
  };
  await walk(dir);
  return hashes;
}
const buildFiles = await inventory(build);
const compiledSourceHashes: Record<string, string> = {};
for (const file of Object.keys(buildFiles).filter(file => file.endsWith('.js.map'))) {
  const map = JSON.parse(await readFile(path.join(build, file), 'utf8')) as { sources: string[]; sourcesContent?: (string | null)[] };
  for (let i = 0; i < map.sources.length; i++) {
    const source = map.sources[i]!, content = map.sourcesContent?.[i];
    const start = source.indexOf('/src/');
    if (start >= 0 && content !== null && content !== undefined) compiledSourceHashes[source.slice(start + 1)] = sha(content);
  }
}
const sourceFiles = ['src/render/index.ts', 'src/render/resourceRetirement.ts', 'src/render/compilation.test.ts', 'src/render/resourceRetirement.test.ts', 'src/render/post/chain.ts', 'src/render/post/chain.test.ts', 'harness/e2e/render-retirement.mts'];
// Current invocation source hashes are explicit; an older frozen build is identified by its
// own complete inventory, never falsely attributed to whichever source is now checked out.
const invocationSourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(file))])));
const catalog = JSON.parse(await readFile(path.join(build, 'model-catalog.json'), 'utf8')) as { models: { logical: string; url: string; sha256: string; bytes: number }[] };
const modelEntries = ['models/bike.glb', 'models/bike-lod.glb', 'models/rider-street.glb', 'models/rider-street-lod.glb'].map(logical => {
  const entry = catalog.models.find(model => model.logical === logical);
  if (!entry) throw new Error(`catalog entry missing: ${logical}`);
  return entry;
});
for (const model of modelEntries) {
  const bytes = await readFile(path.join(build, model.url));
  if (bytes.length !== model.bytes || sha(bytes) !== model.sha256) throw new Error(`catalog mismatch: ${model.logical}`);
}
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname);
    const file = path.resolve(build, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(build + path.sep)) { response.writeHead(403); response.end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const launchArgs = backend === 'webkit' ? [] : [`--use-angle=${backend}`, ...(backend === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []), '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'];

interface Trace { created: number; deleted: number; queriedAfterDelete: number }
interface ProbeWindow extends Window {
  __render: ThreeRenderer;
  __retirementTrace: Trace;
  __retirementAssets: { hashes: Record<string, string>; pending: Promise<void>[]; errors: string[] };
}
const reports: unknown[] = [];
let failed = false;
try {
  for (let run = 0; run < repeat; run++) {
    const browser = await (backend === 'webkit' ? webkit : chromium).launch({ headless: true, args: launchArgs });
    const consoleMessages: string[] = [], failures: string[] = [], responses: Promise<void>[] = [];
    const servedFiles: Record<string, string> = {};
    let details: unknown = null;
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(45_000);
      // tsx preserves names of nested functions in serialized page callbacks with this helper.
      await page.addInitScript({ content: 'window.__name = (fn) => fn;' });
      await page.addInitScript(() => {
        const w = window as unknown as ProbeWindow;
        const trace = w.__retirementTrace = { created: 0, deleted: 0, queriedAfterDelete: 0 };
        const prototype = WebGL2RenderingContext.prototype;
        const create = prototype.createProgram, destroy = prototype.deleteProgram, query = prototype.getProgramParameter;
        const deleted = new WeakSet<WebGLProgram>();
        prototype.createProgram = function () { const program = create.call(this); if (program) trace.created++; return program; };
        prototype.deleteProgram = function (program) { if (program && !deleted.has(program)) { trace.deleted++; deleted.add(program); } return destroy.call(this, program); };
        prototype.getProgramParameter = function (program, parameter) { if (deleted.has(program)) trace.queriedAfterDelete++; return query.call(this, program, parameter); };
        // Observational only: no getError, readiness override, delayed deletion or shader edits.
        const proof = w.__retirementAssets = { hashes: {} as Record<string, string>, pending: [] as Promise<void>[], errors: [] as string[] };
        const fetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const response = await fetch(...args);
          if (new URL(response.url).pathname.endsWith('.glb')) proof.pending.push(response.clone().arrayBuffer().then(async bytes => {
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            proof.hashes[new URL(response.url).pathname.slice(1)] = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          }).catch(error => { proof.errors.push(String(error)); }));
          return response;
        };
      });
      page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
      page.on('console', message => {
        if (message.type() !== 'warning' && message.type() !== 'error') return;
        const text = `${message.type()}: ${message.text()}`;
        consoleMessages.push(text);
        if (!(message.type() === 'warning' && /\[render\] track budget:|KHR_parallel_shader_compile extension not supported|GPU stall due to ReadPixels/.test(message.text()))) failures.push(text);
      });
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.host !== `127.0.0.1:${port}` || response.status() !== 200 || url.pathname.endsWith('.glb')) return;
        const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        responses.push(response.body().then(bytes => {
          servedFiles[file] = sha(bytes);
          if (servedFiles[file] !== buildFiles[file]) failures.push(`served build mismatch: ${file}`);
        }).catch(error => { failures.push(`${file}: ${String(error)}`); }));
      });
      await page.goto(`http://127.0.0.1:${port}/?harness=1&rider=gltf&bike=gltf&hz=120&physics=v2&outfit=street`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__trials?.ready === true);
      details = await page.evaluate(async backend => {
        const w = window as unknown as ProbeWindow, t = window.__trials!;
        t.info(); // The hook is installed before the lazy Game/renderer exists.
        const r = w.__render, renderer = r.debug.renderer, gl = renderer.getContext();
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        if (!extension) throw new Error('renderer identity unavailable');
        const hardware = String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
        if ((backend === 'metal' && !hardware.includes('Metal')) || (backend === 'swiftshader' && !hardware.includes('SwiftShader'))) throw new Error(`wrong backend: ${hardware}`);
        const parallelCompile = !!gl.getExtension('KHR_parallel_shader_compile');
        const state = { inFlight: 0, maxInFlight: 0, starts: 0, ends: 0, bursts: [] as { reason: string; bike: BikeClass; track: string; quality: QualityTier; inFlight: number; at: number }[], entryErrors: [] as string[] };
        const original = renderer.compileAsync.bind(renderer);
        let armed = false, scheduled = false, lastLoad: Promise<unknown> = Promise.resolve();
        const tracks = ['b1-first-ride', 'e2-rear-wheel-first', 'b3-kicker-row', 'm1-hop-up'];
        const qualities: QualityTier[] = ['low', 'high', 'medium'];
        const mutate = (reason: string): void => {
          if (state.bursts.length >= 12) return;
          const i = state.bursts.length, bike = i % 2 === 0 ? 'pro' : 'rookie', track = tracks[i % tracks.length]!, quality = qualities[i % qualities.length]!;
          state.bursts.push({ reason, bike, track, quality, inFlight: state.inFlight, at: performance.now() });
          t.setBike!(bike);
          lastLoad = Promise.resolve(t.loadTrack(track, 1));
          void lastLoad.catch(error => state.entryErrors.push(String(error)));
          t.setQuality(quality);
        };
        renderer.compileAsync = (...args) => {
          state.starts++; state.inFlight++; state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
          const pending = original(...args);
          void pending.then(() => { state.inFlight--; state.ends++; }, error => { state.inFlight--; state.ends++; state.entryErrors.push(String(error)); });
          if (armed && !scheduled) {
            scheduled = true;
            queueMicrotask(() => { scheduled = false; if (state.inFlight > 0) mutate('pending-compile'); });
          }
          return pending;
        };
        const bounded = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout`)), 30_000); })]); }
          finally { clearTimeout(timer); }
        };
        await bounded(r.whenReady(), 'initial readiness');
        armed = true;
        mutate('start');
        for (let i = 0; i < 24 && state.bursts.length < 12; i++) {
          await new Promise(resolve => setTimeout(resolve, 7));
          if (!scheduled && state.bursts.length < 12) mutate(state.inFlight > 0 ? 'timer-pending' : 'timer');
        }
        await bounded(Promise.all([lastLoad, r.whenReady()]), 'final readiness');
        armed = false;
        t.skipCountdown();
        const frames = [];
        for (let i = 0; i < 12; i++) {
          t.setInput({ throttle: 1, lean: 1 }); t.step(2); t.render(true);
          frames.push({ tick: t.getState().tick, glError: gl.getError() });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        await Promise.all(w.__retirementAssets.pending);
        const beforeDispose = r.debugInfo();
        const info = t.info();
        r.dispose();
        await bounded(r.whenReady(), 'renderer disposal');
        // Flush only through the normal final error check; no query/clear is hidden in tracing.
        const afterDisposeError = gl.getError();
        const retirement = r.debugInfo().retirement;
        return { hardware, parallelCompile, state, frames, beforeDispose, retirement, terminalPrograms: r.debugInfo().terminalPrograms, afterDisposeError, trace: w.__retirementTrace, info,
          remainingPrograms: renderer.info.programs?.map(program => ({ name: program.name, id: program.id, usedTimes: program.usedTimes, hasHandle: program.program !== undefined })),
          assets: { hashes: w.__retirementAssets.hashes, errors: w.__retirementAssets.errors } };
      }, backend);
      await Promise.all(responses);
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    finally { await browser.close(); }
    const unchanged = JSON.stringify(buildFiles) === JSON.stringify(await inventory(build));
    if (!unchanged) failures.push('frozen build changed during run');
    // Runtime report narrowing also permits preserving a failed/partial evaluation as null.
    const d = details as { state: { bursts: { inFlight: number }[]; maxInFlight: number; entryErrors: string[] }; frames: { glError: number }[]; afterDisposeError: number;
      retirement?: { pending: number; requested: number; released: number }; trace: Trace; assets: { hashes: Record<string, string>; errors: string[] } } | null;
    if (d) {
      if (d.state.bursts.length !== 12 || !d.state.bursts.some(burst => burst.inFlight > 0)) failures.push('did not exercise overlapping transitions');
      if (d.state.maxInFlight !== 1) failures.push(`compile concurrency ${d.state.maxInFlight}, expected 1`);
      failures.push(...d.state.entryErrors, ...d.assets.errors);
      if (d.frames.some(frame => frame.glError !== 0) || d.afterDisposeError !== 0) failures.push('nonzero GL error');
      if (!d.retirement || d.retirement.pending !== 0 || d.retirement.requested !== d.retirement.released) failures.push('retired resources not fully reclaimed');
      if (d.trace.queriedAfterDelete) failures.push('queried a program after deletion');
      if (d.trace.created !== d.trace.deleted) failures.push(`program objects still retained: ${d.trace.created - d.trace.deleted}`);
      for (const model of modelEntries) if (d.assets.hashes[model.url] !== model.sha256) failures.push(`consumed model mismatch: ${model.logical}`);
    }
    failed ||= failures.length > 0;
    const report = { build, backend, run, launchArgs, browserVersion: browser.version(), invocationSourceHashes, compiledSourceHashes, buildFiles, modelEntries, unchanged, servedFiles, consoleMessages, failures, details };
    reports.push(report);
    await writeFile(path.join(output, `run-${run}.json`), JSON.stringify(report, null, 2) + '\n');
    console.info(JSON.stringify({ run, backend, failures, maxInFlight: d?.state.maxInFlight, overlapBursts: d?.state.bursts.filter(burst => burst.inFlight > 0).length, retirement: d?.retirement, trace: d?.trace }));
  }
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
await writeFile(path.join(output, 'summary.json'), JSON.stringify(reports, null, 2) + '\n');
if (failed) process.exitCode = 1;
