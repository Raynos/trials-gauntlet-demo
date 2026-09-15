# Task: loading progress — the number is the boot sequence's own declaration, never an observation

Status: OPEN (2026-09-14, written from source at 20d463d + the working tree). Review only; no code changed.
Owner: core-game. Priority: P0 — the first thing every phone tester sees has been wrong six times today,
and the seventh is on screen now.

## The report

The user, across the day, on the iPhone (LTE, once WiFi): "stuck at 94 %", "94 % is a scam", "100 % but the
sub-items aren't done", "download finished at 35 %", and tonight, with `DOWNLOAD 1.51 MB / 3.46 MB · 44 %`
beside `SETUP 69 %`: "stuck, not going to 100 %, not accurate, keeps getting regressions." Then the ask that
this document answers: review every time it failed, in order; say how big it went; explain why the same bug
keeps coming back when numbers change; and design it so the class is removed statically and permanently.

## 1. The timeline

Seven screenshots (`~/.claude/uploads/f8d5e168-…/`), six loader commits, one open incident. Each row: what
the user saw, what the number was actually made of at that moment, the assumption that broke, what the fix
changed, and what it left standing.

### (a) 17:13 and 17:24 — `94 %`, "World textures", never moves (`e201982f`, `ec82665c`; fixed by `45f6b62` 17:29)

- **Seen:** one bar at 94 %, `Core 1.48 MB in 0.1 s`, a row list with `Script parse + evaluate …` never
  ticked, `World textures` the current step for 4.1 s and then forever; on 3G the first paint was
  black/white before the loader's own CSS arrived.
- **Made of:** the single bar at `3c58a1d` was a 70/30 split — 70 % from the streamed core bytes (byte-exact,
  finished in 0.1 s because the SW had them), 30 % from `boot.done / boot.total` over ten string-named steps,
  with `boot.done++` on step *start* (a running step counted as done). 94 % = 70 + 30 × 8/10: `World textures`
  is the eighth step, and the number is a fingerprint of the formula. The `Script parse + evaluate` row was
  pushed outside the api (never `cur`), so nothing could ever close it.
- **Broke:** `World textures` awaited `renderer.prepare(report)`. The menu's first frame had already started
  `prepare()` with a no-op reporter (`src/render/index.ts:156-157`), so main's later call returned the same
  promise and the reporter it passed was never called — the step had no sub-progress and no end the loader
  could see. Separately, step 7 waited on the whole art pack over LTE.
- **Fix changed:** `this.report = reportArg` rebinds on every `prepare()` call; the art wait is capped at
  1.5 s (`Promise.race` with `setTimeout`) and the key-art wait at 3 s + 2.5 s; the loader's own
  `Script parse + evaluate` row is opened through the api so main's first `step()` closes it.
- **Did not change:** the number is still a weighted sum of string-named steps; the sub-steps still report
  through a callback that any caller can rebind; "done" is still "the awaits happened to resolve or time out".

### (b) 17:48 — "94 % is a scam" (`56a95bfa`; fixed by `e55c4dd` 17:58)

- **Seen:** still 94 %; the row list now full of `World textures · Materials · pl… 16.90340909090909 / 100`
  — eleven rows of raw floats, `Models (background) 2.10 MB / 2.10 MB ✓` counted as done while the bar was not.
- **Made of:** same 70/30. The materials sub-steps were now reporting, each restarting at 0, and every distinct
  label string got its own row (`row(name)` keys on the label).
- **Broke:** the assumption that a label is an identity. `progress(name, …)` treats any name that is not the
  current step as a new background row; the renderer's labels embed counts (`Materials · plank 3/11`), so
  every tick was a new row. The bar's 30 % setup share also made 94 % the natural resting place of a step
  weighing 1/10 of 30 %.
- **Fix changed:** two bars — DOWNLOAD (bytes) and SETUP (steps, weighted: `plan(14)`, `World textures` 4,
  `Key art` 2); whole numbers; `main.ts` maps the renderer's sub-steps onto a monotone 0..100 with a
  hard-coded phase-order array and `best = Math.max(best, …)`; labels are regex-stripped of their counts
  before becoming row keys (`label.replace(/\s*\d+(\.\d+)?\s*\/\s*\d+.*$/, '')`).
- **Did not change:** the phase-order array in `main.ts` must match the label prefixes emitted in
  `render/index.ts` by string; `plan(14)` is a hand-summed constant with a comment justifying it; and now
  there are two independent numbers that can each be honest while the screen is wrong.

### (c) 19:09 — `DOWNLOAD 88 %` held after start (`d71507f4`; fixed by `e05153e` 19:10)

- **Seen:** `DOWNLOAD 4.08 MB / 4.62 MB 88 %` while `SETUP 80 %` ran; `Title art (background) 494 KB / 1.02 MB`.
- **Made of:** DOWNLOAD = streamed core + Resource Timing entries for the `title` and `models` manifest phases
  (`needBytes()` summing every `bg` group with `need`). The title phase (key art 1×/2×, wordmark plate,
  icons, art manifest = 1.02 MB) was declared needed.
- **Broke:** "needed" was a guess in the inline script (`need = { title: 1, models: 1 }`) about what the boot
  sequence would wait for. Boot did not wait for the 2× key art or the icons; the bar did.
- **Fix changed:** `need = { models: 1 }`; the key art became a capped prefetch (`streamBytes` raced against
  2.5 s) that hot-swaps in.
- **Did not change:** "needed" is still decided in `index.html` by phase name, separately from the awaits in
  `main.ts` and the phase regexes in `vite.config.ts` — three files, three vocabularies.

### (d) 19:12 — `DOWNLOAD 100 %` with sub-items not done (`c771198a`; fixed by `cf13f8b` 19:26)

- **Seen:** `DOWNLOAD 3.60 MB / 3.60 MB 100 %` above `Menu art (background) 364 KB / 2.11 MB` and
  `World art (renderer, background) 1.56 MB / 3.17 MB` with no checkmarks.
- **Made of:** the denominator now excluded title/menu/world; the rows still showed them.
- **Broke:** the display's own consistency — a 100 % bar over a list of unfinished rows. Not a wrong number
  this time; a number whose definition the user could not see.
- **Fix changed:** the background rows moved under a `Streams in after start — not needed to play` heading with
  a down-arrow instead of a checkmark (`paint()` → `bghead`, `'ok bg'`).
- **Did not change:** anything about how the number is computed.

### (e) 21:02 — DOWNLOAD finished at 35 % (`e2b50b49`, WiFi; "fixed" by `5086c25` 21:04)

- **Seen:** `DOWNLOAD 1.50 MB / 4.33 MB 35 %` beside `SETUP 69 %` at 1.6 s; no `Models` row at all.
- **Made of:** core 1.52 MB + the `models` phase, which at that build was all four glbs (full + `-lod`) =
  2.83 MB; the numerator was core only. 4.33 MB = 1.52 + 2.83 (the manifest's numbers, `dist/load-manifest.json`).
- **Broke:** at that commit the renderer fetched only `bike.glb` and `rider.glb`
  (`git show 5086c25:src/render/index.ts` — `loadGltf(HERO_URLS.bike)`), so two of the four files in the
  `models` phase were never requested and the phase could not complete — the manifest's idea of "models" and
  the renderer's had drifted when the LOD twins were added to `public/models`.
- **Diagnosed as:** the Resource Timing buffer (250 entries) filling with art-pack requests before the glbs
  landed. A `PerformanceObserver` is not bounded by that buffer (only `getEntriesByType` is), so the diagnosis
  could not explain a missing entry; it was a guess against a source nobody could inspect.
- **Fix changed:** `setResourceTimingBufferSize(4000)`, 8000 on `resourcetimingbufferfull`; the `-lod.glb`
  files re-phased `models-lod` (a phase `watchBackground` neither labels nor tracks); and at `done()` any
  needed phase still short is reclassified as background — `g.need = false; g.total = Math.max(g.done, 1)` —
  so DOWNLOAD reads 100 % at the moment the loader leaves, by definition.
- **Did not change:** the numerator for a background phase still only moves when a whole file completes and
  its URL tail matches a manifest path, and the credit is the manifest's byte count, not the transfer (a SW
  cache hit credits the full size at once). And the re-phase went stale in one minute: `71d1988` (21:05,
  Render r13) changed `setModels` to `Promise.all([loadGltf(full), loadGltf(lodUrl(full))])` on every tier
  (`src/render/index.ts:344` today), so the phone now downloads 2.83 MB of glb, the loader counts 1.95 MB of
  it as needed, and 0.88 MB of it is invisible. "Needed" lives in render's code; the guess in `index.html`
  cannot follow it.

### (f) 22:09 — tonight, open (`b980979c` = `assets/design/loading/current-iphone-portrait.png`)

- **Seen:** `DOWNLOAD 1.51 MB / 3.46 MB 44 %` beside `SETUP 69 % · World textures · Materials · dirt 512²` at
  1.3 s on LTE; no `Models` row. The user: "stuck, not going to 100 %, not accurate, keeps getting regressions."
- **Made of:** core 1.52 MB + `models` 1.95 MB (`bike.glb` 1 180 724 + `rider.glb` 861 612) = 3.46 MB; numerator
  core only. 44 % is `1.52 / 3.46` to the digit.
- **What broke:** the same picture as (e), one build later, with the bigger buffer in place — which is the
  proof that the buffer was not the cause. The phone is downloading 2.83 MB of glb (full + LOD, `71d1988`)
  while the bar counts 1.95 MB of it as needed and can show none of it until a whole file completes, because a
  background phase is credited per Resource Timing entry, never per byte. 56 % of the denominator is two
  files, so the bar has exactly three positions — 44, 78, 100 — and sits on the first one for however long
  1.2 MB takes on LTE while SETUP visibly advances beside it. Then `done()` fires (Key art capped at 2.5 s),
  reclassifies whatever has not arrived, and DOWNLOAD snaps to 100 as the loader leaves. Whether the entries
  would have landed at 3 s or been lost to the SW / a URL mismatch cannot be told from the screen, and that is
  the point: the number is derived from something nobody on either side of the screen can inspect.
- **Two more latent faults in the same code, read today:** (1) `sw.js` serves `/models/` and `/art/`
  cache-first; Resource Timing entries for SW-served responses are browser-dependent in timing and
  `transferSize`, and the loader keys on their existence. (2) `take()` matches by URL tail against
  `byTail[i.path.replace(/^\.?\//, '')]`; any base path, redirect, or query string that survives `split('?')`
  silently drops the match. Neither is tested; both are one deploy away.

### What every fix had in common

Each closed the reproduction in front of it — a rebind, a cap, a second bar, a `need` map edit, a heading, a
buffer size, a reclassification at `done()` — and left the mechanism that produced the number untouched. The
commit subjects say "honest", "counts only bytes the game waits for", "ends at 100 %"; none says what
invariant the code now holds, because there was none to name. Six of the seven fixes added a constant
(70/30, 14, 1.5 s, 3 s, 2.5 s, 250 → 4000 → 8000, 18 rows, `{ models: 1 }`) and the next incident was the
next constant.

## 2. The flaw (one, not six)

**Progress is derived from observation of things the loader does not own, instead of being declared by the
code that does the work.** Everything else on the candidate list is a consequence.

- **Observation, not declaration.** DOWNLOAD reads `performance.getEntriesByType('resource')` and a
  `PerformanceObserver` — a browser-side log with a finite buffer, per-file granularity, SW-dependent
  semantics and URL-string identity — and reconciles it against a manifest by tail-matching. The code that
  actually fetches the bytes (`src/render/art/library.ts:155` `fetch(url, { cache: 'force-cache' })`,
  three's `FileLoader` inside `GLTFLoader`) knows exactly how many bytes it has; it tells the loader nothing.
  (e) and (f) are this directly; (c) is this — the loader guessed what boot needed because boot never said.
- **Two numbers that can each stall.** DOWNLOAD and SETUP are independent state (`dl`+`bg` vs `boot`) painted
  side by side; the screen is wrong whenever they disagree, which is any time one owns a wait the other does
  not. (b)'s fix created the second number; (e) and (f) are DOWNLOAD frozen while SETUP moves. A single
  number over a single plan cannot disagree with itself.
- **"Needed" is a manifest-side guess.** The phase of a file is a regex on its name in `vite.config.ts`
  (`ART_PHASE`, `/-lod\.glb$/`, `/worklet/`); whether a phase is needed is a literal in `index.html`
  (`need = { models: 1 }`); what boot actually awaits is a sequence of `await`s in `main.ts` and
  `render/index.ts` with timeouts racing them. Three files must agree by convention; (c), (e) and (f) are the
  three times they did not. The `done()` reclassification is the confession: when the guess is wrong, rewrite
  the denominator.
- **String-keyed rows, labels and phases.** `row(name)` keys on label text; `progress()` decides whether a
  report belongs to the current step by `name.indexOf(cur + ' · ') === 0`; `main.ts` orders the renderer's
  sub-steps by a `phases` array of label prefixes that must match strings in another file; `plan(14)` is the
  sum of weights written elsewhere. (a) and (b) are this. TypeScript checks none of it because none of it is
  a type.
- **Untyped, untested, unobservable.** The loader is 210 lines of inline ES5 in `index.html` that `tsc` never
  sees, `vitest` never imports, and every headless test bypasses: `?harness=1` removes `#loader` before it
  runs (`index.html:219`), and the e2e suites only `waitForFunction(() => !document.getElementById('loader'))`.
  No test has ever read a displayed percentage. The only instrument is the user's screenshot.

The invariant that should hold — the number is monotone and reaches 100 exactly when boot is done — is not
false because of a bug; it is not *stated* anywhere a compiler or a test could hold it. Each fix repaired a
symptom of that absence, and each change of a constant (a new phase, a new file, a new tier, a new cap)
re-opened it, because nothing made the constants agree.

## 3. How big it went

- **Incidents:** 6 reported on the phone (17:13, 17:48, 19:09, 19:12, 21:02, 22:09) plus the black/white first
  paint on 3G; one is open.
- **Fixes:** 6 loader commits (`3c58a1d` built it 09:34; `45f6b62`, `e55c4dd`, `e05153e`, `cf13f8b`,
  `5086c25` repaired it), each a production deploy the user had to re-open the phone for; the last one
  shipped a diagnosis the next screenshot contradicted. A seventh commit that never touched the loader
  (`71d1988`, render, one minute after the sixth) changed what "needed" meant and nobody could have known
  from its diff.
- **Time:** 17:13 → 22:09, just under five hours of the user's evening in which every phone session began with
  this screen wrong; seven screenshots and four separate written complaints about one component.
- **Share of the day:** 7 of the 55 screenshots the user uploaded today are the loader (13 %); of the ten rows in
  `docs/plans/PLANS.md` "Field reports from the phone", the loader row alone cites four commits and is the only
  one that came back after being marked fixed — twice.
- **What it displaced:** the ship gate runs with `?harness=1`, so "cold boot" in the gate has never included
  the screen a stranger boots through. The one metric the project says it cares about — attempts-to-clear and
  restart latency from a stranger — starts after a screen the stranger may not have trusted enough to wait for.

## 4. The invariant

> **Progress is the boot sequence's own declaration of work done over work declared, and the loader can only
> display it.**

Corollaries the design must make true by construction, not by review: the displayed fraction is non-decreasing;
it is exactly 1 when, and only when, `done()` has been called; nothing that boot does not await is in it; and a
step that boot awaits cannot be missing from it.

### The design that makes it statically true

1. **One typed boot plan, generated at build time.** The Vite load-manifest plugin already walks `public/` and
   the bundle to emit `load-manifest.json`; it additionally emits `src/boot/plan.generated.ts`:

   ```ts
   // generated by vite.config.ts trials:load-manifest — do not edit
   export const BOOT_STEPS = ['core', 'renderer', 'physics', 'audio', 'game', 'front', 'track',
     'firstFrame', 'materials', 'heroModels', 'shaders', 'fonts'] as const;
   export type BootStep = typeof BOOT_STEPS[number];
   export const BOOT_BYTES: Record<'core' | 'heroModels', readonly { path: string; bytes: number }[]> = { … };
   export const BOOT_WEIGHTS: Record<BootStep, number> = { … };
   ```

   The step list is authored once in a small TypeScript table the plugin reads (`src/boot/steps.ts`); the byte
   tables come from the same walk that builds the manifest, so the plan and the manifest cannot disagree. The
   phase regexes go away: a file is in `BOOT_BYTES.heroModels` because `steps.ts` lists `HERO_URLS` (imported,
   not spelled again), and the `-lod` twins are listed by the same import through `lodUrl()`.

2. **Every await in boot is wrapped by the plan, and the plan is exhaustive.**

   ```ts
   const plan = createBootPlan(BOOT_STEPS, BOOT_WEIGHTS, sink);   // sink: (view: ProgressView) => void
   await plan.step('renderer', () => makeRenderer(…));
   await plan.step('heroModels', (p) => loadHeroModels(p));         // p: ByteProgress, passed to the fetch
   …
   plan.done();   // type error unless every BootStep has been passed to step() — see below
   ```

   `step<K extends BootStep>(k: K, work: (p: StepProgress) => Promise<T>)` marks `k` running, awaits `work`,
   marks `k` complete. A step cannot finish without reporting because finishing *is* reporting. Exhaustiveness
   is enforced two ways: statically, `plan` is a builder whose type accumulates the steps used
   (`Plan<Remaining extends BootStep>`; `step` returns `Plan<Exclude<Remaining, K>>`; `done()` exists only on
   `Plan<never>`) — a forgotten or duplicated step is a compile error in `main.ts`; and at runtime `done()`
   throws in dev if any step is not complete, which the vitest property test covers. Nothing about a step is a
   string the UI parses: labels live in a `Record<BootStep, string>` next to the weights.

3. **Bytes are reported by the fetch that fetches.** `streamBytes` already exists (`src/ui/loader.ts`) and
   reports live bytes; it becomes the only way boot-critical bytes enter the plan. The art library takes a
   `ByteProgress` and calls it from its own read loop (it already tracks `bytesDelivered`); the glTF loader
   is given the bytes through `GLTFLoader.parse` after a `streamBytes` fetch, or through `LoadingManager`'s
   `onProgress` — either way the number comes from the reader, not from a browser log after the fact.
   Resource Timing, `PerformanceObserver('resource')`, `byTail`, `take()`, the buffer sizes and
   `resourcetimingbufferfull` are deleted. The long-task observer stays: it annotates, it does not count.

4. **One monotone number, by construction, in the plan.** `ProgressView.fraction` is computed as
   `Σ(weight × stepFraction) / Σ(weight)` and then `Math.max(prev, next)` inside `createBootPlan`; the UI
   receives a value it cannot make go backwards. `done()` sets it to exactly 1 (the completed sum is 1 by
   arithmetic; the clamp is the assertion, not the mechanism). There is no second number. Background work
   (menu art, world art, LOD twins after the first frame) is not in the plan and not in the fraction; it is a
   separate `after: { label, bytes, total }[]` list on the view rendered as "streams in after start", and a
   background item can never be promoted into the number — there is no `need` flag to flip.

5. **The inline loader is a dumb renderer of a typed message, and it is TypeScript.** The inline script's
   only job is first paint and rendering `ProgressView = { fraction: number; step: BootStep; label: string;
   detail?: string; bytes?: { done: number; total: number }; doneCount: number; total: number;
   after: AfterItem[] }` — plus streaming the core bundle, which it does through the *same* `createBootPlan`
   (core is step 0; the module continues the plan by taking over the same object via
   `window.__bootPlan`). Its source moves to `src/boot/inline.ts`; the plugin's `transformIndexHtml` already
   runs the script through esbuild (`vite.config.ts:141`, `loader: 'js'`) — it reads the file and uses
   `loader: 'ts'` instead, and injects the result. `tsc` checks it, `vitest` imports it, the ≤ 6 KB budget is
   asserted in the build. `createBootPlan` is one small module shared by the inline script and `main.ts`.

6. **The tests.**
   - *vitest property test* (`src/boot/plan.test.ts`, fast-check or a hand-rolled generator): for any
     interleaving of `step()` starts, sub-progress reports in any order and with any `done/total` (including
     restarts at 0, `total = 0`, and reports arriving after a later step started), the sequence of
     `view.fraction` the sink receives is non-decreasing, is < 1 before `done()`, is exactly 1 on `done()`,
     and `done()` throws if any declared step never ran. Also: `after` never contributes to `fraction`.
   - *Rendering test* (vitest + jsdom): the inline renderer, fed a recorded view sequence, paints
     `Math.round(fraction × 100)` and never a raw float; a 100 % paint occurs only on the `done` view.
   - *Headless boot test on `dist/`* (`harness/e2e/boot.mts`, Playwright, iPhone 13 geometry): with
     `emulateNetworkConditions` at LTE (≈ 12 Mbps down, 70 ms RTT) and 3G, sample the displayed percentage
     every 50 ms until `#loader` is gone. Assert: non-decreasing; the last sample before removal is 100;
     no gap between consecutive samples > 2 s while bytes are moving on the wire (the "stuck" detector);
     the `after` list never shows a checkmark. Run four ways: SW absent / SW installed (second load), art
     pack present / absent (`public/art` renamed). The ship gate's cold-boot step runs this, not `?harness=1`.

## 5. Close the instances through the invariant

| # | incident | why it cannot recur under the design |
|---|---|---|
| (a) | 94 %, `World textures` never ends; reporter no-op | `materials` / `heroModels` / `shaders` are plan steps wrapped around their awaits; the renderer receives a `StepProgress` bound to the step, not a rebindable field; a step's end is `work()` resolving. There is no reporter to lose. The no-op-first-frame path cannot start the work outside the plan because `prepare()` takes the plan's `StepProgress` as a required argument. |
| (b) | raw floats, per-label rows, 70/30 resting at 94 % | Rows are `BootStep` keys, not label strings; labels are a typed table; the view carries integers only where it carries percentages; there is one number and its weights are generated, so `plan(14)` and the `phases` order array do not exist. |
| (c) | 88 % held by the title plate boot never waited for | "Needed" is not a flag: bytes are in the fraction only if a plan step streams them. The key art is not a step, so it is in `after`, by construction. To make it needed, someone must write `plan.step('keyArt', …)`, which adds it to the exhaustive step type — visible in the diff and the test. |
| (d) | 100 % over unfinished rows | The `after` list is a distinct field with its own rendering; the number is 1 only on `done()`, and nothing in `after` is ever "done"-styled. |
| (e) | 35 %: model entries never observed (buffer / SW / URL) | Resource Timing is gone. The glb bytes are reported by the reader that reads them; a buffer, a SW cache hit or a URL form cannot lose a count because there is no matching. |
| (f) | 44 %: DOWNLOAD frozen while SETUP moved | There is no DOWNLOAD and SETUP; one fraction advances with the bytes of `heroModels` live, at read-chunk granularity, in the same number the shaders advance. The done-time reclassification is deleted, so 100 % can only mean every declared step completed. The headless LTE test's 2 s stuck-detector fails the build on a frozen bar before a phone sees it. |

And the two latent ones read today (SW-served Resource Timing entries; URL tail matching) are closed the same
way: neither mechanism exists.

## 6. Definition of done, owner, estimate, and the current UI

**Definition of done**

- `src/boot/plan.ts` (`createBootPlan`), `src/boot/steps.ts` (authored step table), `src/boot/plan.generated.ts`
  (emitted by `vite.config.ts` next to `load-manifest.json`, committed as a build artifact or gitignored and
  generated in `pnpm build` and `pnpm typecheck` — pick one, state it in the file header).
- `main.ts` boot is `plan.step(...)` all the way down; `done()` exists only on the exhausted plan type
  (`pnpm typecheck` fails if a step is dropped). `render/index.ts prepare()` takes `StepProgress` per sub-step;
  `this.report` and its rebind are gone. `src/render/art/library.ts` and the glTF path report bytes through
  the plan.
- `index.html` inline script is generated from `src/boot/inline.ts`; `watchBackground`, `needBytes`, `bg`,
  `byTail`, `take`, the buffer sizing and the `done()` reclassification are deleted. `src/ui/loader.ts`'s
  string api (`step(name)`, `progress(name, …)`, `plan(n)`) is deleted, not wrapped.
- `src/boot/plan.test.ts` property test and the jsdom render test pass in `pnpm test`; `harness/e2e/boot.mts`
  passes on `dist/` at LTE and 3G, SW on/off, art present/absent, and is the ship gate's cold-boot step.
- No `setTimeout` race decides whether a step is done. The existing caps (art 1.5 s, key art 3 s + 2.5 s) either
  become "this is background" (leave the plan) or "this is needed" (a step with no cap). No new timer,
  swallow, watchdog, buffer size or reclassification is added anywhere in the loader path.
- One cold boot on the phone, LTE, recorded as a clip not a still, showing the number rise without a pause
  > 2 s and land on 100 as the menu appears. The commit subject names the invariant, not the symptom.

**Owner:** core-game (the boot sequence, `main.ts`, `render/index.ts prepare()`, the Vite plugin are all
theirs; the art library's byte reporting is a one-callback change render owns).

**Effort:** about one working day, in this order — plan module + property test (2 h); generated plan from the
plugin + `steps.ts` (1 h); `main.ts` and `prepare()` onto the plan, delete the string api (2 h); art library
and glTF byte reporting (1 h); inline renderer to TypeScript through the existing esbuild hook, delete
Resource Timing (1.5 h); headless boot test at LTE with the four configurations, wired into the gate (2 h).
Most of the time is deletion.

**The current two-bar UI:** the user is choosing a new loading-screen design from `assets/design/loading/`
(A-gate … E-pitboard). Whichever is chosen renders the single `ProgressView` — one fraction, one step label,
one detail line, the byte pair when the step streams, and the `after` list — and nothing else, because nothing
else exists to render. Do not build that UI in this task and do not keep the two bars alive under it: the new
design's first commit replaces the inline renderer's markup, and its data contract is `ProgressView`, fixed
here. Until then the existing markup can be driven from `ProgressView` with the second bar removed (SETUP's
place taken by the step label), which is an afternoon's mechanical change once the plan exists.
