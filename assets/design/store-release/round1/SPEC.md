# Store release — round 1: three identities (mockups, nothing decided)

Ask 95, plan [STORE_RELEASE.md](../../../../docs/plans/STORE_RELEASE.md) Phases 1–2. Same game, new expression: name,
palette, HUD, words, zones. **The user picks; no game code changed.** Names are *placeholder candidates*, not yet
checked against stores or trademarks (R1 does that).

- Contact sheet: `contact-sheet.jpg` (rows A, B, C; last row world map + snowline).
- 14 images, full-res `*.png` as generated plus `*.jpg`. Generated with Codex `gpt-6-sol` image_gen, 14 runs in
  parallel, 78–195 s each (`briefs/gen.sh`, `briefs/runs.txt`; shared brief + direction + screen). References given
  to the generator were `current-*.jpg/png` (today's build), used only for camera scale and screen content.
- Judge the direction, not pixel truth: the model re-renders, so the ride frames are closer-in than the real
  camera and none of the terrain is a real track.

| | Name | Mood | Palette | Crash word · call-out | Finish | Top medal | Checkpoints / progress |
|---|---|---|---|---|---|---|---|
| **A** | ROCKHOP | field-survey kit, contour lines, trig markers; light, sunny UI | cream · teal · vermilion · ink · ochre | BAILS · "BAIL +1" tag by the timer | CLEAN LINE | OBSIDIAN | MARKERS, triangle trail along the top |
| **B** | STOPPIE | national-park signage, routed wood, embroidered patches | pine · cream · trail red · timber · charcoal | WIPEOUTS · swinging "WIPEOUT" sign | TOPPED OUT | SUMMIT | BLAZES, vertical altimeter on the right edge |
| **C** | KNOBBLY | harbour signwriting, container stencils, signal flags | teal · rust · signal yellow · off-white · navy | SPILLS · tally marks + "SPILL" pennant | DOCKED! | CHROME | BUOYS, signal-flag bunting along the top |

All three put the timer top-left and restart top-right (the top-centre timer + fault pill, the centre "CRASH!" stamp and
"Track finished!" are gone), and all three move off the orange/black hazard palette to daylight worlds.

- **A** — `A-brand`, `A-menu` (desert quarry), `A-ride` (quarry gantry checkpoint), `A-results` (survey ticket card).
- **B** — `B-brand`, `B-menu` (alpine sawmill), `B-ride` (timber arch + pennants), `B-ride-snow` (snowline, same
  HUD), `B-results` (routed signboard).
- **C** — `C-brand`, `C-menu` (harbour), `C-ride` (buoy gate over containers), `C-results` (clipboard card).
- **W** — `W-worldmap`, direction-neutral: one continent, coastal → alpine → desert → snow, 12 markers + 4 FREE RIDE
  flags, a locked-zone sign on the trail.

**Defects the generator added (not the design):** `C-brand` tagline reads "TRIALS BEYOND THE TIDE" (on the denylist:
exactly what the ip-audit gate is for); `C-results` has a black/yellow hazard-striped barrel; `A-ride` puts the
lean/brake glyphs over the terrain rather than in faint corners.

**To pick:** a direction (or a mix, e.g. A's HUD with B's world), and which name(s) go into the R1 shortlist check.
