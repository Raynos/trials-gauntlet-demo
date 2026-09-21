# Human queue

Things that need **you**, not an agent. Everything else is `docs/tasks/ASKS.md`. Keep it short; **delete a line once it is
decided** — the decision lands in the thing it changed (the plan, the SPEC, the ASKS row). Each line leads with what it is
waiting on. IDs never reused. Ported from the FF15 demo's `HUMAN_REVIEW.md`.

- **HR-14 — Native app publication choices (ask 72; before implementation/submission).** Waiting on: you — publisher/account type and permanent app IDs, target markets/devices, monetization, whether existing web saves need importing, and whether optional OTA is worth funding after the bundled release. Proposed defaults and phases: [`NATIVE_MOBILE_PUBLISHING.md`](../../docs/plans/NATIVE_MOBILE_PUBLISHING.md). The planning request is complete without these decisions; no account purchase or public submission yet.

- **HR-05 — First review-inbox note.** Waiting on: you — when the ✎ NOTE button ships, enter the password once and send one note;
  I pull it and the loop is proven.

- **HR-12 — Watch the 15 s trailer, and say where it goes (ask 63).** Waiting on: you — `harness/out/trailer/trailer-ui-15s-web.mp4` (4 MB; masters `-15s.mp4` 720p / `-1080p.mp4` beside it). I cannot watch video: I verified it by sampled frames and a frame-to-frame motion measurement, so **the pacing has never been judged in motion by anyone**. Three calls only you can make: (1) does it play — if a beat drags or snaps, name it and an agent retimes it; (2) the phone-in-a-bezel shot from round 1 is captured and scripted but is not in the cut (round 2 spent its bar on riding) — do you want it back in place of an air beat?; (3) **where it lives** — the cut is gitignored and local-only right now (the original oversized master has been removed from Git history). If you want it kept, it goes in `project/releases/<version>/` + `pnpm media:deploy` like the v0.2.0 trailer, which means picking a version to pin it under. Until then the only copy is on this machine, re-renderable with `harness/trailer/capture-ui.sh <sha7>`.
