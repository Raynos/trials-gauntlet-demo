/**
 * Replay viewer session (docs/design/game.md §16): plays a recording back in the same scene through
 * the live `Game` in playback mode — the recording is the player, every tick goes through the same
 * `tick()` as live play — with a transport (play / pause, scrub, ¼ ½ 1×, restart), three camera
 * modes and the PB ghost alongside. Scrubbing is a deterministic re-simulation from GO to tick N
 * (`Game.seekPlayback`), never an interpolation.
 *
 * Camera modes talk to the renderer through `setCameraOverride?(o | null)` when the render owner
 * exports it; until then the rig's public `bounds` / `setKeys` are driven through `renderer.debug.rig`
 * (follow-wide = a full-track `CameraKey` with `zoomBias: 0.4`; fixed = the camera position clamped
 * to where it was, re-anchored with a hard cut when the bike leaves the frame).
 */
import type { CameraKey, CameraOverride, InputFrame, ReplayCameraMode } from '../core/types';
import type { ReplayBar } from '../ui/replay';
import { REPLAY_CAMERAS, REPLAY_SPEEDS } from '../ui/replay';
import type { Game } from './game';
import type { MetaButtons } from './input';

/** Held ←/→ scrub at this many seconds of run per real second. */
const SCRUB_RATE = 2.5;
/** Fixed camera: re-anchor when the bike's screen x leaves this band. */
const FIXED_BAND: [number, number] = [0.06, 0.94];

interface RigLike {
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null;
  setKeys(keys: CameraKey[] | undefined): void;
}

type RendererLike = Partial<{
  setCameraOverride(o: CameraOverride | null): void;
  debug: { rig: RigLike };
  camera(): { pos: { x: number; y: number }; bikeScreenX: number };
}>;

export interface ReplaySource {
  json: string;
  /** Kicker label: `LAST RUN` / `PERSONAL BEST`. */
  kind: 'last' | 'pb';
  /** The recording is the PB itself → no ghost (it would sit exactly on the bike). */
  isPb: boolean;
}

export class ReplaySession {
  private camera: ReplayCameraMode = 'game';
  private wasPlaying = false;
  private savedBounds: RigLike['bounds'] | undefined;
  private anchorPending = false;
  private trackKeys: CameraKey[] | undefined;
  active = false;

  constructor(
    private readonly game: Game,
    private readonly bar: ReplayBar,
    private readonly onExit: () => void,
  ) {}

  /** Open on a recording; false when the recording cannot play here (hz mismatch, unknown track). */
  open(src: ReplaySource, trackName: string): boolean {
    if (!this.game.startPlayback(src.json, { ghost: !src.isPb })) return false;
    this.active = true;
    this.camera = 'game';
    this.trackKeys = this.game.currentTrack?.meta?.camera;
    const ghostNote = !src.isPb && this.game.ghostState() !== null ? ' · PB ghost alongside' : '';
    this.bar.show({ kicker: `Replay · ${src.kind === 'pb' ? 'Personal best' : 'Last run'}`, trackName, note: `${(this.game.playbackLength() / this.game.physicsHz).toFixed(2)} s · ${this.game.currentBike === 'pro' ? 'Pro' : 'Rookie'}${ghostNote}` });
    this.game.clearHudTransients();
    this.applyCamera();
    return true;
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.setCamera('game');
    this.game.stopPlayback();
    this.bar.hide();
  }

  // -- transport --------------------------------------------------------------------

  toggle(): void {
    const info = this.game.playbackInfo();
    if (!info) return;
    if (info.ended) {
      this.restart();
      return;
    }
    this.game.setPaused(!this.game.paused());
  }

  restart(): void {
    this.seekTick(0);
    this.game.setPaused(false);
  }

  /** Scrub by fraction of the recording; while `live` the sim stays paused, on release it resumes if it was playing. */
  seekFrac(frac: number, live: boolean): void {
    if (live) this.beginScrub();
    this.seekTick(Math.round(frac * this.game.playbackLength()));
    if (!live) this.endScrub();
  }

  private scrubHold = false;

  /** A scrub (pointer drag or held ←/→) is in progress: the app mutes the re-simulation's cues. */
  get scrubbing(): boolean {
    return this.scrubHold;
  }

  private beginScrub(): void {
    if (this.scrubHold) return;
    this.scrubHold = true;
    this.wasPlaying = !this.game.paused() && !(this.game.playbackInfo()?.ended ?? false);
    this.game.setPaused(true);
  }

  private endScrub(): void {
    if (!this.scrubHold) return;
    this.scrubHold = false;
    if (this.wasPlaying) this.game.setPaused(false);
    this.wasPlaying = false;
  }

  seekTick(tick: number): void {
    this.game.seekPlayback(tick);
    if (this.camera === 'fixed') this.anchorPending = true; // a scrub is a cut: re-anchor on the new stretch
  }

  setSpeed(v: number): void {
    this.game.playbackSpeed = v;
  }

  cycleSpeed(d: number): void {
    const i = REPLAY_SPEEDS.indexOf(this.game.playbackSpeed as (typeof REPLAY_SPEEDS)[number]);
    this.setSpeed(REPLAY_SPEEDS[Math.max(0, Math.min(REPLAY_SPEEDS.length - 1, (i < 0 ? 2 : i) + d))]!);
  }

  setCamera(m: ReplayCameraMode): void {
    if (m === this.camera) return;
    this.camera = m;
    this.applyCamera();
  }

  cycleCamera(): void {
    const i = REPLAY_CAMERAS.findIndex((c) => c.id === this.camera);
    this.setCamera(REPLAY_CAMERAS[(i + 1) % REPLAY_CAMERAS.length]!.id);
  }

  exit(): void {
    this.close();
    this.onExit();
  }

  info(): { tick: number; length: number; playing: boolean; speed: number; camera: ReplayCameraMode } | null {
    const p = this.game.playbackInfo();
    return p ? { tick: p.tick, length: p.length, playing: !this.game.paused() && !p.ended, speed: this.game.playbackSpeed, camera: this.camera } : null;
  }

  // -- per frame ----------------------------------------------------------------------

  /** Keyboard / pad: confirm = play/pause, held lean = scrub, navY = speed, alt = camera, restart edge = restart, back/pause = exit. */
  handleInput(frame: Readonly<InputFrame>, meta: MetaButtons, restartEdge: boolean, elapsed: number): void {
    if (meta.back || meta.pause) {
      this.exit();
      return;
    }
    if (meta.confirm) this.toggle();
    if (meta.alt) this.cycleCamera();
    if (meta.navY) this.cycleSpeed(-meta.navY); // ↑ faster
    if (restartEdge) this.restart();
    if (frame.lean !== 0 && elapsed > 0) {
      const info = this.game.playbackInfo();
      if (info) {
        this.beginScrub();
        this.keyScrub = true;
        this.seekTick(info.tick + Math.sign(frame.lean) * SCRUB_RATE * elapsed * this.game.physicsHz);
      }
    } else if (this.keyScrub) {
      this.keyScrub = false;
      this.endScrub();
    }
  }

  private keyScrub = false;

  /** After the game advanced: transport readout + the fixed camera's re-anchor rule. */
  afterFrame(): void {
    const p = this.game.playbackInfo();
    if (!p) return;
    this.bar.update({ tick: p.tick, length: p.length, physicsHz: this.game.physicsHz, playing: !this.game.paused() && !p.ended, ended: p.ended, speed: this.game.playbackSpeed, camera: this.camera });
    if (this.camera === 'fixed') this.holdFixed();
  }

  // -- camera -------------------------------------------------------------------------

  private renderer(): RendererLike {
    return this.game.rendererRef as unknown as RendererLike;
  }

  private rig(): RigLike | null {
    const r = this.renderer();
    const rig = r.debug?.rig;
    return rig && typeof rig.setKeys === 'function' && 'bounds' in rig ? rig : null;
  }

  private applyCamera(): void {
    const r = this.renderer();
    if (typeof r.setCameraOverride === 'function') {
      if (this.camera === 'game') r.setCameraOverride(null);
      else if (this.camera === 'follow-wide') r.setCameraOverride({ mode: 'follow-wide' });
      else {
        const c = r.camera?.();
        r.setCameraOverride({ mode: 'fixed', ...(c ? { x: c.pos.x, y: c.pos.y } : {}) });
      }
      return;
    }
    const rig = this.rig();
    if (!rig) return;
    // Restore whatever the previous mode changed.
    if (this.savedBounds !== undefined) {
      rig.bounds = this.savedBounds;
      this.savedBounds = undefined;
    }
    rig.setKeys(this.trackKeys);
    this.anchorPending = false;
    if (this.camera === 'follow-wide') {
      // ×0.76 height fraction over the whole track. Wider (zoomBias ≥ 0.6) puts the camera at the hall roof / z clamp, 30+ m out, where the fog tiers wash the frame white — a fog-aware wide framing needs the render owner (`setCameraOverride`).
      rig.setKeys([{ x0: -1e9, x1: 1e9, zoomBias: 0.4, blend: 0.5 }]);
    } else if (this.camera === 'fixed') {
      this.anchorPending = true; // the next frame renders with the game camera, then we lock where it landed
    }
  }

  /** Fixed mode: lock the camera where the game camera is; re-anchor (a cut) when the bike leaves the frame. */
  private holdFixed(): void {
    const r = this.renderer();
    if (typeof r.setCameraOverride === 'function') {
      const c = r.camera?.();
      if (c && (c.bikeScreenX < FIXED_BAND[0] || c.bikeScreenX > FIXED_BAND[1])) {
        r.setCameraOverride(null);
        this.anchorPending = true;
      } else if (this.anchorPending && c) {
        this.anchorPending = false;
        r.setCameraOverride({ mode: 'fixed', x: c.pos.x, y: c.pos.y });
      }
      return;
    }
    const rig = this.rig();
    const c = r.camera?.();
    if (!rig || !c) return;
    if (this.anchorPending) {
      // The frame just drawn used the free camera: freeze the rig's position there.
      this.anchorPending = false;
      if (this.savedBounds === undefined) this.savedBounds = rig.bounds;
      const B = rig.bounds;
      const z = B ? { minZ: B.minZ, maxZ: B.maxZ } : { minZ: -1e9, maxZ: 1e9 };
      rig.bounds = { minX: c.pos.x, maxX: c.pos.x, minY: c.pos.y, maxY: c.pos.y, ...z };
      return;
    }
    if (c.bikeScreenX < FIXED_BAND[0] || c.bikeScreenX > FIXED_BAND[1]) {
      // Bike left the window: release for one frame (the rig re-frames it), then lock again.
      if (this.savedBounds !== undefined) rig.bounds = this.savedBounds;
      this.anchorPending = true;
    }
  }
}
