/**
 * The in-app gate runner (docs/plans/STORE_RELEASE.md bar 3 + bar 5; harness/native/README.md). Debug store builds
 * only (`VITE_STORE=1 VITE_STORE_DEBUG=1`, AUTOMATION_HOOK): the shell arms it by injecting, at document start,
 * `navigator.webdriver = true` (so the game never opens an AudioContext), `window.__rockhopGate` (this run's config)
 * and `window.__rockhopGatePost(msg)` (the result sink: a file in the app's Documents on iOS, a CDP-readable map on
 * Android, a Playwright binding on the web). The same code runs on all three, which is the point of bar 3.
 *
 * Two stages, one navigation apart (the harness stage is the same page with `?harness=1`):
 *   boot     the player's path: cold boot to the menu (hook ready, first frame), then `app.play(track)` through
 *            the countdown to riding — then `location.replace('./?harness=1')`;
 *   harness  the harness owns the clock (no RafDriver): every clear recording replayed (finish time as the float's
 *            own 8 bytes + the state hash), one of them again paced at 60 fps with rendering (the clip), the crash
 *            recording (fault, then the restart mash back to control) and 20 restarts (ticks + wall/frame ms) —
 *            the ship gate's G2–G6 (harness/gate/ship-gate.ts), same code, same limits file.
 */
import { decodeAny, expandFrames } from '../core/replay';
import type { InputFrame, TrialsHook } from '../core/types';

export interface GateConfig {
  platform: 'ios' | 'android' | 'web';
  /** Recording URLs relative to the app root (the harness copies them into `<webDir>/gate/`). */
  clear?: string[];
  /** Index into `clear` of the recording also replayed paced + rendered (the clip). -1 = none. */
  paced?: number;
  crash?: string;
  /** Track for the player-path start and the restart reps; default: the first clear recording's track. */
  track?: string;
  restartReps?: number;
  /**
   * Store screenshots from played runs (harness/native/screens.ts): each recording replayed paced and rendered; at
   * each mark (a fraction of the run, or a tick when > 1) the ride holds still for `holdMs` after posting
   * `shot-<n>`, while the harness grabs the screen. Nothing is posed — the frame is the replayed ride at that tick.
   * With `shots` the run skips the boot stage and the checks.
   */
  shots?: ShotSpec[];
  holdMs?: number;
  /**
   * Play every shot recording out past its finish (after its last mark, unrendered) so the run publishes its result
   * and the save holds its best, as a player's would: the world map shot then shows played progress.
   */
  playOut?: boolean;
  /**
   * After the rides, the front end the player's way (the app, not the harness route): `results` — this recording
   * ridden over the line in the app (its inputs fed tick for tick from GO, synchronously, so no wall-clock frame can
   * interleave) and the results ticket shot once its reveal lands, then its MAP tile; `map` — the world map shot.
   */
  front?: { results?: string; map?: boolean };
}

export interface ShotSpec {
  recording: string;
  /** Fractions of the run (≤ 1) or ticks (> 1). */
  at: number[];
  /** Shoot at the mark's tick itself, not the next airborne frame after a clean second. */
  exact?: boolean;
}

interface GateMsg {
  name: string;
  [k: string]: unknown;
}

type GateWindow = Window & {
  __rockhopGate?: Partial<GateConfig>;
  __rockhopGatePost?: (m: GateMsg) => void;
  /** The web harness's grab of `shot-<n>` is done (Playwright's screenshot is async; the ride must not move under it). */
  __rockhopGateAck?: number;
  __rockhopAudioContexts?: () => number;
  __trials?: TrialsHook;
  __rockhop?: TrialsHook;
};

const w = window as GateWindow;
const now = (): number => performance.now();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const frame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

function post(m: GateMsg): void {
  const payload = { ...m, platform: w.__rockhopGate?.platform ?? 'web', atMs: Math.round(now()) };
  try {
    w.__rockhopGatePost?.(payload);
  } catch (e) {
    console.error('[rockhop-gate] post failed', e);
  }
  console.info(`[rockhop-gate] ${m.name} ${JSON.stringify(payload).slice(0, 300)}`);
}

/** The automation hook under either name (the rename to `__rockhop` may land in src/game). */
const hook = (): TrialsHook | undefined => w.__rockhop ?? w.__trials;

async function waitFor<T>(what: string, get: () => T | undefined | null | false, timeoutMs = 120_000): Promise<T> {
  const t0 = now();
  for (;;) {
    const v = get();
    if (v) return v;
    if (now() - t0 > timeoutMs) throw new Error(`gate: timed out waiting for ${what}`);
    await sleep(16);
  }
}

/** A float64's own bytes, hex: "byte-identical" in bar 3 is this string, not a rounded print. */
export function f64hex(x: number | null): string | null {
  if (x === null) return null;
  const b = new Uint8Array(new Float64Array([x]).buffer);
  return Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
}

function audioContexts(): number {
  return w.__rockhopAudioContexts?.() ?? -1;
}

const p95 = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] ?? NaN;
};

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`gate: ${url} → ${r.status}`);
  return r.text();
}

async function bootStage(cfg: GateConfig): Promise<void> {
  const h = await waitFor('the hook (front end)', () => hook()?.app && hook());
  const hookMs = now();
  // The boot is done when the loader has crossfaded away (src/boot/render.ts removes #loader) over the menu.
  await waitFor('the loader to leave', () => !document.getElementById('loader'));
  const loaderGoneMs = now();
  await waitFor('the menu', () => h.app!.screen() === 'menu', 60_000).catch(() => undefined);
  const menuMs = now();
  let startMs: number | null = null;
  let startError: string | null = null;
  const track = cfg.track ?? 'flat-test';
  try {
    const t0 = now();
    h.app!.play(track);
    // A fresh install shows the first-ride card before the countdown (src/ui/cards.ts): the player taps its button.
    await waitFor('riding after app.play', () => {
      document.querySelector<HTMLButtonElement>('.ob-card button')?.click();
      return h.phase() === 'riding';
    }, 60_000);
    startMs = now() - t0;
    await sleep(1500); // a second and a half of the live game on screen (the clip)
    h.app!.quit();
  } catch (e) {
    startError = String(e);
  }
  post({
    name: 'boot',
    hookMs: Math.round(hookMs),
    loaderGoneMs: Math.round(loaderGoneMs),
    menuMs: Math.round(menuMs),
    track,
    startToRidingMs: startMs === null ? null : Math.round(startMs),
    startError,
    renderer: h.info().render ?? null,
    webdriver: navigator.webdriver === true,
    audioContexts: audioContexts(),
    userAgent: navigator.userAgent,
    screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
  });
  await sleep(400); // let the sink write before the navigation tears the page down
  location.replace('./?harness=1');
}

interface ClearRow {
  file: string;
  trackId: string;
  bike: string;
  ticks: number;
  finishTime: number | null;
  finishTimeHex: string | null;
  hash: string;
  cleared: boolean;
  wallMs: number;
}

async function loadTrack(h: TrialsHook, id: string, seed?: number): Promise<void> {
  const r = h.loadTrack(id, seed);
  if (typeof r !== 'boolean') await r;
}

function replayOnce(h: TrialsHook, file: string, text: string): ClearRow {
  const rec = decodeAny(text);
  const t0 = now();
  const st = h.runRecording(text);
  const wallMs = now() - t0;
  const ft = h.finishTime();
  return { file, trackId: rec.header.trackId, bike: rec.header.bike ?? 'rookie', ticks: st.tick, finishTime: ft, finishTimeHex: f64hex(ft), hash: h.hashState(), cleared: h.cleared(), wallMs: Math.round(wallMs) };
}

/** The same recording stepped at 60 fps with a rendered frame each: a played clip, and proof rendering never touches the sim. */
async function replayPaced(h: TrialsHook, file: string, text: string): Promise<ClearRow & { frames: number; longFrames: number }> {
  const rec = decodeAny(text);
  h.setBike?.(rec.header.bike ?? 'rookie');
  await loadTrack(h, rec.header.trackId, rec.header.seed);
  h.skipCountdown();
  const frames = expandFrames(rec);
  const per = Math.max(1, Math.round(rec.header.physicsHz / 60));
  const t0 = now();
  let rendered = 0;
  let longFrames = 0;
  let last = await frame();
  for (let i = 0; i < frames.length; ) {
    for (let k = 0; k < per && i < frames.length; k++, i++) {
      h.setInput(frames[i]!);
      h.step(1);
    }
    h.render(false);
    rendered += 1;
    const t = await frame();
    if (t - last > 34) longFrames += 1;
    last = t;
  }
  h.setInput({ throttle: 0, brake: 0, lean: 0, restart: false });
  const ft = h.finishTime();
  return { file: `${file} (paced)`, trackId: rec.header.trackId, bike: rec.header.bike ?? 'rookie', ticks: h.getState().tick, finishTime: ft, finishTimeHex: f64hex(ft), hash: h.hashState(), cleared: h.cleared(), wallMs: Math.round(now() - t0), frames: rendered, longFrames };
}

async function crashCheck(h: TrialsHook, file: string, text: string): Promise<Record<string, unknown>> {
  const rec = decodeAny(text);
  const fr: InputFrame[] = expandFrames(rec);
  h.setBike?.(rec.header.bike ?? 'rookie');
  await loadTrack(h, rec.header.trackId, rec.header.seed);
  h.skipCountdown();
  h.drainEvents();
  let fault: { tick: number; time: number; reason: string } | null = null;
  for (let i = 0; i < fr.length && !fault; i++) {
    h.setInput(fr[i]!);
    h.step(1);
    for (const e of h.drainEvents()) {
      if (e.type === 'fault' && e.reason !== 'restart') {
        fault = { tick: e.tick, time: e.time, reason: e.reason };
        break;
      }
    }
  }
  h.render(true);
  let toControlTicks: number | null = null;
  const t0 = now();
  if (fault) {
    h.setInput({ restart: true });
    h.step(1);
    let ticks = 1;
    h.setInput({ restart: false, throttle: 1 });
    for (let i = 0; i < 3 * rec.header.physicsHz; i++) {
      h.step(1);
      ticks++;
      if (h.phase() === 'riding' && h.getState().bike.vel.x > 0.05) {
        toControlTicks = ticks;
        break;
      }
    }
  }
  h.render(true);
  const wallMs = now() - t0;
  return { file, trackId: rec.header.trackId, fault, toControlTicks, toControlMs: toControlTicks === null ? null : (toControlTicks * 1000) / rec.header.physicsHz, wallMs: Math.round(wallMs) };
}

async function restartCheck(h: TrialsHook, track: string, reps: number): Promise<Record<string, unknown>> {
  h.setBike?.('rookie');
  await loadTrack(h, track);
  h.skipCountdown();
  h.setInput({ throttle: 1 });
  h.step(360);
  h.render(true);
  const wallMs: number[] = [];
  const frameMs: number[] = [];
  let ticksOk = true;
  let movesAfterTicks = 0;
  for (let rep = 0; rep < reps; rep++) {
    h.setInput({ throttle: 1 });
    h.step(120);
    const a = now();
    h.setInput({ restart: true });
    h.step(1);
    h.setInput({ restart: false });
    const b = now();
    const st = h.getState();
    if (st.tick !== 0 || st.faulted !== null) ticksOk = false;
    h.render(true);
    const c = now();
    wallMs.push(b - a);
    frameMs.push(c - a);
    h.setInput({ throttle: 1 });
    let n = 0;
    do {
      h.step(1);
      n++;
    } while (!(h.getState().bike.vel.x > 0) && n < 120);
    if (n > movesAfterTicks) movesAfterTicks = n;
    await frame(); // let the compositor show it: the clip sees every restart
  }
  h.setInput({ throttle: 0 });
  return { track, reps, ticksOk, wallMsP95: p95(wallMs), frameMsP95: p95(frameMs), movesAfterTicks, wallMs: wallMs.map((x) => Math.round(x * 100) / 100), frameMs: frameMs.map((x) => Math.round(x * 10) / 10) };
}

/**
 * Hold still while the harness grabs `shot-<n>`: on the web until the harness acks that exact shot (a screenshot
 * can take longer than any fixed hold, and a late grab would catch a later tick); in the shells the snapshot is
 * taken on the message itself, so the fixed hold is only the file write's margin.
 */
async function holdShot(cfg: GateConfig, n: number): Promise<void> {
  if (cfg.platform === 'web') {
    await waitFor(`the harness ack of shot ${n}`, () => (w.__rockhopGateAck ?? -1) >= n, 60_000);
    return;
  }
  await sleep(cfg.holdMs ?? 2500);
}

async function shotsStage(cfg: GateConfig): Promise<void> {
  const h = await waitFor('the hook (harness)', () => hook()?.ready && hook());
  // The harness route renders at pixel ratio 1; a store screenshot is taken at the device's own (the quality tier's
  // cap still applies, as in play).
  h.resize(innerWidth, innerHeight, devicePixelRatio);
  let n = 0;
  const shoot = async (recording: string, trackId: string, extra: Record<string, unknown> = {}): Promise<void> => {
    h.render(true);
    await frame();
    await frame();
    post({ name: `shot-${n}`, recording, trackId, tick: h.getState().tick, index: n, ...extra });
    n += 1;
    await holdShot(cfg, n - 1);
  };
  for (const { recording, at, exact } of cfg.shots ?? []) {
    const rec = decodeAny(await fetchText(recording));
    const frames = expandFrames(rec);
    const hz = rec.header.physicsHz;
    const marks = at.map((a) => (a > 1 ? Math.round(a) : Math.round(a * frames.length))).sort((x, y) => x - y);
    h.setBike?.(rec.header.bike ?? 'rookie');
    await loadTrack(h, rec.header.trackId, rec.header.seed);
    // The harness route skips the countdown, so nothing else waits for the renderer to finish compiling the zone
    // behind its fog placeholder (`debugInfo().entering`): a shot must never catch the placeholder.
    await waitFor('the zone compiled', () => {
      h.render(false);
      return !(h.info().render as { entering?: boolean } | null | undefined)?.entering;
    }, 60_000).catch(() => undefined);
    h.skipCountdown();
    const per = Math.max(1, Math.round(hz / 60));
    let next = 0;
    // A mark waits for the ride to look like riding: ≥ 1 s of clean riding since the last bail or restart (a bot
    // golden keeps its in-band retries), then the first airborne frame within 2 s, else the frame at 2 s. An `exact`
    // mark is shot at its own tick.
    let clean = 0;
    let waited = 0;
    let i = 0;
    for (; i < frames.length && next < marks.length; ) {
      for (let k = 0; k < per && i < frames.length; k++, i++) {
        h.setInput(frames[i]!);
        h.step(1);
        const st = h.getState();
        clean = h.phase() === 'riding' && st.faulted === null && st.ragdoll === null ? clean + 1 : 0;
      }
      h.render(false);
      await frame();
      if (i < marks[next]!) continue;
      const st = h.getState();
      const airborne = st.contacts.rear === null && st.contacts.front === null;
      waited += per;
      const ready = exact || (clean >= hz && (airborne || waited >= 2 * hz));
      if (ready) {
        waited = 0;
        await shoot(recording, rec.header.trackId, { faults: h.faults(), airborne });
        next += 1;
      }
    }
    if (cfg.playOut) {
      for (; i < frames.length; i++) {
        h.setInput(frames[i]!);
        h.step(1);
      }
      h.setInput({ throttle: 0, brake: 0, lean: 0, restart: false });
      h.step(3 * hz); // the results delay: the result publishes and the best is stored
    }
  }
  if (cfg.front?.results || cfg.front?.map) {
    await sleep(400);
    location.replace(`./?gatefront=${n}`);
    return;
  }
  post({ name: 'done', shots: n });
}

/** The front end, reached the player's way: boot, menu, a run ridden to the results ticket, its MAP tile — or the map. */
async function frontStage(cfg: GateConfig, first: number): Promise<void> {
  let n = first;
  const h = await waitFor('the hook (front end)', () => hook()?.app && hook());
  await waitFor('the loader to leave', () => !document.getElementById('loader'));
  await waitFor('the menu', () => h.app!.screen() === 'menu', 60_000).catch(() => undefined);
  await sleep(1500);
  const shot = async (trackId: string, extra: Record<string, unknown>): Promise<void> => {
    await frame();
    await frame();
    post({ name: `shot-${n}`, recording: extra['recording'] ?? trackId, trackId, tick: h.getState().tick, index: n, screen: h.app!.screen(), ...extra });
    n += 1;
    await holdShot(cfg, n - 1);
  };
  const results = cfg.front?.results;
  if (results) {
    const rec = decodeAny(await fetchText(results));
    const frames = expandFrames(rec);
    h.app!.play(rec.header.trackId);
    // A fresh install shows the first-ride card before the countdown (src/ui/cards.ts): the player taps its button.
    await waitFor('the countdown', () => {
      document.querySelector<HTMLButtonElement>('.ob-card button')?.click();
      return h.phase() === 'countdown';
    }, 60_000);
    // The recording's bike, as the Garage pick would give it (hard / extreme courses default to the Pro): during the
    // countdown this reloads the course on that bike, back to its countdown.
    h.setBike?.(rec.header.bike ?? 'rookie');
    await waitFor('the countdown on the recording bike', () => h.phase() === 'countdown', 30_000);
    // One task from GO to past the line: the recording is the player, tick for tick; no frame runs in between.
    h.skipCountdown();
    for (const f of frames) {
      h.setInput(f);
      h.step(1);
    }
    h.setInput({ throttle: 0, brake: 0, lean: 0, restart: false });
    const faults = h.faults();
    const cleared = h.cleared();
    const finishTime = h.finishTime();
    post({ name: 'front-ride', recording: results, trackId: rec.header.trackId, ticks: frames.length, faults, cleared, finishTime, phase: h.phase(), tick: h.getState().tick, bikeX: h.getState().bike.pos.x });
    await waitFor('the results ticket', () => document.querySelector('.results.show.stage-5'), 30_000);
    await sleep(1800); // the ticket's CSS settles on wall time
    await shot(rec.header.trackId, { recording: results, results: true, faults, cleared, finishTime, finishTimeHex: f64hex(finishTime), ticks: frames.length });
    if (cfg.front?.map) {
      // The ticket's own MAP tile.
      const tile = await waitFor('the MAP tile', () => document.querySelector<HTMLElement>('.results.live .tile[data-id="menu"], .results.live [data-id="menu"]'), 10_000).catch(() => null);
      tile?.click();
      const byTile = await waitFor('the map from the tile', () => h.app!.screen() === 'tracks', 4000).then(() => true, () => false);
      if (!byTile) {
        h.app!.quit();
        await sleep(600);
        h.app!.goto('tracks');
      }
    }
  } else if (cfg.front?.map) h.app!.goto('tracks');
  if (cfg.front?.map) {
    await waitFor('the world map', () => h.app!.screen() === 'tracks', 20_000);
    await sleep(4000); // the map's own open: plate, trail, markers, the focused card
    await shot('world-map', { recording: 'map' });
  }
  post({ name: 'done', shots: n });
}

async function harnessStage(cfg: GateConfig): Promise<void> {
  const h = await waitFor('the hook (harness)', () => hook()?.ready && hook());
  const readyMs = now();
  const clear: ClearRow[] = [];
  const errors: string[] = [];
  const texts = new Map<string, string>();
  for (const f of cfg.clear ?? []) {
    try {
      const text = await fetchText(f);
      texts.set(f, text);
      clear.push(replayOnce(h, f, text));
      h.render(true);
      await frame();
    } catch (e) {
      errors.push(`${f}: ${String(e)}`);
    }
  }
  post({ name: 'clear', rows: clear, errors });
  let paced: unknown = null;
  const pacedFile = (cfg.clear ?? [])[cfg.paced ?? 0];
  if (pacedFile && texts.has(pacedFile) && (cfg.paced ?? 0) >= 0) {
    try {
      paced = await replayPaced(h, pacedFile, texts.get(pacedFile)!);
    } catch (e) {
      errors.push(`paced ${pacedFile}: ${String(e)}`);
    }
  }
  let crash: unknown = null;
  if (cfg.crash) {
    try {
      crash = await crashCheck(h, cfg.crash, await fetchText(cfg.crash));
    } catch (e) {
      errors.push(`crash: ${String(e)}`);
    }
  }
  let restart: unknown = null;
  try {
    restart = await restartCheck(h, cfg.track ?? clear[0]?.trackId ?? 'flat-test', cfg.restartReps ?? 20);
  } catch (e) {
    errors.push(`restart: ${String(e)}`);
  }
  post({
    name: 'result',
    readyMs: Math.round(readyMs),
    clear,
    paced,
    crash,
    restart,
    errors,
    info: { ...h.info(), lastRender: undefined },
    webdriver: navigator.webdriver === true,
    audioContexts: audioContexts(),
  });
  post({ name: 'done' });
}

export function startGate(): void {
  const cfg: GateConfig = { platform: 'web', ...w.__rockhopGate };
  const harness = /[?&]harness=1(&|$)/.test(location.search);
  const frontAt = /[?&]gatefront=(\d+)/.exec(location.search);
  if (frontAt && !harness) {
    frontStage(cfg, Number(frontAt[1])).catch((e: unknown) => post({ name: 'error', stage: 'front', error: String(e), stack: e instanceof Error ? (e.stack ?? null) : null }));
    return;
  }
  if (!cfg.shots?.length && (cfg.front?.results || cfg.front?.map) && !harness) {
    frontStage(cfg, 0).catch((e: unknown) => post({ name: 'error', stage: 'front', error: String(e), stack: e instanceof Error ? (e.stack ?? null) : null }));
    return;
  }
  if (cfg.shots?.length && !harness) {
    location.replace('./?harness=1');
    return;
  }
  const run = harness ? (cfg.shots?.length ? shotsStage(cfg) : harnessStage(cfg)) : bootStage(cfg);
  run.catch((e: unknown) => post({ name: 'error', stage: harness ? 'harness' : 'boot', error: String(e), stack: e instanceof Error ? (e.stack ?? null) : null }));
}
