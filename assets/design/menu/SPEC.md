# Main menu — three directions (mockups, no decision)

Round subject: *"I don't like the main menu screen — can you do 3 mockups of alternatives?"* Standing direction: less buttons, more design, stylish; a real game's main menu, not a tech-demo button list; landscape phone first (thumbs live in the bottom corners and reach the bottom-centre); the live 3D scene is an asset; wordmark = TRIALS GAUNTLET; fictional sponsors only.

This document is the deliverable: the current screen for reference, three clearly different directions, what each costs against `src/ui/front.ts`, and a recommendation. **No game code changed and nothing is decided here — the user picks on the phone.**

- Contact sheet (current + A/B/C, labelled): `assets/design/menu/contact-sheet.jpg`
- Directions, full-res PNG as generated (1536×1024): `assets/design/menu/A-paddock.png`, `B-broadcast.png`, `C-gate.png`
- Directions, cropped JPG (A's phone bezel and C's letterbox removed): `assets/design/menu/A-paddock.jpg`, `B-broadcast.jpg`, `C-gate.jpg`
- Current build, headless harness capture, `?sw=0`, one tap after the title: `assets/design/menu/current-932x430.png`, `current-844x390.png` (plus `current-title-*.png` for the screen before it)
- Mockups were generated with Codex image generation from written layout prompts (kept in the session scratchpad); they are direction studies, not pixel truth. Every sponsor in them is from the art pack's fictional set (VORTEX OIL, KESTREL TYRES, NORDVIK, APEX SUSPENSION, BOLT ENERGY); B's rider jersey reads NORDVIK, which is ours.

---

## 0. What is wrong today (`current-932x430.png`)

Wordmark top-left, then a plain left column PLAY / GARAGE (Rookie bike) / SETTINGS / CREDITS in the display face, one grey career line at the bottom-left, the b1 start-line scene (bike, crowd, sponsor barrier) behind a left-weighted side scrim. It is `MainMenuScreen` in `src/ui/front.ts`: a `FocusList` of four items plus `.scrim.side`, `.grain`, `.wordmark`, `.menu-foot` — about 70 lines, all styled from `.menu-*` rules in `src/ui/styles.ts`.

Why it reads as a tech demo: four equal text rows carry no hierarchy (PLAY is the only thing a new player wants and it is the same size as CREDITS); the column sits in the dead zone of a landscape phone (left-middle, under neither thumb, and the hand covers the bike to reach it); the scene is dimmed by the side scrim instead of being framed; nothing on the screen says "trials" except the bike itself — no track, no time, no next-thing-to-do.

---

## 1. The three directions

| Dir | Name | Scene | Primary | Secondary | Wordmark | Extra |
|---|---|---|---|---|---|---|
| **A** | Paddock | Bike parked 3/4 in a lit garage bay, rider beside it | One big amber PLAY, bottom-right | Three icon chips bottom-left (garage / settings / credits) | Large, two lines, top-left | NEXT TRACK card top-right |
| **B** | Broadcast | Full-bleed action key art (rider off a kicker, crowd, barrier) | Lower-third band: PLAY · GARAGE · SETTINGS as horizontal tabs | CREDITS small at the band's right end | Angled badge plate, top-left | Best-times ticker along the bottom edge, LIVE · ROOKIE BIKE chip top-right |
| **C** | Gate | The start gate itself: rider on the line, lights red, barrier and crowd | One wide amber RIDE, bottom-centre | GARAGE pill bottom-left, SETTINGS pill bottom-right | Small, one line, top-left | Swipeable track-card carousel above RIDE (medals on the cards) |

### A — "Paddock" (`A-paddock.jpg`)

**What it is.** The menu is the team garage. The bike sits on its stand in three-quarter view, slightly right of centre, rider beside it, sponsor banners on the back wall, the roll-up door open onto the dark track. The wordmark is big and top-left, with one career line under it (`ROOKIE BIKE · 0 OF 15 CLEARED`). PLAY is a single large amber tile in the bottom-right corner; garage / settings / credits are three small round icon chips in the bottom-left; a compact NEXT TRACK card (thumbnail, name, tier, best) sits top-right. The centre is empty on purpose — the bike is the hero.

**Why it fits the phone.** PLAY is under the right thumb and nothing else competes with it; the three chips are under the left thumb and are clearly tertiary. Nothing lives in the middle band, so no hand ever covers the bike. The next-track card answers "what do I do" without a second screen, and it is the one element that would feel wrong under a thumb, so top-right is correct. The hierarchy is one big / three small / one informational — the "less buttons" brief in its purest form.

**What it costs.** Lowest of the three. `MainMenuScreen` keeps its `FocusList` for keyboard / pad (four items are still there, they are just rendered as one tile + three chips instead of a column); the DOM change is the `.menu-list` becoming an absolute bottom-right tile plus a bottom-left chip row, plus one new `.menu-next` card that reuses the existing track-card art lookup (`kind:'track-card'`) and `nextTrack()` which the screen already calls for the career line. The garage *scene* is the real cost: today the backdrop is the b1 start line with the renderer's idle 3/4 camera. Options, cheapest first: (1) keep the b1 scene and just reframe the UI — the mockup's garage mood is lost but the layout works as-is; (2) put the existing `garage-plate.webp` behind the canvas the way the title puts key art over it at 55 % — cheap, but the 3D bike and a painted garage will not agree on floor and lighting; (3) a real menu camera preset + a small garage set in the renderer — the right answer long-term, it is renderer work, not front-end work. Estimate: half a day for the UI on the current scene, one to two days if the garage set is built.

### B — "Broadcast" (`B-broadcast.jpg`)

**What it is.** A TV sports package. Full-bleed key art (rider mid-air off a rusted kicker at dusk, crowd behind a VORTEX OIL / APEX / BOLT ENERGY barrier) fills the screen. The bottom fifth is a dark lower-third slab with a thin amber top edge carrying PLAY · GARAGE · SETTINGS as horizontal tabs (the active tab has an amber underline), CREDITS in small caps at the band's right end, and a best-times ticker running along the very bottom edge. The wordmark is an angled dark badge plate top-left; a `● LIVE · ROOKIE BIKE` chip sits top-right.

**Why it fits the phone.** Every control is in one horizontal band in the bottom quarter, which is exactly the thumb arc from either corner; the band is also where the pause / results tiles already live, so the game has one "actions live low" rule. The art gets 80 % of the screen with nothing on it. It is the most *stylish* of the three and the most recognisably "a real game" — the lower third and ticker are the visual language of Trials-style titles.

**What it costs.** Medium, and it pays for itself with the least new logic. The tabs are the current `FocusList` rendered horizontally (`flex-direction: row`, the `.menu-bar` becoming an underline), so navigation, hover-focus and cues come for free. The ticker is a new `.menu-ticker` reading `bestOf()` for the authored tracks — data the screen already receives. The badge plate is CSS (`clip-path` on the existing `.wordmark`). The scene is the cost and also the risk: the mockup is key art, not the live renderer. We have `keyart-industrial-1920.webp` and `keyart-canyon-1920.webp` already loaded for the title, so the honest version of B is *the title's key art stays under the menu* (today the title composites key art at 55 % over the canvas and the menu drops it) — that is a flag, not a feature. The live bike then disappears from the menu, which the user has said is an asset; the compromise is key art under the band with the canvas visible above it only on wide screens, which is two layouts. Note the band covers the bottom fifth of the scene, which on the live b1 backdrop is the barrier and front wheel. Estimate: one day.

### C — "Gate" (`C-gate.jpg`)

**What it is.** The menu is the start line. Low camera behind the rider, feet down, start-light tower on the left showing red, barrier and crowd on the right, the first climb lit ahead. A horizontal carousel of track cards (thumbnail, medal disc, name; the centred card larger with an amber ring) spans the lower-middle, and a single wide amber RIDE button sits bottom-centre. GARAGE and SETTINGS are small pills in the bottom-left and bottom-right corners. Credits move into Settings. The wordmark is small and one line, top-left.

**Why it fits the phone.** It collapses two screens into one: the menu *is* track select, so the path from cold boot to riding is tap RIDE, not PLAY → pick a card → confirm. RIDE is at the bottom-centre where both thumbs reach; the corner pills are under each thumb; the carousel is a swipe, which is the one gesture a landscape phone does well. The start gate as backdrop is the closest to the game's own promise — you are on the line — and the red lights turning green on RIDE is a free countdown lead-in.

**What it costs.** Highest, because it changes the flow, not just the menu. `TrackSelectScreen` (≈ 235 lines) already owns the carousel, cards, medal discs, lock rule, per-row focus memory and the `cardgo` launch animation; C means either hosting one row of that inside `MainMenuScreen` or making `TrackSelectScreen` the menu (with the wordmark and corner pills added) and retiring `menu` from `App.screen` and `src/game/flow.ts` (routing is tested — the tests change). The tier structure (five rows, locks) has to become one row with tier separators or a tier switcher, which is a design decision on its own. Keyboard / pad: left/right on the carousel, up/down to the pills, confirm = RIDE — the existing spatial `navigateFrom` handles it. The scene is the cheapest of the three: it is the b1 start line the menu already holds; only the camera moves (a low rear-3/4 preset instead of the idle side 3/4), and the start lights already exist as gate geometry. Estimate: two days plus the flow-test churn; the payoff is one fewer screen forever.

---

## 2. Recommendation

**A, "Paddock", as the direction — built first on the existing b1 scene, with the garage set as a follow-up.** Reasons, in priority order:

1. **It is the brief.** One big PLAY, three chips, a card that tells you what is next: fewer buttons than today with more hierarchy, and every control in a thumb corner. B keeps four text items in a row; C is a bigger, better idea but it is a flow change, not a menu redesign.
2. **Cheapest honest path, and the layout works before the scene does.** A's UI is a restyle of the existing `FocusList` plus one card, half a day, and it looks right over the current start-line backdrop (bike right of centre, PLAY under it). The garage set can land in a later round without the menu changing again. B and C both need the scene changed to look like their mockup.
3. **The live bike stays the hero.** A frames the 3D bike with empty centre; B replaces it with a still; C shows its back.
4. **It composes with the rest of the front end.** Amber tile = `.btn.primary` / focused pause tile; chips = the Visuals `.mini-seg` language; the next-track card = the track select card. No new container.

If the user wants the *boldest* option rather than the safest, pick **C** and budget the flow change: it removes a screen and puts the player on the start line from the first frame, which is the game's identity. Pick **B** if the priority is a title-quality still on the menu and the live bike can be given up.

Whichever wins, the round that ships it needs a played clip on the phone harness: cold boot → title tap → menu → primary action under the thumb → countdown, with a stranger's first tap landing on the right control.
