/**
 * ONE resolution decision for the whole game (ask 59, items 2 + 3).
 *
 * The art pack and the world map both ship two tiers of the same picture — `1x`/`2x` in the manifest
 * (`src/ui/art.ts`), `-1024`/`-1536` for the world-map plates (`src/ui/worldMap.ts`). Before this there
 * were four copies of "is this a hi-res device", two of them with different thresholds (1400 px for key
 * art and the map, 1600 px for the garage bike), and the offline pack simply fetched **both** tiers of
 * everything — 3.08 MB of plates where a device draws 1.7 MB, and 1.9 MB of variants where it draws one.
 *
 * The rule now lives here and nowhere else, because three separate things must agree or the offline
 * guarantee breaks: what the screens DRAW, what the offline pack FETCHES, and what the loader's DOWNLOAD
 * denominator COUNTS (`src/boot/outfit.ts` picks the matching bucket of `__BOOT_TOTALS__`).
 *
 * Dependency-free: the 8 KB inline loader bundles this file.
 */
export type ArtTier = '1x' | '2x';

/** The other tier — what a device that changed DPR since the download degrades to. */
export const otherTier = (t: ArtTier): ArtTier => (t === '2x' ? '1x' : '2x');

/**
 * Hi-res when the device has real pixels for it: DPR > 1.5 (every modern phone, every retina laptop) or a
 * viewport wide enough that a 960-px plate would be upscaled. Read live, never cached: a window moved to an
 * external monitor gets the right answer on the next screen that asks — and whatever is already cached
 * still draws, because every consumer falls back to the other tier when its first choice will not decode.
 */
// An arrow, bare globals, no `|| 1`: this pair is bundled into the 8 KB inline loader, where `function` and
// `window.` are real budget (ask 43 round 4 fought for those bytes). Outside a browser (node tests, the
// build) there is no window, and no hi-res screen.
export const wantsHiRes = (): boolean => typeof window !== 'undefined' && (devicePixelRatio > 1.5 || innerWidth > 1400);

export const artTier = (): ArtTier => (wantsHiRes() ? '2x' : '1x');
