# Phone aliasing — ask 74, round 1

The previous low tier rendered at DPR 1 directly to the canvas, with both context MSAA and
composer MSAA disabled and no final antialiasing pass. Wildshard's source reference is
`/Users/raynos/projects/games/project-wildshard-singleplayer/src/core/Game.ts` and `tier.ts`:
half-float HDR, phone DPR 1.5, SMAA LOW after tone mapping. The new path adopts those phone
settings with Three's bundled SMAA, retaining this game's ACES and biome grade. Desktop uses
the bundled medium search algorithm; it does not claim Wildshard HIGH diagonal-search parity.

Low still omits AO/bloom; phone-high retains the small emissive-only bloom. Low/phone-high do
not acquire chromatic fringes or speed smear merely because HDR now runs. The low-tier width
budget remains 1600 pixels. All tiers dispose and resize their HDR/AA resources.

Headless captures use recorded input and inspect GL errors plus hashes of served build/model
bytes. Phone viewport 932×430, requested DPR 3: the actual buffer grows 932×430 → 1398×645.
The 90 sampled physics states are byte-identical before/after AA. The synchronized render
p95 rises 3.24 → 4.40 ms on **desktop WebKit**, not an iPhone. Concurrent capture load makes
these diagnostic timings, not a controlled device benchmark or a 60 fps phone claim.
Desktop-high Chromium/Metal and phone-high WebKit also capture without errors.

The original Snow Line capture failed: mixed indexed/non-indexed obstacle geometry silently
dropped the plywood material batch. Identity indices preserve its vertices, normals and UVs
and restore the batch. A regression compares the entire attribute multiset against individually
rendered obstacles and confirms unchanged colliders. The new Snow Line capture has no errors;
its existing track-triangle budget warning remains (94,364 vs 80,000).

Five targeted tests, scoped ESLint, app/harness typechecking and the build passed. Parent review
inspected frames from the input-driven clips; this is not a claim of human continuous playback.
The clip paths and hashes, build inventories, state hashes and host timings are in `report.json`.
Clips remain local under ignored `harness/out/render-aa-round1/`.

Capture recipe: `pnpm exec tsx harness/hero-capture.mts <frozen-build> <recording> <new-output>
120 360 low street-mustard 30 932x430 webkit 3 phone`. Snow uses
`harness/inputs/p3-snow-line/bot-3.json`, ticks 480–720; the pose comparison uses
`harness/inputs/hero-r15/seated-forward-back.json`. Actual iPhone validation and deployment
remain open; riding-pose implementation continues separately.
