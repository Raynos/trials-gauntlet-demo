# Human queue

Things that need **you**, not an agent. Everything else is `docs/tasks/ASKS.md`. Keep it short; **delete a line once it is
decided** — the decision lands in the thing it changed (the plan, the SPEC, the ASKS row). Each line leads with what it is
waiting on. IDs never reused. Ported from the FF15 demo's `HUMAN_REVIEW.md`.

- **HR-05 — First review-inbox note.** Waiting on: you — when the ✎ NOTE button ships, enter the password once and send one note;
  I pull it and the loop is proven.

- **HR-16 — Open the two store accounts (ask 86, [STORE_RELEASE.md](../../docs/plans/STORE_RELEASE.md)).** Waiting on: you — enrol at
  developer.apple.com/programs (individual, $99/yr; your legal name shows as seller) and play.google.com/console (personal,
  $25; identity verification can take days). Start now: Google's 12-tester × 14-day closed test can't begin until the account exists.

- **HR-18 — Back up the Android upload key (ask 104).** Waiting on: you — copy `~/.config/rockhop/` (upload-keystore.jks + keystore.properties, alias `rockhop-upload`, SHA-256 `C3:61:7C:2E:…:1F:57`) to your password manager / an offline backup. It is not in git by design;
  losing it means a Play support upload-key reset. Also noted: the Android emulator gate is off at your request (machine load) — your own Android phone is the Android check once the
  internal-testing track exists (after HR-16).

- **HR-19 — Support email for the Rockhop store pages (ask 104).** Waiting on: you — both stores require a public privacy +
  support URL; `store/site` (rockhop.vercel.app) prints a contact email and refuses to build without one. Reply with the address
  to publish (a new alias like rockhop.support@… keeps your personal inbox off a public page). Then the parent deploys the site.
