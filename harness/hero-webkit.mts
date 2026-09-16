/**
 * WebKit hero gate — the rider's arms on the phone's path (`pnpm harness:hero-webkit`).
 *
 * iOS Safari renders WebGL through WebKit + ANGLE-on-Metal; Playwright's macOS `webkit` build is the same
 * stack, so a device-only skinning bug reproduces here at the phone geometry (874x330 CSS px, DPR 3). Three
 * legs, three truths:
 *  - harness leg (both engines, each tier): the b1 golden through the hook, one render per `every` ticks —
 *    the hand bones vs the chain's grips, the IK residual, the chain's reach error, and the GPU truth: the
 *    skinned mesh rendered alone into an offscreen target, its pixel mask against the CPU-skinned vertex cloud
 *    projected through the same camera (a wrong arm on the GPU is a mask outside the CPU box);
 *  - live leg (WebKit, each tier): the real app — no `harness=1`, DPR 2, lazy boot, the RAF loop rendering
 *    EVERY frame — idle at the line then gas pulses. Anything that accumulates per rendered frame (the
 *    5649aa6 arms: `additive()` position deltas never re-set) shows here and never in the harness leg;
 *  - `--bench`: the phone's exact `?bench=1` flow start to finish (~3 min), a probe and a still per scenario.
 *
 * usage: tsx harness/hero-webkit.mts [--engine webkit|chromium|both] [--tier low,high] [--track b1-first-ride]
 *          [--to 700] [--every 10] [--shot 700] [--seconds 20] [--harness | --app | --bench] [--riderlod]
 *          [--out harness/out/hero-webkit] [--json] [--build]
 * FAIL when any leg has an IK residual (hand - reach error) > 3 cm, a bone-drift floor > 0.5 mm (positions
 * accumulating), a GPU mask overhang > 6 px, or the two engines' harness hand rows disagree by > 1 cm. The
 * chain's own reach error (the grips beyond the rig's arms — the launch's lean +1 / torsoPitch -0.9 frames) is
 * reported, not gated: that is the pose table's, not the renderer's.
 */
import fs from 'node:fs';
import path from 'node:path';
/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read the renderer's private handles through window.__render */
import { webkit, type Browser, type BrowserContext } from 'playwright';
import { launchBrowser } from './lib/browser';
import { startServer } from './lib/server';
import { loadRecording } from './lib/recording';
import { REPO_ROOT } from './lib/paths';
import { expandFrames } from '../src/core/replay';

const args = process.argv.slice(2);
const VAL = new Set(['engine', 'tier', 'track', 'to', 'every', 'shot', 'out', 'seconds']);
const flag = (n: string, d: string): string => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1]! : d;
};
void VAL;
const engines = flag('engine', 'both') === 'both' ? ['webkit', 'chromium'] : [flag('engine', 'both')];
const tiers = flag('tier', 'low,high').split(',');
const track = flag('track', 'b1-first-ride');
const to = +flag('to', '700');
const every = +flag('every', '10');
const shotTick = +flag('shot', '700');
const outDir = path.resolve(REPO_ROOT, flag('out', 'harness/out/hero-webkit'));
const riderLod = args.includes('--riderlod');
/** `--app`: live legs only (every engine); `--harness`: harness legs only; default = harness legs + WebKit live legs. */
const appMode = args.includes('--app');
const harnessOnly = args.includes('--harness');
const appSeconds = +flag('seconds', '20');
/** `--bench`: the phone's exact flow, `?bench=1` start to finish (~3 min per engine). */
const benchMode = args.includes('--bench');
const HAND_CM = 3;
const MASK_PX = 6;
const DRIFT_MM = 0.5;
/** iPhone landscape (the user's device): 874x330 CSS px at DPR 3. */
const GEOM = { viewport: { width: 874, height: 330 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

fs.mkdirSync(outDir, { recursive: true });
const rec = loadRecording(path.join(REPO_ROOT, 'harness', 'inputs', track, 'bot-3.json'));
const frames = expandFrames(rec);

interface Row {
  t: number;
  hand: [number, number];
  wristErr: number[];
  cpuBox: number[];
  gpuBox: number[];
  /** px the GPU mask reaches beyond the CPU box (max over the 4 edges, 0 when inside). */
  overhang: number;
  /** Fraction of GPU mask pixels outside the CPU box (dilated by MASK_PX). */
  outside: number;
  maskPx: number;
  phase: string;
  /** Largest bone-local position offset from the bind pose (metres) and its bone; the pelvis excluded. */
  drift?: number;
  driftBone?: string;
  /** Physics pose fields [lean, crouch, torsoPitch, armExtend] and the chain's left grip (bike frame). */
  rider?: number[];
  grip?: number[];
  scenario?: string;
}

interface RunResult {
  engine: string;
  tier: string;
  mode: 'harness' | 'app' | 'bench';
  env: Record<string, unknown>;
  rows: Row[];
  /** Hand bone to grip, worst over the leg (cm) — includes the chain's own reach error. */
  worstHandCm: number;
  /** hand - reach error: what the rig's IK left on the table (cm). */
  worstIkCm: number;
  /** The chain's grips beyond the rig's arm reach (cm). */
  worstReachCm: number;
  /** Bone-local position drift: the floor over the leg's last quarter (0 unless something accumulates) and the peak (mm). */
  driftFloorMm: number;
  driftMaxMm: number;
  worstOverhangPx: number;
  shot: string;
}

/** Runs in the page once per tick batch: steps the inputs, renders, measures. */
function probeInPage([inputs, MASK_PX]: [unknown[], number]): Row {
  const w = window as any;
  const tr = w.__trials;
  for (const f of inputs) {
    tr.setInput(f);
    tr.step(1);
  }
  tr.render(true);
  const r = w.__render;
  const rider = r.riderRef;
  const bike = r.bikeRef;
  const THREE = r.debug.THREE;
  const renderer = r.renderer as import('three').WebGLRenderer;
  const cam = r.rig.camera as import('three').PerspectiveCamera;
  rider.scene.updateMatrixWorld(true);
  const hand: [number, number] = [0, 0];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 'L' : 'R';
    // Merge #3 (blender-work rider): the grip is held by `gripSocket.<side>` (palm, a child of the hand bone) and the hand
    // bone sits at the wrist, |wristFromGrip| = 6.04 cm from the grip by design; measure the contact point the rig has.
    const hb = rider.scene.getObjectByName('gripSocket.' + side) ?? rider.scene.getObjectByName('gripSocket' + side) ?? rider.bones.get('hand.' + side);
    const p = new THREE.Vector3();
    hb.updateWorldMatrix(true, false);
    hb.getWorldPosition(p);
    bike.frame.worldToLocal(p);
    hand[i] = +p.distanceTo(rider.chain.hand[i]).toFixed(4);
  }
  let sk: import('three').SkinnedMesh | null = null;
  rider.scene.traverse((o: any) => {
    if (o.isSkinnedMesh && !sk) sk = o;
  });
  const out: Row = { t: tr.frame(), hand, wristErr: [...rider.debug.wristErr], cpuBox: [], gpuBox: [], overhang: -1, outside: -1, maskPx: 0, phase: tr.getState().phase };
  // Bone-local position drift from the bind pose (the pelvis is re-set every frame; nothing else should move).
  {
    let worst = 0;
    let who = '';
    for (const [name, b] of rider.bones as Map<string, import('three').Bone>) {
      if (name === 'pelvis') continue;
      const rest = rider.restLocalP.get(name);
      if (!rest) continue;
      const d = b.position.distanceTo(rest);
      if (d > worst) {
        worst = d;
        who = name;
      }
    }
    out.drift = +worst.toFixed(4);
    out.driftBone = who;
    const st = tr.getState();
    out.rider = st.rider ? [st.rider.lean, st.rider.crouch, st.rider.torsoPitch, st.rider.armExtend].map((n: number) => +n.toFixed(3)) : [];
    out.grip = rider.chain.hand[0].toArray().map((n: number) => +n.toFixed(3));
  }
  if (!sk) return out;
  const mesh = sk as import('three').SkinnedMesh;
  // Offscreen target: the canvas aspect at 512 px wide.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const W = 512;
  const H = Math.max(1, Math.round((W * size.y) / size.x));
  let rt = w.__heroProbeRT as import('three').WebGLRenderTarget | undefined;
  if (!rt || rt.width !== W || rt.height !== H) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: false }) as import('three').WebGLRenderTarget;
    w.__heroProbeRT = rt;
  }
  const target = rt as import('three').WebGLRenderTarget;
  // CPU truth: every vertex through the same skin on the CPU, projected with the same camera.
  cam.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v);
    mesh.localToWorld(v).project(cam);
    if (v.z > 1) continue;
    const px = (v.x * 0.5 + 0.5) * W;
    const py = (1 - (v.y * 0.5 + 0.5)) * H;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  out.cpuBox = [x0, y0, x1, y1].map((n) => +n.toFixed(1));
  // GPU truth: the skinned mesh alone, its own material and program, clear alpha 0 → mask = alpha > 0.
  const prevRT = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  const prevTone = renderer.toneMapping;
  const prevShadow = renderer.shadowMap.enabled;
  const prevPR = renderer.getPixelRatio();
  const prevVisible = mesh.visible;
  const prevCull = mesh.frustumCulled;
  mesh.visible = true;
  mesh.frustumCulled = false;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.clear();
  renderer.render(mesh as unknown as import('three').Scene, cam);
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, buf);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  renderer.toneMapping = prevTone;
  renderer.shadowMap.enabled = prevShadow;
  renderer.setPixelRatio(prevPR);
  mesh.visible = prevVisible;
  mesh.frustumCulled = prevCull;
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity, n = 0, outside = 0;
  const bx0 = x0 - MASK_PX, by0 = y0 - MASK_PX, bx1 = x1 + MASK_PX, by1 = y1 + MASK_PX;
  for (let y = 0; y < H; y++) {
    const py = H - 1 - y; // readPixels rows are bottom-up
    for (let x = 0; x < W; x++) {
      if (buf[(y * W + x) * 4 + 3]! === 0) continue;
      n++;
      if (x < gx0) gx0 = x;
      if (x > gx1) gx1 = x;
      if (py < gy0) gy0 = py;
      if (py > gy1) gy1 = py;
      if (x < bx0 || x > bx1 || py < by0 || py > by1) outside++;
    }
  }
  out.maskPx = n;
  if (n) {
    out.gpuBox = [gx0, gy0, gx1, gy1];
    out.overhang = +Math.max(0, x0 - gx0, y0 - gy0, gx1 - x1, gy1 - y1).toFixed(1);
    out.outside = +(outside / n).toFixed(4);
  }
  return out;
}

function envInPage(): Record<string, unknown> {
  const w = window as any;
  const r = w.__render;
  const renderer = r.renderer as import('three').WebGLRenderer;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rider = r.riderRef;
  let sk: any = null;
  rider.scene.traverse((o: any) => {
    if (o.isSkinnedMesh && !sk) sk = o;
  });
  const attr = (name: string) => {
    const a = sk?.geometry.getAttribute(name);
    if (!a) return null;
    return { type: a.array?.constructor?.name ?? (a.data?.array?.constructor?.name + ' interleaved'), itemSize: a.itemSize, normalized: a.normalized, interleaved: !!a.isInterleavedBufferAttribute, stride: a.data?.stride, offset: a.offset, count: a.count };
  };
  const caps = renderer.capabilities;
  const info = r.debugInfo?.() ?? {};
  return {
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    glVersion: gl.getParameter(gl.VERSION),
    glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    isWebGL2: caps.isWebGL2,
    precision: caps.precision,
    floatVertexTextures: (caps as unknown as { floatVertexTextures?: boolean }).floatVertexTextures ?? 'n/a (r186: always on)',
    maxVertexTextures: caps.maxVertexTextures,
    maxVertexUniforms: caps.maxVertexUniforms,
    vertexHighpFloat: gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT),
    heroDoc: info.heroDoc,
    tier: info.tier,
    pixelRatio: renderer.getPixelRatio(),
    drawingBuffer: renderer.getDrawingBufferSize(new r.debug.THREE.Vector2()).toArray(),
    bones: sk?.skeleton.bones.length,
    boneTexture: sk?.skeleton.boneTexture ? { w: sk.skeleton.boneTexture.image.width, h: sk.skeleton.boneTexture.image.height, type: sk.skeleton.boneTexture.type } : null,
    bindMode: sk?.bindMode,
    skinIndex: attr('skinIndex'),
    skinWeight: attr('skinWeight'),
    position: attr('position'),
    material: sk?.material?.type,
    materialName: sk?.material?.name,
    glError: gl.getError(),
  };
}

async function launch(engine: string): Promise<{ browser: Browser; context: BrowserContext; close(): Promise<void> }> {
  if (engine === 'webkit') {
    const browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({ ...GEOM, reducedMotion: 'reduce' });
    return { browser, context, close: () => browser.close() };
  }
  const b = await launchBrowser({ width: GEOM.viewport.width, height: GEOM.viewport.height });
  await b.context.close();
  const context = await b.browser.newContext({ ...GEOM, reducedMotion: 'reduce' });
  return { browser: b.browser, context, close: b.close };
}

type Mode = 'harness' | 'app' | 'bench';

async function openPage(b: { context: BrowserContext }, baseUrl: string, mode: Mode): Promise<{ page: import('playwright').Page; errors: string[] }> {
  const page = await b.context.newPage();
  await page.addInitScript('window.__name = function (f) { return f; };'); // tsx keepNames helper inside evaluated functions
  // A fresh context is a first launch: the onboarding card would pause the run behind it (the bench skips it, the live leg must too).
  await page.addInitScript('try { localStorage.setItem("trials.onboarded", "1"); } catch {}');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = new URL(baseUrl);
  if (mode === 'harness') url.searchParams.set('harness', '1');
  if (mode === 'bench') url.searchParams.set('bench', '1');
  url.searchParams.set('sw', '0');
  url.searchParams.set('track', track);
  url.searchParams.set('rider', 'gltf');
  url.searchParams.set('bike', 'gltf');
  await page.goto(url.toString(), { waitUntil: 'commit' });
  await page.waitForFunction(() => (window as any).__trials?.ready === true, undefined, { timeout: 60_000 });
  return { page, errors };
}

function summarize(engine: string, tier: string, mode: Mode, env: Record<string, unknown>, rows: Row[], shot: string): RunResult {
  return {
    engine,
    tier,
    mode,
    env,
    rows,
    worstHandCm: +(Math.max(0, ...rows.flatMap((r) => r.hand)) * 100).toFixed(2),
    worstIkCm: +(Math.max(0, ...rows.map((r) => Math.max(r.hand[0] - (r.wristErr[0] ?? 0), r.hand[1] - (r.wristErr[1] ?? 0)))) * 100).toFixed(2),
    worstReachCm: +(Math.max(0, ...rows.flatMap((r) => r.wristErr)) * 100).toFixed(2),
    // The floor over the LAST quarter of the leg: an accumulation never returns to 0 once the ride has run; a live clip does.
    driftFloorMm: +(Math.min(...rows.slice(Math.floor((rows.length * 3) / 4)).map((r) => r.drift ?? 0)) * 1000).toFixed(2),
    driftMaxMm: +(Math.max(0, ...rows.map((r) => r.drift ?? 0)) * 1000).toFixed(2),
    worstOverhangPx: Math.max(0, ...rows.map((r) => r.overhang)),
    shot,
  };
}

/** Harness leg: the b1 golden through the hook, one render per `every` ticks, the t700 still. */
async function runHarness(engine: string, tier: string, baseUrl: string): Promise<RunResult> {
  const b = await launch(engine);
  try {
    const { page, errors } = await openPage(b, baseUrl, 'harness');
    await page.evaluate(
      async ([track, seed, tier, lod]) => {
        const w = window as any;
        w.__trials.setQuality(tier);
        if (lod) w.__render.setRiderLod(true);
        w.__trials.loadTrack(track, seed);
        await w.__render.whenReady();
        w.__trials.render(true);
        w.__trials.render(true);
        w.__trials.skipCountdown?.();
      },
      [track, rec.header.seed, tier, riderLod] as const,
    );
    const env = await page.evaluate(envInPage);
    env.pageErrors = errors.slice();
    const rows: Row[] = [];
    let at = 0;
    let shot = '';
    while (at < to) {
      const slice = frames.slice(at, Math.min(to, at + every));
      const row = await page.evaluate(probeInPage, [slice as unknown[], MASK_PX] as [unknown[], number]);
      at += slice.length;
      rows.push(row);
      if (!shot && at >= shotTick) {
        shot = path.join(outDir, `${engine}-${tier}${riderLod ? '-lod' : ''}-t${at}.png`);
        await page.evaluate(() => (window as any).__trials.render(true));
        await page.screenshot({ path: shot });
      }
    }
    return summarize(engine, tier, 'harness', env, rows, shot);
  } finally {
    await b.close();
  }
}

/**
 * Live leg: the real app (no `harness=1`: DPR 2, lazy boot, the RAF loop rendering every frame). The app plays
 * `?track=` itself; the rider idles at the line, then rides gas pulses — every rendered frame runs the additive
 * clips, which is where a per-frame accumulation shows and the harness's one render per 10 ticks never did.
 */
async function runApp(engine: string, tier: string, baseUrl: string): Promise<RunResult> {
  const b = await launch(engine);
  try {
    const { page, errors } = await openPage(b, baseUrl, 'app');
    await page.waitForFunction(() => (window as any).__trials.app?.screen() === 'run', undefined, { timeout: 60_000 });
    await page.evaluate(
      async ([tier, lod]) => {
        const w = window as any;
        w.__trials.setQuality(tier);
        if (lod) w.__render.setRiderLod(true);
        await w.__render.whenReady();
        w.__trials.skipCountdown?.();
      },
      [tier, riderLod] as const,
    );
    const env = await page.evaluate(envInPage);
    env.pageErrors = errors.slice();
    const rows: Row[] = [];
    const t0 = Date.now();
    let gasDown = false;
    while (Date.now() - t0 < appSeconds * 1000) {
      await page.waitForTimeout(500);
      const el = Date.now() - t0;
      // First quarter: idle at the line (breathing). Then 2 s gas / 2 s coast pulses through the keyboard — the
      // app's own input path (the hook's setInput is overwritten by the mux every live frame): landings, slow coasting.
      const gas = el > appSeconds * 250 && el % 4000 < 2000;
      if (gas !== gasDown) {
        if (gas) await page.keyboard.down('ArrowUp');
        else await page.keyboard.up('ArrowUp');
        gasDown = gas;
      }
      rows.push(await page.evaluate(probeInPage, [[] as unknown[], MASK_PX] as [unknown[], number]));
    }
    if (gasDown) await page.keyboard.up('ArrowUp');
    const shot = path.join(outDir, `${engine}-${tier}${riderLod ? '-lod' : ''}-app.png`);
    await page.screenshot({ path: shot });
    return summarize(engine, tier, 'app', env, rows, shot);
  } finally {
    await b.close();
  }
}

/** Bench leg: the phone's exact flow, `?bench=1` start to finish (~3 min): menu, garage, b1 start, b1 ride x 5 tiers/caps. */
async function runBench(engine: string, baseUrl: string): Promise<RunResult> {
  const b = await launch(engine);
  try {
    const { page, errors } = await openPage(b, baseUrl, 'bench');
    await page.evaluate(() => (window as any).__trials.bench.start());
    const rows: Row[] = [];
    const shots: string[] = [];
    let env: Record<string, unknown> | null = null;
    let last = '';
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      await page.waitForTimeout(3000);
      const st = await page.evaluate(() => (window as any).__trials.bench.state());
      if (st.done) break;
      const screen = await page.evaluate(() => (window as any).__trials.app.screen());
      if (screen !== 'run') continue;
      if (!env) env = await page.evaluate(envInPage);
      const row = await page.evaluate(probeInPage, [[] as unknown[], MASK_PX] as [unknown[], number]);
      row.scenario = st.scenario;
      rows.push(row);
      if (st.scenario !== last || row.overhang > MASK_PX) {
        const shot = path.join(outDir, `${engine}-bench-${st.scenario}-${Math.round((Date.now() - t0) / 1000)}s.png`);
        await page.screenshot({ path: shot });
        shots.push(shot);
        last = st.scenario;
      }
    }
    env = env ?? {};
    env.pageErrors = errors.slice();
    return summarize(engine, 'bench', 'bench', env, rows, shots.join(','));
  } finally {
    await b.close();
  }
}

const server = await startServer({ dev: false, forceBuild: args.includes('--build'), freeze: true });
const results: RunResult[] = [];
try {
  if (benchMode) for (const engine of engines) results.push(await runBench(engine, server.url));
  else {
    if (!appMode) for (const engine of engines) for (const tier of tiers) results.push(await runHarness(engine, tier, server.url));
    if (!harnessOnly) for (const engine of appMode ? engines : ['webkit']) for (const tier of tiers) results.push(await runApp(engine, tier, server.url));
  }
} finally {
  await server.close();
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const jsonPath = path.join(outDir, `hero-webkit-${stamp}.json`);
fs.writeFileSync(jsonPath, JSON.stringify({ track, to, every, riderLod, results }, null, 1));
const failures: string[] = [];
console.log(`hero-webkit  track=${track}  ticks=${to}  every=${every}  live=${appSeconds}s${riderLod ? '  rider=lod' : ''}`);
console.log('engine    tier   leg      renderer                            heroDoc          hand max  IK resid  reach err  drift floor/max  GPU overhang  shot');
for (const r of results) {
  const bad: string[] = [];
  if (r.worstIkCm > HAND_CM) bad.push(`IK residual ${r.worstIkCm} cm > ${HAND_CM}`);
  if (r.driftFloorMm > DRIFT_MM) bad.push(`bone drift floor ${r.driftFloorMm} mm > ${DRIFT_MM} (accumulating)`);
  if (r.worstOverhangPx > MASK_PX) bad.push(`GPU mask overhang ${r.worstOverhangPx} px > ${MASK_PX}`);
  for (const m of bad) failures.push(`${r.engine} ${r.tier} ${r.mode}: ${m}`);
  console.log(
    `${r.engine.padEnd(9)} ${r.tier.padEnd(6)} ${r.mode.padEnd(8)} ${String(r.env.renderer).slice(0, 34).padEnd(35)} ${String(r.env.heroDoc).padEnd(16)} ${(r.worstHandCm + ' cm').padEnd(9)} ${(r.worstIkCm + ' cm').padEnd(9)} ${(r.worstReachCm + ' cm').padEnd(10)} ${(r.driftFloorMm + ' / ' + r.driftMaxMm + ' mm').padEnd(16)} ${(r.worstOverhangPx + ' px').padEnd(13)} ${path.relative(REPO_ROOT, r.shot.split(',')[0]!)}${bad.length ? '  FAIL' : ''}`,
  );
}
// Same JS on both engines: the harness legs' hand rows must agree tick for tick.
for (const tier of tiers) {
  const wk = results.find((r) => r.engine === 'webkit' && r.tier === tier && r.mode === 'harness');
  const cr = results.find((r) => r.engine === 'chromium' && r.tier === tier && r.mode === 'harness');
  if (!wk || !cr) continue;
  let worst = 0;
  for (let i = 0; i < Math.min(wk.rows.length, cr.rows.length); i++) worst = Math.max(worst, Math.abs(wk.rows[i]!.hand[0] - cr.rows[i]!.hand[0]), Math.abs(wk.rows[i]!.hand[1] - cr.rows[i]!.hand[1]));
  console.log(`webkit vs chromium hand rows (${tier}): max |delta| ${(worst * 100).toFixed(2)} cm`);
  if (worst * 100 > 1) failures.push(`${tier}: webkit and chromium hand rows differ by ${(worst * 100).toFixed(2)} cm`);
}
if (args.includes('--json')) console.log(JSON.stringify(results.map((r) => ({ engine: r.engine, tier: r.tier, mode: r.mode, env: r.env, rows: r.rows })), null, 0));
else {
  for (const r of results) {
    console.log(`\n${r.engine} ${r.tier} ${r.mode}: heroDoc=${r.env.heroDoc} dpr=${r.env.dpr} buffer=${r.env.drawingBuffer} bones=${r.env.bones} boneTex=${JSON.stringify(r.env.boneTexture)} skinIndex=${JSON.stringify(r.env.skinIndex)} errors=${JSON.stringify(r.env.pageErrors)}`);
    console.log('  t      handL   handR   reachL  reachR  drift(mm) bone        cpuBox                    gpuBox                    overhang  scenario');
    for (const row of r.rows) {
      const quiet = row.overhang <= MASK_PX && Math.max(...row.hand) * 100 <= HAND_CM && (row.drift ?? 0) * 1000 <= DRIFT_MM;
      if (r.mode === 'harness' && row.t % 100 !== 0 && quiet) continue;
      if (r.mode === 'app' && rows_every(row, r.rows) && quiet) continue;
      console.log(
        `  ${String(row.t).padEnd(6)} ${row.hand[0].toFixed(3).padEnd(7)} ${row.hand[1].toFixed(3).padEnd(7)} ${(row.wristErr[0] ?? 0).toFixed(3).padEnd(7)} ${(row.wristErr[1] ?? 0).toFixed(3).padEnd(7)} ${((row.drift ?? 0) * 1000).toFixed(2).padEnd(9)} ${(row.driftBone ?? '').padEnd(11)} ${JSON.stringify(row.cpuBox).padEnd(25)} ${JSON.stringify(row.gpuBox).padEnd(25)} ${String(row.overhang).padEnd(9)} ${row.scenario ?? ''}`,
      );
    }
  }
}
function rows_every(row: Row, rows: Row[]): boolean {
  return rows.indexOf(row) % 8 !== 0;
}
console.log(`\njson: ${path.relative(REPO_ROOT, jsonPath)}`);
if (failures.length) {
  console.log(`\nFAIL\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nPASS');
process.exit(0);
