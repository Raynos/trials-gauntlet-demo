/**
 * Automated runs are silent (the user's rule, ask 86: "all testing must be without audio").
 * Playwright sets `navigator.webdriver` in every engine, and headless WebKit has no mute flag —
 * it plays through the Mac's speakers — so the game refuses to open an AudioContext under
 * automation. `?audible=1` opts a run back in. Offline rendering (OfflineAudioContext) is untouched.
 */
import { DEV_SURFACES } from '../core/release';

export function silentAutomation(): boolean {
  if (typeof navigator === 'undefined' || navigator.webdriver !== true) return false;
  // A store build reads no `?` parameter (src/core/release.ts): automation is always silent there.
  return !DEV_SURFACES || typeof location === 'undefined' || new URLSearchParams(location.search).get('audible') !== '1';
}
