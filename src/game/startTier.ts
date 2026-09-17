/**
 * The tier the app starts on and the hero detail its first frame draws — ONE rule for the app (app.ts, the governor's
 * start), main.ts (the renderer's construction options) and the 8 KB boot inline (src/boot/outfit.ts, the declared
 * download): boot fetches only the pair the first frame draws (ask 43 round 4), so the three must agree or the
 * denominator lies. Pure: the callers read storage / the device (src/ui/best.ts `loadQualityOverride` /
 * `loadHeldTier`, `isPhone` here).
 */
import type { QualityTier } from '../core/types';

/** A stored tier string, or null (the inline reads storage raw; best.ts's readers do the same check). */
export function asTier(v: string | null | undefined): QualityTier | null {
  return v === 'low' || v === 'medium' || v === 'high' ? v : null;
}

/**
 * The manual override, else the tier this device last held for 30 s, else medium on a phone / high on desktop.
 * A phone never starts on a stored `high` (best.ts: earlier builds' probe promoted phones to high and the override
 * stuck) — that override reads as auto.
 */
export function startTier(override: QualityTier | 'auto' | null | undefined, held: QualityTier | null, phone: boolean): QualityTier {
  if (override && override !== 'auto' && !(phone && override === 'high')) return override;
  return held ?? (phone ? 'medium' : 'high');
}

/** `render/hero/lod.ts lodChoice` with phone-high asking as `medium`: the authored pair on desktop-high, the LOD twin everywhere else. */
export function firstHeroDetail(tier: QualityTier, phone: boolean): 'lod' | 'full' {
  return tier === 'high' && !phone ? 'full' : 'lod';
}

export function isPhone(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.innerWidth, window.innerHeight) < 500;
}
