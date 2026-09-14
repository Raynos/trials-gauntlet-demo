/**
 * Browser app shell: front end (title → menu → track select / settings /
 * credits) ⇄ runs (countdown → riding → pause / results), input mux → game,
 * RAF driver, quality probe, mobile rules (DPR cap, audio unlock, visibility
 * pause). Nothing in here touches determinism: the game only ever sees
 * quantized InputFrames and simulated seconds.
 *
 * Flow (`App.screen`): `title` → `menu` → `tracks` | `settings` | `credits`;
 * `run` (countdown…) → pause overlay → results. The title and menu render
 * over the live 3D scene with `BACKDROP_TRACK` loaded in the `menu` phase.
 */
import type { InputDevice, QualityTier, TrackDef } from '../core/types';
import type { AudioSystem } from '../audio';
import { getTrack, listTrackIds } from '../tracks';
import {
  ArtManifest,
  CreditsScreen,
  MainMenuScreen,
  PauseMenu,
  SettingsScreen,
  TitleScreen,
  TrackSelectScreen,
  UiSfx,
  loadGhostEnabled,
  loadModelChoice,
  loadQualityOverride,
  loadSoundEnabled,
  loadVolume,
  mountRotatePrompt,
  saveGhostEnabled,
  saveModelChoice,
  saveQualityOverride,
  saveSoundEnabled,
  saveVolume,
  shipTracks,
  type BestTimes,
  type DomHud,
  type FrontScreen,
  type FrontState,
  type ModelChoice,
  type QualityChoice,
} from '../ui';
import { BACKDROP_TRACK } from './flow';
import type { Game } from './game';
import { GamepadInput, InputMux, KeyboardInput, TouchInput } from './input';

export interface AppOptions {
  game: Game;
  hud: DomHud;
  bestTimes: BestTimes;
  audio: AudioSystem | undefined;
  /** Element the touch layer and menus mount into (above the canvas). */
  uiRoot: HTMLElement;
  /** Element holding the canvas (`#app`): gets the title drift / dim classes. */
  sceneRoot?: HTMLElement | undefined;
  resize(width: number, height: number, pixelRatio: number): void;
  /** `?track=`: skip the front end and ride. */
  initialTrack?: string | undefined;
  /** `?dev=1`: every tier unlocked, test strips listed. */
  dev?: boolean | undefined;
  /** Model choices in effect for this page load (URL param or stored). */
  models: { rider: ModelChoice; bike: ModelChoice };
  /** Called after a model choice changes; the renderer is built once, so the app reloads. */
  applyModels?: ((models: { rider: ModelChoice; bike: ModelChoice }) => boolean) | undefined;
  /** Renderer has a glTF path (`setModels`): shows the Rider / Bike settings rows. Default hidden. */
  modelsSupported?: boolean | undefined;
  /** `?touchdebug=1`: overlay of active pointers + live InputFrame. */
  touchDebug?: boolean | undefined;
  /** Injected manifest (tests); default fetches `art/manifest.json`. */
  art?: ArtManifest | undefined;
}

const PROBE_FRAMES = 60;
const DEVICE_SHOW_FRAMES = 90;
const LAST_TRACK_KEY = 'trials.lastTrack';
const TOUCH_SETTLE_S = 3;

export function isPhone(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.innerWidth, window.innerHeight) < 500;
}

export function dprCap(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isPhone() ? 1.5 : 2);
}

export type AppScreen = FrontScreen | 'run';

export class App {
  private readonly game: Game;
  private readonly hud: DomHud;
  private readonly audio: AudioSystem | undefined;
  private readonly mux = new InputMux();
  private readonly touch: TouchInput;
  private readonly sfx: UiSfx;
  private readonly art: ArtManifest;
  private readonly title: TitleScreen;
  private readonly menu: MainMenuScreen;
  private readonly tracksScreen: TrackSelectScreen;
  private readonly settings: SettingsScreen;
  private readonly credits: CreditsScreen;
  private readonly pause: PauseMenu;
  private readonly bestTimes: BestTimes;
  private readonly tracks: TrackDef[];
  private screen: AppScreen = 'title';
  private qualityChoice: QualityChoice;
  private soundOn: boolean;
  private volume: number;
  private ghostOn: boolean;
  private probe: number[] = [];
  private probeArmed = false;
  private probeDone = false;
  private lastNow = 0;
  private raf = 0;
  private audioUnlocked = false;
  private lastTrackId: string | null = null;
  /** Seconds of riding since the last GO (touch zones settle at 3 s). */
  private rideSeconds = 0;
  private settled = false;

  constructor(private readonly o: AppOptions) {
    this.game = o.game;
    this.hud = o.hud;
    this.audio = o.audio;
    this.bestTimes = o.bestTimes;
    this.tracks = listTrackIds()
      .map((id) => getTrack(id))
      .filter((t): t is TrackDef => t !== undefined);
    try {
      this.lastTrackId = localStorage.getItem(LAST_TRACK_KEY);
    } catch {
      this.lastTrackId = null;
    }

    this.touch = new TouchInput(o.uiRoot, { debug: o.touchDebug ?? false });
    this.mux.add(new KeyboardInput()).add(new GamepadInput()).add(this.touch);
    this.mux.onDeviceChange = (d) => this.onDevice(d);

    this.qualityChoice = loadQualityOverride();
    this.soundOn = loadSoundEnabled();
    this.volume = loadVolume();
    this.ghostOn = loadGhostEnabled();
    this.sfx = new UiSfx(this.audio as { context?: AudioContext | null } | undefined);
    this.sfx.setEnabled(this.soundOn);
    this.sfx.setVolume(this.volume);
    this.audio?.setMasterVolume(this.soundOn ? this.volume : 0);
    this.art = o.art ?? new ArtManifest();
    if (!this.art.ready) void this.art.load();
    this.art.whenReady(() => {
      for (const m of ['bronze', 'silver', 'gold', 'platinum'] as const) {
        const e = this.art.medal(m);
        if (e) void this.art.probe(e.src).then((ok) => ok && this.hud.setMedalArt({ [m]: e.src }));
      }
    });

    const bestOf = (id: string) => this.bestTimes.get(id);
    const state = (): FrontState => ({
      quality: this.qualityChoice,
      sound: this.soundOn,
      volume: this.volume,
      ghost: this.ghostOn,
      rider: o.models.rider,
      bike: o.models.bike,
      dev: o.dev ?? false,
      lastPlayed: this.lastTrackId,
      models: o.modelsSupported ?? false,
    });
    const cb = {
      play: (id: string) => this.play(id),
      timeAttack: (id: string) => {
        this.sfx.launch();
        this.play(id);
      },
      goto: (s: FrontScreen) => this.goto(s),
      setQuality: (q: QualityChoice) => this.chooseQuality(q),
      setSound: (on: boolean) => {
        this.soundOn = on;
        saveSoundEnabled(on);
        this.sfx.setEnabled(on);
        this.audio?.setMasterVolume(on ? this.volume : 0);
      },
      setVolume: (v: number) => {
        this.volume = v;
        saveVolume(v);
        this.sfx.setVolume(v);
        this.audio?.setMasterVolume(this.soundOn ? v : 0);
      },
      setGhost: (on: boolean) => {
        this.ghostOn = on;
        saveGhostEnabled(on);
        this.game.setGhostEnabled(on);
      },
      setModel: (which: 'rider' | 'bike', v: ModelChoice) => {
        saveModelChoice(which, v);
        o.models[which] = v;
        const models = { rider: loadModelChoice('rider'), bike: loadModelChoice('bike') };
        const applied = o.applyModels?.(models) ?? false;
        if (!applied) {
          // Renderer is constructed once: reload without model params so the stored choice wins.
          const url = new URL(location.href);
          url.searchParams.delete('rider');
          url.searchParams.delete('bike');
          location.replace(url.toString());
        }
      },
      resetProgress: () => {
        this.bestTimes.clear();
        this.lastTrackId = null;
        try {
          localStorage.removeItem(LAST_TRACK_KEY);
        } catch {
          /* storage unavailable */
        }
        this.game.setGhostEnabled(this.ghostOn);
      },
    };

    this.title = new TitleScreen(o.uiRoot, this.art, () => this.goto('menu'));
    this.menu = new MainMenuScreen(o.uiRoot, this.sfx, cb, bestOf, state);
    this.tracksScreen = new TrackSelectScreen(o.uiRoot, this.sfx, this.art, cb, bestOf, state);
    this.settings = new SettingsScreen(o.uiRoot, this.sfx, cb, state);
    this.credits = new CreditsScreen(o.uiRoot, this.sfx, cb);
    this.pause = new PauseMenu(o.uiRoot, this.sfx, {
      resume: () => this.resume(),
      restartTrack: () => {
        this.resume();
        this.game.restartFromStart();
      },
      quit: () => this.quit(),
      ...(o.modelsSupported
        ? {
            models: {
              get: () => ({ rider: o.models.rider, bike: o.models.bike }),
              set: (which: 'rider' | 'bike', v: ModelChoice) => {
                this.sfx.tick();
                cb.setModel(which, v);
              },
            },
          }
        : {}),
    });
    mountRotatePrompt(o.uiRoot);
    this.menu.setTracks(shipTracks(this.tracks, o.dev ?? false));

    this.hud.onAction = (a) => {
      if (a === 'retry') this.game.restartFromStart();
      else if (a === 'next') this.play(this.nextTrackId());
      else if (a === 'menu') this.quit();
      else if (a === 'pause') this.togglePause();
    };

    this.game.setGhostEnabled(this.ghostOn);
    if (this.qualityChoice !== 'auto') {
      this.game.setQuality(this.qualityChoice);
      this.probeDone = true;
    }

    const unlock = (): void => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      void this.audio?.unlock();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inRun() && !this.game.paused()) this.togglePause();
    });
    window.addEventListener('resize', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    this.fit();

    this.game.onPhase = (phase) => {
      if (phase === 'riding' && !this.probeDone) this.probeArmed = true; // probe the first 60 frames after GO
    };
  }

  // -- flow -------------------------------------------------------------------

  start(): void {
    if (this.o.initialTrack && getTrack(this.o.initialTrack)) this.play(this.o.initialTrack);
    else {
      this.loadBackdrop(BACKDROP_TRACK);
      this.goto('title');
    }
    this.lastNow = performance.now();
    const frame = (now: number): void => {
      const elapsed = Math.min(0.25, Math.max(0, (now - this.lastNow) / 1000));
      this.lastNow = now;
      this.tickFrame(elapsed);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Current front-end screen or `run`. */
  currentScreen(): AppScreen {
    return this.screen;
  }

  /**
   * Put a track under the menus: loaded, bike at its start, phase `menu` so
   * nothing ticks. The countdown cue the load emits is muted for the moment.
   */
  private loadBackdrop(id: string): void {
    const vol = this.soundOn ? this.volume : 0;
    this.audio?.setMasterVolume(0);
    if (this.game.currentTrack?.id === id) this.game.startRun();
    else this.game.loadTrack(id);
    this.game.toMenu();
    this.hud.hideResults();
    setTimeout(() => this.audio?.setMasterVolume(vol), 60);
  }

  goto(screen: FrontScreen): void {
    this.screen = screen;
    this.touch.setEnabled(false);
    this.pause.hide();
    this.title.hide();
    this.menu.hide();
    this.tracksScreen.hide();
    this.settings.hide();
    this.credits.hide();
    const scene = this.o.sceneRoot;
    scene?.classList.toggle('drift', screen === 'title' || screen === 'menu');
    scene?.classList.toggle('dim', screen !== 'title');
    const dev = this.mux.activeDevice();
    if (screen === 'title') this.title.show();
    else if (screen === 'menu') {
      this.menu.setDevice(dev);
      this.menu.show();
    } else if (screen === 'tracks') {
      this.tracksScreen.build(this.tracks);
      this.tracksScreen.setDevice(dev);
      this.tracksScreen.show();
    } else if (screen === 'settings') {
      this.settings.setDevice(dev);
      this.settings.show();
    } else this.credits.show();
  }

  private play(id: string): void {
    if (!this.game.loadTrack(id)) return;
    this.screen = 'run';
    this.lastTrackId = id;
    try {
      localStorage.setItem(LAST_TRACK_KEY, id);
    } catch {
      /* storage unavailable */
    }
    this.o.sceneRoot?.classList.remove('drift', 'dim');
    this.title.hide();
    this.menu.hide();
    this.settings.hide();
    this.credits.hide();
    // Track select hides itself after its fly-up (same-scene handoff).
    if (!this.tracksScreen.visible) this.tracksScreen.hide();
    this.pause.hide();
    this.game.setPaused(false);
    this.touch.setEnabled(true);
  }

  private quit(): void {
    this.game.setPaused(false);
    this.loadBackdrop(this.game.currentTrack?.id ?? BACKDROP_TRACK);
    this.goto('menu');
  }

  private resume(): void {
    this.pause.hide();
    this.game.setPaused(false);
    this.lastNow = performance.now();
  }

  private togglePause(): void {
    if (!this.inRun()) return;
    if (this.game.paused()) this.resume();
    else {
      this.game.setPaused(true);
      const t = this.game.currentTrack;
      this.pause.show({ trackName: t?.name ?? '', tier: t?.tier ?? '', runTime: this.game.runTime(), faults: this.game.faults() });
    }
  }

  private inRun(): boolean {
    return this.screen === 'run' && this.game.phase() !== 'menu';
  }

  private nextTrackId(): string {
    const ship = shipTracks(this.tracks, this.o.dev ?? false);
    const i = ship.findIndex((t) => t.id === this.lastTrackId);
    return ship[(i + 1) % ship.length]?.id ?? ship[0]!.id;
  }

  // -- per frame ----------------------------------------------------------------

  private tickFrame(elapsed: number): void {
    const { frame, meta } = this.mux.poll();
    if (this.screen === 'title') {
      // Any key / pad button / touch (the title root also listens to pointerdown).
      if (meta.active || meta.confirm || meta.pause || meta.back || frame.throttle > 0 || frame.brake > 0 || frame.lean !== 0) this.title.anyInput();
    } else if (this.screen !== 'run') {
      const s = this.screen === 'menu' ? this.menu : this.screen === 'tracks' ? this.tracksScreen : this.screen === 'settings' ? this.settings : this.credits;
      if (meta.navX || meta.navY) s.nav(meta.navX, meta.navY);
      if (meta.confirm) s.confirm();
      else if (meta.back || meta.pause) s.back();
    } else if (this.pause.visible) {
      if (meta.navX || meta.navY) this.pause.move(meta.navX, meta.navY);
      if (meta.pause || meta.back) this.resume();
      else if (meta.confirm) this.pause.confirm();
    } else {
      if (meta.pause) this.togglePause();
      this.game.setInput(frame);
    }
    const dev = this.mux.activeDevice();
    if (dev) this.hud.setDevice(dev, this.mux.idleFrames() < DEVICE_SHOW_FRAMES);

    this.game.advance(elapsed);
    if (this.probeArmed && !this.probeDone && !this.game.paused()) this.recordProbe(elapsed * 1000);
    this.settleTouch(elapsed);
  }

  /** Zone labels at full strength for the first 3 s after GO, then ~30 %; re-armed by every countdown / menu. */
  private settleTouch(elapsed: number): void {
    const phase = this.game.phase();
    if (phase === 'menu' || phase === 'countdown') {
      this.rideSeconds = 0;
      if (this.settled) this.touch.setSettled((this.settled = false));
      return;
    }
    if (this.game.paused()) return;
    this.rideSeconds += elapsed;
    if (!this.settled && this.rideSeconds >= TOUCH_SETTLE_S) this.touch.setSettled((this.settled = true));
  }

  private onDevice(d: InputDevice): void {
    this.touch.setVisible(d === 'touch');
    this.hud.setDevice(d, true);
    for (const s of [this.menu, this.tracksScreen, this.settings]) s.setDevice(d);
  }

  // -- quality ------------------------------------------------------------------

  /** Median RAF interval over the first 60 frames after GO → tier (60 fps high, 30 fps medium, else low). */
  private recordProbe(frameMs: number): void {
    this.probe.push(frameMs);
    if (this.probe.length < PROBE_FRAMES) return;
    this.probeDone = true;
    const sorted = [...this.probe].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1] ?? 0;
    const tier: QualityTier = median <= 17.5 ? 'high' : median <= 34 ? 'medium' : 'low';
    if (this.qualityChoice === 'auto') this.game.setQuality(tier);
    this.probe = [];
    this.probeArmed = false;
  }

  private chooseQuality(q: QualityChoice): void {
    this.qualityChoice = q;
    saveQualityOverride(q);
    if (q === 'auto') {
      this.probeDone = false;
      this.probe = [];
      this.probeArmed = this.game.phase() === 'riding';
    } else {
      this.probeDone = true;
      this.game.setQuality(q);
    }
  }

  private fit(): void {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    this.o.resize(w, h, dprCap());
  }
}
