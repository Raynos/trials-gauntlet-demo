/**
 * Browser entry. Composes whatever the physics / render / audio modules
 * export today (they land in parallel), the DOM HUD and the app shell.
 *
 *   ?harness=1      no real-time driver; the headless harness owns the clock via window.__trials
 *   ?countdown=1    keep the 3-2-1-GO in harness mode (captures of the countdown)
 *   ?physics=mock   force the scaffold MockPhysics even when the real bike physics exists
 *   ?physics=v1|v2  pick `createBikePhysicsV1` / `createBikePhysicsV2` from the physics barrel when exported (A/B during the v2 migration); default = `createBikePhysics`
 *   ?audio=0        NullAudio (the hook then has no renderOffline)
 *   ?ghost=1        run the PB ghost world in harness mode too (off by default there: one world per µs/tick)
 *   ?rider=gltf|proc, ?bike=gltf|proc   rider / bike model (default gltf; a stored settings choice otherwise)
 *   ?outfit=street|race   cosmetic rider outfit (default street; stored garage choice otherwise)
 *   ?touchdebug=1   overlay showing active touch pointers and the live InputFrame
 *   ?track=<id>     start straight into a track (skips the menu)
 *   ?dev=1          unlock every tier in track select and list the harness test strips
 *   ?hz=<n>         physics rate (default 120)
 *   ?perf=1         fps / frame ms / physics µs / draw-call overlay (top-left, under the pause button)
 *   ?sw=0           do not register the service worker (production builds register it; harness never does)
 *   ?updatetoast=1  show the "Update available" toast at once (capture / QA of the PWA reload path)
 *   ?trace=1        live InputFrame bars (gas / brake / lean) under the HUD timer — for filming the phone
 *   ?lab=1          physics lab HUD + ghost of the last attempt on every track (automatic on `lab-*` tracks)
 *   ?bench=1        the on-device benchmark (src/game/bench.ts, docs/device/README.md): START card → scenarios → Copy report;
 *                   `&quick=1` (menu + garage, 3 s), `&no=audio,hud,render,touch`, `&cap=60`
 */
import { DEFAULT_PHYSICS_HZ, type PhysicsVersion } from './core';
import * as audioMod from './audio';
import * as physicsMod from './physics';
import * as renderMod from './render';
import type { AudioSystem } from './audio';
import type { PhysicsWorld } from './physics';
import type { GameRenderer } from './render';
import { App, Game, MockPhysics, installHook, isPhone, type HookExtras } from './game';
import { parseBenchParams } from './game/bench';
import { resolveBoot } from './game/flow';
import { registerServiceWorker } from './game/pwa';
import { getTrack } from './tracks';
import { ArtManifest, BestTimes, DomHud, injectStyles, loadModelChoice, type ModelChoice } from './ui';
import { nextPaint } from './ui/loader';
import { takeBootPlan } from './boot/handoff';
import { streamBytes } from './boot/stream';
import { PREPARE_STEPS } from './boot/steps';
import { delegate, type ByteProgress, type StepRunner } from './boot/plan';
import type { PrepareStep } from './boot/steps';
import type { RiderOutfit, RiderOutfitRenderer } from './core/types';
import { loadRiderOutfit } from './ui/outfit';

type AnyModule = Record<string, unknown>;

type PhysicsFactoryFn = (hz: number) => PhysicsWorld;

/** Solver versions the physics barrel exports today (`createBikePhysicsV1` / `createBikePhysicsV2`). */
function physicsVersions(): ('v1' | 'v2')[] {
  const m = physicsMod as AnyModule;
  const out: ('v1' | 'v2')[] = [];
  if (typeof m['createBikePhysicsV1'] === 'function') out.push('v1');
  if (typeof m['createBikePhysicsV2'] === 'function') out.push('v2');
  return out;
}

/**
 * Real bike physics when the physics owner has exported a factory; mock otherwise. `?physics=v1|v2` picks a
 * versioned factory when it exists. `version` is the solver stamp (`createBikePhysics` is v2 since the R3 flip,
 * `src/physics/index.ts`); undefined for the mock.
 */
function physicsFactory(choice: string | null): { make: PhysicsFactoryFn; kind: string; version: PhysicsVersion | undefined } {
  const m = physicsMod as AnyModule;
  if (choice !== 'mock') {
    const names = choice === 'v1' ? ['createBikePhysicsV1'] : choice === 'v2' ? ['createBikePhysicsV2'] : [];
    for (const name of [...names, 'createBikePhysics', 'bikePhysicsFactory', 'createPhysics']) {
      const f = m[name];
      if (typeof f === 'function') return { make: f as PhysicsFactoryFn, kind: name, version: name === 'createBikePhysicsV1' ? 'v1' : 'v2' };
    }
  }
  return { make: (hz) => new MockPhysics(hz), kind: 'mock', version: undefined };
}

export interface ModelChoices {
  riderModel: ModelChoice;
  bikeModel: ModelChoice;
}

function modelChoices(params: URLSearchParams): ModelChoices {
  const pick = (v: string | null, stored: ModelChoice): ModelChoice => (v === 'gltf' || v === 'proc' ? v : stored);
  return {
    riderModel: params.get('rider') === 'img2' ? 'img2' : pick(params.get('rider'), loadModelChoice('rider')),
    bikeModel: pick(params.get('bike'), loadModelChoice('bike')),
  };
}

/** Boot-plan hooks the renderer takes at construction: the hero glTF byte counter and the per-track art `after` item. */
interface RendererBootHooks {
  heroBytes: ByteProgress;
  artBytes: ByteProgress;
  onTrackArt: (done: number, total: number, label: string) => void;
}

function makeRenderer(parent: HTMLElement, harness: boolean, models: ModelChoices, riderOutfit: RiderOutfit, boot?: RendererBootHooks): { renderer: GameRenderer; kind: string } {
  const m = renderMod as AnyModule;
  // riderModel / bikeModel: 'proc' | 'gltf' — the render owner reads them; unknown keys are ignored today.
  const opts = { ...(harness ? { pixelRatio: 1 } : {}), preserveDrawingBuffer: harness, ...models, riderOutfit, ...(boot ?? {}) };
  const create = m['createRenderer'];
  if (typeof create === 'function') {
    return { renderer: (create as (p: HTMLElement, o: typeof opts) => GameRenderer)(parent, opts), kind: 'createRenderer' };
  }
  const Ctor = m['ThreeRenderer'] as (new (p: HTMLElement, o: typeof opts) => GameRenderer) | undefined;
  if (!Ctor) throw new Error('render module exports neither createRenderer nor ThreeRenderer');
  return { renderer: new Ctor(parent, opts), kind: 'ThreeRenderer' };
}

/**
 * Real WebAudio system when exported (constructed lazily-safe: no AudioContext
 * until unlock()), NullAudio otherwise. `renderOffline` reaches the hook either
 * from the instance or from a module-level export.
 */
function makeAudio(makePhysics: PhysicsFactoryFn, muted: boolean): { audio: AudioSystem; kind: string; extras: HookExtras } {
  const m = audioMod as AnyModule;
  const extras: HookExtras = {};
  let audio: AudioSystem | null = null;
  let kind = 'null';
  const Web = m['WebAudioSystem'] as (new (o: { makePhysics: PhysicsFactoryFn }) => AudioSystem) | undefined;
  if (Web && !muted) {
    try {
      audio = new Web({ makePhysics });
      kind = 'WebAudioSystem';
    } catch (e) {
      console.warn('[trials] WebAudioSystem failed to construct, using NullAudio', e);
    }
  }
  if (!audio) {
    const Null = m['NullAudio'] as (new () => AudioSystem) | undefined;
    if (!Null) throw new Error('audio module exports no NullAudio');
    audio = new Null();
  }
  const ro = audio.renderOffline ?? (typeof m['renderOffline'] === 'function' ? (m['renderOffline'] as NonNullable<HookExtras['renderOffline']>) : undefined);
  if (ro) extras.renderOffline = (json, seconds) => ro(json, seconds);
  return { audio, kind, extras };
}

interface Composed {
  game: Game;
  hud: DomHud;
  bestTimes: BestTimes;
  audio: AudioSystem;
  renderer: GameRenderer;
}

/** Renderer-side startup work run through the boot plan (`PREPARE_STEPS`, src/render/index.ts `prepare`). */
type Preparable = Partial<{ prepare(run: StepRunner<PrepareStep>): Promise<void> }>;

function boot(): void {
  const params = new URLSearchParams(location.search);
  const route = resolveBoot(params, (id) => getTrack(id) !== undefined);
  const harness = route.mode === 'harness';
  const physicsHz = Number(params.get('hz')) || DEFAULT_PHYSICS_HZ;
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');
  injectStyles();
  const extras: HookExtras = {};
  const initialTrack = route.track ?? undefined;
  const models = modelChoices(params);
  const riderOutfit = loadRiderOutfit(params.get('outfit'));

  let composed: Composed | null = null;
  const compose = (): Composed => {
    if (composed) return composed;
    const t0 = performance.now();
    const { renderer, kind: renderKind } = makeRenderer(app, harness, models, riderOutfit);
    const tRender = performance.now();
    const { make: makePhysics, kind: physicsKind, version: physicsVersion } = physicsFactory(params.get('physics'));
    const physics = makePhysics(physicsHz);
    const tPhysics = performance.now();
    const audioParts = makeAudio(makePhysics, params.get('audio') === '0');
    if (audioParts.extras.renderOffline) extras.renderOffline = audioParts.extras.renderOffline;
    const tAudio = performance.now();

    const ui = document.createElement('div');
    ui.id = 'ui';
    app.appendChild(ui);
    const bestTimes = new BestTimes();
    const hud = new DomHud(ui, (id) => bestTimes.get(id), (id, bike) => bestTimes.board(id, bike));
    const game = new Game({
      physicsHz,
      physics,
      renderer,
      hud,
      audio: audioParts.audio,
      bestTimes,
      autoSkipCountdown: harness && params.get('countdown') !== '1',
      physicsFactory: makePhysics,
      autoRecord: true,
      ghostEnabled: !harness || params.get('ghost') === '1',
      physicsVersion,
    });
    const tGame = performance.now();
    extras.modules = { physics: physicsKind, render: renderKind, audio: audioParts.kind, rider: models.riderModel, bike: models.bikeModel };
    console.info(
      `[trials] physics=${physicsKind} render=${renderKind} audio=${audioParts.kind} harness=${harness} | compose at ${t0.toFixed(0)} ms since nav; ms: render ${(tRender - t0).toFixed(0)} physics ${(tPhysics - tRender).toFixed(0)} audio ${(tAudio - tPhysics).toFixed(0)} game+hud ${(tGame - tAudio).toFixed(0)}`,
    );
    if (harness) {
      renderer.resize(window.innerWidth, window.innerHeight, 1);
      window.addEventListener('resize', () => renderer.resize(window.innerWidth, window.innerHeight, 1));
    }
    composed = { game, hud, bestTimes, audio: audioParts.audio, renderer };
    return composed;
  };

  if (harness) {
    // `ready` first, at module-evaluation time. The hook resolves the game on first use, so
    // any harness call is correct regardless of task order; normally the composition task
    // below (renderer + WebGL context, physics, audio, HUD) and the track load have already
    // run. CONTRACT §3: texture/track generation happens after installHook and is budgeted
    // separately — `info().loadTrackMs`; the first frame is the harness's own `render()`.
    installHook(() => compose().game, true, extras);
    setTimeout(() => {
      const { game } = compose();
      if (!game.currentTrack) game.loadTrack(initialTrack);
      console.info(`[trials] loadTrack ${game.currentTrack?.id ?? '?'} ${game.lastLoadMs.toFixed(0)} ms`);
    }, 0);
    return;
  }

  const appRoot: HTMLElement = app;
  void bootFront();
  return;

  /**
   * Normal play: the boot, step by step, on the boot plan the inline loader created (src/boot/plan.ts;
   * docs/tasks/loading-progress-invariant.md). Every await is a `plan.step(...)`; the plan's type loses
   * each key as it runs, so `done()` only compiles once every step in `BOOT_STEPS` has run here (the
   * renderer's eight `PREPARE_STEPS` are delegated through `delegate()` and verified at runtime).
   * One `nextPaint()` at the start of each step so the loader paints the step before its CPU work.
   */
  async function bootFront(): Promise<void> {
    const plan = await takeBootPlan();
    try {
      const sRenderer = await plan.step('renderer', async () => {
        await nextPaint();
        // The two downloads boot awaits (hero glTF, boot art set) start in the renderer's constructor, each with its
        // DOWNLOAD reader; per-track art after the boot set is an `after` item.
        return makeRenderer(appRoot, false, models, riderOutfit, { heroBytes: plan.reader('heroModels'), artBytes: plan.reader('bootArt'), onTrackArt: (done, total) => plan.after('trackArt', done, total) });
      });
      const { renderer, kind: renderKind } = sRenderer.value;
      const sPhysics = await sRenderer.step('physics', async () => {
        await nextPaint();
        const f = physicsFactory(params.get('physics'));
        return { ...f, physics: f.make(physicsHz) };
      });
      const { make: makePhysics, kind: physicsKind, version: physicsVersion, physics } = sPhysics.value;
      const sAudio = await sPhysics.step('audio', async () => {
        await nextPaint();
        const a = makeAudio(makePhysics, params.get('audio') === '0');
        if (a.extras.renderOffline) extras.renderOffline = a.extras.renderOffline;
        return a;
      });
      const audioParts = sAudio.value;
      const sGame = await sAudio.step('game', async () => {
        await nextPaint();
        const ui = document.createElement('div');
        ui.id = 'ui';
        appRoot.appendChild(ui);
        const bestTimes = new BestTimes();
        const hud = new DomHud(ui, (id) => bestTimes.get(id), (id, bike) => bestTimes.board(id, bike));
        const game = new Game({
          physicsHz,
          physics,
          renderer,
          hud,
          audio: audioParts.audio,
          bestTimes,
          autoSkipCountdown: false,
          physicsFactory: makePhysics,
          autoRecord: true,
          ghostEnabled: true,
          physicsVersion,
        });
        extras.modules = { physics: physicsKind, render: renderKind, audio: audioParts.kind, rider: models.riderModel, bike: models.bikeModel };
        console.info(`[trials] physics=${physicsKind} render=${renderKind} audio=${audioParts.kind} harness=false`);
        return { ui, bestTimes, hud, game };
      });
      const { ui, bestTimes, hud, game } = sGame.value;
      const sFront = await sGame.step('front', async () => {
        await nextPaint();
        const art = new ArtManifest();
        // Key art is background: streamed into the browser cache with its bytes on the `after` list, never awaited
        // (the menu's CSS background finishes the download on its own and hot-swaps the plate in).
        void art.load().then(() => {
          const key = art.keyart('industrial');
          if (key) streamBytes(key.src, (_d, got, total) => plan.after('keyArt', got, total), key.bytes ?? 0).catch(() => undefined);
        });
        const shell = new App({
          game,
          hud,
          bestTimes,
          audio: audioParts.audio,
          uiRoot: ui,
          sceneRoot: appRoot,
          dev: route.dev,
          resize: (w, h, dpr) => renderer.resize(w, h, dpr),
          initialTrack,
          models: { rider: models.riderModel, bike: models.bikeModel },
          riderOutfit,
          onRiderOutfitChange: (outfit) => (renderer as RiderOutfitRenderer).setRiderOutfit?.(outfit) ?? Promise.resolve(false),
          // Garage round: the workshop set + orbit camera behind the garage screen (render exports both).
          onGarageStage: (on) => {
            const r = renderer as Partial<{ setGarageStage(on: boolean): void }>;
            if (typeof r.setGarageStage === 'function') r.setGarageStage(on);
          },
          setCameraOverride: (o) => {
            if (typeof renderer.setCameraOverride === 'function') renderer.setCameraOverride(o);
          },
          touchDebug: params.get('touchdebug') === '1',
          modelsSupported: typeof (renderer as Partial<{ setModels: unknown }>).setModels === 'function',
          applyModels: (m) => {
            const r = renderer as Partial<{ setModels(o: ModelChoices): void }>;
            if (typeof r.setModels !== 'function') return false;
            r.setModels({ riderModel: m.rider, bikeModel: m.bike });
            return true;
          },
          art,
          perf: params.get('perf') === '1',
          trace: params.get('trace') === '1',
          lab: params.get('lab') === '1',
          physics: { current: params.get('physics') === 'v1' ? 'v1' : params.get('physics') === 'v2' ? 'v2' : 'default', available: physicsVersions(), live: physicsVersion },
          bench: parseBenchParams(params) ?? undefined,
          initialReview: params.get('review') ?? undefined,
          // Per-class livery when the render owner exports it (`setBikeClass(bike)`); otherwise the garage card carries the colour.
          onBikeChange: (bike) => {
            const r = renderer as Partial<{ setBikeClass(b: 'rookie' | 'pro'): void }>;
            if (typeof r.setBikeClass === 'function') r.setBikeClass(bike);
          },
        });
        // Device class for the renderer's tier definitions (PERF.md §3.1: phone-high is a different pass list
        // than desktop-high); the app decides from the coarse-pointer/short-side rule, the renderer never guesses from DPR.
        {
          const r = renderer as Partial<{ setDeviceClass(c: 'phone' | 'desktop'): void }>;
          if (typeof r.setDeviceClass === 'function') r.setDeviceClass(isPhone() ? 'phone' : 'desktop');
        }
        const hook = installHook(game, false, extras);
        hook.lastRun = () => game.lastRunRecording()?.json ?? null;
        hook.replay = shell.replayApi();
        hook.review = shell.reviewApi();
        hook.navLog = () => shell.navLog.all();
        hook.app = shell.testApi();
        const benchApi = shell.benchApi();
        if (benchApi) hook.bench = benchApi;
        if (import.meta.env.PROD && params.get('sw') !== '0') registerServiceWorker((reload) => shell.showUpdate(reload));
        if (params.get('updatetoast') === '1') setTimeout(() => shell.showUpdate(() => location.reload()), 1500);
        return shell;
      });
      const shell = sFront.value;
      const sTrack = await sFront.step('track', async (p) => {
        p.detail(getTrack(initialTrack ?? 'b1-first-ride')?.name ?? 'track');
        await nextPaint();
        shell.start(); // loads the track (compile + physics + renderer world) and shows the menu
        console.info(`[trials] loadTrack ${game.currentTrack?.id ?? '?'} ${game.lastLoadMs.toFixed(0)} ms`);
        await nextPaint();
      });
      // The renderer's eight steps (hero meshes … first frame), delegated: its runner accepts only those keys
      // and the plan throws if it resolves with one of them not complete.
      const sPrepared = await delegate(sTrack, PREPARE_STEPS, async (run) => {
        const prep = (renderer as Preparable).prepare;
        if (typeof prep === 'function') return prep.call(renderer, run);
        // A renderer without prepare(): the steps run as no-ops so the plan (and the number) is the same shape.
        for (const key of PREPARE_STEPS) await run(key, () => undefined);
      });
      const sFonts = await sPrepared.step('fonts', async () => {
        await nextPaint();
        // The fonts are in the core set the inline loader streamed; this is the decode, not a download. No cap.
        const f = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
        if (f) await f.ready;
      });
      sFonts.done();
    } catch (e) {
      console.error('[trials] boot failed', e);
      plan.fail(`Startup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

boot();
