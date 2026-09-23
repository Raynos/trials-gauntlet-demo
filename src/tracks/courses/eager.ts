/**
 * The retired set, bound statically: the only static edge from the registry (`../index`) to `./retired`.
 *
 * Node (the tsx harness, vitest, the physics / audio tools) and `vite dev` read this file as written, so `getTrack('b1-first-ride')`
 * resolves synchronously there exactly as before the retirement. A production `vite build` (web and store) loads
 * it as empty arrays instead (vite.config.ts `retiredTracksLazy`), so no retired course is in the entry chunk:
 * the web build fetches `./retired` on demand (`loadRetiredTracks()`), the store build never.
 *
 * Contract for the stub: every export here is a readonly array, the tracks or the review-segment rows (the plugin emits `export const <name> = []`
 * for each name re-exported below; a name it cannot stub fails the build).
 */
export { CURRICULUM, LAB_TRACKS, PLAYGROUND_TRACKS, RETIRED_TRACKS, SHIP_SEGMENT_ROWS } from './retired';
