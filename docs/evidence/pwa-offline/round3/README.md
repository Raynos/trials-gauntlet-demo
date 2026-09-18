# PWA offline — round 3 evidence: everything is in the first boot (ask 58)

The user's rule, recorded in `docs/plans/README.md`: *"I want this to behave like a game. Load
everything up front, but aggressively cache it. Once everything is loaded up front you can cache it, so
the second boot: all cache, all cache, all cache."* and *"garage swaps needing network is a bug anyway;
it should behave like an iOS game — download once, instant after."*

So there is no background fill and no cache-on-use. A new boot step, `offlinePack`
(`src/boot/offline-pack.ts`, `src/boot/steps.ts`), streams everything the rest of the boot does not
already fetch — the whole art pack beyond the 16-id boot set, **both** world-map tiers, and the two lazy
chunks nothing touches until a gesture (the audio worklet and the review sheet) — inside the loader's
own DOWNLOAD bar, with the denominator declared by the build (`offlinePackBytes`, one rule shared by
`vite.config.ts` and `src/boot/totals.ts`).

Raw: `offline.json` (the suite's own measurements), `offline-e2e.log`, `cache-after-one-load.txt`
(all 180 cached URLs), `garage-online-control.log`.

## After exactly ONE online load

| | round 1 | round 3 |
|---|---|---|
| Cache Storage entries | 65 | **180** (shell 4 · static 157 · immutable 19) |
| `/models/` | 14 | 14 (all five outfits, both liveries, authored + LOD) |
| `/art/` | 42 | **153** (the whole pack + both world-map tiers) |
| `/assets/` + `/fonts/` | 2 + 3 | **5 + 3** (the audio worklet and the review-sheet chunk are now in) |
| bytes held (the worker's own count) | 32 158 162 | **40 453 566** |
| `usageDetails.caches` | 33 519 872 | **41 963 008** |
| over the wire | 30 766 814 B / 70 req | **39 010 615 B / 184 req** |
| loader | 100/100, 15 955 ms | 100/100, **13 626 ms** |

The first load costs **8.2 MB more** than round 1 and buys the whole game offline. That is the user's
call, made explicitly; the loader counts every byte of it honestly (the DOWNLOAD denominator moved from
27.02 MB to 38.44 MB — core 1.82 + hero 26.71 + boot art 0.72 + offline pack 9.19).

## Cold OFFLINE start, origin unreachable

| reading | value |
|---|---|
| loader | DOWNLOAD **100**, SETUP **100**, `data-done = 1`, gone at **16 882 ms** |
| requests that reached the origin | **0** · bytes **0** |
| navigation `transferSize` / `workerStart` | **0** / **0.50 ms** |
| page errors | **0** |
| world map | world plate **loaded**, **5** region plates, 22 markers |
| b1 golden replay | `40.5583 s`, hash `389a5dc6c07a` — **identical to the online run** |

## The garage, offline (the user's ask, proved)

Origin unreachable, every outfit tapped with an emulated finger on both liveries:

```
PASS offline.garageSwapsOffline   10/10 combinations   0 failed /models/ requests
```

No swap touched the network and none fell back to a procedural stand-in (the renderer's `heroDoc` reads
`bike rider` for all ten, never `proc`).

## A finding this produced, and it is in the suite, not the game

The first run of the sweep failed exactly two combinations — `street-openface × rookie` and
`race-bluewhite × rookie` — every time, deterministically. An **online control**
(`garage-online-control.log`, same taps, same geometry, `?sw=0`) swept **10/10**, so it was not the
cache. The cause was the suite's own order: `__trials.runRecording()` drives the real `Game` through the
whole 40 s recording, and sweeping the garage on top of that ate the first two swaps. The replay now
runs **last** in the offline phase, and the sweep is 10/10. Worth writing down because the harness read
as a product bug for three runs.

## Two other things that were genuinely broken and are now fixed

- **The audio worklet was never in the offline set.** It is loaded on the first unlock gesture, so the
  boot never fetched it, so the worker never cached it — offline the first sound attempt failed with
  `worklet timeout` and dropped the game to the fallback graph. The `offlinePack` step now pulls every
  `audio-worklet` / `other` chunk the load manifest names (a few KB, fetched outside the reader so a
  handful of kilobytes cannot move a 38 MB number).
- **The world-map plates were in no manifest at all.** `publicItems()` in `vite.config.ts` walked
  `fonts/`, the art manifest, the icons and `models/` — the 13 plates were in none of them, so the
  worker could not even name them. They are a `worldmap` phase now, and the boot fetches both tiers.
