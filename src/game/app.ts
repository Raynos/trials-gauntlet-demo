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
import type { BikeClass, InputDevice, QualityTier, RunResult, TrackDef } from '../core/types';
import type { AudioSystem } from '../audio';
import { getTrack, listTrackIds } from '../tracks';
import {
  ArtManifest,
  BUILD_STAMP,
  CreditsScreen,
  GarageScreen,
  MainMenuScreen,
  OnboardingCard,
  PauseMenu,
  PerfOverlay,
  SettingsScreen,
  TitleScreen,
  TrackSelectScreen,
  UiSfx,
  UpdateToast,
  loadBikeChoice,
  loadGhostEnabled,
  loadModelChoice,
  loadOnboarded,
  loadQualityOverride,
  loadSoundEnabled,
  loadTelemetryEnabled,
  loadVolume,
  mountRotatePrompt,
  saveBikeChoice,
  saveGhostEnabled,
  saveModelChoice,
  saveOnboarded,
  saveQualityOverride,
  saveSoundEnabled,
  saveTelemetryEnabled,
  saveVolume,
  shipTracks,
  tierUnlocked,
  type BestTimes,
  type DomHud,
  type FrontScreen,
  type FrontState,
  type ModelChoice,
  type QualityChoice,
} from '../ui';
import { applyOrientation } from '../ui/orientation';
import { BACKDROP_TRACK } from './flow';
import { Percentiles, type Game } from './game';
import { GamepadInput, InputMux, KeyboardInput, TouchInput } from './input';
import { defaultBikeForTier } from './rules';
import { RunCollector, RunLog } from './telemetry';

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
  /** `?perf=1`: fps / frame ms / physics µs / draw calls overlay top-left. */
  perf?: boolean | undefined;
  /** Bike class changed (garage preview or track launch): the renderer may repaint the hero (`setBikeClass`). */
  onBikeChange?: ((bike: BikeClass) => void) | undefined;
}

const PROBE_FRAMES = 60;
const DEVICE_SHOW_FRAMES = 90;
const LAST_TRACK_KEY = 'trials.lastTrack';
const TOUCH_SETTLE_S = 3;

/** Grace after a screen change during which menu buttons (confirm/back/nav) are ignored: the edge that changed screens must not act twice. */
const SCREEN_GRACE_MS = 150;

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
  private readonly garage: GarageScreen;
  private readonly onboard: OnboardingCard;
  private readonly toast: UpdateToast;
  private readonly perf: PerfOverlay | null;
  private readonly frameMs = new Percentiles(120);
  private readonly runLog = new RunLog();
  private readonly collector = new RunCollector();
  private telemetryOn: boolean;
  /** Garage choice (null = never picked: the per-tier default applies). */
  private bikeChoice: BikeClass | null;
  /** Bike class of the last launched track (medium's default, and what the Garage opens on). */
  private lastRidden: BikeClass | null = null;
  private qualityWhy: string;
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
  private screenAt = 0;
  private prevRestart = false;
  private prevThrottle = false;

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
    this.telemetryOn = loadTelemetryEnabled();
    this.bikeChoice = loadBikeChoice();
    this.qualityWhy = this.qualityChoice === 'auto' ? 'pending probe' : 'manual (settings)';
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
      bikeClass: this.bikeInEffect(),
      telemetry: this.telemetryOn,
      runlog: this.runLog.summary(),
      canShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
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
      setTelemetry: (on: boolean) => {
        this.telemetryOn = on;
        saveTelemetryEnabled(on);
      },
      copyRunLog: () => this.copyRunLog(),
      shareRunLog: () => this.shareRunLog(),
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
    this.credits = new CreditsScreen(o.uiRoot, this.sfx, cb, this.art);
    this.garage = new GarageScreen(o.uiRoot, this.sfx, this.art, {
      previewBike: (b) => this.applyBike(b, false),
      setBike: (b) => this.applyBike(b, true),
      back: () => this.goto('menu'),
    });
    this.onboard = new OnboardingCard(o.uiRoot, () => {
      saveOnboarded();
      this.game.setPaused(false);
      this.lastNow = performance.now();
    });
    this.toast = new UpdateToast(o.uiRoot, () => this.reloadForUpdate?.());
    this.perf = o.perf ? new PerfOverlay(o.uiRoot) : null;
    if (o.perf) this.game.perfTiming = true;
    this.pause = new PauseMenu(o.uiRoot, this.sfx, {
      resume: () => this.resume(),
      restartTrack: () => {
        // Hard cut (SPEC §6): overlay gone on the same frame the world resets.
        this.pause.hide();
        this.setOverlay(false);
        this.game.setPaused(false);
        this.lastNow = performance.now();
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

    // Telemetry: every fault is a death at the bike's x (the state after the faulting step).
    this.game.onEvent((e) => {
      if (e.type !== 'fault') return;
      const st = this.game.getState();
      this.collector.death(st.bike.pos.x, e.reason, st.checkpoint);
    });

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
    window.addEventListener('orientationchange', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    this.fit();

    this.game.onPhase = (phase, prev) => {
      if (phase === 'riding' && !this.probeDone) this.probeArmed = true; // probe the first 60 frames after GO
      if (phase !== 'finished' && !this.pause.visible) this.touch.setOverlay(false); // retry / next out of the results frame
      // First GO on this track load starts the run's telemetry window (full restarts keep it: time-to-clear is per track visit).
      if (phase === 'riding' && prev === 'countdown' && this.screen === 'run' && !this.collector.running) this.collector.begin();
    };
    // Results: NEXT TRACK is live only when the next track is unlocked (this clear may have unlocked it).
    this.game.onResults = (r) => {
      this.hud.setNextEnabled(this.nextTrackEnabled(), this.nextTrackName());
      this.touch.setOverlay(true);
      this.logRun(r);
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
  private loadBackdrop(id: string, fresh = false): void {
    const vol = this.soundOn ? this.volume : 0;
    this.audio?.setMasterVolume(0);
    if (!fresh && this.game.currentTrack?.id === id) this.game.startRun();
    else this.game.loadTrack(id);
    this.game.toMenu();
    this.hud.hideNow(); // no HUD frame (timer, "3" banner) under the title / menu
    setTimeout(() => this.audio?.setMasterVolume(vol), 60);
  }

  goto(screen: FrontScreen): void {
    this.screen = screen;
    this.screenAt = performance.now();
    this.touch.setEnabled(false);
    this.pause.hide();
    this.title.hide();
    this.menu.hide();
    this.tracksScreen.hide();
    this.settings.hide();
    this.credits.hide();
    this.garage.hide();
    const scene = this.o.sceneRoot;
    scene?.classList.toggle('drift', screen === 'title' || screen === 'menu');
    scene?.classList.toggle('dim', screen !== 'title' && screen !== 'garage');
    scene?.classList.toggle('garage', screen === 'garage');
    const dev = this.mux.activeDevice();
    if (screen === 'title') this.title.show();
    else if (screen === 'menu') {
      this.menu.setDevice(dev);
      this.menu.show();
    } else if (screen === 'garage') {
      this.garage.setDevice(dev);
      this.garage.show(this.bikeInEffect());
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
    const def = getTrack(id);
    if (!def) return;
    // Bike: the Garage choice when the player has made one, else the tier default (medium = last ridden).
    const bike = this.bikeChoice ?? defaultBikeForTier(def.tier, this.lastRidden);
    this.collector.abandon();
    if (!this.game.loadTrack(id, undefined, bike)) return;
    if (bike !== this.lastRidden) this.o.onBikeChange?.(bike);
    this.lastRidden = bike;
    this.screen = 'run';
    this.screenAt = performance.now();
    this.lastTrackId = id;
    try {
      localStorage.setItem(LAST_TRACK_KEY, id);
    } catch {
      /* storage unavailable */
    }
    this.o.sceneRoot?.classList.remove('drift', 'dim', 'garage');
    this.title.hide();
    this.menu.hide();
    this.garage.hide();
    this.settings.hide();
    this.credits.hide();
    // Track select hides itself after its fly-up (same-scene handoff).
    if (!this.tracksScreen.visible) this.tracksScreen.hide();
    this.pause.hide();
    this.setOverlay(false);
    this.game.setPaused(false);
    this.touch.setEnabled(true);
    this.touch.setOverlay(false);
    this.hud.setNextEnabled(this.nextTrackEnabled(), this.nextTrackName());
    // First launch ever: one card (gas / brake / lean), the countdown waits behind it.
    if (!loadOnboarded()) {
      this.game.setPaused(true);
      this.onboard.show(this.mux.activeDevice());
    }
  }

  // -- garage / bike ------------------------------------------------------------

  /** Class the next launch would ride: the Garage choice, else the tier default of the last-played (or first) track. */
  private bikeInEffect(): BikeClass {
    if (this.bikeChoice) return this.bikeChoice;
    const t = this.tracks.find((x) => x.id === this.lastTrackId) ?? shipTracks(this.tracks, this.o.dev ?? false)[0];
    return defaultBikeForTier(t?.tier ?? 'beginner', this.lastRidden);
  }

  /**
   * Garage: focusing a card previews it (the menu backdrop reloads with that class, renderer
   * repaints), confirming commits it (`trials.bikeClass`). Leaving without confirming previews back.
   */
  private applyBike(b: BikeClass, commit: boolean): void {
    if (commit) {
      this.bikeChoice = b;
      saveBikeChoice(b);
    }
    if (this.game.currentBike !== b) {
      const vol = this.soundOn ? this.volume : 0;
      this.audio?.setMasterVolume(0);
      this.game.setBike(b);
      if (this.screen !== 'run') this.hud.hideNow();
      setTimeout(() => this.audio?.setMasterVolume(vol), 60);
    }
    this.o.onBikeChange?.(b);
  }

  // -- telemetry ------------------------------------------------------------------

  private logRun(r: RunResult): void {
    if (!this.collector.running) return;
    const entry = this.collector.finish({
      track: r.trackId,
      bike: r.bike ?? 'rookie',
      faults: r.faults,
      time: r.time,
      medal: r.medal,
      quality: this.game.qualityTier,
      qualityWhy: this.qualityWhy,
      build: BUILD_STAMP.replace(/^build /, ''),
    });
    if (this.telemetryOn) this.runLog.append(entry);
  }

  private async copyRunLog(): Promise<boolean> {
    const json = this.runLog.exportJson(BUILD_STAMP);
    try {
      await navigator.clipboard.writeText(json);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  private async shareRunLog(): Promise<boolean> {
    if (typeof navigator.share !== 'function') return this.copyRunLog();
    try {
      await navigator.share({ title: 'Trials Gauntlet run log', text: this.runLog.exportJson(BUILD_STAMP) });
      return true;
    } catch {
      return false; // AbortError (sheet dismissed) or unsupported payload
    }
  }

  // -- service-worker update toast -----------------------------------------------

  private reloadForUpdate: (() => void) | null = null;

  /** A newer build is installed and waiting: show "Update available → Reload"; `reload` activates it. */
  showUpdate(reload: () => void): void {
    this.reloadForUpdate = reload;
    this.toast.show();
  }

  /**
   * Run → main menu, by exactly the cold-boot path: the showcase track is
   * loaded afresh (`loadTrack` → renderer `setTrack`: world rebuilt, particles
   * and finish flash cleared, camera cut to the idle framing), phase `menu`,
   * then the menu fades in over it. Re-arming the finished track in place left
   * its frozen finish state under the menu (user screenshot, round 3).
   */
  private quit(): void {
    this.game.setPaused(false);
    this.pause.hide();
    this.setOverlay(false);
    this.hud.hideResults();
    this.touch.setEnabled(false);
    this.loadBackdrop(BACKDROP_TRACK, true);
    this.goto('menu');
  }

  /** Resume: the game unpauses on this frame; the overlay fades over --t1 while the HUD fades back over --t2 (SPEC §6). */
  private resume(): void {
    this.pause.fadeOut();
    this.setOverlay(false);
    this.game.setPaused(false);
    this.lastNow = performance.now();
  }

  private togglePause(): void {
    if (!this.inRun() || this.onboard.visible) return;
    if (this.game.paused()) this.resume();
    else {
      this.game.setPaused(true);
      const t = this.game.currentTrack;
      const st = this.game.getState();
      this.pause.setDevice(this.mux.activeDevice() ?? 'keyboard');
      this.pause.show({
        trackName: t?.name ?? '',
        tier: t?.tier ?? '',
        runTime: this.game.runTime(),
        faults: this.game.faults(),
        phase: this.game.phase(),
        checkpoint: st.checkpoint,
        checkpointCount: t?.checkpoints.length ?? 0,
      });
      this.setOverlay(true);
    }
  }

  /** Pause overlay up: HUD top band hidden, touch layer inert (a tile tap must not rev), scene dimmed 50 %. */
  private setOverlay(on: boolean): void {
    this.hud.setOverlay(on);
    this.touch.setOverlay(on);
    this.o.sceneRoot?.classList.toggle('dim', on && this.screen === 'run');
  }

  private inRun(): boolean {
    return this.screen === 'run' && this.game.phase() !== 'menu';
  }

  /** The next ship track exists, is not this one, and its tier is unlocked (src/ui/progress.ts rule). */
  private nextTrackEnabled(): boolean {
    const ship = shipTracks(this.tracks, this.o.dev ?? false);
    const i = ship.findIndex((t) => t.id === this.lastTrackId);
    const next = ship[i + 1];
    if (!next) return false;
    return tierUnlocked(this.tracks, next.tier, (id) => this.bestTimes.get(id)?.medal ?? null, this.o.dev ?? false);
  }

  private nextTrackId(): string {
    const ship = shipTracks(this.tracks, this.o.dev ?? false);
    const i = ship.findIndex((t) => t.id === this.lastTrackId);
    return ship[(i + 1) % ship.length]?.id ?? ship[0]!.id;
  }

  private nextTrackName(): string | null {
    const ship = shipTracks(this.tracks, this.o.dev ?? false);
    const i = ship.findIndex((t) => t.id === this.lastTrackId);
    return ship[i + 1]?.name ?? null;
  }

  // -- per frame ----------------------------------------------------------------

  private tickFrame(elapsed: number): void {
    if (this.perf) this.perf.root.hidden = !(this.screen === 'run' && !this.pause.visible && this.game.phase() !== 'finished' && !this.onboard.visible);
    const { frame, meta } = this.mux.poll();
    const restartEdge = frame.restart === true && !this.prevRestart;
    const throttleEdge = frame.throttle > 0 && !this.prevThrottle;
    if (performance.now() - this.screenAt < SCREEN_GRACE_MS && this.screen !== 'run') {
      // The key / tap that just changed screens must not also act on the new one.
      meta.confirm = meta.back = meta.pause = false;
      meta.navX = meta.navY = 0;
    }
    if (this.onboard.visible) {
      // First-launch card: any confirm / back / gas edge dismisses it; nothing reaches the game meanwhile.
      if (meta.confirm || meta.back || meta.pause || throttleEdge || restartEdge) this.onboard.dismiss();
      this.prevRestart = frame.restart === true;
      this.prevThrottle = frame.throttle > 0;
      this.game.advance(0);
      return;
    }
    if (this.screen === 'title') {
      // Any key / pad button / touch (the title root also listens to pointerdown).
      if (meta.active || meta.confirm || meta.pause || meta.back || frame.throttle > 0 || frame.brake > 0 || frame.lean !== 0) this.title.anyInput();
    } else if (this.screen !== 'run') {
      const s = this.screen === 'menu' ? this.menu : this.screen === 'garage' ? this.garage : this.screen === 'tracks' ? this.tracksScreen : this.screen === 'settings' ? this.settings : this.credits;
      if (meta.navX || meta.navY) s.nav(meta.navX, meta.navY);
      if (meta.confirm) s.confirm();
      else if (meta.back || meta.pause) s.back();
    } else if (this.pause.visible) {
      if (meta.navX || meta.navY) this.pause.move(meta.navX, meta.navY);
      if (meta.pause || meta.back) this.resume();
      else if (meta.confirm) this.pause.confirm();
      else if (restartEdge) this.pause.restartShortcut(); // R (keyboard) = RESTART while paused; B is back → resume
    } else if (this.game.phase() === 'finished') {
      // Results (SPEC §5): Esc/Start = MENU from the line on; once the tiles are up (0.6 s) ←/→ move, Enter/A pick,
      // a throttle *edge* is retry (never a held gas across the line); R / B / Backspace retry through the game's own
      // restart edge at any time, so retry stays one press from the moment the timer freezes.
      const live = this.hud.resultsInteractive();
      if (live && meta.navX) this.hud.resultsMove(meta.navX);
      if (meta.pause) this.quit();
      else if (live && meta.confirm) this.hud.resultsConfirm();
      else if (live && throttleEdge) this.game.restartFromStart();
      else this.game.setInput(frame);
    } else {
      if (meta.pause) this.togglePause();
      this.game.setInput(frame);
    }
    this.prevRestart = frame.restart === true;
    this.prevThrottle = frame.throttle > 0;
    const dev = this.mux.activeDevice();
    if (dev) this.hud.setDevice(dev, this.mux.idleFrames() < DEVICE_SHOW_FRAMES);

    this.game.advance(elapsed);
    if (this.probeArmed && !this.probeDone && !this.game.paused()) this.recordProbe(elapsed * 1000);
    this.settleTouch(elapsed);
    if (this.inRun() && !this.game.paused()) {
      this.collector.frame(elapsed * 1000);
      this.frameMs.push(elapsed * 1000);
    }
    this.perf?.update(performance.now(), () => ({
      frameMs: this.frameMs.stats(),
      physicsUs: this.game.physicsUs.stats(),
      stats: this.safeStats(),
      quality: this.game.qualityTier,
      qualityWhy: this.qualityWhy,
      dpr: dprCap(),
    }));
  }

  private safeStats(): ReturnType<Game['stats']> | null {
    try {
      return this.game.stats();
    } catch {
      return null;
    }
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
    this.garage.setDevice(d);
    this.onboard.setDevice(d);
    this.pause.setDevice(d);
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
    if (this.qualityChoice === 'auto') {
      this.game.setQuality(tier);
      this.qualityWhy = `probe median ${median.toFixed(1)} ms`;
    }
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
      this.qualityWhy = 'pending probe';
    } else {
      this.probeDone = true;
      this.game.setQuality(q);
      this.qualityWhy = 'manual (settings)';
    }
  }

  /** Viewport → renderer size (+ the short/narrow layout classes, src/ui/orientation.ts). Rotate-to-play: portrait shows the prompt. */
  private fit(): void {
    const size = applyOrientation();
    this.o.resize(size.w, size.h, dprCap());
  }
}
