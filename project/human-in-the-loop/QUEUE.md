# Human queue

Things that need **you**, not an agent. Everything else is `docs/tasks/ASKS.md`. Keep it short; **delete a line once it is
decided** — the decision lands in the thing it changed (the plan, the SPEC, the ASKS row). Each line leads with what it is
waiting on. IDs never reused. Ported from the FF15 demo's `HUMAN_REVIEW.md`.

- **HR-05 — First review-inbox note.** Waiting on: you — when the ✎ NOTE button ships, enter the password once and send one note;
  I pull it and the loop is proven.
- **HR-06 — The new level select, played.** Waiting on: you — live now: menu → PLAY; swipe the tiles, tap a pin, the locked H1, the
  island page. Verdict: ship in v0.3.0 / fix list (`docs/evidence/level-select/` has the clip and sheets).

- **HR-07 — Hero garage art and phone review.** Waiting on: you — review the [complete rider/bike images and recorded motion](../../prototypes/hero-garage/art/ART_HANDOFF.md), then approve or give a concrete visual fix list. Actual iPhone/Safari 30 fps and memory validation remain required for these dense local assets. Claude + Opus own game integration; this review does not authorize deployment.
- **HR-08 — Chromium/Metal GL 1281 with a fully cold Metal cache.** Waiting on: you — the 09-15 startup error is 18/18 non-repro today
  (`docs/evidence/chromium-metal/`); the one untested trigger is a first-ever compile. It is two cache dirs the agent may not move:
  `C=$(getconf DARWIN_USER_CACHE_DIR); mv $C/com.apple.metal /tmp/metal-cache-aside; mv $C/com.google.chrome.for.testing.helper/com.apple.metal /tmp/chrome-metal-cache-aside`
  then `npx tsx harness/hero-ship.mts dist harness/inputs/b1-first-ride/bot-3.json /tmp/coldmetal metal` (after `pnpm build`). Pass → delete this line; fail → reopen the plan with `/tmp/coldmetal/failure.json`.
