/**
 * UI contract (CONTRACT.md §2.7): the HUD the game drives every frame, plus
 * the front end (title, menu, track select, settings, credits) and the pause
 * overlay the app shell composes. DOM/CSS; no canvas text.
 */
import type { GameEvent, InputDevice, PhysicsState, RunInfo, RunResult, TrackDef } from '../core/types';

export type HudAction = 'retry' | 'next' | 'menu' | 'pause' | 'replay';

export interface Hud {
  /** Per rendered frame, after `setRun`. `ghost` is the PB ghost's state when one is running. */
  update(state: PhysicsState, ghost?: PhysicsState | null): void;
  onEvent(event: GameEvent): void;
  /** Per rendered frame: run clock, faults, phase, checkpoint progress, sim clock. */
  setRun(info: RunInfo): void;
  /** New track loaded: marks, hints, name. */
  setTrack(track: TrackDef): void;
  setTrackName(name: string): void;
  /** 0.4 s after the finish line. */
  showResults(result: RunResult): void;
  /** Checkpoint split vs the stored PB: negative = ahead. Kinetic label by the timer for 1.5 s. */
  showSplit(checkpoint: number, deltaSeconds: number): void;
  setDevice(device: InputDevice, visible: boolean): void;
  /** Drop every transient (banners, flashes, split label) — after a replay scrub re-simulated a stretch of run in one frame. */
  clearBanners?(): void;
  dispose(): void;
}

export { formatTime, formatDelta } from './format';
export { DomHud } from './hud';
export { PauseMenu, mountRotatePrompt, spatialMove, type PauseCallbacks, type QualityChoice } from './menu';
export { MainMenuScreen, menuPlate, SettingsScreen, CreditsScreen, FocusList, GAME_NAME, BIKE_NAME, BUILD_STAMP, BUILD_STAMP_SHORT, hardReload, type FrontCallbacks, type FrontScreen, type FrontState } from './front';
export { GarageScreen, BIKE_SPECS, BIKE_LABEL, type BikeSpec, type GarageCallbacks } from './garage';
export { PerfOverlay, type PerfSample } from './perf';
export { ReplayBar, type ReplayBarState, type ReplayBarCallbacks } from './replay';
export { LabPanel, type LabSample } from './lab';
export { TraceBars } from './trace';
export { OnboardingCard } from './cards';
export { ArtManifest, BIOME_TINT, type ArtEntry } from './art';
export { UiSfx } from './sfx';
export { TIER_ORDER, TIER_LABEL, shipTracks, tierUnlocked, tierComplete, trackUnlocked, stageUnlocked, stageOf, zoneOf, nextTrack, medalTotals, labTracks, isLabTrack } from './progress';
export {
  BestTimes,
  loadQualityOverride,
  saveQualityOverride,
  loadGhostEnabled,
  saveGhostEnabled,
  loadModelChoice,
  saveModelChoice,
  loadSoundEnabled,
  saveSoundEnabled,
  loadVolume,
  saveVolume,
  loadMusicVolume,
  saveMusicVolume,
  clearAllBest,
  bestKey,
  loadBikeChoice,
  saveBikeChoice,
  loadTelemetryEnabled,
  saveTelemetryEnabled,
  loadOnboarded,
  saveOnboarded,
  loadFpsChoice,
  loadHeldTier,
  saveHeldTier,
  saveFpsChoice,
  type FpsChoice,
  LastRuns,
  type LastRunEntry,
  type BestEntry,
  type BoardEntry,
  BOARD_SIZE,
  type ModelChoice,
} from './best';
export { injectStyles, UI_CSS, TOKENS_CSS } from './styles';
export { applyOrientation, isForcedLandscape, isTouchDevice, toLogical, toPhysical, logicalRect, type LogicalSize } from './orientation';
export { ReviewPickScreen, ReviewPanel, type ReviewPickCallbacks, type ReviewPanelCallbacks } from './review';
export { WorldMapScreen } from './worldMapScreen';
