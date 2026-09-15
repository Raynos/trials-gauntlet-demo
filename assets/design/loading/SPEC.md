# Loading screen — five directions (mockups, no decision)

Round subject: *"Loading screen got stuck, not going to 100 % and not accurate. I don't like how it can't just load smoothly to 100 % and keeps getting regressions. It's also great how much feedback it gives, but keeping all the done steps there permanently is a lot. Redesign it — 5 mockups to choose from."*

This document is the deliverable: the current phone screen for reference, five clearly different directions, one shared rule for what the number *is*, what each direction costs against the inline loader in `index.html`, and a recommendation. **No game code changed and nothing is decided here — the user picks on the phone.**

- Contact sheet (current + A–E, labelled): `assets/design/loading/contact-sheet.jpg`
- Directions, full-res PNG as generated (1024×1536 portrait): `A-gate.png`, `B-odometer.png`, `C-ticker.png`, `D-poster.png`, `E-pitboard.png`
- Same five as phone-sized JPG: `A-gate.jpg` … `E-pitboard.jpg`
- Reference: `current-iphone-portrait.png` (the user's iPhone, portrait, LTE, 1.3 s in — DOWNLOAD 44 %, SETUP 69 %, seventeen rows)
- Mockups were generated with Codex image generation from written layout prompts (kept in the session scratchpad); they are direction studies, not pixel truth. Every sponsor is from the fictional set (VORTEX OIL, NORDVIK, APEX SUSPENSION, BOLT ENERGY, KESTREL TYRES, IRONWORKS). Every mockup shows the same moment on purpose — 62 %, World textures · dirt 512² · 41 %, nine steps done, 4.2 s, 715 kbps — so the directions are compared on layout, not on numbers. Mockup nits: B's ring arc is drawn a little short of its own 62; D's key art is lighter than the prompt asked (the built version darkens harder, §1 D).

---

## 0. What is wrong today (`current-iphone-portrait.png`)

Two bars that answer two different questions (DOWNLOAD = bytes, SETUP = boot steps), a status line that repeats the SETUP label, then every step ever run as a permanent row (five files, eight boot steps, the live one, a *streams in after start* group of three) and the elapsed seconds at the bottom. On the phone in portrait that is seventeen rows of 12 px text under two numbers that never agree.

Why it feels stuck and regresses, read from `index.html`:

- **DOWNLOAD's denominator includes files the loader does not fetch itself.** `needBytes()` adds the `models` phase (`need = { models: 1 }`) to the streamed core: those bytes are counted from Resource Timing as each file's entry appears, matched by path tail against the manifest. A model file that is never requested before the title, is served from a path that does not match its manifest tail, or is simply not needed by the first screen, parks the bar under 100 % until `done()` quietly drops the phase (`g.need = false`). The bar then jumps to 100 at the crossfade — exactly "not going to 100 %".
- **SETUP's numerator can go backwards.** `progress()` sets `boot.frac = done / total` for the current step; World textures reports a `best` fraction over a changing set of jobs and Key art streams bytes against a manifest estimate, so `frac` can move down within a step. `step()` then resets `frac` to 0 and adds the previous step's *weight*, so a step that reported 60 % and weighed 1 ends by adding the same 1 whether it reported 0 or 99 — fine — but the number the user watches dips whenever a sub-step's total is revised.
- **Two bars can never both be at 100 while anything is happening.** Download finishes at ~40 % of wall time on LAN and ~90 % on 3G; setup finishes at the end. Whichever the eye lands on looks wrong for half the load.
- **The list is a log, not a status.** `row()` caps at 18 rows and evicts the oldest, so on a long load rows silently vanish too — the wall is both permanent and lossy.

Nothing here is dishonest; it is all real numbers. The problem is that there are two of them and every step is kept on screen.

---

## 1. The shared spine (all five directions)

Every direction draws **one number**, keeps **one live line**, folds the done steps into **one count**, and hides the **full log behind a native disclosure**. The directions differ only in how the number is drawn and where the pieces sit. This spine is what the implementation builds once; the direction is styling on top of it.

### 1.1 One monotone number

```
p_dl   = bytesReceived / bytesNeeded         // the streamed core set only (three, index, fonts) — the manifest knows the total before the first byte
p_boot = (weightDone + frac × weightCurrent) / plannedWeight     // plan(14) as today: 10 steps, World textures 4, Key art 2
p      = W × p_dl + (1 − W) × p_boot
shown  = max(shown, floor(p × 99))           // never backwards, never 100 before done()
done() → shown = 100, then the 240 ms crossfade
```

- **`W` is a time weight, not a byte weight.** Default `W = 0.5`. After the first visit the loader stores `{ dlMs, bootMs }` in `localStorage` (`trials.loadProfile`) and uses `W = dlMs / (dlMs + bootMs)`, clamped to 0.2–0.8. On LAN the number then spends most of its travel on setup; on 3G most of it on download. Either way it moves at roughly constant speed against the clock, which is what "smooth" means to a person.
- **The `models` / `title` phases leave the number.** They are counted and shown as detail (the live line, the log) but a phase counted from Resource Timing can never be in the denominator of the hero number, because the loader does not control when or whether those requests happen. The core set is fetched by the loader itself, byte by byte, so its total is exact and its completion is certain.
- **`max()` is the anti-regression rule.** When a sub-step's total is revised down, the number pauses rather than dips. Honest: a pause *is* the truth ("this step turned out to be bigger"); a dip is not.
- **99 is the ceiling until `done()`.** The number reads 100 only when the title is on screen and fading in. No "100 %" with a black screen behind it.
- **Freeze detection stays.** The `longtask` observer still marks the step; the red mark moves from a row to the live line (a red ■ before the step name) and into the log.

### 1.2 What stays visible, what folds

| Element | Today | All five directions |
|---|---|---|
| Hero | two bars + two % | one number (drawn per direction) |
| Live step | status line + SETUP label + its own row (three copies) | **one line**: `WORLD TEXTURES · DIRT 512² · 41 %` (step · detail · its own unit) |
| Download detail | KB counter next to the DOWNLOAD label | folded into the live line while downloading (`DOWNLOAD · three.js · 729 KB / 1.29 MB`), gone after |
| Done steps | one row each, permanent | **one count**: `✓ 9 STEPS DONE` (A, C, E add the elapsed of the done part) |
| Background phases | a three-row group with ↓ arrows | in the log only; after the title lands the game's own front end owns those |
| Full log | *is* the screen | `<details class="log">` wrapping today's `<ol>` — native, zero JS, works in iOS Safari, closed by default, remembered open/closed in `localStorage` for the developer who wants it open every time |
| Elapsed, kbps | footer | footer, unchanged (11 px, corners) |
| Failure | error text + ⟳ Retry | unchanged, replaces the live line |

The `<ol>` and every `setRow()` call survive untouched inside the `<details>`: the harness, the timelapse and anyone debugging a 3G load still get the full row log, it is just not the screen.

### 1.3 Portrait and landscape

The loader shows in portrait (the game's rotate-to-play gate comes after it) but the desktop and a phone already in landscape see the same HTML. Each direction below states both. The shared rule: under 500 px of height the hero shrinks one step and the sponsor strip drops; nothing else changes.

---

## 2. The five directions

| Dir | Name | The number is drawn as | Live line | Done steps | Log | Backdrop |
|---|---|---|---|---|---|---|
| **A** | Gate | Five start-gate lamps (phases) + big % under them | under the % | `✓ 9 STEPS DONE` chip | `DETAILS ▾` chip | blurred dark arena, floodlights |
| **B** | Odometer | Tacho ring + drum digits | under the gauge | `✓ 9 DONE` text | `DETAILS ▾` pill | brushed dark metal |
| **C** | Ticker tape | Horizontal rail, five phase nodes, % above the live node | under the live node | strip of nine tick glyphs | `TAP FOR DETAILS` | tarmac + painted line |
| **D** | Poster | Slim amber bar on the bottom edge, % at its end | above the bar, left | none on screen (in the log) | tiny ⓘ | full-bleed key art |
| **E** | Pit board | Chunky tyre-tread gauge with a 0–100 scale | NOW row | DONE row (`9 STEPS · 2.1 S`) | ▾ on the DONE row | pit board over a dark garage |

### A — "Gate" (`A-gate.png`)

**What it is.** The start-gate light tower stands dead centre: five lamps, top to bottom DOWNLOAD · ENGINE · TRACK · TEXTURES · READY. Done phases are green, the live phase amber, the rest red. Under the tower a very large amber italic `62%`, the live line beneath it, then two chips: `✓ 9 STEPS DONE` and `DETAILS ▾`. Wordmark badge top-left, sponsor strip and footer along the bottom. The backdrop is the dark arena, blurred hard.

**What the % is made of.** The spine number (§1.1). The lamps are a second, coarser reading of the *same* number: each lamp owns a band of the weighted total (DOWNLOAD = the `W` share; ENGINE = renderer + physics + audio + game + front end; TRACK = the track step + first frame; TEXTURES = World textures + fonts + key art; READY = `done()`), and a lamp turns green when `shown` passes the top of its band. Two readings of one number cannot disagree.

**Detail.** The live line under the %; done steps as the chip count; the full log opens under the chips (a `<details>`, pushing the sponsor strip down).

**Portrait / landscape.** Portrait is the mockup. Landscape lays the tower on its side above the number — five lamps in a row, labels under them — which is a `flex-direction` swap and is the shape of the real gate anyway; under 500 px of height the lamps shrink to 24 px and the % to 56 px.

**Cost.** Low–medium. Markup: five `<i class="lamp">` plus labels (~300 B). CSS: a radial-gradient lamp in three states, the tower housing as one bordered column (~700 B). JS: the band table (five thresholds) and a class flip in `paint()` (~200 B minified). The tower art in the mockup is a rendered prop; the built one is CSS discs in a dark column — it will read as UI, not as a photo, and that is fine on a dark ground. The blurred arena backdrop cannot be there at first paint (no art before the core lands); the built version is the current radial gradient, with the arena optional as a blur-up after the title phase. Estimate: half a day including the spine.

### B — "Odometer" (`B-odometer.png`)

**What it is.** One dashboard instrument: a three-quarter amber ring gauge with tick marks, filled clockwise from the left; inside it the % as mechanical drum digits, the next digit peeking from below; `LOADING` in small caps under the digits. Wordmark badge centred above. One live line, then `DETAILS ▾` and `✓ 9 DONE` on one row. Sponsor strip and footer at the bottom, the lower third otherwise empty.

**What the % is made of.** The spine number, drawn twice in one instrument: the ring is `stroke-dasharray` on one SVG arc, the digits are two columns of 0–9 translated by `transform`. Both read `shown`; the drum roll makes the "never backwards" rule visible — drums only turn one way.

**Detail.** The live line under the gauge; done count as plain text next to the disclosure; the log opens beneath, into the empty lower third, which is why that space is empty.

**Portrait / landscape.** Portrait is the mockup. Landscape puts the badge left, the gauge centre, the live line and chips right of it in a row; under 500 px of height the ring shrinks to 160 px. The empty lower third disappears in landscape, so the log opens as a scrolling panel of fixed height instead.

**Cost.** Lowest of the five for what it gives. Markup: one inline `<svg>` with two `<circle>` (~250 B), two digit columns (~120 B). CSS: the drum window with `overflow: hidden`, `transition: transform 240ms` on the columns, tick marks as a `repeating-conic-gradient` on a ring-shaped pseudo-element (~600 B). JS: set `stroke-dashoffset` and two `translateY` values in `paint()` (~120 B). No art at all, so it is identical at first paint and at 99 %. The mockup's brushed-metal texture is the existing radial gradient plus the existing grain. Estimate: half a day including the spine, and it is the one direction with no "the built one will look different" caveat.

### C — "Ticker tape" (`C-ticker.png`)

**What it is.** A horizontal rail across the middle of the screen with five slanted nodes — DOWNLOAD · BUILD · TEXTURES · SHADERS · READY — lit left to right, the rail filled amber up to the live node, the % sitting just above it and moving along with it. Under the live node the live line and, in grey, its bytes and %. Below that a strip of nine small green ticks captioned `9 STEPS DONE · TAP FOR DETAILS`. Wordmark top-left, sponsor strip and footer at the bottom, a painted start-line stripe across the tarmac behind.

**What the % is made of.** The spine number; the rail fill is its width, the nodes are the same five bands as A's lamps (BUILD = ENGINE + TRACK, SHADERS split out because it is the step that freezes under a cold GPU cache — the node with the red mark is the one that matters). The % travelling with the fill end makes it read as one thing.

**Detail.** The live line anchored under the active node (it re-centres when the node changes); done steps as literal ticks, one per step, so the strip grows visibly; the log opens under the strip.

**Portrait / landscape.** This is the landscape-native direction: the rail spans a 932 px screen with room for labels, the % rides above it, the log opens below in the remaining height. In portrait at 390 px the five labels are tight (≈ 70 px each) — the mockup gets away with it at 1024 px; on the phone the labels drop to 9 px tracked caps or the outer two lose their text and keep their tick. That is the honest weakness of C in the orientation the user actually sees.

**Cost.** Medium. Markup: rail, five nodes, five labels, a tick strip (~450 B). CSS: slanted nodes via `skew`, three node states, the % positioned by `left: calc(var(--p) * 100%)` (~800 B). JS: the band table shared with A, one tick appended per `step()` (~200 B). The stripe backdrop is a `linear-gradient` at an angle — no art. Estimate: three quarters of a day, plus the portrait label decision.

### D — "Poster" (`D-poster.png`)

**What it is.** Full-bleed key art — the NORDVIK rider off the rusted kicker inside the hall, crowd behind the VORTEX OIL / APEX / BOLT ENERGY barrier — the same picture family as the main menu B it hands off to. No list, no chips. Along the very bottom edge a 4 px amber bar, its filled end capped; above the bar's right end a large amber `62%`; above its left end the live line and a grey second line with bytes and elapsed; a tiny ⓘ in the corner for details. Wordmark badge top-left.

**What the % is made of.** The spine number as bar width and as the numeral. Nothing else on screen moves, so there is nothing for it to disagree with.

**Detail.** The live line only. Done steps are not on screen at all — the count is inside the log, which ⓘ opens as a dark sheet sliding up over the bottom third. This is the least feedback of the five and it is deliberate: D says "you are already looking at the game".

**Portrait / landscape.** Portrait is the mockup; the art is composed tall. Landscape needs a second crop of the same key art (the menu already has `keyart-industrial-1920.webp` in landscape) — the bar and text layout are identical, only `object-position` changes. Under 500 px the % drops to 40 px.

**Cost.** Highest, and the one that fights the loader's first rule. The loader paints with the first HTML bytes and no art; key art is 400 KB–1 MB and belongs to the `title` phase. So the built D is: dark ground + bar + text at first paint, then the art fades in when it lands — on LAN within a second, on 3G tens of seconds after the bar has been moving. Two honest mitigations, both cheap: (1) inline a 32×48 blurred JPEG of the key art as a `data:` URI (~1.2 KB, inside the 8 KB) and show it scaled up with `filter: blur(24px)` from the first byte — a blur-up, the art sharpens when the real file arrives; (2) start the `title` phase fetch from the loader itself, in parallel with the core, so the picture arrives as early as the link allows. The bar and text are ~400 B of markup and CSS. The risk is not bytes; it is that a static poster with a thin bar is the most familiar loading-screen shape in games and on a slow link the "poster" is a blur for a long time. Estimate: one day (a portrait crop of the key art, the blur-up asset in the build, the sheet for the log).

### E — "Pit board" (`E-pitboard.png`)

**What it is.** A mechanic's pit board fills the screen: steel-framed dark board, the wordmark badge wide across the top with a `ROOKIE BIKE` chip, `LOADING` and a big amber `62%` over one chunky tread-textured gauge with a 0 · 25 · 50 · 75 · 100 scale, then exactly three slabs — `NOW  World textures · dirt 512² · 41 %  ●`, `NEXT  Fonts, Title art`, `DONE  9 steps · 2.1 s ✓ ▾`. Sponsors run stencilled down the left edge; footer at the board's foot; a dark garage bay barely visible above.

**What the % is made of.** The spine number as the gauge fill and the numeral; the printed 0–100 scale makes the fill legible without reading the numeral, which matters at arm's length.

**Detail.** The most structured of the five: NOW is the live line, NEXT answers the question the current screen never answers ("what is it waiting for after this"), DONE is the count plus the time the done part took, and its ▾ opens the log in place, growing the board. Nothing is lost, nothing is permanent.

**Portrait / landscape.** Portrait is the mockup — the board is a tall object. Landscape puts the gauge across the top of a wide board and the three rows beneath it in one column on the left, the sponsor rail moving to the bottom edge; the board keeps its frame. Under 500 px the frame and the sponsor rail go and only the gauge and three rows remain.

**Cost.** Medium, with one API change. Markup: three rows (~350 B). CSS: the framed board, the tread gauge (a `repeating-linear-gradient` chevron pattern masked to the fill), the scale (~900 B). JS: `plan()` grows from a count to an ordered list of step names with weights — `plan([['WebGL renderer',1], …, ['World textures',4], …])` — so the loader can print NEXT and can weight the number without waiting for `step()`; that is a one-line change in `src/main.ts` (line 214) and a ~150 B change in the loader. `ROOKIE BIKE` is read from `localStorage` (`trials.bikeClass`), which the loader can do before any script lands. The board and the garage are CSS and the existing gradient; no art. Estimate: three quarters of a day including the `plan()` change.

---

## 3. Recommendation

**B, "Odometer", as the direction — with E's `NEXT` line folded into it if the user wants more than one line of detail.** Reasons, in priority order:

1. **It is the complaint, answered literally.** The user asked for one number that only goes up and reaches 100. B is nothing but that number, drawn as an instrument whose drums physically cannot turn backwards. Every other direction adds a second reading (lamps, nodes, a scale) that has to be kept in agreement.
2. **It is the only direction whose mockup is the build.** No art, no blur-up, no prop that becomes CSS discs; the ring and drums are 400 B of SVG and CSS and paint identically at the first HTML byte and at 99 %. It fits the ≤ 8 KB inline rule with room left over.
3. **It is the same product as the menu.** Dark ground, amber, the badge plate, one line of small caps, sponsors at the foot — B's loader fades into the Broadcast menu without a change of register.
4. **The empty lower third is the log's home.** Details open into space the design already reserved, so the curious user and the developer get the full wall on request, and nobody else sees it.

If the user wants the loader to *say more* by default, pick **E** — the NOW / NEXT / DONE board is the best information design of the five and costs one `plan()` change. If the user wants the loader to *look like the game*, pick **D** and accept the blur-up on slow links. **A** and **C** are the same idea in two orientations; A is the better portrait screen, C the better landscape one, and neither is as clean as B in both.

Whichever wins, the round that ships it owes: a 3G harness clip (CDP 750 kbps) showing the number moving without a single backward step from 0 to 100 and the crossfade landing on the menu, plus the same on LAN, and the `trials.loadProfile` weight measured on the phone so the number travels at an even pace against the clock.
