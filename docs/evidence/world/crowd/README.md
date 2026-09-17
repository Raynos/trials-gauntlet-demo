# Ask 62 — "cloned photo-cutout crowds"

**Before:** `src/render/world/gates.ts crowdSheet()` used the art pack's keyed photo row
(`crowd-day` / `crowd-night`: 8 photographed spectators, one pose) as the crowd card atlas — one
cell per person, the same 8 cut-outs cloned along every start / checkpoint / finish gate and the
spectator bridges, the cheer only a vertical bob.

**After:** the crowd is the game's own — `src/render/world/crowd.ts`:

- 16 painted silhouette figures per track (`castCrowd`, seeded from the track), each with an **idle
  pose** (5 kinds: stand, lean with a hand in a pocket, hands on the rail, phone up, arms crossed)
  and a **cheer pose** (5 kinds: both arms up, one fist, arms wide, flag, clap) — every pose kind on
  3–4 of the 16 figures, atlas neighbours never the same pose or shirt.
- Per-figure skin (6), shirt (12 distinct per cast, muted toward the hall key, a third with a stripe
  or a shirt number), trousers, hair (incl. long hair), headwear (cap / beanie / hood), sunglasses by
  day; a **night cast** for nightCity / foundry (jackets, beanies, hoods, cool grade, lit phone
  screens with a glow).
- Painted with a light side / shadow side and grounded feet (`shadeCell`), one 1280 × 512 atlas
  (2 rows: idle | cheer), 2.6 MB in GPU vs the photo row's 2.0 MB; the 119 KB `crowd-day` fetch left
  the boot set and `crowd-night` the nightCity / foundry track sets.
- The card shader (`cardMaterial`, mode 0) now picks the atlas **row** on cheer (a figure whose bob
  phase is on the up-beat switches to its cheer pose while `uCheer` is on, so half the crowd is up
  at any instant), **mirrors half the cards** by a hash of their position, and each instance carries
  an exposure / warmth tint (`crowdTint`, 0.72–0.95): a cell that repeats in a 30-person gate cluster
  is mirrored, scaled, tinted and in a different row from its twin.
- Draw budget unchanged: the crowd is still **one instanced card batch** (`props:crowd:<chunk>`),
  same material, same program; +0 draws, +0 tris. The photo sheet stays as an option behind
  `CROWD_PHOTO_SHEET = false` in `gates.ts` (off by default; its ids would need re-adding to
  `art/boot-set.ts` / `art/library.ts idsFor`).
- Tests: `src/render/world/crowd.test.ts` (pose coverage, colour variety, night wardrobe,
  determinism, tint bounds).

**Budget (`pnpm harness:bench --tracks b1 --tiers high,low --geoms phone`, before = the same tree with the
world files at HEAD, after = this tree, same host):** high · b1 calls 145 → 145, tris 251 k → 251 k,
programs 57 → 54, tex 79.5 → 83.1 MB (the bench counts the photo row at its 119 KB delivered size and the
painted atlas at its 3.5 MB RGBA + mips; real GPU delta ≈ +0.9 MB crowd, +0.35 MB tarp); low · b1 calls
102 → 102, tris 102 k → 102 k, programs 47 → 45, tex 51.7 → 52.4 MB. (The 145-call phone-high row is above
the 123 budget on both sides: that is the hero pool work in the tree, not the world.)

## Clips (played, same recording and ticks on both sides; before = HEAD's world files, after = this tree)

| file | what |
|---|---|
| `b1-start-gate-before-left-after-right.mp4` | b1 from GO for 3.5 s at 30 fps: the 30-person start crowd cheering as the bike launches (left: photo cut-outs bobbing; right: painted figures switching to their cheer poses, mirrored / tinted) |
| `b1-start-gate-sheet.jpg` | 8 frames of that clip, each tile = before (left) / after (right) |
| `b1-gate-0.7s-before.jpg` / `b1-gate-0.7s-after.jpg` | the gate at 0.7 s, cropped |
| `p1-checkpoint2-before-left-after-right.mp4` | p1 (industrial playground) through checkpoint 2 at speed, 4 s @ 60 fps (the world-pair cell) |
| `p2-checkpoint2-before-left-after-right.mp4` · `p2-cp2-before-zoom.jpg` / `p2-cp2-after-zoom.jpg` | p2 (canyon playground) through checkpoint 2, the same window; zoom on the 7-person cluster |
| `h1-night-gate-after.jpg` | h1 (nightCity) start gate at 0.9 s: the night cast (jackets, beanies, hoods, lit phones) |

## Blind world pairs (`harness/compare/RUBRIC.md`, `pnpm harness:pair … --mask`, one fresh critic per pair, logged with `harness:log-verdict`)

Same 4 s cells before and after (b1 = the standing r4 `world-industrial-1` window ticks 1800–2280 vs
Evolution warehouse `eg10 4.0–8.0`; p1 = checkpoint 2 pass at x 160 vs the same ref; p2 = checkpoint
2 pass at x 182 vs Rising canyon `rv02 5.2–8.0`). The rubric judges **motion** (weight, contact,
camera, cuts, continuity), and the recording, physics and camera are identical on both sides of
each cell, so the crowd cannot move these numbers much — they are reported because the ask named
them as the judge. See `PAIRS.md` for the per-pair scores.
