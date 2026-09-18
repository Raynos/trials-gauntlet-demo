# Boot bytes, round 1 — ask 59 items 2, 3, 5

What a **first** load costs, measured in the server (`measure.mts`, run with
`npx tsx docs/evidence/boot-bytes/round1/measure.mts`), fresh profile per geometry, service worker on.
Wire bytes are counted per response by a `vite preview` middleware: the offline pack is fetched from
inside the worker, and a page-side counter reports a flattering 0 for a boot that really pulled 37 MB.

"Before" is measured, not modelled — after the boot finishes, the script asks the same server for the
exact files the old build also pulled (the other world-map tier, the other art variant of every pair,
`og.jpg`) and adds those bytes.

| geometry | wire before | wire after | saved | DOWNLOAD before | DOWNLOAD after |
|---|---|---|---|---|---|
| 430×932 DPR 2 (phone) | 39.01 MB | **37.08 MB** | −1.93 MB (16 files) | 39.78 MB | **37.85 MB** |
| 1280×720 DPR 1 (desktop) | 39.01 MB | **35.73 MB** | −3.28 MB (16 files) | 39.78 MB | **36.50 MB** |

The denominator moves with the fetch, in both directions and by the same bytes — that is the point: the
DOWNLOAD bar stays honest. `src/boot/offline-pack.test.ts` holds the two together file by file (it maps
every URL in the runtime list back to its row in the build's byte table and checks the sum equals
`OFFLINE_PACK_BYTES` for that tier).

The 16 dropped files per device: `og.jpg` (115 KB), 6 world-map plates of the tier this device does not
draw (1.34 MB at 2x / 1.75 MB at 1x), and 9 art variants (0.48 MB of `1x` on a 2x device, 1.42 MB of `2x`
on a 1x device) — 4 medals, 3 key-art plates, 2 garage bike renders.

Raw: `boot-bytes.json` (build `411697e-eef943a7cc`). Offline gate after the change: `--only=offline`
**10/10**, including `offline.coldStartPlayable`, `offline.worldMapDraws` (5 region plates with the origin
unreachable) and `offline.garageSwapsOffline` 10/10.

`--only=boot` is 3/4 then 2/4 on this host, with different rows each run: B3's stuck detector fires while
DOWNLOAD sits on an integer percent (`boot lte/sw=off/art=present`, held at 4 % for 3.1 s while 153 KB
arrived) and once on a 7.7 s SETUP freeze at 100/84 with no bytes moving at all (`art=absent`, where there
is no art pack for this change to touch). One percent of a 37.85 MB denominator is 378 KB, so 153 KB in a
window cannot move the number — and before this change one percent was 398 KB, so the same window failed
harder. The detector is calibrated against the pre-ask-58 27 MB denominator, not against this one.
