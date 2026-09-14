/**
 * UI contract (CONTRACT.md §2.7): the HUD the game drives every frame, plus
 * the menus the app shell composes. DOM/CSS; no canvas text.
 */
import type { GameEvent, InputDevice, PhysicsState, RunInfo, RunResult, TrackDef } from '../core/types';

export type HudAction = 'retry' | 'next' | 'menu' | 'pause';

export interface Hud {
  /** Per rendered frame, after `setRun`. */
  update(state: PhysicsState): void;
  onEvent(event: GameEvent): void;
  /** Per rendered frame: run clock, faults, phase, checkpoint progress, sim clock. */
  setRun(info: RunInfo): void;
  /** New track loaded: marks, hints, name. */
  setTrack(track: TrackDef): void;
  setTrackName(name: string): void;
  /** 0.4 s after the finish line. */
  showResults(result: RunResult): void;
  setDevice(device: InputDevice, visible: boolean): void;
  dispose(): void;
}

export { formatTime, formatDelta } from './format';
export { DomHud } from './hud';
export { MainMenu, PauseMenu, mountRotatePrompt, type MenuCallbacks, type PauseCallbacks, type QualityChoice } from './menu';
export { BestTimes, loadQualityOverride, saveQualityOverride, type BestEntry } from './best';
export { injectStyles, UI_CSS } from './styles';
