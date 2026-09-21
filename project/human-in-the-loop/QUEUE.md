# Human queue

Things that need **you**, not an agent. Everything else is `docs/tasks/ASKS.md`. Keep it short; **delete a line once it is
decided** — the decision lands in the thing it changed (the plan, the SPEC, the ASKS row). Each line leads with what it is
waiting on. IDs never reused. Ported from the FF15 demo's `HUMAN_REVIEW.md`.

- **HR-05 — First review-inbox note.** Waiting on: you — when the ✎ NOTE button ships, enter the password once and send one note;
  I pull it and the loop is proven.

- **HR-10 — The hero art build, on your iPhone.** Waiting on: you — open v0.3.0 (link in `RELEASES.md`) in Safari: menu → GARAGE, cycle the five outfits and both bikes, then b1. Two readings: is the garage smooth (the 30 fps bar; `?bench=1` is not needed — just say), and does the hair read right at arm's length? A fix list goes to ask 46's row.

- **HR-12 — Watch the 15 s trailer, and say where it goes (ask 63).** Waiting on: you — `harness/out/trailer/trailer-ui-15s-web.mp4` (4 MB; masters `-15s.mp4` 720p / `-1080p.mp4` beside it). I cannot watch video: I verified it by sampled frames and a frame-to-frame motion measurement, so **the pacing has never been judged in motion by anyone**. Three calls only you can make: (1) does it play — if a beat drags or snaps, name it and an agent retimes it; (2) the phone-in-a-bezel shot from round 1 is captured and scripted but is not in the cut (round 2 spent its bar on riding) — do you want it back in place of an air beat?; (3) **where it lives** — the cut is gitignored and local-only right now (the original oversized master has been removed from Git history). If you want it kept, it goes in `project/releases/<version>/` + `pnpm media:deploy` like the v0.2.0 trailer, which means picking a version to pin it under. Until then the only copy is on this machine, re-renderable with `harness/trailer/capture-ui.sh <sha7>`.

- **HR-13 — World map gestures on your iPhone (ask 54).** Waiting on: you — in Safari on the latest build, open PLAY, pan across two regions, pinch in and out, select a marker, then return to the menu. Say whether any gesture is lost or the map stutters enough to interrupt navigation. No benchmark is needed. The WebKit proxy passed; this actual-phone reading closes the last world-map plan gate.
