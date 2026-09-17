You are generating ONE UI mockup image with the built-in image_gen tool. Generate exactly one image, 1536 wide by 1024 tall (landscape). Then copy the generated PNG to the exact output path given at the end of this prompt (mkdir -p the folder). Do not edit any other file. Report the saved path.

THREE images are attached, all captured headless from the live build of "Trials Gauntlet" (a Trials-style 2.5D motorbike game) on a landscape iPhone (932x430 CSS px). Ignore the small red "fps · ms · L" debug readout in each.
- IMAGE 1: the CURRENT home screen (main menu). It is the thing being replaced: it is the same "Broadcast" style as the other two screens but older and flatter — a still key-art photo with a plain lower-third of text tabs. Use it ONLY for the exact wordmark, build stamp, chip, tab text and ticker text. Do not copy its layout.
- IMAGE 2: the LIVE GARAGE — the look the user loves. A dusk garage bay: a wide steel roller shutter half open behind the bike onto a blue-orange evening skyline, a warm sodium work lamp, wet-look dark concrete mirroring the bike, a pegboard tool wall, an IRONWORKS stencil and a BOLT ENERGY sticker on the shutter. The HERO is the game's real 3D rider and bike as drawn here: a blue-and-white-tanked trials bike, the rider in a charcoal hoodie, open-face helmet and blue jeans, seated, side-on. The UI is charcoal shop tags on a rail (left), a charcoal metadata panel with amber stat bars (right), a round "‹ MENU" pill top-right. Every mockup must draw THIS hero (same bike, same rider, same outfit) and, where it shows a garage, THIS bay.
- IMAGE 3: the LIVE LEVEL SELECT — an isometric diorama: one chunky raised industrial terrain tile (rusted container yard, gantry crane, sodium lamps, a KESTREL TYRES / VORTEX OIL / NORDVIK / APEX SUSPENSION sponsor barrier and crowd behind it) on a dark table, round pins on posts with medal discs and name plates, an amber route between cleared pins, a charcoal track card with a big amber RIDE pill bottom-right, a row of biome miniature tiles along the bottom. Where a mockup shows the world, it is THIS diorama language.

## The round (what this is)
The user: "The home screen is feeling stale & old compared to the garage & new level select. Can we do 5 new mockups of a remastered home screen that's really fitting the garage / level select style." Five directions, each a DIFFERENT architecture for the same home screen, described in the DIRECTION section at the end. Every direction must feel like it belongs to IMAGE 2 and IMAGE 3 — same materials, same chrome, same hero, the same 3D-rendered-scene look (a real-time game render, not a photograph) — and must be unmistakably the FIRST screen of the game, not the garage or the level select themselves.

## Framing (same for every mockup)
- FRAME: the phone screen is EXACTLY 1536 x 708 image px (19.5:9), centred, with 158 px of plain black letterbox above and 158 px below. The UI must fill the 1536 x 708 screen edge to edge as a real app would. No phone bezel, no hands, no reflections, no shadow, no iOS status bar, no home indicator.
- Leave a 34 px (screen-space) safe area on the left and right edges (notch side / home side): no text or tappable element inside it.
- Every tappable element is at least 44 x 44 px in screen space (a 932x430 screen = 1536x708 in the image, so 44 px = ~73 image px). One-thumb reach on a phone held in both hands: the thumbs rest in the BOTTOM CORNERS and sweep the bottom third; the primary action must sit under a thumb, the secondary actions within a thumb's arc. Nothing tappable in the top-centre band.
- It must also survive an 844x390 phone: keep ~40 px of slack in the vertical layout (nothing critical in the top and bottom 5 % of the screen except the badge, chip and ticker).

## Visual language: "Broadcast" as it now lives in the garage and the level select
- A TV sports package rendered inside a game. Dark charcoal slabs (#0c0e12 to #171a20) with ONE thin amber top edge (#f2a93b) on the main band or panel; near-white CONDENSED ITALIC display face for headlines (like "GARAGE" and "SELECT TRACK" in the references); small tracked-out caps for labels; tabular numerals for times. Amber (#f2a93b / #ffb020) is THE accent and the colour of the primary action and the selected state; green (#5ad36a) only for a best time under target; medals gold #e2b23c, silver #b9c0c9, bronze #b7713d, platinum pale cyan-white. Amber also happens to be the colour of the garage's sodium lamp — use that.
- Top-left, ALWAYS: the small angled dark badge plate "TRIALS GAUNTLET" (amber italic wordmark on a charcoal plate with an amber left edge, exactly as IMAGE 1–2) and under it the tiny grey build stamp "build 4d2e762 · 2026-09-17". This is the wordmark; there is no other title unless the direction says so.
- Top-right, ALWAYS: the small charcoal chip "● ROOKIE BIKE" (amber dot). Nothing else in the top-right unless the direction says so.
- Bottom edge, ALWAYS: a thin charcoal best-times ticker strip (about 28 px on screen), small tracked caps with tabular numerals, exactly: "BEST TIMES · FIRST RIDE 0:41.200 · LEAN BACK 0:47.900 · KICKER ROW 0:58.100 · UPHILL WEIGHT 0:52.400 · REAR WHEEL FIRST 1:06.800 · STAIRWAY 1:01.300 · HOP UP --:-- · DRUM ROLL --:-- · SEE-SAW --:--". It is information, never a control; a direction may restyle it (e.g. into a printed timing sheet) but must keep the text.
- Sponsors / stencils / stickers / banners ONLY from this fictional set: IRONWORKS, VORTEX OIL, KESTREL TYRES, APEX SUSPENSION, NORDVIK, BOLT ENERGY. No real brands, no real bike makes, no rider names.
- Film-grain-free, crisp UI. Every word legible and spelled exactly as given. No garbled or invented labels.

## The state shown (identical in every mockup)
- Career: 6 / 15 CLEARED · medals ● 0 PLATINUM · ● 1 GOLD · ● 3 SILVER · ● 2 BRONZE.
- LAST RUN: E3 STAIRWAY · CANYON · SILVER · 1:01.300 · target 1:10.000 · ridden on the PRO bike.
- UP NEXT: M1 HOP UP · MEDIUM · INDUSTRIAL · target 1:10.000 · no best yet.
- Bike in effect: ROOKIE (CLASS A · POWER 55 · GRIP 82 · WEIGHT Planted). Outfit: Charcoal · open-face. Rider model: Blender.
- The hero (IMAGE 2's bike + rider, same outfit) is present and large in every direction, drawn as the live 3D scene, never as a photograph.

## The actions (exactly these five — nothing added, nothing dropped)
Today's menu offers, in this order: PLAY (→ the level select), GARAGE (→ the garage), REVIEW (→ the level-review picker), SETTINGS, CREDITS (a minor item, drawn smaller than the others). Every mockup carries all five, spelled exactly PLAY, GARAGE, REVIEW, SETTINGS, CREDITS. PLAY is the one primary and must be the largest, amber, and under a thumb. The others are secondary and may be pills, tags, tabs, cards or labelled places in the scene — but each is a clear ≥ 44 px tappable with its word on it, and there is no sixth action (no LIVE, no ONLINE, no SHOP, no STORE, no profile, no login). The "● ROOKIE BIKE" chip, the ticker, the build stamp and any career / last-run / up-next information are display only.

## Hard rules
- One screen, no scrolling: everything is visible at once.
- Nothing tappable overlaps the hero's bike.
- The badge plate, chip and ticker never overlap anything.
- Charcoal, amber, near-white, the dusk blue-orange of the garage sky and the sodium orange of its lamp are the palette; no other saturated accent except the medal colours and the blue tank of the bike.
