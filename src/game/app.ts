/**
 * Browser app shell: front end (main menu → track select / garage / settings /
 * credits) ⇄ runs (countdown → riding → pause / results), input mux → game,
 * RAF driver, quality probe, mobile rules (DPR cap, audio unlock, visibility
 * pause). Nothing in here touches determinism: the game only ever sees
 * quantized InputFrames and simulated seconds.
 *
 * Flow (`App.screen`): boot lands on `menu` (no title step) → `tracks` |
 * `garage` | `settings` | `credits`; `run` (countdown…) → pause overlay →
 * results. The menu renders over the live 3D scene with `BACKDROP_TRACK`
 * loaded in the `menu` phase (the key art plate covers it once decoded).
 */
import type { BikeClass, CameraOverride, InputDevice, PhysicsVersion, QualityTier, ReplayCameraMode, RiderOutfit, RunResult, TrackDef, TrialsHook } from '../core/types';
import type { AudioScene, AudioSystem } from '../audio';
import { getTrack, listTrackIds } from '../tracks';
import {
  ArtManifest,
  BUILD_STAMP,
  CreditsScreen,
  GarageScreen,
  LabPanel,
  LastRuns,
  MainMenuScreen,
  OnboardingCard,
  PauseMenu,
  PerfOverlay,
  ReplayBar,
  ReviewPanel,
  ReviewPickScreen,
  SettingsScreen,
  TraceBars,
  TrackSelectScreen,
  UiSfx,
  UpdateToast,
  loadBikeChoice,
  loadGhostEnabled,
  loadModelChoice,
  loadOnboarded,
  loadQualityOverride,
  loadHeldTier,
  saveHeldTier,
  loadFpsChoice,
  saveFpsChoice,
  type FpsChoice,
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
  type BestEntry,
  type BestTimes,
  type DomHud,
  type FrontScreen,
  type FrontState,
  type ModelChoice,
  type FrontCallbacks,
  type QualityChoice,
} from '../ui';
import { tickLive } from '../ui/live';
import { applyOrientation } from '../ui/orientation';
import { loadRiderOutfit, saveRiderOutfit } from '../ui/outfit';
import { copyText } from '../ui/clipboard';
import { Bench, type BenchOptions, type FrameSplit } from './bench';
import { FrameCadence } from './cadence';
import { BACKDROP_TRACK } from './flow';
import { Percentiles, type Game } from './game';
import { GamepadInput, InputMux, KeyboardInput, TouchInput } from './input';
import { NavLog, type NavContext } from './navlog';
import { ReplaySession, type ReplaySource } from './replay';
import { ReviewSession } from './review';
import { defaultBikeForTier } from './rules';
import { BenchLog, RunCollector, RunLog } from './telemetry';

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
  /** Outfit resolved at boot (including a URL override), shared with the renderer. */
  riderOutfit?: RiderOutfit | undefined;
  /** A committed cosmetic choice; changes clothing without restarting the bike or track. */
  onRiderOutfitChange?: ((outfit: RiderOutfit) => Promise<boolean>) | undefined;
  /** Garage round: stage the hero on the renderer's workshop set while the garage screen is up (`setGarageStage`). */
  onGarageStage?: ((on: boolean) => void) | undefined;
  /** Garage round: the model explorer's orbit camera (`setCameraOverride`); null = the menu framing. */
  setCameraOverride?: ((o: CameraOverride | null) => void) | undefined;
  /** `?trace=1`: live InputFrame bars under the HUD timer (filming the phone). */
  trace?: boolean | undefined;
  /** `?lab=1`: the physics lab HUD on every track (it is automatic on `lab-*` tracks). */
  lab?: boolean | undefined;
  /** Solver in effect + exported versions (hidden dev Settings row, `?physics=v1|v2`). */
  physics?: { current: 'default' | 'v1' | 'v2'; available: ('v1' | 'v2')[]; live?: PhysicsVersion | undefined } | undefined;
  /** `?bench=1`: the on-device benchmark (src/game/bench.ts) — a START card over the menu, the scenarios, the report. */
  bench?: BenchOptions | undefined;
  /** `?review=<track>`: deep link straight into the level reviewer on that track (docs/design/game.md §21). */
  initialReview?: string | undefined;
}

const DEVICE_SHOW_FRAMES = 90;
const LAST_TRACK_KEY = 'trials.lastTrack';
const TOUCH_SETTLE_S = 3;

/** Grace after a screen change during which the polled menu buttons (keyboard / pad confirm, back, nav) are ignored: the edge that changed screens must not act twice. */
const SCREEN_GRACE_MS = 250;

export function isPhone(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.innerWidth, window.innerHeight) < 500;
}

export function dprCap(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isPhone() ? 1.5 : 2);
}

export type AppScreen = FrontScreen | 'run' | 'replay' | 'reviewer';

/** Physics lab HUD + ghost of the last attempt: every `lab-*` track (MEGA_PLAN P0 §3), or any track with `?lab=1`. */
/**
 * The physics lab HUD (gauges, traces, last-hop readout) is a developer instrument: it shows only with
 * `?lab=1`, never automatically on the lab tracks — the user found it noise over the results panel.
 */
export function isLabTrack(id: string, force = false): boolean {
  void id;
  return force;
}

export class App {
  private readonly game: Game;
  private readonly hud: DomHud;
  private readonly audio: AudioSystem | undefined;
  private readonly mux = new InputMux();
  private readonly touch: TouchInput;
  private readonly sfx: UiSfx;
  private readonly art: ArtManifest;
  private readonly menu: MainMenuScreen;
  private readonly tracksScreen: TrackSelectScreen;
  private readonly settings: SettingsScreen;
  private readonly credits: CreditsScreen;
  private readonly pause: PauseMenu;
  private readonly garage: GarageScreen;
  private readonly onboard: OnboardingCard;
  private readonly toast: UpdateToast;
  private readonly perf: PerfOverlay | null;
  private readonly lastRuns = new LastRuns();
  private readonly replayBar: ReplayBar;
  private readonly replay: ReplaySession;
  private readonly reviewPick: ReviewPickScreen;
  private readonly reviewPanel: ReviewPanel;
  private readonly review: ReviewSession;
  private readonly labPanel: LabPanel;
  private readonly traceBars: TraceBars | null;
  /** Where the viewer returns to on exit, and the finished run it interrupted (restored so the results panel comes back). */
  private replayReturn: { from: 'results'; snap: ReturnType<Game['snapshot']>; counters: ReturnType<Game['counters']>; result: RunResult | null } | { from: 'tracks' } | null = null;
  private replayMuted = false;
  private readonly frameMs = new Percentiles(120);
  private readonly runLog = new RunLog();
  private readonly benchLog = new BenchLog();
  private readonly bench: Bench | null;
  /** Per-frame split of `tickFrame` (reused; `?bench=1` reads it after every rendered frame). */
  private readonly frameSplit: FrameSplit = { totalMs: 0, pollMs: 0, advanceMs: 0, physicsMs: 0, ticks: 0, hudMs: 0, audioMs: 0, submitMs: 0, otherMs: 0 };
  /** Bench: cap forced for the current scenario (else the Settings / phone rule). */
  private capOverride: 30 | 60 | null = null;
  /** Bench `&no=touch`: the layer stays hidden whatever the device. */
  private touchHidden = false;
  private readonly cadence = new FrameCadence();
  private readonly collector = new RunCollector();
  /** Navigation instrument (docs/tasks/touch-navigation-invariant.md §1): what fired quit / pause / goto / restart, from where. */
  readonly navLog = new NavLog();
  /** Set by the app right before it asks the game for a full restart, so the game's `restart` event names the trigger. */
  private restartVia: string | null = null;
  private telemetryOn: boolean;
  /** Garage choice (null = never picked: the per-tier default applies). */
  private bikeChoice: BikeClass | null;
  private riderOutfit: RiderOutfit;
  /** Bike class of the last launched track (medium's default, and what the Garage opens on). */
  private lastRidden: BikeClass | null = null;
  /** The governor's last decision string; lives on the game so `hook.info().qualityWhy` and `?perf=1` read one value. */
  private get qualityWhy(): string {
    return this.game.qualityWhy;
  }
  private set qualityWhy(v: string) {
    this.game.qualityWhy = v;
  }
  private readonly bestTimes: BestTimes;
  private readonly tracks: TrackDef[];
  private screen: AppScreen = 'menu';
  private qualityChoice: QualityChoice;
  /** Frame cap (Settings · Frame rate). 'auto' = 30 on phones, 60 elsewhere; the RAF loop skips frames to match. */
  private fpsChoice: FpsChoice;
  private lastRenderAt = 0;
  private capInEffect = 0;
  /** Lightweight FPS meter, top-right, always on: rendered frames per second and the quality tier letter. */
  private readonly fpsEl: HTMLDivElement;
  private fpsFrames = 0;
  private fpsWindowAt = 0;
  private fpsWorstMs = 0;
  private soundOn: boolean;
  private volume: number;
  private ghostOn: boolean;
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
  /** Last scene handed to `audio.setScene` (music bed): deduplicated, optional on the interface. */
  private audioScene: AudioScene | null = null;

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

    // No click swallow here: a new screen takes pointers only once it is `.live` (src/ui/live.ts, >= 150 ms
    // after it is drawn), so the tail of the tap that changed screens cannot land on it.
    this.touch = new TouchInput(o.uiRoot, { debug: o.touchDebug ?? false });
    this.mux.add(new KeyboardInput()).add(new GamepadInput()).add(this.touch);
    this.mux.onDeviceChange = (d) => this.onDevice(d);

    this.qualityChoice = loadQualityOverride();
    this.fpsChoice = loadFpsChoice();
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fpsmeter';
    this.fpsEl.textContent = '-- fps';
    o.uiRoot.appendChild(this.fpsEl);
    this.soundOn = loadSoundEnabled();
    this.volume = loadVolume();
    this.ghostOn = loadGhostEnabled();
    this.telemetryOn = loadTelemetryEnabled();
    this.bikeChoice = loadBikeChoice();
    this.riderOutfit = o.riderOutfit ?? loadRiderOutfit();
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

    const bestOf = (id: string) => this.playableBest(this.bestTimes.get(id));
    const state = (): FrontState => ({
      quality: this.qualityChoice,
      fps: this.fpsChoice,
      fpsInEffect: this.frameCapHz(),
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
      ...(o.physics ? { physics: o.physics } : {}),
    });
    const cb: FrontCallbacks = {
      play: (id: string) => this.play(id),
      timeAttack: (id: string) => {
        this.sfx.launch();
        this.play(id);
      },
      goto: (s: FrontScreen) => this.goto(s),
      setQuality: (q: QualityChoice) => this.chooseQuality(q),
      setFps: (v: FpsChoice) => {
        this.fpsChoice = v;
        saveFpsChoice(v);
      },
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
      setPhysics: (v: 'default' | 'v1' | 'v2') => {
        const url = new URL(location.href);
        if (v === 'default') url.searchParams.delete('physics');
        else url.searchParams.set('physics', v);
        location.replace(url.toString());
      },
      watchPb: (id: string) => {
        const pb = this.playableBest(this.bestTimes.get(id));
        if (pb?.recording) this.enterReplay({ json: pb.recording, kind: 'pb', isPb: true }, { from: 'tracks' });
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

    cb.outfits = {
      get: () => this.riderOutfit,
      set: async (outfit) => {
        if (!await this.o.onRiderOutfitChange?.(outfit)) return false;
        this.riderOutfit = outfit;
        saveRiderOutfit(outfit);
        o.models.rider = 'gltf';
        saveModelChoice('rider', 'gltf');
        return true;
      },
    };

    this.menu = new MainMenuScreen(o.uiRoot, this.sfx, this.art, cb, bestOf, state);
    this.tracksScreen = new TrackSelectScreen(o.uiRoot, this.sfx, this.art, cb, bestOf, state, (id, bike) => this.bestTimes.board(id, bike));
    this.settings = new SettingsScreen(o.uiRoot, this.sfx, cb, state);
    this.credits = new CreditsScreen(o.uiRoot, this.sfx, cb, this.art);
    this.garage = new GarageScreen(o.uiRoot, this.sfx, this.art, {
      previewBike: (b) => this.applyBike(b, false),
      setBike: (b) => this.applyBike(b, true),
      setOutfit: (outfit) => cb.outfits!.set(outfit),
      back: () => this.goto('menu'),
      // The rider model row lives here alone now (garage round): the same persisted choice (`trials.riderModel`).
      ...(o.modelsSupported ? { models: { get: () => o.models.rider, set: (v: ModelChoice) => cb.setModel('rider', v) } } : {}),
      stage: (on) => o.onGarageStage?.(on),
      orbit: (view) => o.setCameraOverride?.(view ? { mode: 'orbit', yaw: view.yaw, pitch: view.pitch, dist: view.dist, screenY: view.screenY } : null),
    });
    this.onboard = new OnboardingCard(o.uiRoot, () => {
      saveOnboarded();
      this.game.setPaused(false);
      this.lastNow = performance.now();
    });
    this.toast = new UpdateToast(o.uiRoot, () => this.reloadForUpdate?.());
    this.perf = o.perf ? new PerfOverlay(o.uiRoot) : null;
    if (o.perf) this.game.perfTiming = true;
    this.labPanel = new LabPanel(o.uiRoot, this.game.physicsHz);
    this.traceBars = o.trace ? new TraceBars(o.uiRoot) : null;
    this.replayBar = new ReplayBar(o.uiRoot, {
      toggle: () => this.replay.toggle(),
      restart: () => this.replay.restart(),
      seek: (f, live) => this.replay.seekFrac(f, live),
      setSpeed: (v) => this.replay.setSpeed(v),
      setCamera: (m: ReplayCameraMode) => this.replay.setCamera(m),
      exit: () => this.replay.exit(),
    });
    this.replay = new ReplaySession(this.game, this.replayBar, () => this.leaveReplay());

    // Level reviewer (docs/design/game.md §21): REVIEW on the menu → the picker → the review UI on one track.
    this.review = new ReviewSession(this.game, {
      onView: (v) => this.reviewPanel.update(v),
      onRide: (on) => {
        this.touch.setEnabled(on);
        this.touch.setOverlay(false);
        this.hud.setReview(!on);
        if (!on) this.hud.hideNow();
      },
    });
    this.reviewPick = new ReviewPickScreen(o.uiRoot, this.sfx, { pick: (id) => this.enterReview(id), back: () => this.goto('menu') }, (id) => this.review.store.count(id));
    this.reviewPanel = new ReviewPanel(o.uiRoot, {
      jump: (i) => this.review.jumpTo(i),
      pan: (dx, w) => this.review.panPx(dx, w),
      zoom: (f) => this.review.zoomBy(f),
      fly: () => this.review.toggleFly(),
      ride: () => this.review.toggleRide(),
      copy: () => copyText(this.review.export(BUILD_STAMP).text),
      share: async () => {
        const nav = navigator as Partial<Navigator>;
        if (typeof nav.share !== 'function') return false;
        try {
          await nav.share({ title: `Level review · ${this.game.currentTrack?.name ?? ''}`, text: this.review.export(BUILD_STAMP).text });
          return true;
        } catch {
          return false;
        }
      },
      exit: () => this.leaveReview(),
      note: (i) => this.review.note(i),
      save: (i, n) => void this.review.saveNote(i, n),
    });
    this.pause = new PauseMenu(o.uiRoot, this.sfx, {
      resume: () => this.resume('pause:resume'),
      restartTrack: () => {
        // Hard cut (SPEC §6): overlay gone on the same frame the world resets.
        this.pause.hide();
        this.setOverlay(false);
        this.game.setPaused(false);
        this.lastNow = performance.now();
        this.fullRestart('pause:restart');
      },
      quit: () => this.quit('pause:quit'),
    });
    mountRotatePrompt(o.uiRoot);
    this.menu.setTracks(shipTracks(this.tracks, o.dev ?? false));
    this.bench = o.bench
      ? new Bench(
          o.uiRoot,
          {
            game: this.game,
            audio: this.audio,
            gotoMenu: () => (this.screen === 'run' ? this.quit('bench') : this.goto('menu')),
            gotoGarage: () => {
              if (this.screen === 'run') this.quit('bench');
              this.goto('garage');
            },
            startB1: () => this.play('b1-first-ride'),
            rideB1: (json) => {
              if (this.screen !== 'run' || this.game.currentTrack?.id !== 'b1-first-ride') this.play('b1-first-ride');
              this.game.startPlayback(json, { ghost: false });
            },
            setCapOverride: (hz) => {
              this.capOverride = hz;
              this.cadence.reset();
            },
            currentCap: () => this.frameCapHz(),
            setTouchHidden: (hidden) => {
              this.touchHidden = hidden;
              this.touch.setVisible(this.mux.activeDevice() === 'touch' && !hidden);
            },
            qualityWhy: () => this.qualityWhy,
            build: BUILD_STAMP.replace(/^build /, ''),
            physics: o.physics?.live ?? 'mock',
          },
          o.bench,
          (r) => this.benchLog.append(r),
        )
      : null;
    // Under the bench the governor is off (`governFrame` returns when `this.bench`): scenarios pin their tiers.

    // Telemetry: every fault is a death at the bike's x (the state after the faulting step) with the last second of input.
    this.game.onEvent((e) => {
      if (this.game.inPlayback()) return;
      if (e.type === 'restart' && e.checkpoint === -1 && this.inRun()) {
        // Full restart during a run (results tile, pause tile, throttle edge on the results, or the held ↻): the phase is still the old one here.
        this.navLog.record('restart', this.navContext(), this.restartVia ?? (this.prevRestart ? `poll:${this.mux.activeDevice() ?? '?'}:restart-hold` : 'game'));
        this.restartVia = null;
      }
      if (e.type !== 'fault') return;
      const st = this.game.getState();
      this.collector.death(st.bike.pos.x, e.reason, st.checkpoint, this.game.recentInput());
    });
    this.navLog.onEntry = (n) => {
      this.collector.nav(n);
      this.touch.note(NavLog.line(n));
    };

    this.hud.onAction = (a) => {
      if (a === 'retry') this.fullRestart('results:retry');
      else if (a === 'next') this.play(this.nextTrackId());
      else if (a === 'menu') this.quit('results:menu');
      else if (a === 'pause') this.togglePause('hud:pause');
      else if (a === 'replay') this.watchLastRun();
    };

    this.game.setGhostEnabled(this.ghostOn);
    if (this.qualityChoice !== 'auto') {
      this.game.setQuality(this.qualityChoice);
    } else {
      // Auto is a governor, not a one-shot probe (the user: "auto shifts around based on FPS; high if
      // possible"). Start at the tier this device last held for 30 s, else medium on a phone / high on
      // desktop; the governor climbs to high while the frame holds and steps down the moment it does not.
      const start = loadHeldTier() ?? (isPhone() ? 'medium' : 'high');
      this.game.setQuality(start);
      this.qualityWhy = `governor start ${start}${loadHeldTier() ? ' (held last session)' : ''}`;
    }

    const unlock = (): void => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      void this.audio?.unlock();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inRun() && !this.game.paused()) this.togglePause('visibilitychange');
      if (document.hidden && this.screen === 'replay') this.game.setPaused(true);
    });
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    this.fit();

    this.game.onPhase = (phase, prev) => {
      // From the line on the run is over for the thumbs: the layer is inert now, not when the panel lands 0.4 s later
      // (a corner tap in that window used to be an unconfirmed quit / a full restart).
      if (phase === 'finished') this.touch.setOverlay(true);
      if (phase !== 'finished' && !this.pause.visible) this.touch.setOverlay(false); // retry / next out of the results frame
      // First GO on this track load starts the run's telemetry window (full restarts keep it: time-to-clear is per track visit).
      if (phase === 'riding' && prev === 'countdown' && this.screen === 'run' && !this.collector.running) this.collector.begin();
      // Retry / next out of the results: the bed goes back to the run scene with the countdown.
      if ((phase === 'countdown' || phase === 'riding') && (this.screen === 'run' || this.screen === 'replay')) this.setAudioScene('run');
    };
    // Results: NEXT TRACK is live only when the next track is unlocked (this clear may have unlocked it).
    this.game.onResults = (r) => {
      this.setAudioScene('results');
      this.hud.setNextEnabled(this.nextTrackEnabled(), this.nextTrackName());
      this.touch.setOverlay(true);
      this.logRun(r);
      // "Last run" storage (replay viewer): every finished run, PB or not.
      const last = this.game.lastRunRecording();
      if (last) this.lastRuns.put(r.trackId, { time: last.time, faults: last.faults, bike: last.bike, at: new Date().toISOString(), recording: last.json });
      this.hud.setReplayEnabled(last !== null);
    };
  }

  // -- replay viewer (docs/design/game.md §16) ------------------------------------------

  /** Results → "Watch replay": the run that just finished, in the same scene, PB ghost alongside unless this run is the PB. */
  private watchLastRun(): void {
    const last = this.game.lastRunRecording();
    if (!last) return;
    const pb = this.bestTimes.get(last.trackId, last.bike);
    const isPb = !!pb?.recording && pb.recording === last.json;
    this.enterReplay({ json: last.json, kind: isPb ? 'pb' : 'last', isPb }, { from: 'results' });
  }

  private enterReplay(src: ReplaySource, ret: { from: 'results' } | { from: 'tracks' }): void {
    if (this.replay.active) return;
    const fromResults = ret.from === 'results';
    this.replayReturn = fromResults ? { from: 'results', snap: this.game.snapshot(), counters: this.game.counters(), result: this.game.result() } : { from: 'tracks' };
    this.hud.hideResults();
    this.pause.hide();
    this.menu.hide();
    this.garage.hide();
    this.settings.hide();
    this.credits.hide();
    this.tracksScreen.hide();
    this.setOverlay(false);
    this.touch.setEnabled(false);
    this.touch.setOverlay(false);
    this.o.sceneRoot?.classList.remove('covered', 'dim', 'garage');
    this.game.renderEnabled = true;
    const vol = this.soundOn ? this.volume : 0;
    this.audio?.setMasterVolume(0); // the load / rewind cues stay silent
    const name = getTrack(JSON.parse(src.json).header?.trackId as string)?.name ?? this.game.currentTrack?.name ?? '';
    if (!this.replay.open(src, name)) {
      this.audio?.setMasterVolume(vol);
      this.replayReturn = null;
      if (fromResults && this.game.result()) this.hud.showResults(this.game.result()!);
      return;
    }
    this.screen = 'replay';
    this.setAudioScene('run');
    this.screenAt = performance.now();
    this.hud.setReplay(true);
    this.replayBar.setDevice(this.mux.activeDevice() ?? 'keyboard');
    this.setLab(this.game.currentTrack?.id ?? '');
    setTimeout(() => {
      if (this.screen === 'replay' && !this.replayMuted) this.audio?.setMasterVolume(vol);
    }, 60);
  }

  /** Exit: back to the results panel of the interrupted run (state restored), or to track select. */
  private leaveReplay(): void {
    const ret = this.replayReturn;
    this.replayReturn = null;
    this.replayMuted = false;
    this.hud.setReplay(false);
    this.audio?.setMasterVolume(this.soundOn ? this.volume : 0);
    if (ret?.from === 'results') {
      this.game.restore(ret.snap);
      this.game.restoreCounters(ret.counters);
      this.game.clearHudTransients();
      this.screen = 'run';
      this.screenAt = performance.now();
      this.touch.setEnabled(true);
      if (ret.result) {
        this.hud.setNextEnabled(this.nextTrackEnabled(), this.nextTrackName());
        this.hud.setReplayEnabled(true);
        this.hud.showResults(ret.result);
        this.touch.setOverlay(true);
      }
      return;
    }
    this.hud.hideNow();
    this.loadBackdrop(BACKDROP_TRACK, true);
    this.goto('tracks');
  }

  // -- level reviewer (docs/design/game.md §21) -------------------------------------------

  /** Picker row / `?review=`: load the track under the review UI (nothing racing, the bike parked at segment 1). */
  private enterReview(trackId: string, seg = 0): boolean {
    if (!getTrack(trackId)) return false;
    if (this.replay.active) this.replay.close();
    if (this.review.active) this.review.close();
    this.collector.abandon();
    this.hud.hideResults();
    this.pause.hide();
    this.menu.hide();
    this.garage.hide();
    this.settings.hide();
    this.credits.hide();
    this.tracksScreen.hide();
    this.reviewPick.hide();
    this.setOverlay(false);
    this.touch.setEnabled(false);
    this.touch.setOverlay(false);
    this.o.sceneRoot?.classList.remove('covered', 'dim', 'garage');
    this.game.renderEnabled = true;
    this.setLab(trackId);
    const vol = this.soundOn ? this.volume : 0;
    this.audio?.setMasterVolume(0); // the load's countdown cue stays silent
    if (!this.review.open(trackId, seg)) {
      this.audio?.setMasterVolume(vol);
      return false;
    }
    this.hud.hideNow();
    this.hud.setReplay(true);
    this.hud.setReview(true);
    this.screen = 'reviewer';
    this.screenAt = performance.now();
    this.setAudioScene('menu');
    this.reviewPanel.show();
    this.reviewPanel.update(this.review.view());
    setTimeout(() => this.audio?.setMasterVolume(vol), 60);
    return true;
  }

  /** ‹ Tracks / Esc: back to the picker (the row's noted count refreshed). */
  private leaveReview(): void {
    if (!this.review.active) return;
    this.reviewPanel.hide();
    this.review.close();
    this.hud.setReplay(false);
    this.hud.setReview(false);
    this.hud.hideNow();
    this.loadBackdrop(BACKDROP_TRACK, true);
    this.goto('review');
  }

  /** Harness / QA surface (`window.__trials.review`): the reviewer's state and controls without a pointer. */
  reviewApi(): NonNullable<TrialsHook['review']> {
    return {
      open: (id, seg) => this.enterReview(id, seg ?? 0),
      close: () => this.leaveReview(),
      active: () => this.review.active,
      view: () => {
        const v = this.review.view();
        return { trackId: v.trackId, seg: v.seg, x: v.x, dist: v.dist, flying: v.flying, riding: v.riding, segments: v.segments.map((s) => ({ i: s.i, from: s.from, to: s.to, label: s.label, kinds: Object.fromEntries(s.kinds) })) };
      },
      jump: (i) => this.review.jumpTo(i),
      pan: (m) => this.review.panM(m),
      zoom: (f) => this.review.zoomBy(f),
      fly: () => this.review.toggleFly(),
      ride: () => this.review.toggleRide(),
      export: () => this.review.export(BUILD_STAMP),
    };
  }

  /** Harness / e2e surface (`window.__trials.app`): one synchronous app frame, the flow methods, the state. */
  testApi(): NonNullable<TrialsHook['app']> {
    return {
      frame: () => {
        this.tickFrame(0, false); // input poll + flow only: no render (a SwiftShader frame per call would dominate the e2e)
        tickLive();
      },
      play: (id) => this.play(id),
      goto: (s) => this.goto(s),
      quit: () => this.quit('hook'),
      togglePause: () => this.togglePause('hook'),
      screen: () => this.screen,
      paused: () => this.game.paused(),
    };
  }

  /** `window.__trials.bench` (`?bench=1` only): start, state, the finished report. */
  benchApi(): NonNullable<TrialsHook['bench']> | undefined {
    const b = this.bench;
    if (!b) return undefined;
    return { start: () => b.start(), state: () => b.state(), report: () => b.report(), text: () => b.text() };
  }

  /** Harness / QA surface (`window.__trials.replay`). */
  replayApi(): { open(json?: string): boolean; seek(tick: number): void; info(): ReturnType<ReplaySession['info']>; close(): void } {
    return {
      open: (json) => {
        if (json) {
          this.enterReplay({ json, kind: 'last', isPb: false }, { from: 'tracks' });
        } else this.watchLastRun();
        return this.replay.active;
      },
      seek: (tick) => this.replay.seekTick(tick),
      info: () => this.replay.info(),
      close: () => this.replay.exit(),
    };
  }

  // -- physics lab HUD (MEGA_PLAN P0 §3) ---------------------------------------------------

  /** Lab tracks (`lab-*`, or `?lab=1`): panel on, ghost slot = last attempt, per-tick sampling tap. */
  private setLab(trackId: string): void {
    const on = isLabTrack(trackId, this.o.lab ?? false);
    this.game.setLabMode(on);
    this.labPanel.root.hidden = !on;
    if (on) this.labPanel.stopStart = this.game.bumpStopStart();
    this.game.tickTap = on ? (st, t) => this.labPanel.sample(st, t, this.game.attempts(), this.game.physicsDebug()) : null;
  }

  // -- flow -------------------------------------------------------------------

  start(): void {
    // The mux presumes touch on coarse-pointer devices before any input; apply that device to the
    // screens and the touch layer now (onDeviceChange only fires on a change).
    const d0 = this.mux.activeDevice();
    if (d0) this.onDevice(d0);
    if (this.o.initialReview && this.enterReview(this.o.initialReview)) {
      /* the reviewer owns the scene */
    } else if (this.o.initialTrack && getTrack(this.o.initialTrack)) this.play(this.o.initialTrack);
    else {
      this.loadBackdrop(BACKDROP_TRACK);
      this.goto('menu');
    }
    this.lastNow = performance.now();
    const frame = (now: number): void => {
      // Frame cap: a phase-locked cadence (src/game/cadence.ts) — a render is due every 1000/cap ms from
      // the first one, whatever RAF slot it lands on, so a 30 cap on a 60 or 120 Hz display holds 30 flat
      // instead of slipping to 24–28 after each frame that overran its slot (PERF.md §0 F4). Physics is
      // fixed-step, so the skipped frames' time is simply consumed by the next advance.
      this.bench?.raf(now);
      const cap = this.frameCapHz();
      if (cap !== this.capInEffect) {
        this.capInEffect = cap;
        this.cadence.reset();
      }
      if (!this.cadence.shouldRender(now, cap)) {
        this.raf = requestAnimationFrame(frame);
        return;
      }
      const sinceRender = this.lastRenderAt ? now - this.lastRenderAt : 0;
      this.lastRenderAt = now;
      const elapsed = Math.min(0.25, Math.max(0, (now - this.lastNow) / 1000));
      this.lastNow = now;
      this.tickFrame(elapsed);
      this.meterFrame(now, sinceRender);
      this.governFrame(now, sinceRender);
      this.bench?.frame(now, this.frameSplit);
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
    this.hud.hideNow(); // no HUD frame (timer, "3" banner) under the menu
    setTimeout(() => this.audio?.setMasterVolume(vol), 60);
  }

  goto(screen: FrontScreen): void {
    this.navLog.record('goto', this.navContext(), null, screen);
    if (this.replay.active) this.replay.close();
    if (this.review.active) {
      this.reviewPanel.hide();
      this.review.close();
      this.hud.setReplay(false);
      this.hud.setReview(false);
      this.hud.hideNow();
    }
    this.screen = screen;
    this.screenAt = performance.now();
    this.setAudioScene('menu');
    this.touch.setEnabled(false);
    this.pause.hide();
    this.menu.hide();
    this.tracksScreen.hide();
    this.settings.hide();
    this.credits.hide();
    this.garage.hide();
    this.reviewPick.hide();
    const scene = this.o.sceneRoot;
    // The menu's key art covers the canvas: no WebGL frame at all while it is up (PERF.md #1 —
    // the phone paid a full tier frame plus a compositor copy for an invisible canvas).
    scene?.classList.toggle('covered', screen === 'menu');
    this.game.renderEnabled = screen !== 'menu';
    scene?.classList.toggle('dim', screen !== 'menu' && screen !== 'garage');
    scene?.classList.toggle('garage', screen === 'garage');
    const dev = this.mux.activeDevice();
    if (screen === 'menu') {
      this.menu.setDevice(dev);
      this.menu.show();
    } else if (screen === 'garage') {
      this.garage.setDevice(dev);
      this.garage.show(this.bikeInEffect(), this.riderOutfit);
    } else if (screen === 'tracks') {
      this.tracksScreen.build(this.tracks);
      this.tracksScreen.setDevice(dev);
      this.tracksScreen.show();
    } else if (screen === 'settings') {
      this.settings.setDevice(dev);
      this.settings.show();
    } else if (screen === 'review') {
      this.reviewPick.build(listTrackIds().map((id) => getTrack(id)!).filter((t) => !!t));
      this.reviewPick.setDevice(dev);
      this.reviewPick.show();
    } else this.credits.show();
  }

  private play(id: string): void {
    const def = getTrack(id);
    if (!def) return;
    // Bike: the Garage choice when the player has made one, else the tier default (medium = last ridden).
    const bike = this.bikeChoice ?? defaultBikeForTier(def.tier, this.lastRidden);
    this.collector.abandon();
    if (this.replay.active) this.replay.close();
    if (this.review.active) {
      this.reviewPanel.hide();
      this.review.close();
      this.hud.setReplay(false);
      this.hud.setReview(false);
    }
    this.reviewPick.hide();
    this.setLab(id);
    if (!this.game.loadTrack(id, undefined, bike)) return;
    // Always on launch (materials only, no rebuild): a garage browse may have left the hero in the other livery.
    this.o.onBikeChange?.(bike);
    this.lastRidden = bike;
    this.screen = 'run';
    this.screenAt = performance.now();
    this.setAudioScene('run');
    this.lastTrackId = id;
    try {
      localStorage.setItem(LAST_TRACK_KEY, id);
    } catch {
      /* storage unavailable */
    }
    this.o.sceneRoot?.classList.remove('covered', 'dim', 'garage');
    this.game.renderEnabled = true;
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
    if (!loadOnboarded() && !this.bench) {
      this.game.setPaused(true);
      this.onboard.show(this.mux.activeDevice());
    }
  }

  /**
   * A PB as the front end may show it: medal and time always; the recording (the card's `▶ Watch` and the
   * ghost) only when it was ridden on the live solver — a v1 PB is never replayed under v2 or vice versa.
   */
  private playableBest(b: BestEntry | null): BestEntry | null {
    if (!b?.recording || this.game.recordingMatchesPhysics(b.recording)) return b;
    const { recording: _dropped, ...rest } = b;
    return rest;
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
    this.menu.setBike(b);
  }

  // -- telemetry ------------------------------------------------------------------

  private logRun(r: RunResult): void {
    if (!this.collector.running) return;
    const entry = this.collector.finish({
      track: r.trackId,
      bike: r.bike ?? 'rookie',
      physics: this.game.physicsVersion,
      faults: r.faults,
      time: r.time,
      medal: r.medal,
      quality: this.game.qualityTier,
      qualityWhy: this.qualityWhy,
      build: BUILD_STAMP.replace(/^build /, ''),
    });
    if (this.telemetryOn) this.runLog.append(entry);
  }

  private copyRunLog(): Promise<boolean> {
    return copyText(this.runLog.exportJson(BUILD_STAMP, this.benchLog.read()));
  }

  private async shareRunLog(): Promise<boolean> {
    if (typeof navigator.share !== 'function') return this.copyRunLog();
    try {
      await navigator.share({ title: 'Trials Gauntlet run log', text: this.runLog.exportJson(BUILD_STAMP, this.benchLog.read()) });
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
  private quit(via: string): void {
    this.navLog.record('quit', this.navContext(), via);
    this.game.setPaused(false);
    this.pause.hide();
    this.setOverlay(false);
    this.hud.hideResults();
    this.touch.setEnabled(false);
    this.loadBackdrop(BACKDROP_TRACK, true);
    this.goto('menu');
  }

  /** Resume: the game unpauses on this frame; the overlay fades over --t1 while the HUD fades back over --t2 (SPEC §6). */
  private resume(via: string): void {
    this.navLog.record('resume', this.navContext(), via);
    this.screenAt = performance.now();
    this.pause.fadeOut();
    this.setOverlay(false);
    this.game.setPaused(false);
    this.lastNow = performance.now();
  }

  private togglePause(via: string): void {
    if (!this.inRun() || this.onboard.visible) return;
    if (this.game.paused()) this.resume(via);
    else {
      this.navLog.record('pause', this.navContext(), via);
      this.screenAt = performance.now();
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

  /** Full restart asked by the UI (results / pause tile, throttle edge on the results): the game's `restart` event logs it under `via`. */
  private fullRestart(via: string): void {
    this.restartVia = via;
    this.game.restartFromStart();
    this.restartVia = null;
  }

  private navContext(): NavContext {
    return { screen: this.screen, phase: this.game.phase(), stage: this.hud.stage(), screenAt: this.screenAt };
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

  /** Audio round 3 (additive): the app's scene for the music bed — `menu` for every front screen, `run` from launch / retry / replay, `results` when the panel lands. */
  private setAudioScene(scene: AudioScene): void {
    if (scene === this.audioScene) return;
    this.audioScene = scene;
    this.audio?.setScene?.(scene);
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

  /** One app frame with its split bracketed into `frameSplit` (four `performance.now()` calls; the game adds its own). */
  private tickFrame(elapsed: number, render = true): void {
    const sp = this.frameSplit;
    const t0 = performance.now();
    this.tickFrameInner(elapsed, render, t0);
    const t1 = performance.now();
    const lr = this.game.lastRender;
    const la = this.game.lastAdvance;
    sp.totalMs = t1 - t0;
    sp.physicsMs = la.physicsMs;
    sp.ticks = la.ticks;
    sp.hudMs = lr.hudMs;
    sp.audioMs = lr.audioMs;
    sp.submitMs = lr.submitMs;
    // `other` = the app shell's housekeeping plus the game's state prep (getState / run info / ghost) before the HUD.
    sp.otherMs = Math.max(0, sp.totalMs - sp.pollMs - sp.advanceMs) + lr.prepMs;
  }

  private tickFrameInner(elapsed: number, render: boolean, t0: number): void {
    const sp = this.frameSplit;
    sp.pollMs = sp.advanceMs = 0;
    this.game.lastAdvance.ticks = 0;
    this.game.lastAdvance.physicsMs = 0;
    if (this.perf) this.perf.root.hidden = !(this.screen === 'run' && !this.pause.visible && this.game.phase() !== 'finished' && !this.onboard.visible);
    const { frame, meta } = this.mux.poll();
    sp.pollMs = performance.now() - t0;
    const restartEdge = frame.restart === true && !this.prevRestart;
    const throttleEdge = frame.throttle > 0 && !this.prevThrottle;
    if (performance.now() - this.screenAt < SCREEN_GRACE_MS && this.screen !== 'run') {
      // The key / tap that just changed screens must not also act on the new one.
      meta.confirm = meta.back = meta.pause = false;
      meta.navX = meta.navY = 0;
    }
    if (this.screen === 'replay') {
      // Replay viewer: the recording drives the game; the devices drive the transport.
      this.replay.handleInput(frame, meta, restartEdge && !meta.confirm, elapsed);
      this.prevRestart = frame.restart === true;
      this.prevThrottle = frame.throttle > 0;
      const dev = this.mux.activeDevice();
      if (dev) this.replayBar.setDevice(dev);
      const scrub = this.replay.scrubbing;
      if (scrub !== this.replayMuted) {
        // Scrubs re-simulate whole stretches in one frame: their crash / checkpoint cues stay silent.
        this.replayMuted = scrub;
        this.audio?.setMasterVolume(scrub || !this.soundOn ? 0 : this.volume);
      }
      this.game.advance(elapsed);
      if (this.screen === 'replay') {
        this.replay.afterFrame();
        this.traceBars?.update(this.game.effectiveInput());
        this.labPanel.update(performance.now());
      }
      return;
    }
    if (this.screen === 'reviewer') {
      // Level reviewer: Esc / B / pause = back to the picker; V / Y = fly; while riding the frame drives the bike,
      // otherwise held lean pans the probe (12 m/s) and ←/→ nav jumps a segment.
      if (meta.back || meta.pause) {
        this.leaveReview();
        return;
      }
      if (meta.alt) this.review.toggleFly();
      if (this.review.view().riding) {
        this.game.setInput(frame);
      } else {
        if (frame.lean !== 0 && elapsed > 0) this.review.panM(frame.lean * 12 * elapsed);
        if (meta.navX) this.review.jumpTo(this.review.view().seg + meta.navX);
        if (meta.confirm) this.review.toggleRide();
      }
      this.prevRestart = frame.restart === true;
      this.prevThrottle = frame.throttle > 0;
      this.review.frame(elapsed);
      this.game.advance(elapsed);
      this.settleTouch(elapsed);
      this.labPanel.update(performance.now());
      return;
    }
    if (this.onboard.visible) {
      // First-launch card: any confirm / back / gas edge dismisses it; nothing reaches the game meanwhile.
      if (meta.confirm || meta.back || meta.pause || throttleEdge || restartEdge) this.onboard.dismiss();
      this.prevRestart = frame.restart === true;
      this.prevThrottle = frame.throttle > 0;
      this.game.advance(0);
      return;
    }
    if (this.screen !== 'run') {
      const s = this.screen === 'menu' ? this.menu : this.screen === 'garage' ? this.garage : this.screen === 'tracks' ? this.tracksScreen : this.screen === 'settings' ? this.settings : this.screen === 'review' ? this.reviewPick : this.credits;
      if (meta.navX || meta.navY) s.nav(meta.navX, meta.navY);
      if (meta.confirm) s.confirm();
      else if (meta.back || meta.pause) s.back();
      else if (meta.alt && 'alt' in s) s.alt();
    } else if (this.pause.visible) {
      if (meta.navX || meta.navY) this.pause.move(meta.navX, meta.navY);
      if (meta.pause || meta.back) this.resume(`poll:${this.mux.activeDevice() ?? '?'}:${meta.pause ? 'pause' : 'back'}`);
      else if (meta.confirm) this.pause.confirm();
      else if (restartEdge) this.pause.restartShortcut(); // R (keyboard) = RESTART while paused; B is back → resume
    } else if (this.game.phase() === 'finished') {
      // Results (SPEC §5): once the tiles are up (0.6 s) Esc/Start = MENU, ←/→ move, Enter/A pick, a throttle *edge*
      // is retry (never a held gas across the line); R / B / Backspace retry through the game's own restart edge at
      // any time, so retry stays one press from the moment the timer freezes. Before the tiles are up a pause press is
      // ignored: the invariant says nothing navigates without a drawn control (the touch layer is inert from the line).
      const live = this.hud.resultsInteractive();
      if (live && meta.navX) this.hud.resultsMove(meta.navX);
      if (live && meta.pause) this.quit(`poll:${this.mux.activeDevice() ?? '?'}:pause`);
      else if (live && meta.confirm) this.hud.resultsConfirm();
      else if (live && throttleEdge) this.fullRestart(`poll:${this.mux.activeDevice() ?? '?'}:throttle-edge`);
      else this.game.setInput(frame);
    } else {
      if (meta.pause) this.togglePause(`poll:${this.mux.activeDevice() ?? '?'}:pause`);
      this.game.setInput(frame);
    }
    this.prevRestart = frame.restart === true;
    this.prevThrottle = frame.throttle > 0;
    const dev = this.mux.activeDevice();
    if (dev) this.hud.setDevice(dev, this.mux.idleFrames() < DEVICE_SHOW_FRAMES);

    if (render) {
      const tA = performance.now();
      this.game.advance(elapsed);
      sp.advanceMs = performance.now() - tA;
    }
    this.settleTouch(elapsed);
    if (this.inRun() && !this.game.paused()) {
      this.collector.frame(elapsed * 1000);
      this.frameMs.push(elapsed * 1000);
    }
    if (this.traceBars) {
      const show = this.screen === 'run' && !this.pause.visible;
      this.traceBars.setVisible(show);
      if (show) this.traceBars.update(this.game.effectiveInput());
    }
    this.labPanel.update(performance.now());
    this.perf?.update(performance.now(), () => ({
      frameMs: this.frameMs.stats(),
      physicsUs: this.game.physicsUs.stats(),
      stats: this.safeStats(),
      quality: this.game.qualityTier,
      qualityWhy: this.qualityWhy,
      dpr: dprCap(),
      render: this.game.rendererDebug(),
      entryHold: this.game.entryHeld,
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
    this.touch.setVisible(d === 'touch' && !this.touchHidden);
    this.hud.setDevice(d, true);
    for (const s of [this.menu, this.tracksScreen, this.settings]) s.setDevice(d);
    this.garage.setDevice(d);
    this.replayBar.setDevice(d);
    this.onboard.setDevice(d);
    this.pause.setDevice(d);
  }

  /** Cap in effect: the Settings choice, else 60 everywhere (device report #1: low holds 59.5 fps on the phone). */
  private frameCapHz(): 30 | 60 {
    if (this.capOverride) return this.capOverride;
    if (this.fpsChoice === '30') return 30;
    return 60;
  }

  /** FPS meter: rendered frames over the last 500 ms, the worst frame interval in that window, the tier letter. Two DOM writes per second. */
  private meterFrame(now: number, sinceRender: number): void {
    this.fpsFrames++;
    if (sinceRender > this.fpsWorstMs) this.fpsWorstMs = sinceRender;
    if (now - this.fpsWindowAt < 500) return;
    if (this.fpsWindowAt) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsWindowAt));
      const cap = this.frameCapHz();
      this.fpsEl.textContent = `${fps} fps · ${Math.round(this.fpsWorstMs)} ms · ${this.game.qualityTier[0]!.toUpperCase()}`;
      this.fpsEl.classList.toggle('bad', fps < cap - 5 || this.fpsWorstMs > 1000 / cap + 12);
    }
    this.fpsWindowAt = now;
    this.fpsFrames = 0;
    this.fpsWorstMs = 0;
  }

  // -- quality ------------------------------------------------------------------

  /**
   * The quality governor (Auto). Every rendered frame's interval feeds a 2 s window; at the window's end:
   *   p95 > 1.3 × budget or drops > 8 %  → step DOWN now (a stutter beats sustained lag), 10 s cooldown;
   *   p95 ≤ 1.1 × budget and drops < 2 % for 4 consecutive windows → step UP, but only at a safe moment
   *   (not riding: countdown / menu / garage / pause / results) because a tier change recompiles materials.
   * The first second after any change is ignored (the recompile itself would read as drops). A tier held
   * for 30 s is remembered per device so the next boot starts there. Manual settings disable it.
   */
  private govWindowAt = 0;
  private govIntervals: number[] = [];
  private govGoodWindows = 0;
  private govChangedAt = 0;
  private govLastDownAt = 0;
  private govHeldSince = 0;
  private governFrame(now: number, sinceRender: number): void {
    if (this.qualityChoice !== 'auto' || this.bench) return;
    if (now - this.govChangedAt < 1000) return; // recompile shadow
    if (sinceRender > 0) this.govIntervals.push(sinceRender);
    if (!this.govWindowAt) this.govWindowAt = now;
    if (now - this.govWindowAt < 2000) return;
    const n = this.govIntervals.length;
    this.govWindowAt = now;
    if (n < 10) {
      this.govIntervals = [];
      return;
    }
    const sorted = this.govIntervals.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))]!;
    const budget = 1000 / this.frameCapHz();
    const drops = sorted.filter((x) => x > budget * 1.5).length / n;
    this.govIntervals = [];
    const order: QualityTier[] = ['low', 'medium', 'high'];
    const cur = this.game.qualityTier;
    const i = order.indexOf(cur);
    const riding = this.inRun() && this.game.phase() === 'riding' && !this.game.paused();
    if (p95 > budget * 1.3 || drops > 0.08) {
      this.govGoodWindows = 0;
      this.govHeldSince = now;
      if (i > 0) {
        this.game.setQuality(order[i - 1]!);
        this.govChangedAt = now;
        this.govLastDownAt = now;
        this.qualityWhy = `governor ↓ ${order[i - 1]} (p95 ${p95.toFixed(1)} ms, drops ${(drops * 100).toFixed(0)} %)`;
      }
      return;
    }
    if (p95 <= budget * 1.1 && drops < 0.02) {
      this.govGoodWindows++;
      if (now - this.govHeldSince > 30000) saveHeldTier(cur);
      if (this.govGoodWindows >= 4 && i < 2 && !riding && now - this.govLastDownAt > 10000) {
        this.game.setQuality(order[i + 1]!);
        this.govChangedAt = now;
        this.govGoodWindows = 0;
        this.govHeldSince = now;
        this.qualityWhy = `governor ↑ ${order[i + 1]} (p95 ${p95.toFixed(1)} ms held ${4 * 2} s)`;
      }
    } else {
      this.govGoodWindows = 0;
    }
  }

  private chooseQuality(q: QualityChoice): void {
    this.qualityChoice = q;
    saveQualityOverride(q);
    if (q === 'auto') {
      this.govGoodWindows = 0;
      this.govChangedAt = performance.now();
      this.qualityWhy = 'governor (auto)';
    } else {
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
