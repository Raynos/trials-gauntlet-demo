/**
 * Browser entry. Composes whatever the physics / render / audio modules
 * export today (they land in parallel), the DOM HUD and the app shell.
 *
 *   ?harness=1      no real-time driver; the headless harness owns the clock via window.__trials
 *   ?countdown=1    keep the 3-2-1-GO in harness mode (captures of the countdown)
 *   ?physics=mock   force the scaffold MockPhysics even when the real bike physics exists
 *   ?audio=0        NullAudio (the hook then has no renderOffline)
 *   ?ghost=1        run the PB ghost world in harness mode too (off by default there: one world per µs/tick)
 *   ?rider=gltf|proc, ?bike=gltf|proc   rider / bike model (default proc; stored choice from the settings menu otherwise)
 *   ?touchdebug=1   overlay showing active touch pointers and the live InputFrame
 *   ?track=<id>     start straight into a track (skips the title / menu)
 *   ?dev=1          unlock every tier in track select and list the harness test strips
 *   ?hz=<n>         physics rate (default 120)
 */
import { DEFAULT_PHYSICS_HZ } from './core';
import * as audioMod from './audio';
import * as physicsMod from './physics';
import * as renderMod from './render';
import type { AudioSystem } from './audio';
import type { PhysicsWorld } from './physics';
import type { GameRenderer } from './render';
import { App, Game, MockPhysics, installHook, type HookExtras } from './game';
import { resolveBoot } from './game/flow';
import { getTrack } from './tracks';
import { ArtManifest, BestTimes, DomHud, injectStyles, loadModelChoice, type ModelChoice } from './ui';
import { fontsReady, getLoader, nextPaint, streamBytes } from './ui/loader';

type AnyModule = Record<string, unknown>;

type PhysicsFactoryFn = (hz: number) => PhysicsWorld;

/** Real bike physics when the physics owner has exported a factory; mock otherwise. */
function physicsFactory(forceMock: boolean): { make: PhysicsFactoryFn; kind: string } {
  const m = physicsMod as AnyModule;
  if (!forceMock) {
    for (const name of ['createBikePhysics', 'bikePhysicsFactory', 'createPhysics']) {
      const f = m[name];
      if (typeof f === 'function') return { make: f as PhysicsFactoryFn, kind: name };
    }
  }
  return { make: (hz) => new MockPhysics(hz), kind: 'mock' };
}

export interface ModelChoices {
  riderModel: ModelChoice;
  bikeModel: ModelChoice;
}

function modelChoices(params: URLSearchParams): ModelChoices {
  const pick = (v: string | null, stored: ModelChoice): ModelChoice => (v === 'gltf' || v === 'proc' ? v : stored);
  return {
    riderModel: pick(params.get('rider'), loadModelChoice('rider')),
    bikeModel: pick(params.get('bike'), loadModelChoice('bike')),
  };
}

function makeRenderer(parent: HTMLElement, harness: boolean, models: ModelChoices): { renderer: GameRenderer; kind: string } {
  const m = renderMod as AnyModule;
  // riderModel / bikeModel: 'proc' | 'gltf' — the render owner reads them; unknown keys are ignored today.
  const opts = { ...(harness ? { pixelRatio: 1 } : {}), preserveDrawingBuffer: harness, ...models };
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

/** Renderer-side startup work the render owner may expose (texture generation that yields between jobs). */
type Preparable = Partial<{ prepare(report: (done: number, total: number, label?: string) => void): Promise<void> | void }>;

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

  let composed: Composed | null = null;
  const compose = (): Composed => {
    if (composed) return composed;
    const t0 = performance.now();
    const { renderer, kind: renderKind } = makeRenderer(app, harness, models);
    const tRender = performance.now();
    const { make: makePhysics, kind: physicsKind } = physicsFactory(params.get('physics') === 'mock');
    const physics = makePhysics(physicsHz);
    const tPhysics = performance.now();
    const audioParts = makeAudio(makePhysics, params.get('audio') === '0');
    if (audioParts.extras.renderOffline) extras.renderOffline = audioParts.extras.renderOffline;
    const tAudio = performance.now();

    const ui = document.createElement('div');
    ui.id = 'ui';
    app.appendChild(ui);
    const bestTimes = new BestTimes();
    const hud = new DomHud(ui, (id) => bestTimes.get(id));
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
   * Normal play: staged boot reported to the inline loader (index.html), one
   * yield per step so the page repaints between the CPU-heavy pieces
   * (renderer + WebGL context, physics, audio, track compile, texture prep).
   */
  async function bootFront(): Promise<void> {
    const loader = getLoader();
    loader.plan(10);
    try {
      loader.step('WebGL renderer');
      await nextPaint();
      const { renderer, kind: renderKind } = makeRenderer(appRoot, false, models);
      loader.step('Physics world');
      await nextPaint();
      const { make: makePhysics, kind: physicsKind } = physicsFactory(params.get('physics') === 'mock');
      const physics = makePhysics(physicsHz);
      loader.step('Audio');
      await nextPaint();
      const audioParts = makeAudio(makePhysics, params.get('audio') === '0');
      if (audioParts.extras.renderOffline) extras.renderOffline = audioParts.extras.renderOffline;
      loader.step('Game + HUD');
      await nextPaint();
      const ui = document.createElement('div');
      ui.id = 'ui';
      appRoot.appendChild(ui);
      const bestTimes = new BestTimes();
      const hud = new DomHud(ui, (id) => bestTimes.get(id));
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
      });
      extras.modules = { physics: physicsKind, render: renderKind, audio: audioParts.kind, rider: models.riderModel, bike: models.bikeModel };
      console.info(`[trials] physics=${physicsKind} render=${renderKind} audio=${audioParts.kind} harness=false`);
      const art = new ArtManifest();
      const artLoad = art.load();
      loader.step('Front end + first resize');
      await nextPaint();
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
        touchDebug: params.get('touchdebug') === '1',
        modelsSupported: typeof (renderer as Partial<{ setModels: unknown }>).setModels === 'function',
        applyModels: (m) => {
          const r = renderer as Partial<{ setModels(o: ModelChoices): void }>;
          if (typeof r.setModels !== 'function') return false;
          r.setModels({ riderModel: m.rider, bikeModel: m.bike });
          return true;
        },
        art,
      });
      installHook(game, false, extras);
      const trackName = getTrack(initialTrack ?? 'b1-first-ride')?.name ?? 'track';
      loader.step(`Track: ${trackName}`);
      await nextPaint();
      shell.start(); // loads the track (compile + physics + renderer world) and shows the title
      console.info(`[trials] loadTrack ${game.currentTrack?.id ?? '?'} ${game.lastLoadMs.toFixed(0)} ms`);
      // The first WebGL frame (shader compile, texture upload) is the biggest single task of boot: give it its own row.
      loader.step('First frame (shaders)');
      await nextPaint();
      await nextPaint();
      const prep = (renderer as Preparable).prepare;
      loader.step('World textures');
      await nextPaint();
      if (typeof prep === 'function') {
        await prep.call(renderer, (done, total, label) => loader.progress(label ? `World textures · ${label}` : 'World textures', done, total));
      }
      loader.step('Fonts');
      await nextPaint();
      await fontsReady();
      loader.step('Title art');
      await nextPaint();
      await Promise.race([artLoad, new Promise((r) => setTimeout(r, 3000))]);
      const key = art.keyart('industrial');
      if (key) {
        const item = (await loadManifestItem(key.src)) ?? null;
        await streamBytes(key.src, (done, total) => loader.progress('Title art', done, total, 'B'), item?.bytes ?? 0);
      }
      loader.done();
    } catch (e) {
      console.error('[trials] boot failed', e);
      loader.fail(`Startup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** Expected byte count for a URL from the build's load manifest (null in dev / on a miss). */
let loadManifestCache: Promise<Array<{ path: string; bytes: number }> | null> | null = null;
async function loadManifestItem(url: string): Promise<{ path: string; bytes: number } | null> {
  loadManifestCache ??= fetch('./load-manifest.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<{ items: Array<{ path: string; bytes: number }> }>) : null))
    .then((m) => m?.items ?? null)
    .catch(() => null);
  const items = await loadManifestCache;
  if (!items) return null;
  const tail = url.replace(/^\.?\//, '');
  return items.find((i) => i.path.replace(/^\.?\//, '') === tail) ?? null;
}

boot();
