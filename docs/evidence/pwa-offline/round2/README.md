# PWA offline — round 2 evidence: the gate (ask 58)

`harness/e2e/offline.mts`, wired into `pnpm harness:e2e --only=offline`, `harness/README.md`, and the
ship gate (`offline.coldStartPlayable` + a threshold in `harness/gate/thresholds.json`).

Every other harness entry runs `?sw=0` on purpose, so this is the only suite in the tree that exercises
the service worker at all — which is why the cold start is a **gate** row and not a nice-to-have.

## The three rules the measurements taught (all three lied first)

1. **`chromium.launchPersistentContext`, never `browser.newContext()`.** An ephemeral context does not
   keep Cache Storage across the offline switch (the plan's M5) — the suite would fail a working build.
2. **The HTTP server is shut down for the offline phase.** Playwright's `offline` flag does not reach
   service-worker fetches. With the flag set and the server up, six core files still went to the origin
   and came back `304`, and the "offline" boot passed on the browser's HTTP disk cache. With the origin
   actually unreachable the same build died at `DOWNLOAD 0` with `TypeError: Failed to fetch`.
3. **Wire bytes are counted in the server, not the page.** The boot's bytes are fetched by the worker,
   whose requests belong to the worker target and never reach a page-level CDP session; a page-side
   counter reported a flattering `0` for a boot that had just pulled 30 MB.

## The gate row

```
PASS  offline.coldStartPlayable    100/100 done=true in 13848 ms  (limit true)  9/9 offline e2e checks pass
      section offline: 64.9 s
```

`npx tsx harness/gate/ship-gate.ts --only=offline --quick` — `PARTIAL (offline): 1/1 checks pass`.
The gate prints the one judged row and carries the other checks as its note; the full ten are in
`harness/out/offline/offline.json` and in round 3's evidence.
