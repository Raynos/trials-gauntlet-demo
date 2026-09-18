# PWA offline — round 5: the gate, the copy, and the one thing only a phone can answer (ask 58)

## Ship gate, `--quick --build`, on a clean export of the working tree

`pnpm harness:gate --quick --build` run in a fresh copy of the tree (`git ls-files -c -o
--exclude-standard` rsynced to a clean directory, `node_modules` symlinked) — no stale `dist/`, no
`harness/out/` carried over. Full log: `ship-gate-quick.log`.

```
PASS  offline.coldStartPlayable    100/100 done=true in 17102 ms  (limit true)  10/10 offline e2e checks pass
NO-SHIP: 28/31 checks pass, track=flat-test, physics=bikePhysicsFactory-v2, wall=178s
```

The three failures are the three SwiftShader GPU-timing rows this machine has always failed, each one
printed with its own `SwiftShader limit; ship target NOT met (informational on this machine)` note:
`boot.firstFrameMs` 6 443 / 4 000, `restart.frameMsP95` 192 / 150, `perf.renderSyncedMsP95` 1 357 / 250.
`docs/plans/README.md` records the standing baseline for this box as 27/30 with the same three. Nothing
in this work touches the render path; `determinism.pass` is 9/9, `clear.*` and `restart.ticks` are green,
and the new row passes.

## What the player is told

`src/ui/offlineStatus.ts` asks the worker what it holds (the `VERSION` message) and the settings footer
says it, once:

> **Offline ready · 40.5 MB in 180 files · iOS clears it after 7 days without opening the game**

That closes the plan's §6.5 ("a version the page can read") and §9.1 (the eviction question) together.
The user's call was to **accept** the 7-day eviction and not engineer around it — `storage.persist()`
does not exist on iOS and there is nothing else to try — so it is stated rather than hidden.

## Draft HR row (for the parent to add to `project/human-in-the-loop/QUEUE.md` — not added here)

```
- **HR-12 — The game in aeroplane mode, on your iPhone home screen (ask 58).** Waiting on: you. Open the new
  build in Safari **once**, let it reach the menu (the loading bar now pulls the whole game — about 39 MB —
  so give it the one load it asks for), then Share → Add to Home Screen. Kill Safari and the app from the
  app switcher, turn on **Aeroplane Mode** (Wi-Fi off too), and open the icon. Four readings: (1) what is on
  screen while it starts — it should be the dark plate with the wordmark, not white; (2) does the loader reach
  100/100 and show the menu; (3) can you ride B1 to the finish; (4) in the garage, swap through all five
  outfits and both bikes — every one should appear with no waiting and no grey stand-in. If any of them fails,
  say what was on screen and for how long. Then turn the radio back on and open it again: you should get ONE
  loading screen and come up on the new build — there is no "Update available → Reload" toast any more, on
  purpose.
```

## What is left after this round

- **HR-12 itself.** Headless Chromium is not iOS Safari: it cannot prove the home-screen install, the
  standalone launch, the launch image, WebKit's service-worker lifecycle in a standalone app, or the
  7-day eviction. Ask 58 stays in flight until that reading comes back.
- **Players who installed before a working worker** (plan §9.3) become offline-capable only after one more
  **online** launch. The release note has to say "open it once online after this update".
- **The 26.88 MB of `dist/models/*.glb` flat copies** are still deployed and still never requested
  (plan §9.7). Removing them would roughly halve the deploy. Out of scope here; it is its own row.
