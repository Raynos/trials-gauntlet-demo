# Store release — same game, our own identity, on the App Store and Google Play

**Status: planned, decisions taken 2026-09-22 (ask 86); implementation not started. Top priority.** In-flight work
(poses release asks 81/82, continuous deploy ask 84, oxlint ask 85) finishes as it is; the physics-library proposal
is parked until this ships. Parent owns this plan and its row in [README.md](README.md).

## Goal

Ship the game to **Google Play (public production)** and the **App Store (iPhone, via TestFlight then public)** as an
original product that passes store review and gives Ubisoft nothing to point at. The problem is not the gameplay, it
is the **expression**: the name, the look, the level layouts and the copy say "Trials" out loud.

**Kept exactly:** the physics, the bike, the rider, the controls, the fixed-step deterministic sim, instant restart,
checkpoints, the timer, the scoring structure, the garage, the world-map level select, the hero art. Game mechanics
are not protected; expression is. We are not rebuilding from scratch — we are replacing every piece of expression that
was traced from Trials, and nothing else.

**Replaced:** the name and brand, every "Trials" string and image, the Trials-coded palette and HUD presentation, all
shipped level layouts (12 new ones), the music, and every dev/debug surface a store reviewer could trip over.

## Decisions (the user, 2026-09-22)

| # | Decision | Taken |
|---|---|---|
| D1 | Business model | **Free, no ads, no IAP.** No billing code; "Data not collected" privacy labels. |
| D2 | Accounts | **Neither yet, personal.** Apple Developer individual ($99/yr), Google Play personal ($25 once). |
| D3 | Name | **Shortlist + checks**, tone **punchy one-word**. The user picks from the R1 shortlist. |
| D4 | Music | **Local AI + royalty-free library + procedural.** Generated on this 128 GB Mac with an open model (not Suno/Udio); library tracks fill gaps; the engine/SFX synth stays. |
| D5 | World | **Mix the zones:** desert quarry, alpine/forest trail, coastal scrapyard, **plus snow**. The warehouse/neon-Trials look retires. |
| D6 | Levels | **12, all redesigned** — new layouts, not tweaked copies. |
| D7 | Priority | **Top priority; in-flight work finishes;** physics-library plan parked. |
| D8 | Public GitHub repo | **Stays public. Delete the bad stuff from the current tree, do not purge history.** Trials comparison docs are development and stay. |
| D9 | Hero hair + beard licences | **Ship as is** (user accepts the HR-09 risk: "I only care about Ubisoft"). |
| D10 | Web build + old URLs | **Rebrand the web build; retire the old `trials-gauntlet-*` URLs.** |
| D11 | Android | **Personal account + closed test ASAP.** The user has one Android phone and one iPhone. |
| D12 | iPad | **iPhone only** (`TARGETED_DEVICE_FAMILY = 1`); iPad runs it in compatibility mode. |
| D13 | Phase 0 timing (ask 95) | **Start now,** in parallel with the design rounds. |
| D14 | Where the reskin lands (ask 95) | **`main`, visible as it lands** — no store flag for the reskin; production web changes progressively. (`VITE_STORE=1` still strips dev UI, P0.3.) |
| D15 | Closed-test testers (ask 95) | **Need to recruit** — the user has fewer than 12; recruiting (tester-exchange communities) is part of Phase 6 and starts before the first renamed build. |
| D16 | App ID prefix (ask 95) | **`com.jakeverbaten.<name>`** — permanent on both stores. |
| D17 | Name (ask 98) | **ROCKHOP.** R1 shrank to a clearance check of this one name: **clear with caveats** (`docs/evidence/store-release/name-clearance-rockhop.md` — no live mark in 9/41, no same-name app; Specialized's "Rockhopper" is class 12, so never "Rockhopper" and never a mountain-bike angle), so the app ID is **`com.jakeverbaten.rockhop`**; domain is HR-17; store name proposal "Rockhop: Dirt Bike Physics". Identity kit from `assets/design/store-release/round1/A-brand` (survey-marker O, cream/teal/vermilion). |
| D18 | Home screen (ask 98) | **Both A-menu (quarry) and C-menu (harbour) art liked**, under the ROCKHOP wordmark. |
| D19 | Results screen (ask 98) | **A-results** — the "CLEAN LINE" survey-ticket card, OBSIDIAN top medal, BAILS. |
| D20 | World looks (ask 98) | **B-ride (alpine), B-ride-snow (snowline), C-ride (coastal) and W-worldmap are the targets;** A-ride (quarry) rejected — the desert quarry needs a new look in the spirit of B/C. |
| D21 | HUD + controls (ask 98) | **Unchanged: today's HUD layout and the four strip keys at the bottom stay exactly as they are.** Phase 2's "HUD reskin" shrinks to words only (faults → BAILS, no "CRASH!"/"Track finished!", CLEAN LINE finish) + the new results screen. |
| D22 | Rider + bike (ask 98) | **Ship as is,** no livery change. |

**On D11 — the closed test cannot be skipped.** Google enforces it for personal accounts created after 2023-11-13:
production access unlocks only after a closed test with **≥ 12 testers opted in for 14 continuous days**. The only
bypass is an organisation account (D-U-N-S), which the user declined. So the **14-day clock is the critical path** and
this plan starts it as early as possible, on a renamed-but-not-yet-reskinned build, and keeps updating that track
while the reskin lands. The user's own Android phone gets builds the same day through the **internal testing** track
(no review, no tester minimum); the iPhone through **TestFlight internal** (no review).

## Why the stores would reject us today

From the 2026-09-22 IP audit (Explore agent, full report summarised here):

1. **Name.** "Trials Gauntlet" (`src/ui/front.ts:71` `GAME_NAME`, `index.html` ×13, manifest `short_name: "Trials"`,
   `public/offline.html`, 28 splash PNGs, `og.jpg`). TRIALS is Ubisoft's game trademark; GAUNTLET is Atari/WB's.
   Apple 2.1/2.3 also rejects anything that reads as a "trial" or "demo" version.
2. **The credits cite the source.** `src/ui/front.ts:731`: "Thanks — Trials Evolution and Trials Rising for the
   read-outs, the crash stamp and the checkpoint restart." Shipped in the bundle.
3. **Two Labs levels are explicit recreations** of Trials Evolution licence tests (`lab-box-climb` "Container Step",
   `lab-ramp-jump` "Timber Launch", asks 78/79), playable from the world map.
4. **Brand text drawn in the world:** sponsor "TRIALS" / "TRIALS NIGHT" (`render/world/gates.ts:44,551`), neon
   "TRIALS" (`biomeKit.ts:202`, `hall.ts:218`), `poster-trials-night.webp`, `banner-ironworks-series.webp`
   ("IRONWORKS TRIALS SERIES"), `graffiti-nofear.webp` (real brand "No Fear"), `graffiti-rise.webp` (reads as Rising).
5. **HUD presentation is documented as copied** (`docs/design/game.md` §4, `src/ui/hud.ts`): Evolution's timer+fault
   pill, Rising's checkpoint strip and "CRASH!" stamp timing, "Track finished!", Evolution's results reveal.
6. **Production sourcemaps** (`vite.config.ts` `sourcemap: true`) ship the full source including comments naming
   Evolution/Rising/HD/Fusion; `public/art/manifest.json` ships the AI image prompts.
7. **Public repo tracks Ubisoft material:** 8 WAVs cut from Trials Evolution videos
   (`reference/evolution-gameplay/audio/`), 79 contact sheets of Trials footage, `ref-*.jpg/png` frames under
   `assets/blender/`, `docs/research/frames/`.
8. **Store-review surfaces unrelated to IP:** the password-protected review inbox (`?review=1`, `api/inbox.ts`) is a
   hidden feature (Apple 2.3.1); telemetry would force a data-collection label; the new "Update available" pill (ask
   84) and the service worker load code from a server (Apple 2.5.2); the menu's Classic / Blender / Img2 rider switch,
   bench and Labs are dev UI (Apple 2.1 completeness).

What is **already fine** (no work): all audio is synthesised in code (`src/audio/dsp/*`), the music is seeded
original chord progressions, not transcriptions; the font is Barlow Condensed (SIL OFL); key art, icons and world
textures are our own AI generations; sponsor names (VORTEX, KESTREL, NORDVIK, APEX, BOLT) are invented; the rider and
bike are our Blender work; no RedLynx/Ubisoft strings exist in src.

## The bars (measurable, checked by the parent)

1. **Denylist gate = 0.** A new `scripts/ip-audit.mjs` scans the store build (`dist/`, `ios/`, `android/`, store
   metadata) and fails on any case-insensitive hit of: `trials`, `gauntlet`, `ubisoft`, `redlynx`, `evolution`,
   `rising`, `fusion`, `no fear`, `demo`, plus the retired level names. Runs in CI on every push. Internal code and
   docs are out of scope for the gate; the *built* artefacts are in scope.
2. **No retired layout ships.** Every shipped track's height profile correlates < 0.6 with every retired track
   (`scripts/track-originality.mjs`, normalised cross-correlation over the resampled profile), and no track's
   design notes cite a Trials clip.
3. **Gameplay unchanged.** Physics/tuning fingerprint identical before and after the reskin (only the in-flight
   poses release may move it, in its own rounds). Recorded inputs replay to a byte-identical finish time **in the web
   build, the iOS WKWebView and the Android WebView**.
4. **Difficulty curve holds.** Bot attempts-to-clear rises monotonically across the 12 tracks; a stranger (harness
   protocol) clears the first 6; restart latency stays one logical tick, visible restart within today's ship-gate
   budget on the native shells.
5. **Store gates.** Ship gate (cold boot → clear a track → crash → instant restart) green on the iOS Simulator
   (iPhone, and iPad compat mode) and the headless Android emulator; the user plays both phones (HR).
6. **Review passes.** App Store approved; Play production approved after the 14-day closed test.

## Owners (AGENTS.md: builders own paths and verify; only the parent judges)

| Owner | Paths | Scope |
|---|---|---|
| **Brand/UI** | `src/ui/**`, `index.html`, `public/manifest.webmanifest`, `public/offline.html`, `public/art/{icons,splash,menu,og.jpg}` | name, strings, HUD reskin, icon, splash |
| **World** | `src/render/**`, `public/art/{world,worldmap,plates,thumbs}`, `public/models/*` liveries | zones, props, gates, palette, world map repaint |
| **Tracks** | `src/tracks/**`, `tracks/SPEC.md`, `src/tracks/golden.json` | 12 new layouts, playgrounds, goldens, originality check |
| **Audio** | `src/audio/**`, `assets/audio/**`, `public/audio/**` | music generation pipeline, integration, licence ledger |
| **Release** | `capacitor.config.ts`, `ios/**`, `android/**`, `scripts/{ip-audit,store-*}.mjs`, `store/**`, `.github/workflows/**` | native shells, store build flag, CI gates, submissions, web rebrand deploy |

One checkout, no worktrees; subagents retire by 150 responses; one commit per round, subject states the finding.

## Phase 0 — Clean room (first, cheapest, biggest risk cut)

- [ ] **P0.1 Tree scrub (D8).** `git rm` from the current tree: `reference/*/audio/*.wav`, all tracked contact
      sheets/frames of Trials footage (`reference/**/*.jpg`, `assets/blender/pose-study/ref-*.jpg`,
      `assets/blender/previews/_cmp/ref-*.png`, `compare-reference.png`, `docs/research/frames/*` Trials strips).
      `reference/` becomes fully gitignored; notes/manifests with YouTube IDs may stay (they are text, D8 keeps the
      comparison docs). History is not rewritten.
- [ ] **P0.2 Bundle scrub.** Delete the credits "Thanks" line; `sourcemap: 'hidden'` (maps built for our error screen,
      never deployed — `.vercelignore` + store copy step exclude `*.map`); drop `public/art/manifest.json` from the
      bundle (move to `assets/art/`); delete `public/bench/b1-bot-3.json`; retire `graffiti-nofear`, `graffiti-rise`,
      `poster-trials-night`, `banner-ironworks-series`; strip franchise names from comments in `src/`.
- [ ] **P0.3 Store build flag.** `VITE_STORE=1` compiles out: review inbox + `api/inbox` calls, telemetry, bench,
      Labs tracks, the rider-family dev switch (Classic/Blender/Img2), `?`-param dev modes, the service worker and
      the update pill. The `window.__<hook>` automation hook stays **only** in debug builds (the native gate needs
      it), never in release. Unit test asserts each is absent from the release bundle.
- [ ] **P0.4 `scripts/ip-audit.mjs` + CI.** Bar 1 wired into the deploy workflow; it reports today's count as the
      baseline and must reach 0 before Phase 6.

Done when: the store build has no Labs, no dev UI, no network calls, no sourcemaps, and ip-audit's count drops to
the name-only residue (expected: the name, the splash, in-world brand text).

## Phase 1 — Name and brand

- [ ] **R1 Shortlist.** 12+ punchy one-word candidates (D3). Each checked and recorded in
      `docs/evidence/store-release/name-shortlist.md`: App Store search (exact + near), Play search, USPTO + EUIPO
      class 9/41 marks, `.com`/`.gg`/`.app` availability, `<name>.vercel.app`, handle on major socials, and it must
      not contain a genre term that reads as Trials ("trial", "gauntlet", "moto x"), a competitor ("Hill Climb",
      "Bike Race", "Moto X3M") or "demo". Seed ideas to check, not endorsed: *Throttlecraft, Clutchline, Wheelstand,
      Kickstand, Torqline, Ledgeline, Rockhop, Gripline, Revline, Crankcase, Stoppie, Knobbly.* → **HR: user picks.**
- [ ] **R2 Identity kit.** From the picked name: bundle/application ID (`com.<you>.<name>` — permanent on both stores,
      confirm with the user), wordmark, app icon (1024² no alpha for iOS; Android adaptive foreground/background +
      512² Play icon), palette tokens in `docs/design/CONTRACT.md` moving off orange/black hazard, a display font
      choice (Barlow stays for UI or is swapped for another OFL face). Design round with options → **HR: user picks**
      (`assets/design/brand/SPEC.md`).
- [ ] **R3 Rename pass.** Every user-visible string (the audit's ~40 places), manifest, `<title>`/meta, offline page,
      share-sheet titles, 28 splash PNGs regenerated, `og.jpg`, in-world sponsor/neon text. Internal identifiers too,
      because minified strings survive into the bundle: localStorage `trials.*` → `<name>.*` (with a one-time
      migration for existing web players), SW cache names, `trials-synth` worklet, `TrialsSynth`, font-family names,
      Vite plugin names, console tags, track id `x3-gauntlet`, `package.json` name.

## Phase 2 — Look and feel (D5)

Zones replace biomes. Existing code has `industrial`, `canyon`, `snow`, `nightCity`, `foundry` (`src/render/biomes`).

| New zone | Built from | Look | Tier span |
|---|---|---|---|
| **Coastal scrapyard** | `industrial` (reworked) | containers, cranes, junk piles, sea haze, daylight; teal/rust | beginner → easy |
| **Alpine forest trail** | new (timber kit from `canyon` props) | logs, sawmill, logging trucks, pine green/cream | easy → medium |
| **Desert quarry** | `canyon` + `foundry` rigs | sandstone, mining rigs, rope bridges, sun-bleached, teal sky | medium → hard |
| **Snowline** | `snow` (restyled) | glacier, ski-lift towers, avalanche fences, cold blue | hard → extreme |

`nightCity` (neon) and the warehouse interior retire from shipped content — they are the most Trials-coded looks.

- [ ] **Gates and arches.** New checkpoint, start and finish language per zone (e.g. timing-beam posts with flag
      pennants, painted timber arches, quarry-rig gantries) replacing the neon gate.
- [ ] **HUD reskin.** Same information, new presentation and words: timer + crash count in our layout (not the
      top-centre timer/fault pill combination), checkpoint progress in our own form, new crash call-out (not
      "CRASH!" at Rising's 0.2 s timing), new countdown and finish copy (not "Track finished!"), new results reveal.
      "Faults" becomes our own term (proposal: **bails**); medals keep four tiers under our own names and art
      (proposal: bronze/silver/gold + a named top tier, not "platinum"). Proposal set → **HR: user picks**.
- [ ] **World map repaint.** Same pan/zoom/marker engine (ask 38/54); the painted continent regenerated with the four
      zones, 12 markers and 4 playground markers.
- [ ] **Signage and decals.** New sponsor/decal set built on the invented brands, no graffiti that reads as a real
      brand or a Trials title.
- [ ] **Bike livery.** New default livery in the brand palette (rider untouched, D9).

Each item is a design round (`assets/design/<screen>/SPEC.md`, the user picks), judged in played clips.

## Phase 3 — Levels (D6)

- [ ] **Retire** the 15 curriculum tracks, 5 playgrounds and the Labs from shipped builds (code stays in the repo,
      tagged dev-only; their goldens archive with them).
- [ ] **12 new tracks, 3 per zone,** following `tracks/SPEC.md`. The curriculum *teaching* order may stay (lean back,
      uphill weight, hop, see-saw…: mechanics, not expression); the geometry, obstacles, set pieces and names are new
      and built from each zone's own prop kit. No design note may cite a Trials clip or storyboard
      (`docs/design/tracks-storyboards.md` is not a source).
- [ ] **4 playgrounds,** one free-ride per zone.
- [ ] **Per track:** reflex-bot clear + attempts-to-clear, stranger run for tracks 1–6, golden replay committed,
      originality check (bar 2), played clip judged by the parent. Tracks land in zone batches of 3 so the
      closed-test build always has a playable set.

## Phase 4 — Music and audio (D4)

- [ ] **Local generator.** Set up **ACE-Step 1.5** outside the repo (`~/tools/ace-step`, MLX backend on Apple
      Silicon). Checked 2026-09-22: code and weights **MIT**, the model card states generated music may be used
      commercially, training data described as licensed + public-domain + royalty-free. Record the exact commit and
      weights hash in the ledger. Fallback candidates, licence re-checked before use: Stable Audio Open (Stability
      Community Licence — commercial under $1 M revenue), YuE (Apache-2.0). **Not allowed:** MusicGen/MAGNeT
      (CC-BY-NC weights), Suno, Udio.
- [ ] **Cues (instrumental only):** main menu theme, world map, one ride loop per zone (4), results sting. Seven
      cues. Prompts never name an artist, a game or a soundtrack. Every render's prompt, seed, model hash and
      duration go in `assets/audio/LEDGER.md`; ≥ 4 candidates per cue → **HR: user picks.**
- [ ] **Library fill.** Any cue the generator can't nail comes from a royalty-free source whose licence explicitly
      covers commercial use in a distributed app/game (CC0 first); licence text + URL + purchase receipt in the ledger.
- [ ] **Procedural stays** for engine, tyres, crowd, ambience and stingers — it is already original.
- [ ] **Integration.** Loops cut on bar boundaries, AAC `.m4a` (plays in WKWebView and Android WebView), ≤ 15 MB
      total, decoded to `AudioBuffer`s on the existing graph, ducked under the engine, respects the volume setting;
      iOS audio session **ambient** so the silent switch mutes it. Tests stay silent (navigator.webdriver rule).
- Note: purely AI-generated music is likely not copyrightable by us — others could reuse it. It gives no one else a
  claim against us; accepted.

## Phase 5 — Native shells

- [ ] **Capacitor** (current major) wrapping the `VITE_STORE=1` build; `ios/` and `android/` committed; all assets
      bundled, **zero network required** (reviewers often test offline).
- [ ] **iOS:** landscape only, iPhone only (D12), status bar hidden, home indicator auto-hide, `PrivacyInfo.xcprivacy`,
      `ITSAppUsesNonExemptEncryption = NO`, launch storyboard with the wordmark, keep-awake during rides, audio
      session ambient. Progress/best times move to `@capacitor/preferences` (WKWebView localStorage can be evicted
      under storage pressure), with the web build keeping localStorage.
- [ ] **Android:** landscape, immersive fullscreen, system back = pause menu / exit confirm, target SDK = Play's
      current requirement at submission time, App Bundle with **Play App Signing**; the upload keystore lives
      outside the repo (`~/.config/<name>/`), never committed.
- [ ] **Native gate harness** (no browser of our own — AGENTS.md): iOS Simulator via `xcrun simctl`
      (boot → install → launch a debug build whose in-app gate runner plays recorded inputs → results via
      `simctl spawn log stream`, clip via `simctl io recordVideo`); Android via headless `emulator -no-window`, adb,
      and Playwright's Android/WebView CDP connection. Runs the ship gate and the replay-identity check (bar 3).
- [ ] **Performance.** The adaptive quality governor gets an Android WebView tier check on the emulator; the user's
      two phones are the real reading (HR).

## Phase 6 — Stores

- [ ] **HR-16 accounts, now.** Apple Developer (individual) and Google Play Console (personal) enrolment +
      identity verification. Note: an individual Apple account shows the user's legal name as the seller.
- [ ] **Credentials for automation** (user creates, stored outside the repo): App Store Connect API key (.p8) and a
      Play service-account JSON, so the Release owner uploads builds with fastlane. **Pressing "Submit for review"
      and "Release" stays the user's call** (outward-facing).
- [ ] **Listing kit** in `store/`: name, subtitle (30), promo text, description, iOS keywords (100 — no competitor
      names, Apple 2.3.7), Play short (80) and full description, category Games › Racing (or Sports), iPhone 6.9"
      landscape screenshots and Play phone screenshots **taken from played runs** (never posed), Play feature graphic
      1024×500, optional 15–30 s app preview built with the trailer pipeline (majority gameplay).
- [ ] **Compliance:** privacy policy + support page on the rebranded web domain (both stores require a URL even with
      no collection), "Data not collected" (iOS) / no data shared or collected (Play Data safety), age ratings (Apple
      questionnaire; IARC on Play; target audience 13+ to stay out of the Families policy), content-rights
      declaration, EU DSA status **non-trader** (free, no monetisation), export compliance none.
- [ ] **Android track sequence (D11):** internal testing (the user's phone, same day) → **closed test with ≥ 12
      testers, started the day the first renamed build exists** → keep pushing reskin builds to it → after 14
      continuous days, apply for production (Google asks about the test) → production review. Tester recruitment is
      the user's (HR); testers must stay opted in for all 14 days.
- [ ] **iOS track sequence:** TestFlight internal (the user's iPhone, no review) → optional external TestFlight →
      App Store review with the final build. Review notes: "offline single-player game, no account, no data".

## Phase 7 — Web rebrand and retiring the old URLs (D10)

- [ ] New Vercel project **named before its first deploy** (global CLAUDE.md), serving the store-equivalent web
      build plus the privacy/support pages; the ask-84 deploy workflow retargets to it.
- [ ] The old production domain redirects to the new one for a transition period, then is deleted; the pinned
      `trials-gauntlet-v0-*` and `trials-gauntlet-review` deployments are deleted. `RELEASES.md` records it.
- [ ] Optional, user's call: rename the GitHub repo (GitHub keeps a redirect).

## Sequencing — the 14-day clock is the long pole

```
P0 clean room ──► R1 name (HR pick) ──► R3 rename ──► P5 native shell ──► internal test + TestFlight
                                                             │
                                                             └──► CLOSED TEST STARTS (day 0) ── 14 days ──► apply prod
   P2 look ─┐                                                           ▲ updated builds keep landing
   P3 levels├── in zone batches, pushed to closed test + TestFlight ────┘
   P4 music ┘
                                              final build ──► App Store review ─┐
                                                          ──► Play production ──┴─► public on both
```

Ship gate every third round, as always. Rounds are numbered in `docs/evidence/store-release/ROUNDS.md`.

## Human queue items this plan will file

HR-16 accounts (filed now) · name pick (after R1) · bundle ID confirm · brand kit pick · HUD/terms pick · zone art
picks · music picks · 12 closed testers · credentials for upload · both phones play-check · final Submit/Release.

## Costs

Apple $99/yr · Google $25 once · music $0 (local) plus any library track bought · optional custom domain ~$15/yr.

## Out of scope for v1

Game Center / Play Games leaderboards, cloud save, iPad-native layout, gamepad polish, localisation, monetisation,
the physics-engine selector. Each is a later plan.
