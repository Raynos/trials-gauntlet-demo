/** The declared hero download for one outfit, class and first-drawn detail. Its own module: the 8 KB inline imports this and never `asset-totals.ts` (whose table pulls the generated model catalog). */
import type { BikeClass, RiderOutfit } from '../core/types';
import type { DeclaredBootTotals } from './asset-totals';

export function heroTotal(t: DeclaredBootTotals, outfit: RiderOutfit, cls: BikeClass, detail: 'lod' | 'full'): number {
  const slot = detail === 'full' ? 1 : 0;
  return t.riders[outfit][slot] + t.bikes[cls][slot];
}
