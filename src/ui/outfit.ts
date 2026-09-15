import type { RiderOutfit } from '../core/types';

export const RIDER_OUTFIT_KEY = 'trials.riderOutfit';
export const DEFAULT_RIDER_OUTFIT: RiderOutfit = 'street';
export const RIDER_OUTFITS: readonly RiderOutfit[] = ['street', 'race'];
export const OUTFIT_LABEL: Record<RiderOutfit, string> = { street: 'Street', race: 'Race kit' };
export const OUTFIT_DETAIL: Record<RiderOutfit, string> = { street: 'Hoodie, jeans & trainers', race: 'Jersey, race pants & boots' };

function isOutfit(value: unknown): value is RiderOutfit {
  return value === 'street' || value === 'race';
}

/** A valid URL override affects this page only; otherwise read the committed garage preference. */
export function loadRiderOutfit(override?: string | null): RiderOutfit {
  if (isOutfit(override)) return override;
  try {
    const stored = localStorage.getItem(RIDER_OUTFIT_KEY);
    return isOutfit(stored) ? stored : DEFAULT_RIDER_OUTFIT;
  } catch {
    return DEFAULT_RIDER_OUTFIT;
  }
}

export function saveRiderOutfit(outfit: RiderOutfit): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RIDER_OUTFIT_KEY, outfit);
  } catch {
    // The selection still applies to the current page when storage is unavailable.
  }
}
