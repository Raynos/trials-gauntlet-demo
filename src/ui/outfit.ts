import type { RiderOutfit } from '../core/types';
import { AVAILABLE_RIDER_PRESETS, DEFAULT_RIDER_OUTFIT, normalizeRiderOutfit, normalizeRiderFamily, type RiderModelFamily } from '../core/riderPresets';

export const RIDER_OUTFIT_KEY = 'trials.riderOutfit';
export { DEFAULT_RIDER_OUTFIT } from '../core/riderPresets';
export const RIDER_OUTFITS: readonly RiderOutfit[] = /* @__PURE__ */ AVAILABLE_RIDER_PRESETS.map(p => p.id);
export const OUTFIT_LABEL = /* @__PURE__ */ Object.fromEntries(/* @__PURE__ */ AVAILABLE_RIDER_PRESETS.map(p => [p.id, p.label])) as Record<RiderOutfit, string>;
export const OUTFIT_DETAIL = /* @__PURE__ */ Object.fromEntries(/* @__PURE__ */ AVAILABLE_RIDER_PRESETS.map(p => [p.id, p.detail])) as Record<RiderOutfit, string>;

/** A valid URL override affects this page only; otherwise read the committed garage preference. */
export function loadRiderOutfit(override?: string | null): RiderOutfit {
  return loadPreference(override, normalizeRiderOutfit) ?? DEFAULT_RIDER_OUTFIT;
}

export function loadRiderModelFamily(override?: string | null): RiderModelFamily {
  return loadPreference(override, normalizeRiderFamily) ?? 'street';
}

/** URL overrides are session-only; both boot and garage share fallback/storage semantics. */
function loadPreference<T>(override: string | null | undefined, normalize: (value: string | null | undefined) => T | null): T | null {
  const requested = normalize(override);
  if (requested) return requested;
  try {
    const stored = localStorage.getItem(RIDER_OUTFIT_KEY);
    return normalize(stored);
  } catch {
    return null;
  }
}

export function saveRiderOutfit(outfit: RiderOutfit): void {
  const canonical = normalizeRiderOutfit(outfit);
  if (!canonical) return;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RIDER_OUTFIT_KEY, canonical);
  } catch {
    // The selection still applies to the current page when storage is unavailable.
  }
}
