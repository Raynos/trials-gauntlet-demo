# Human queue

Things that need **you**, not an agent. Everything else is `docs/tasks/ASKS.md`. Keep it short; **delete a line once it is
decided** — the decision lands in the thing it changed (the plan, the SPEC, the ASKS row). Each line leads with what it is
waiting on. IDs never reused. Ported from the FF15 demo's `HUMAN_REVIEW.md`.

- **HR-05 — First review-inbox note.** Waiting on: you — when the ✎ NOTE button ships, enter the password once and send one note;
  I pull it and the loop is proven.

- **HR-14 — Real iPhone riding/AA check (asks 73–74).** Waiting on: you — open **https://trials-gauntlet-review.vercel.app** (preview of `c7885c4`, deployed 2026-09-22; production unchanged) on the iPhone and play. Optional subjective review of forward/back lean readability and edge quality during ordinary play on the user’s iPhone; no benchmark or measurements requested (the standing no-more-benchmarks decision remains in force). Headless WebKit uses the phone layout at 932×430, DPR capped1.5, and proves compatibility only; it is not an actual iPhone performance reading. Local evidence: `docs/evidence/riding-poses/qualification-round3/`.

- **HR-16 — Open the two store accounts (ask 86, [STORE_RELEASE.md](../../docs/plans/STORE_RELEASE.md)).** Waiting on: you — enrol at
  developer.apple.com/programs (individual, $99/yr; your legal name shows as seller) and play.google.com/console (personal,
  $25; identity verification can take days). Start now: Google's 12-tester × 14-day closed test can't begin until the account exists.

- **HR-15 — Turn on continuous deployment (ask 84).** Waiting on: you. The workflow is on `main`, and its checks (typecheck, lint, tests, build) already run on every push, but it deploys nothing until the `VERCEL_TOKEN` secret exists. The Vercel CLI login can't create tokens (403), so: vercel.com/account/tokens → Create → scope **Project: trials-gauntlet-demo** (the same kind as "wildshard proto single deploy") → then in your own terminal run `gh secret set VERCEL_TOKEN -R Raynos/trials-gauntlet-demo` and paste it. **Adding it is the decision:** from then on every green push to `main` becomes production, including the forward-pose candidate the riding session now keeps on a preview. Agents will keep unfinished work off `main` (AGENTS.md).

- **HR-17 — Register a ROCKHOP domain (ask 98, D17).** Waiting on: you — the name cleared (`docs/evidence/store-release/name-clearance-rockhop.md`:
  no live ROCKHOP mark in 9/41, no store app of that name). rockhop.com/.net/.app are taken; **rockhop.gg** or **rockhopgame.com** are free —
  buy one (~$15–70/yr) before the name is announced; it hosts the privacy/support pages both stores require. Also grab **@rockhopgame** handles
  (YouTube free; TikTok/IG/X unchecked). Or say "vercel.app is fine" and the pages go on rockhop.vercel.app.
