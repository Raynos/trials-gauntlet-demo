/**
 * Browser app shell: menus ⇄ runs, input mux → game, RAF driver, quality
 * probe, mobile rules (DPR cap, audio unlock, visibility pause). Nothing in
 * here touches determinism: the game only ever sees quantized InputFrames
 * and simulated seconds.
 */
import type { InputDevice, QualityTier, TrackDef } from '../core/types';
import type { AudioSystem } from '../audio';
import { getTrack, listTrackIds } from '../tracks';
import { MainMenu, PauseMenu, loadGhostEnabled, loadModelChoice, loadQualityOverride, mountRotatePrompt, saveGhostEnabled, saveModelChoice, saveQualityOverride, type BestTimes, type DomHud, type ModelChoice, type QualityChoice } from '../ui';
import type { Game } from './game';
import { GamepadInput, InputMux, KeyboardInput, TouchInput } from './input';

export interface AppOptions {
  game: Game;
  hud: DomHud;
  bestTimes: BestTimes;
  audio: AudioSystem | undefined;
  /** Element the touch layer and menus mount into (above the canvas). */
  uiRoot: HTMLElement;
  resize(width: number, height: number, pixelRatio: number): void;
  initialTrack?: string | undefined;
  /** Model choices in effect for this page load (URL param or stored). */
  models: { rider: ModelChoice; bike: ModelChoice };
  /** Called after a model choice changes; the renderer is built once, so the app reloads. */
  applyModels?: ((models: { rider: ModelChoice; bike: ModelChoice }) => boolean) | undefined;
  /** `?touchdebug=1`: overlay of active pointers + live InputFrame. */
  touchDebug?: boolean | undefined;
}

const PROBE_FRAMES = 60;
const DEVICE_SHOW_FRAMES = 90;

export function isPhone(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.innerWidth, window.innerHeight) < 500;
}

export function dprCap(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isPhone() ? 1.5 : 2);
}

export class App {
  private readonly game: Game;
  private readonly hud: DomHud;
  private readonly audio: AudioSystem | undefined;
  private readonly mux = new InputMux();
  private readonly touch: TouchInput;
  private readonly menu: MainMenu;
  private readonly pause: PauseMenu;
  private readonly bestTimes: BestTimes;
  private readonly tracks: TrackDef[];
  private qualityChoice: QualityChoice;
  private probe: number[] = [];
  private probeArmed = false;
  private probeDone = false;
  private lastNow = 0;
  private raf = 0;
  private audioUnlocked = false;
  private lastTrackId: string | null = null;

  constructor(private readonly o: AppOptions) {
    this.game = o.game;
    this.hud = o.hud;
    this.audio = o.audio;
    this.bestTimes = o.bestTimes;
    this.tracks = listTrackIds()
      .map((id) => getTrack(id))
      .filter((t): t is TrackDef => t !== undefined);

    this.touch = new TouchInput(o.uiRoot, { debug: o.touchDebug ?? false });
    this.mux.add(new KeyboardInput()).add(new GamepadInput()).add(this.touch);
    this.mux.onDeviceChange = (d) => this.onDevice(d);

    this.menu = new MainMenu(
      o.uiRoot,
      {
        play: (id) => this.play(id),
        setQuality: (q) => this.chooseQuality(q),
        setAudio: (on) => this.audio?.setMasterVolume(on ? 1 : 0),
        setGhost: (on) => {
          saveGhostEnabled(on);
          this.game.setGhostEnabled(on);
        },
        setModel: (which, v) => {
          saveModelChoice(which, v);
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
      },
      (id) => this.bestTimes.get(id),
    );
    this.pause = new PauseMenu(o.uiRoot, {
      resume: () => this.resume(),
      restartTrack: () => {
        this.resume();
        this.game.restartFromStart();
      },
      quit: () => this.quit(),
    });
    mountRotatePrompt(o.uiRoot);

    this.hud.onAction = (a) => {
      if (a === 'retry') this.game.restartFromStart();
      else if (a === 'next') this.play(this.nextTrackId());
      else if (a === 'menu') this.quit();
      else if (a === 'pause') this.togglePause();
    };

    this.qualityChoice = loadQualityOverride();
    this.menu.setQuality(this.qualityChoice);
    this.menu.setModel('rider', o.models.rider);
    this.menu.setModel('bike', o.models.bike);
    const ghostOn = loadGhostEnabled();
    this.menu.setGhost(ghostOn);
    this.game.setGhostEnabled(ghostOn);
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
    else this.showMenu();
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

  private showMenu(): void {
    this.game.toMenu();
    this.touch.setEnabled(false);
    this.pause.hide();
    this.menu.setTracks(this.tracks, this.lastTrackId);
    this.menu.show();
  }

  private play(id: string): void {
    if (!this.game.loadTrack(id)) return;
    this.lastTrackId = id;
    this.menu.hide();
    this.pause.hide();
    this.game.setPaused(false);
    this.touch.setEnabled(true);
  }

  private quit(): void {
    this.game.setPaused(false);
    this.showMenu();
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
      this.pause.show();
    }
  }

  private inRun(): boolean {
    return this.game.phase() !== 'menu';
  }

  private nextTrackId(): string {
    const i = this.tracks.findIndex((t) => t.id === this.lastTrackId);
    return this.tracks[(i + 1) % this.tracks.length]?.id ?? this.tracks[0]!.id;
  }

  // -- per frame ----------------------------------------------------------------

  private tickFrame(elapsed: number): void {
    const { frame, meta } = this.mux.poll();
    if (this.menu.visible) {
      if (meta.navX || meta.navY) this.menu.move(meta.navX, meta.navY);
      if (meta.confirm) this.menu.confirm();
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
  }

  private onDevice(d: InputDevice): void {
    this.touch.setVisible(d === 'touch');
    this.hud.setDevice(d, true);
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
