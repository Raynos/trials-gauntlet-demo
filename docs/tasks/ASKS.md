# The user's asks — one ledger, every request, its status, its evidence

Kept current by the parent at every commit and every time the user asks for something. Newest at the bottom of each
table; a row never leaves — it moves from **open** to **done** (with the commit / evidence) or **dropped** (with the
user's words). If it is not in here, it was not asked, or the parent forgot — say so.

Status: **open** (nobody on it) · **in flight** (owner named) · **needs pick** (waiting on the user) · **done** · **dropped**.

## 2026-09-16

| # | ask (the user's words, shortened) | status | owner / evidence |
|---|---|---|---|
| 1 | Deploy latest and make it officially **0.2.1** in the releases | **done** | tag `v0.2.1` = `c7a82e8`, pin `613f6bf`, https://trials-gauntlet-v0-2-1.vercel.app, `RELEASES.md` row; gate 27/30 on the export, live pin replays the b1 Pro golden bit-equal |
| 2 | **Selecting img2threejs is completely broken** (black scene, HUD alive) | **done** | `b06f9ed` — the generator's uv-less hair shell carried an anisotropic material → NaN → bloom spread it over the frame; adapter zeroes anisotropy on uv-less meshes, the bloom high-pass drops NaN/Inf; reproduced + verified headless on Chromium and WebKit; deployed to production |
| 3 | I need to actually **see the model in the garage** / the hero is **blocked by buttons** | **in flight** | garage owner (subagent): hero unobstructed, ≥ 45 % of viewport height |
| 4 | The garage should **look like a garage**, the hero **bigger**, a **model-explorer view I can rotate** | **in flight** | same owner: garage set (floor, tool wall, key lamp), `orbit` camera override, touch-drag rotate + pinch/wheel zoom |
| 5 | **No outfit / Classic-Blender-Img2 selectors on the main menu or pause menu** — all in the garage | **in flight** | same owner |
| 6 | **5 Codex image mockups of a new garage** | **needs pick** | `assets/design/garage/` A pit box · B tool wall · C showroom spot · D workbench · E shutter door + contact sheet + SPEC (recommends C); sent to the user |
| 7 | Did we have 5 mockups of a new **level select**? | **done** | yes — `assets/design/tracks/` A–E (`3351dbb`), never picked; sent to the user |
| 8 | **What mockups are lying around not built** | **done** | tracks A–E (the only orphan); menu B, loading B, controls G, pause chosen direction are built; `hero-targets` are art targets, not UI |
| 9 | Show me all the level-select ones | **done** | sent contact sheet + A–E + current |
| 10 | **Delta image, 0.1.0 Blender hero vs 0.2.1** / 3 before-and-after shots of just the hero | **done** | `docs/evidence/hero-delta-v010-v021/`: rider ×3, bike ×3 (+ |diff| ×3), the three outfits; rider 11 718 → 44 734 tris + real head + 3 outfits, bike 29 356 → 29 940 tris (livery + parts only); verdict = HR-02 |
| 11 | **Build A biome map**; new mockups of **A+D**, **A+E**, and **A1 / A2 / A3** | **needs pick** (mockups done `a67512d`) · **open** (build) | `assets/design/tracks/round2/` A1 / A2 / A3 / AD / AE + contact sheet + SPEC (recommends A2 skeleton + AE road + AD shelf); sent; build = HD-01 |
| 12 | Are we keeping a **durable task list of all my asks**? | **done** | this file; linked from `docs/plans/README.md` and `AGENTS.md` |
| 13 | Which repos have the **session brief** / **human review** flow; we need that here too | **done** | found: `games/kami-kakushi` (origin, 372-line brief), `kami-kakushi2`, `house` (`.claude/hooks/session-brief.sh` + `project/human-in-the-loop/`), `vibe-demos/fe-shooter-prototype-fable` (54-line port + `QUEUE.md`); ported the light version here: `project/human-in-the-loop/QUEUE.md`, `.claude/hooks/session-brief.sh`, `.claude/settings.json` SessionStart |
| 14 | **Update AGENTS.md** with the asks system; document undocumented processes — terse, pointers only | **done** | six pointer bullets appended (asks, human queue, session brief, design rounds, pins/evidence/device, harness docs) |
| 15 | **Before-and-after videos** of the 0.1.0 vs 0.2.1 Blender models | **done** | `docs/evidence/hero-delta-v010-v021/{rider,bike}-turntable-before-after.mp4` (360°, 6 s, side by side); sent |
| 16 | Garage: **UI layout = B**, **set = E**; three new mockups combining them | **done** | `c3fc76f` `assets/design/garage/round2/` BE1–BE3 + SPEC; sent |
| 17 | **BE3 dusk** for the garage | **in flight** | the garage builder was told: B layout, E set, dusk sodium key, wet floor (cheap trick, perf caps hold) |
| 18 | Process, run by me: AGENTS.md trimmed to 3 bullets; queue delete-on-decision; **80/20 markdown budget** with a commit guard (refuse > 40 % unless Design:/Docs:) | **done** | `d788414`; `.githooks/commit-msg` → `.claude/hooks/md-ratio.sh`; the brief prints the tree's share (13 % today) |
| 19 | Port from FF15: **in-game review inbox + drain skill** — Vercel function + Blob, **password entered once, kept in localStorage** | **in flight** | inbox owner (subagent): `api/inbox.ts`, `src/ui/inbox.ts`, `scripts/inbox-pull.ts`, `.claude/skills/drain-inbox`; preview deploy proves the loop |
| 20 | Hero art (HR-02): the user takes it to Codex themselves | **dropped** (user-owned) | not an agent item here; `prototypes/hero-garage` stays the user's |
| 21 | **v0.2.2 when the garage lands**; **deploy on green**, review live on the phone | **open** | pin recipe in `RELEASES.md`; HR-04 is the review |
| 22 | **5 variants of A3 isometric diorama** for the level select | **done** | `d01c42d` `assets/design/tracks/round3/` A3a–A3e + SPEC; sent |
| 23 | "Enough questions — **build autonomously**: new garage, new levels, all the little asks; leave the physics-library plan for another agent" | **in flight** | level-select owner spawned on the round-3 default **A3b one tile lit like A3e** (parent's call, reversible); garage + inbox owners running; physics library untouched |
| 24 | Next after the garage = **level select**; keep all five outfits + three models; physics-library toggle off the main menu when built; stray `0` deleted | **done** | recorded; `0` removed in `d01c42d` |

| HG-01 | Full person + full bike, screenshot in Three.js; work breadth first, pause hair/beard depth | **in flight** | Codex hero owner: complete scene and six poses present; packaged runtime verified, screenshot/recording in captures/whole-package-round17; hair/beard paused, production plan remains open |

## Standing items the asks imply (parent's list, not the user's words)

- Production deploy after the garage round lands (the v0.2.1 pin stays where it is; production moves).
- `docs/plans/README.md` line "pinned v0.1.0" still names only v0.1.0 / v0.2.0 — update when that file is next quiet (another owner is editing it).
- The stray untracked file `0` in the repo root (a shell-redirect typo) — the user's call to delete.
