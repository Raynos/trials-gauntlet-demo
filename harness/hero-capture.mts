import { normalizeRiderOutfit } from '../src/core/riderPresets';
import { heroFiles } from '../src/render/hero/urls';
import type { SkinnedMesh } from 'three';
import { decodeJSON, iterateFrames } from '../src/core/replay';
import type { QualityTier } from '../src/core/types';
import type { HeroHarnessWindow } from './hero-browser';
// Played hero capture with full prefix rendering, exact timestamps and consumed-model byte proofs.
// Run: tsx harness/hero-capture.mts build recording output fromTick toTick [quality] [outfit] [fps] [widthxheight] [swiftshader|metal|webkit] [deviceDpr=1] [phone|desktop]
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';

const [buildArg, recordingArg, outArg, fromArg, toArg, quality = 'high', outfit = 'street', fpsArg = '60', size = '1280x720', angleBackend = 'swiftshader', dprArg = '1', deviceClass = 'desktop'] = process.argv.slice(2);
if (!buildArg || !recordingArg || !outArg) throw new Error('build recording output fromTick toTick [quality] [outfit] [fps] [widthxheight] [swiftshader|metal|webkit] [deviceDpr=1] [phone|desktop]');
const normalizedOutfit = normalizeRiderOutfit(outfit);
if (!normalizedOutfit || !['low', 'medium', 'high'].includes(quality)) throw new Error('invalid outfit or quality');
if (!['swiftshader', 'metal', 'webkit'].includes(angleBackend)) throw new Error('unsupported graphics backend');
const devicePixelRatio = Number(dprArg);
if (!Number.isFinite(devicePixelRatio) || devicePixelRatio < 1 || devicePixelRatio > 4 || !['phone', 'desktop'].includes(deviceClass)) throw new Error('DPR 1..4 and phone|desktop required');
const [width, height] = size.split('x').map(Number);
if (!width || !height || ![width, height].every(Number.isSafeInteger)) throw new Error('integer widthxheight required');
const build = path.resolve(buildArg), out = path.resolve(outArg);
const recordingBytes = await readFile(recordingArg);
const recording = decodeJSON(recordingBytes.toString('utf8'));
const physics = recording.header.physics ?? 'v1';
if (!['v1', 'v2'].includes(physics)) throw new Error('unrecognized recorded physics version');
const hz = recording.header.physicsHz;
const fps = Number(fpsArg), ticksPerFrame = hz / fps;
if (![30, 60, 120].includes(fps) || ![60, 120, 240].includes(hz)) throw new Error('unsupported capture cadence');
if (!Number.isInteger(ticksPerFrame)) throw new Error('cadence must divide the recorded physics rate');
const from = Number(fromArg), to = Number(toArg);
if (![from, to].every(Number.isSafeInteger) || from % ticksPerFrame || to % ticksPerFrame) throw new Error('explicit exact frame-aligned tick boundaries required');
const inputs = [...iterateFrames(recording)];
if (to > inputs.length || from < 0 || to <= from) throw new Error('invalid capture window');
await mkdir(path.join(out, 'frames'), { recursive: true });
if ((await readdir(path.join(out, 'frames'))).length) throw new Error('capture requires a fresh frames directory');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const buildFiles: Record<string, string> = {};
async function inventory(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else buildFiles[path.relative(build, file)] = sha(await readFile(file));
  }
}
await inventory(build);
const catalog = JSON.parse(await readFile(path.join(build, 'model-catalog.json'), 'utf8')) as { models: { logical: string; url: string; bytes: number; sha256: string }[] };
// Ask 43: the live hero family (src/render/hero/urls.ts) names the files — one per outfit, one per bike class, each with its LOD twin.
const logicalFiles: readonly string[] = heroFiles(normalizedOutfit!, recording.header.bike ?? 'rookie');
const assetBytes: Record<string, string> = {};
for (const logical of logicalFiles) {
  const entry = catalog.models.find(m => m.logical === logical);
  if (!entry) throw new Error(`Missing catalog entry: ${logical}`);
  const bytes = await readFile(path.join(build, entry.url)), digest = sha(bytes);
  if (entry.sha256 !== digest || entry.bytes !== bytes.length) throw new Error(`Catalog differs from actual bytes: ${logical}`);
  assetBytes[entry.url] = digest;
}
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
    if (process.env.TRIALS_MISSING_RIDER === '1' && pathname.includes('/rider-') && pathname.endsWith('.glb')) { res.writeHead(404); res.end(); return; }
    const file = path.resolve(build, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(build + path.sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const addr = server.address() as { port: number };
const launchArgs = angleBackend === 'webkit' ? [] : [`--use-angle=${angleBackend}`, ...(angleBackend === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []), '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'];
const browser = await (angleBackend === 'webkit' ? webkit : chromium).launch({ headless: true, args: launchArgs });
const browserIdentity = { browser: angleBackend === 'webkit' ? 'webkit' : 'chromium', browserVersion: browser.version(),
  ...(angleBackend === 'webkit' ? {} : { chromium: browser.version() }) };
const errors: string[] = [], responses: Promise<void>[] = [], downloads: Record<string, string> = {};
const servedFiles: Record<string, string> = {};
const responseFailures: string[] = [];
const executionErrors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: devicePixelRatio });
  await page.addInitScript(() => {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      originalError(...args);
      if (args.some(a => typeof a === 'string' && a.includes('mergeGeometries'))) originalError(new Error('geometry merge call stack').stack);
    };
    const proof = { hashes: {} as Record<string, string>, pending: [] as Promise<void>[], errors: [] as string[] };
    (window as unknown as HeroHarnessWindow).__assetProof = proof;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = new URL(response.url);
      if (url.pathname.endsWith('.glb')) {
        // Clone the very response consumed by FileLoader. DevTools may evict streamed bodies;
        // this checks actual model bytes without a second request or trusting response headers.
        proof.pending.push(response.clone().arrayBuffer().then(async bytes => {
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          proof.hashes[url.pathname.slice(1)] = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        }).catch(error => { proof.errors.push(error.message); }));
      }
      return response;
    };
  });
  page.on('pageerror', e => { errors.push(e.message); executionErrors.push(e.message); });
  page.on('console', m => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const message = `${m.type()}: ${m.text()}`;
    errors.push(message);
    // Browser readback optimization advice is retained in evidence, but is not
    // a rendering failure. Screenshot capture itself exercises readback.
    const knownWarning = m.type() === 'warning' && /GPU stall due to ReadPixels|KHR_parallel_shader_compile extension not supported|\[render\] track budget:|^Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute/.test(m.text());
    if (!knownWarning) executionErrors.push(message);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    // Embedded glTF images become blob URLs; their bytes are already covered by the GLB hash.
    if (url.protocol !== 'http:' || url.host !== `127.0.0.1:${addr.port}`) return;
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const name = path.basename(relative);
    if (name.endsWith('.glb')) return; // actual streamed body is cloned and hashed in-page
    if (response.status() === 200) responses.push(response.body().then(bytes => {
      const digest = sha(bytes);
      servedFiles[relative] = digest;
      if (digest !== buildFiles[relative]) throw new Error(`served file does not match frozen build: ${relative}`);
      if (name.endsWith('.glb')) downloads[name] = digest;
    }).catch(error => { responseFailures.push(`${relative}: ${error.message}`); }));
  });
  await page.goto(`http://127.0.0.1:${addr.port}/?harness=1&rider=gltf&bike=gltf&hz=${hz}&physics=${physics}&outfit=${outfit}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rockhop?.ready === true);
  await page.evaluate(async header => {
    const t = window.__rockhop!;
    const r = (window as unknown as HeroHarnessWindow).__render;
    // Visual replay starts from a settled scene. Rapid track/tier switching is a separate
    // lifecycle test; do not overlap those warmups while preparing a deterministic clip.
    await r.whenReady();
    t.setBike!(header.bike ?? 'rookie');
    await r.whenReady();
    if (!await t.loadTrack(header.trackId, header.seed)) throw new Error('track did not load');
    await r.whenReady();
    t.skipCountdown();
    if (t.info().physicsHz !== header.physicsHz || t.info().bike !== (header.bike ?? 'rookie') || t.info().seed !== header.seed) throw new Error('recording rate/class/seed does not match running simulation');
    const expectedFactory = (header.physics ?? 'v1') === 'v2' ? 'createBikePhysicsV2' : 'createBikePhysicsV1';
    if (t.info().modules?.physics !== expectedFactory) throw new Error('recording solver does not match running simulation');
  }, recording.header);
  await page.evaluate(async ({ tier, width, height, devicePixelRatio, deviceClass }) => {
    const t = window.__rockhop!, r = (window as unknown as HeroHarnessWindow).__render;
    if (!r) throw new Error('missing renderer inspection handle');
    t.resize(width, height);
    r.setDeviceClass(deviceClass as 'phone' | 'desktop');
    t.setQuality(tier);
    r.resize(width, height, devicePixelRatio);
    await r.whenReady();
    const d = r.debug;
    if (!d.rider.source?.scene || !d.bike.source?.scene) throw new Error('procedural fallback, no parsed asset');
    let skins = 0;
    d.scene.traverse(o => { const mesh = o as SkinnedMesh; if (mesh.isSkinnedMesh && mesh.skeleton.bones.length === 19) skins++; });
    if (!skins) throw new Error('actual scene has no 19-bone skinned rider');
    // This probe samples exact fixed-step snapshots. The inherited Game hook passes alpha=0,
    // which displays the previous render state while reporting the current physics state.
    // Override only interpolation here, explicitly, to make measured and displayed time agree.
    const render = r.render.bind(r);
    r.render = state => render(state, 1);
  }, { tier: quality as QualityTier, width, height, devicePixelRatio, deviceClass });
  const graphics = await page.evaluate(() => {
    const r = (window as unknown as HeroHarnessWindow).__render;
    const gl = r.debug.renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    if (!extension) throw new Error('renderer identity unavailable');
    return {
      vendor: String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)),
      version: String(gl.getParameter(gl.VERSION)),
      userAgent: navigator.userAgent,
      renderSettings: r.debugInfo(),
    };
  });
  if (angleBackend !== 'webkit' && !(angleBackend === 'metal' ? /Metal/ : /SwiftShader/i).test(graphics.renderer)) throw new Error(`requested ${angleBackend}, received ${graphics.renderer}`);
  const captureStarted = performance.now();
  const trace: Record<string, unknown>[] = [];
  let frame = 0;
  // EVERY preceding rendered frame is evaluated: no cold camera/rig at the clip start.
  for (let tick = 0; tick < to; tick += ticksPerFrame) {
    const sample = await page.evaluate(batch => {
      const t = window.__rockhop!, r = (window as unknown as HeroHarnessWindow).__render;
      for (const input of batch) { t.setInput(input); t.step(1); }
      const renderStart = performance.now();
      t.render(true);
      const renderMs = performance.now() - renderStart;
      const d = r.debug, gl = d.renderer.getContext();
      gl.finish();
      const renderSyncedMs = performance.now() - renderStart;
      const glError = gl.getError();
      if (glError !== gl.NO_ERROR) throw new Error(`WebGL error ${glError} at simulation tick ${t.getState().tick}`);
      const state = t.getState();
      const renderedTime = r.frames.frame.tSim;
      if (Math.abs(renderedTime - state.time) > 1e-9) throw new Error(`display time ${renderedTime} differs from state time ${state.time}`);
      const contacts: Record<string, number[]> = {};
      if (!state.ragdoll) d.bike.frame.traverse(o => {
        if ('isBone' in o && o.isBone && /^(hand|foot)[.]?[LR]$/.test(o.name)) {
          const point = d.bike.frame.worldToLocal(o.getWorldPosition(new d.THREE.Vector3()));
          contacts[o.name] = point.toArray();
        }
      });
      // Actual skinned skeleton joints in world space, including the detached crash body.
      // This is measured after drawing and can be compared with independently replayed sensors.
      const jointWorld: Record<string, number[]> = {};
      d.scene.traverse(o => {
        const mesh = o as SkinnedMesh;
        if (!mesh.isSkinnedMesh || mesh.skeleton.bones.length !== 19) return;
        for (const bone of mesh.skeleton.bones) {
          if (!(bone.name in jointWorld)) jointWorld[bone.name] = bone.getWorldPosition(new d.THREE.Vector3()).toArray();
        }
      });
      return { jointWorld, renderMs, renderSyncedMs, segmentTick: state.tick, stateTime: state.time, renderedTime, runTime: t.runTime(), phase: t.phase(), stateHash: t.hashState(), stateJson: JSON.stringify(state), boneOrigins: contacts, rider: structuredClone(d.rider.debug), camera: t.camera(), heroDoc: r.debugInfo().heroDoc };
    }, inputs.slice(tick, tick + ticksPerFrame));
    trace.push({ inputTick: tick + ticksPerFrame, ...sample });
    if (tick >= from) {
      await page.screenshot({ scale: 'css', path: path.join(out, 'frames', `frame-${String(frame++).padStart(5, '0')}.png`), animations: 'disabled' });
    }
  }
  await Promise.all(responses);
  if (responseFailures.length) throw new Error(responseFailures.join('\n'));
  if (executionErrors.length) throw new Error(executionErrors.join('\n'));
  const modelProof = await page.evaluate(async () => {
    const proof = (window as unknown as HeroHarnessWindow).__assetProof;
    await Promise.all(proof.pending);
    return { hashes: proof.hashes, errors: proof.errors };
  });
  if (modelProof.errors.length) throw new Error(modelProof.errors.join('\n'));
  Object.assign(downloads, modelProof.hashes);
  for (const name of Object.keys(assetBytes)) if (downloads[name] !== assetBytes[name]) throw new Error(`download bytes differ for ${name}`);
  const report = { build, buildFiles, servedFiles, recording: path.resolve(recordingArg), recordingSha256: sha(recordingBytes), assetBytes, downloads, physics, hz, fps, from, to, firstFrameInputTick: from + ticksPerFrame, interval: '(from,to]', frames: frame, prefixRendered: true, renderAlpha: 1, setup: 'await scene readiness between class, track and quality changes', quality, outfit, width, height, devicePixelRatio, deviceClass, graphics: { requestedBackend: angleBackend, launchArgs, ...browserIdentity, hostPlatform: process.platform, ...graphics }, captureWallMs: performance.now() - captureStarted, errors, trace };
  await writeFile(path.join(out, 'evidence.json'), JSON.stringify(report, null, 2));
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(out, 'frames', 'frame-%05d.png'), '-frames:v', String(frame), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(out, 'clip.mp4')], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(ff.stderr);
  console.log(JSON.stringify({ out, frames: frame, assetBytes, errors, final: trace.at(-1) }));
} catch (error) {
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({ build, recording: path.resolve(recordingArg), recordingSha256: sha(recordingBytes), requestedBackend: angleBackend, launchArgs, ...browserIdentity, errors, executionErrors, responseFailures, failure: error instanceof Error ? error.message : String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
