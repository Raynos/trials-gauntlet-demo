# Garage hover flash (ask 29) — the reload under the stage

`probe-hover.mts` (run: `npx tsx docs/evidence/garage-hover/probe-hover.mts` against a built `dist/`) opens the garage headless, wraps the renderer's `setTrack` / `clearWorld` / `setBikeClass`, dispatches one mouse `pointerenter` on the Pro chip and samples the stage over the next six frames.

| build | setTrack | clearWorld | setBikeClass | stage hidden meshes (before → frames) |
|---|---|---|---|---|
| before (`4d2e762`) | 1 | 1 | 2 | 575 → 389 389 389 389 389 389 |
| after | 0 | 0 | 2 | 575 → 575 575 575 575 575 575 |

Before: `Game.setBike` in the menu phase ran a full `loadTrack` → `renderer.setTrack` → `clearWorld`; the stage kept only the meshes it had hidden from the *old* world, the new world came up half-visible under the set — the grey flash on every hover and every rookie ↔ pro tap. After: the menu phase swaps livery and engine voice only; the physics row reloads on the next arm (`startRun` / `loadTrack`). The e2e `front` flow's G4 checks (`harness/e2e/touch.mts`) assert 0 `setTrack` per swap and failed 2/2 geometries on the old build (351/353) before passing 445/445 on the fix.
