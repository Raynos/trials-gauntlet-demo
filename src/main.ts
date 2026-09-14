/**
 * Browser entry. `?harness=1` disables the real-time driver so the headless
 * harness owns the clock via `window.__trials`.
 */
import { DEFAULT_PHYSICS_HZ } from './core';
import { NullAudio } from './audio';
import { Game, MockPhysics, installHook, KeyboardInput, RafDriver } from './game';
import { ThreeRenderer } from './render';
import { DEFAULT_TRACK_ID } from './tracks';
import { DomHud } from './ui';

function boot(): void {
  const params = new URLSearchParams(location.search);
  const harness = params.get('harness') === '1';
  const physicsHz = Number(params.get('hz')) || DEFAULT_PHYSICS_HZ;
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const renderer = new ThreeRenderer(app, {
    ...(harness ? { pixelRatio: 1 } : {}),
    preserveDrawingBuffer: harness,
  });
  const hud = new DomHud(app);
  const game = new Game({
    physicsHz,
    physics: new MockPhysics(physicsHz),
    renderer,
    hud,
    audio: new NullAudio(),
  });

  const fit = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  fit();
  window.addEventListener('resize', fit);

  game.loadTrack(params.get('track') ?? DEFAULT_TRACK_ID);
  installHook(game, harness);

  if (harness) {
    // One frame so the canvas is not blank before the harness takes over.
    game.renderOnce();
    return;
  }
  const keyboard = new KeyboardInput();
  new RafDriver(game, keyboard).start();
}

boot();
