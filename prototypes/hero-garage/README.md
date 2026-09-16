# Hero Garage

Independent Three.js production viewer for target 01. This package imports no game boot, gameplay physics, rider factories or model-selection code. It presents actual exported GLBs only; missing assets produce a visible error. Current assets and their provisional status are declared in `public/assets/catalog.json`. Loading successfully is not an art acceptance gate.

## Current milestone

Milestone A remains unaccepted. Main production proceeds through local Blender and licensed authored assets independently of neural generation. MPFB correction2 improves beard fit and eyes but still fails hair and identity; a replacement authored hair source is being investigated. See [previous comparison clip](captures/head-authored-a3/webkit-orbit-relight.webm) and [parent verdict](reports/parent-review-authored-a3.json). Hunyuan is a separate parallel experiment and TRELLIS work is paused. No body, bike, riding motion, runtime budget or actual iPhone pass is claimed. The hourly heartbeat is paused while the active goal runs.

## Run and build

From this directory:

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm run preview
```

The local server is http://127.0.0.1:4178. Run commands prepare reference copies from the authoritative repository originals with `tools/prepare-references.mjs`; inspect `references/manifest.json` for hashes. `/identity.html` is the reference board. Generated asset sources, provenance, and evidence are owned by the corresponding `art`, `reports`, and `captures` directories.

Use the repository's headless harness only; do not launch an interactive browser for evaluation. The separate `tools/capture.mjs` harness documents its CLI arguments in its source. Example:

```sh
npm exec playwright install webkit chromium
npm run verify:assets
npm run capture -- --engine webkit --seconds 30 --name head-candidate01
```

The viewer supports touch orbit/pinch and responsive controls. Coarse-pointer devices render at a 30 fps cap; desktop caps at 60. Internal DPR caps are 1.5 for narrow viewports and 2 for desktop. These are chosen settings, not evidence of actual iPhone performance. Performance acceptance still requires the declared real device.

## Catalog contract

```json
{
  "version": 1,
  "stage": "Milestone 0 — identity and source study",
  "reference": { "url": "/references/target01.png", "label": "Target 01 · design concept" },
  "assets": [
    { "id": "head-candidate01", "label": "Anatomical source study", "url": "/assets/head-candidate01.glb", "kind": "head" }
  ],
  "notes": ["Provisional source study. Identity and hair acceptance remain open."]
}
```

Asset kinds are `head`, `rider`, and `bike`. Optional `position` and `rotation` are three-number arrays; rotation uses radians. Optional `scale` is a uniform number. GLB coordinates are Y-up, meters, face forward along +Z. Assets share one coordinate space; do not normalize each body component independently. The first head should be centered near `(0, 1.65, 0)`. Face framing fits head bounds, full/reference fit all assets, and bike fits bike bounds. Without a separate head, face framing selects the upper portion of the rider bounds. Bike UI is disabled when no bike exists.

Use glTF PBR-compatible exported materials. GLTFLoader preserves appropriate texture color spaces; renderer output is sRGB with ACES filmic tone mapping and fixed exposure. Garage and neutral lighting both use the same environment and no post-processing. Unsupported compression requires adding and validating the appropriate decoder before cataloging those exports.

Authored animations appear by their exported clip names. Missing clips leave transport disabled with an explicit explanation; camera orbit is not a substitute for character motion.

## Deterministic headless inspection

`window.__heroGarage` and `window.__garage` are aliases. Use `?capture=1` to stop the automatic render loop, wait for `ready === true` (or fail on non-null `error`), and drive the renderer explicitly.

- `setCamera('face' | 'full' | 'bike' | 'reference')`: fit a fixed comparison camera; resets orbit angle.
- `setLighting('neutral' | 'garage')`: immediately apply and render lighting.
- `setClip(name)`: select a real exported animation, reset time and pause.
- `setTime(seconds)`: pause, evaluate the mixer at absolute time, render. Clips loop by duration.
- `setOrbit(radians)`: absolute orbit offset from the selected camera preset, render.
- `setFrame({time, orbit, lighting?})`: apply time, orbit and optional lighting together, with exactly one render. Preferred for measured capture.
- `setPlaying(boolean)`: live authored animation playback outside capture mode.
- `getDiagnostics()` or `state`: asset URLs and clips, camera position/target, time, lighting, render dimensions/triangles/draw calls, object-memory counts, catalog load milliseconds, render interval samples and p95.

Memory counters count geometry/texture objects, not GPU bytes. Render interval p95 is a UI loop observation, not isolated GPU duration. In capture mode the external harness owns timing. A capture must preserve its browser, GPU, resolution, DPR and warmup metadata; screenshot I/O overhead is not scene frame time.

No visual milestone is accepted solely by the viewer. The parent reviews played orbit/relighting clips against the reference, with no more than three visible defects per correction round.

### Matched head comparison

The touch-accessible **Compare head at equal scale** button opens the original concept crop beside the live GLB. It does not replace the runtime render. `setComparison(true | false)` exposes the same toggle to the harness; diagnostics report the framing contract. The original target image remains unchanged: the viewer samples pixel rectangle `(694,128,111,118)` and enlarges it without generative reconstruction.

For the current Street01 source, face framing uses a fixed Y-up head envelope from `(-0.115,1.528,-0.10)` to `(0.115,1.805,0.19)` meters, excluding the bust. In comparison, the reference camera fits this envelope and the concept crop height follows the projected crown-to-chin height. Both panes therefore show the declared head height at the same pixel scale, including after responsive resizing; the reference retains its own head-width ratio. This is a framing comparison, not a pixel-registered overlay or a claim that the two designs have matching anatomy. New asset proportions require an explicit framing-contract review. Orbit and relighting remain live.
