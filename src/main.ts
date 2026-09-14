/**
 * Browser entry. Composes whatever the physics / render / audio modules
 * export today (they land in parallel), the DOM HUD and the app shell.
 *
 *   ?harness=1      no real-time driver; the headless harness owns the clock via window.__trials
 *   ?countdown=1    keep the 3-2-1-GO in harness mode (captures of the countdown)
 *   ?physics=mock   force the scaffold MockPhysics even when the real bike physics exists
 *   ?audio=0        NullAudio (the hook then has no renderOffline)
 *   ?track=<id>     start straight into a track (skips the menu)
 *   ?hz=<n>         physics rate (default 120)
 */
import { DEFAULT_PHYSICS_HZ } from './core';
import * as audioMod from './audio';
import * as physicsMod from './physics';
import * as renderMod from './render';
import type { AudioSystem } from './audio';
import type { PhysicsWorld } from './physics';
import type { GameRenderer } from './render';
import { App, Game, MockPhysics, dprCap, installHook, type HookExtras } from './game';
import { BestTimes, DomHud, injectStyles } from './ui';

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

function makeRenderer(parent: HTMLElement, harness: boolean): { renderer: GameRenderer; kind: string } {
  const m = renderMod as AnyModule;
  const opts = { ...(harness ? { pixelRatio: 1 } : {}), preserveDrawingBuffer: harness };
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

function boot(): void {
  const params = new URLSearchParams(location.search);
  const harness = params.get('harness') === '1';
  const physicsHz = Number(params.get('hz')) || DEFAULT_PHYSICS_HZ;
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');
  injectStyles();

  const t0 = performance.now();
  const { renderer, kind: renderKind } = makeRenderer(app, harness);
  const tRender = performance.now();
  const { make: makePhysics, kind: physicsKind } = physicsFactory(params.get('physics') === 'mock');
  const physics = makePhysics(physicsHz);
  const tPhysics = performance.now();
  const { audio, kind: audioKind, extras } = makeAudio(makePhysics, params.get('audio') === '0');
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
    audio,
    bestTimes,
    autoSkipCountdown: harness && params.get('countdown') !== '1',
  });
  const tGame = performance.now();
  console.info(
    `[trials] physics=${physicsKind} render=${renderKind} audio=${audioKind} harness=${harness} | construct ms: render ${(tRender - t0).toFixed(0)} physics ${(tPhysics - tRender).toFixed(0)} audio ${(tAudio - tPhysics).toFixed(0)} game ${(tGame - tAudio).toFixed(0)}`,
  );

  extras.modules = { physics: physicsKind, render: renderKind, audio: audioKind };
  const initialTrack = params.get('track') ?? undefined;

  if (harness) {
    renderer.resize(window.innerWidth, window.innerHeight, 1);
    window.addEventListener('resize', () => renderer.resize(window.innerWidth, window.innerHeight, 1));
    // Hook first (CONTRACT §3: track/texture generation happens *after* installHook and is
    // budgeted separately — see info().loadTrackMs), then the track in the next task so
    // `ready` is observable before the load. Any hook call the harness makes queues behind it.
    installHook(game, true, extras);
    setTimeout(() => {
      game.loadTrack(initialTrack);
      console.info(`[trials] loadTrack ${game.currentTrack?.id ?? '?'} ${game.lastLoadMs.toFixed(0)} ms`);
      game.renderOnce(); // one frame so the canvas is not blank before the harness takes over
    }, 0);
    return;
  }

  const shell = new App({
    game,
    hud,
    bestTimes,
    audio,
    uiRoot: ui,
    resize: (w, h, dpr) => renderer.resize(w, h, dpr),
    initialTrack,
  });
  installHook(game, false, extras);
  renderer.resize(window.innerWidth, window.innerHeight, dprCap());
  shell.start();
}

boot();
