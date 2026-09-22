/**
 * WebAudioSystem — the live AudioSystem.
 *
 * iOS Safari rules baked in:
 *  - the AudioContext is created *synchronously* inside `unlock()` (call it
 *    from the first touch/key handler, before any await);
 *  - `resume()` is retried on every later `unlock()` call and on statechange
 *    (Safari suspends/interrupts on phone calls, tab switches, silent switch);
 *  - AudioWorklet is tried first; if `addModule` throws or times out the
 *    oscillator-bank FallbackGraph takes over with the same param stream.
 *
 * The engine, tyres, crowd, stingers and the procedural bed live in the model + synth; this file moves
 * a Float32Array per frame. The recorded music (src/audio/music) is the one exception: AudioBuffers
 * on the same context, beside the synth, created with the backend (so never before the first gesture
 * and never under automation), ducked under the engine from the model's own load / engine gain.
 */
import type { BikeClass, CompiledTrack, GameEvent, InputFrame, PhysicsState } from '../../core/types';
import type { PhysicsFactory } from '../../physics';
import type { AudioSystem } from '../index';
import { ModelDriver, type AudioScene } from '../driver';
import { createOfflineRenderer, type OfflineOptions } from '../offline';
import { FallbackGraph } from './fallback';
import { silentAutomation } from '../automation';
import { MusicPlayer, type MusicPlayerOptions } from '../music/player';
import { zoneOf, type MusicZone } from '../music/zone';
import { SCENE_MENU, SCENE_RESULTS } from '../model/mapParams';

const WORKLET_NAME = 'trials-synth';

export interface WebAudioOptions {
  /** Inject a context (tests / OfflineAudioContext). Default: new AudioContext in unlock(). */
  context?: AudioContext;
  /** Force the oscillator-bank fallback (debug / low tier). */
  forceFallback?: boolean;
  /** Physics factory for renderOffline(); without it renderOffline is undefined. */
  makePhysics?: PhysicsFactory;
  offline?: OfflineOptions;
  /** ms to wait for the worklet module before falling back (default 4000). */
  workletTimeoutMs?: number;
  /** Recorded music: false = procedural bed only; an object overrides the player (tests: cues, fetch). */
  music?: boolean | Omit<MusicPlayerOptions, 'onBed'>;
}

/**
 * Music ducking under the engine (dB): the ride loop gives way as the throttle opens —
 * 1 dB at a closed throttle, 4 dB wide open; nothing when the engine bus is silent (crash, menu).
 */
export function engineDuckDb(engineGain: number, load: number): number {
  const g = Math.max(0, Math.min(1, engineGain));
  return g * (1 + 3 * Math.max(0, Math.min(1, load)));
}

type Backend = { kind: 'worklet'; node: AudioWorkletNode } | { kind: 'fallback'; graph: FallbackGraph };

export class WebAudioSystem implements AudioSystem {
  readonly driver = new ModelDriver();
  private ctx: AudioContext | null = null;
  private backend: Backend | null = null;
  private unlocking: Promise<void> | null = null;
  private master = 1;
  private disposed = false;
  private track: CompiledTrack | null = null;
  private seed = 0;
  private onVisibility: (() => void) | null = null;
  private music: MusicPlayer | null = null;
  private appScene: AudioScene | null = null;
  private zone: MusicZone | null = null;
  private musicVolume = 1;
  readonly renderOffline: ((recordingJson: string, seconds: number) => Promise<Float32Array>) | undefined;

  constructor(private readonly opts: WebAudioOptions = {}) {
    if (opts.makePhysics) this.renderOffline = createOfflineRenderer(opts.makePhysics, opts.offline ?? {});
  }

  /** 'worklet' | 'fallback' | null (not unlocked yet). */
  get backendKind(): Backend['kind'] | null {
    return this.backend?.kind ?? null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Optional (additive): the game calls this from loadTrack so biome + seed follow the track. */
  setTrack(track: CompiledTrack, seed: number): void {
    this.track = track;
    this.seed = seed >>> 0;
    this.zone = zoneOf(track);
    this.music?.setZone(this.zone);
    this.driver.setTrack(track, this.seed);
    if (this.backend?.kind === 'worklet') {
      this.backend.node.port.postMessage({ seed: this.seed });
      this.postScene();
    }
  }

  /** Optional (additive): the class the physics was loaded with (Game.setBike / loadTrack). Voicing only. */
  setBike(bike: BikeClass): void {
    this.driver.setBike(bike);
  }

  /**
   * Optional (additive): the app's screen, for the music bed — 'menu' (front end, garage, track select),
   * 'results', or 'run'. Without it the bed is inferred: menu until the first countdown, results 1.4 s
   * after a finish, run again on the next restart. Pass null to return to inference.
   */
  setScene(scene: AudioScene | null): void {
    this.appScene = scene;
    this.driver.setScene(scene);
    this.postScene();
  }

  /** The music-only slider (0..1). Scales the recorded cues; the master scales everything. */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.music?.setMusicVolume(this.musicVolume);
  }

  /** The recorded-music player, once the context exists (null before the first gesture / under automation). */
  get musicPlayer(): MusicPlayer | null {
    return this.music;
  }

  /** The scene the music follows: the app's word when it gave one, else the model's inference. */
  private musicScene(): AudioScene {
    if (this.appScene) return this.appScene;
    const s = this.driver.scene;
    return s === SCENE_MENU ? 'menu' : s === SCENE_RESULTS ? 'results' : 'run';
  }

  private postScene(): void {
    const b = this.backend;
    if (b?.kind === 'worklet') b.node.port.postMessage({ scene: this.driver.scene });
    this.music?.setScene(this.musicScene(), this.zone ?? undefined);
  }

  private postBed(on: boolean): void {
    const b = this.backend;
    if (b?.kind === 'worklet') b.node.port.postMessage({ bed: on });
  }

  unlock(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.ctx && !this.opts.context && silentAutomation()) return Promise.resolve();
    if (!this.ctx) {
      // iOS: an ambient session — the silent switch mutes the game and other apps' audio keeps playing
      // (Safari 17+ / WKWebView; the native shells also set it, store release Phase 5).
      try {
        const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'ambient';
      } catch {
        /* not supported */
      }
      // Synchronous creation inside the gesture — this is the iOS requirement.
      try {
        this.ctx = this.opts.context ?? new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return Promise.resolve();
      }
      const ctx = this.ctx;
      const kick = (): void => {
        if (this.disposed || this.ctx !== ctx) return;
        if ((ctx.state as string) === 'interrupted' || ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      };
      // Safari suspends/interrupts on phone calls, tab switches and the lock screen; resume
      // when the state flips and again when the page becomes visible (iOS needs the latter).
      ctx.onstatechange = kick;
      if (typeof document !== 'undefined') {
        this.onVisibility = () => {
          if (document.visibilityState === 'visible') kick();
        };
        document.addEventListener('visibilitychange', this.onVisibility);
      }
    }
    const ctx = this.ctx;
    // Kick resume() synchronously inside the gesture as well.
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (this.backend) return Promise.resolve();
    if (!this.unlocking) this.unlocking = this.buildBackend(ctx).finally(() => (this.unlocking = null));
    return this.unlocking;
  }

  private async buildBackend(ctx: AudioContext): Promise<void> {
    let backend: Backend | null = null;
    if (!this.opts.forceFallback && typeof ctx.audioWorklet?.addModule === 'function') {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('worklet timeout')), this.opts.workletTimeoutMs ?? 4000),
        );
        // Vite bundles `./worklet?worker&url` into its own chunk and hands back its URL.
        // The specifier is cast so tsc (which lacks vite/client types in the harness
        // config) does not try to resolve it; esbuild strips the cast before Vite sees it.
        const mod = (await import('./worklet?worker&url' as string)) as { default: string };
        await Promise.race([ctx.audioWorklet.addModule(mod.default), timeout]);
        const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.connect(ctx.destination);
        node.port.postMessage({ seed: this.seed });
        node.port.postMessage({ master: this.master });
        node.port.postMessage({ scene: this.driver.scene });
        backend = { kind: 'worklet', node };
      } catch {
        backend = null;
      }
    }
    if (!backend) {
      const graph = new FallbackGraph(ctx, ctx.destination);
      graph.setMaster(this.master);
      backend = { kind: 'fallback', graph };
    }
    if (this.disposed) return;
    this.backend = backend;
    if (this.track) this.driver.setTrack(this.track, this.seed);
    if (this.opts.music !== false) {
      const mo = typeof this.opts.music === 'object' ? this.opts.music : {};
      try {
        this.music = new MusicPlayer(ctx, ctx.destination, { ...mo, onBed: (on) => this.postBed(on) });
        this.music.setVolume(this.master);
        this.music.setMusicVolume(this.musicVolume);
        this.music.setScene(this.musicScene(), this.zone ?? undefined);
      } catch {
        this.music = null; // the procedural bed stays
      }
    }
  }

  update(state: PhysicsState, dt: number, input?: Readonly<InputFrame>): void {
    const packed = this.driver.update(state, dt, input);
    const m = this.music;
    if (m) {
      const p = this.driver.params;
      m.setDuckDb(this.driver.scene === SCENE_MENU || this.driver.scene === SCENE_RESULTS ? 0 : engineDuckDb(p.engineGain, p.load));
      if (!this.appScene) m.setScene(this.musicScene(), this.zone ?? undefined);
    }
    const b = this.backend;
    if (b && this.ctx && this.ctx.state === 'running') {
      if (b.kind === 'worklet') b.node.port.postMessage(packed);
      else b.graph.setParams(packed);
    }
    this.driver.flush();
  }

  onEvent(event: GameEvent): void {
    const before = this.driver.scene;
    this.driver.onEvent(event);
    // scene edges from events reach the worklet even when no frame follows (finish → results in the menu-less case)
    if (this.driver.scene !== before) this.postScene();
  }

  setMasterVolume(v: number): void {
    const p = Math.max(0, Math.min(1, v));
    this.master = p * p; // perceptual
    this.music?.setVolume(this.master);
    const b = this.backend;
    if (!b) return;
    if (b.kind === 'worklet') b.node.port.postMessage({ master: this.master });
    else b.graph.setMaster(this.master);
  }

  dispose(): void {
    this.disposed = true;
    if (this.onVisibility && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.onVisibility = null;
    const b = this.backend;
    if (b?.kind === 'worklet') {
      b.node.port.postMessage({ stop: true });
      b.node.disconnect();
    }
    this.backend = null;
    this.music?.dispose();
    this.music = null;
    if (this.ctx && !this.opts.context) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }
}
