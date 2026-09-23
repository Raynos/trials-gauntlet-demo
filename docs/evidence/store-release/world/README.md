# World — ROCKHOP zones, round 1

Each sheet: the approved mockup | the first played frame (tick 60, start gate) | tick 900, from a ride on the
current build (held throttle, restart on a bail; `harness/out/world/stills.mts`, Metal, 1280×720, `high`).
Tracks: C1 Low Tide (coast), A1 Sawdust (alpine), D1 Dust Devil (quarry), S1 Lift Line (snowline).

| zone | sheet | riding-frame calls / tris (high, desktop) |
|---|---|---|
| coast | `coast-mockup-vs-played.jpg` | 139–141 / 237–258 k |
| alpine | `alpine-mockup-vs-played.jpg` | 111–114 / 241–253 k |
| quarry | `quarry-mockup-vs-played.jpg` | 118–123 / 231–233 k |
| snowline | `snowline-mockup-vs-played.jpg` | 135–139 / 259–289 k |

What reads: every zone is daylight with its painted far plate + sky, the horizon in the upper third (the
zones frame near side-on: `Biome.camPitchScale` 0.38), the new gate language (buoys + signal flags, timber
arch + pennants, rusted gantry + teal ROCKHOP plate + timing beam, snow posts + triangle plate), no crowd.
Gap to the mockups, next rounds: prop density and detail in the near tier (the mockups' foregrounds are
packed), the alpine pines (low-poly lobes vs painted spruces), the quarry's cut-block course bodies and
bench faces, the snowline ice gorge (reads as white slabs), and clips through `harness:clip` once the
Tracks owner commits goldens for the new courses.

# World, round 2 (423bf473, bb9d0e57)

## Before and after, per zone

`<zone>-before-after.jpg` shows four panels: the target mockup (Q2 for the quarry), the round-1 played frame at tick 900, and the round-2 played frames at tick 60 and tick 900. The ride uses the same held throttle as round 1 (`harness/out/world2/stills.mts`, Metal, 1280×720, `high`).

| zone | riding-frame calls / tris (high, desktop) |
|---|---|
| coast (C1) | 150–156 / 341–346 k |
| alpine (A1) | 118–120 / 282–290 k |
| quarry (D1) | 120–122 / 275–277 k |
| snowline (S1) | 138–143 / 296–327 k |

## Prop coverage

These are played frames. Each course's `bot-3` golden is replayed in the page, and the canvas is grabbed at the tick where the bike reaches 4 m before the prop (`harness/out/world2/propshot.mts`). The sheets are `props/<zone>-props.jpg`, and every target was reached on HEAD physics.

| prop | seen on | x | tick |
|---|---|---|---|
| tyre | C1 Low Tide | 92.0 | 926 |
| pallet | C1 Low Tide | 157.6 | 1424 |
| container | C1 Low Tide | 311.6 | 2586 |
| gangway | C1 Low Tide | 341.6 | 2789 |
| pier | C2 Crane Hop | 50.0 | 560 |
| buoy | C3 Hull Breach | 24.0 | 350 |
| hull | C3 Hull Breach | 66.0 | 685 |
| hung-container | none (no course places it): an injected renderer-only copy of C2 at x 18–24, **posed** | 21 | 290 |
| log | A1 Sawdust | 24.0 | 350 |
| timber-deck | A1 Sawdust | 68.0 | 705 |
| flume | A1 Sawdust | 283.8 | 2358 |
| log (see-saw) | A2 Log Jam | 118.8 | 1221 |
| log-stack | A2 Log Jam | 290.0 | 2740 |
| stump | A3 Timberline | 181.0 | 1522 |
| truck-bed | A3 Timberline | 251.2 | 2038 |
| block | D1 Dust Devil | 31.0 | 411 |
| rubble | D1 Dust Devil | 53.0 | 586 |
| conveyor | D2 Conveyor | 61.3 | 720 |
| pulley | D2 Conveyor | 140.3 | 1372 |
| ore-cart (ramp) | D2 Conveyor | 349.3 | 3248 |
| ore-cart (see-saw) | D3 Rope Walk | 109.8 | 1076 |
| rope-bridge | D3 Rope Walk | 353.3 | 3238 |
| ice-ledge | S1 Lift Line | 40.0 | 485 |
| lift-tower | S1 Lift Line | 357.9 | 3009 |
| snowcat | S2 Cornice | 45.0 | 523 |
| cornice | S2 Cornice | 143.9 | 1300 |
| fence | S2 Cornice | 249.4 | 2478 |

## Phone path

The phone path is WebKit (ANGLE-on-Metal) at 932×430 CSS, DPR 1.5, with the phone device class, over 240 synced golden frames (`harness/out/world2/wk.mts`).

| course | phone-high p50 / p95 ms | calls / tris | low p50 ms | calls / tris |
|---|---|---|---|---|
| C1 coast | 1.96 / 3.02 | 117 / 290 k | 1.30 | 93 / 136 k |
| A1 alpine | 1.78 / 2.76 | 90 / 267 k | 1.24 | 72 / 101 k |
| D1 quarry | 1.78–2.12 / 2.62–3.02 | 92 / 246 k | 1.18 | 78 / 101 k |
| S1 snowline | 1.90 / 2.82 | 117 / 278 k | 1.42 | 91 / 132 k |
| b1 industrial (retired) | 2.54 / 3.32 | 141 / 252 k | 1.50 | 100 / 102 k |
| p2 canyon (retired) | 2.20 / 2.98 | 110 / 234 k | 1.68 | 89 / 79 k |
| p4 night city (retired) | 3.04 / 3.90 | 127 / 205 k | 1.82 | 98 / 49 k |
| p5 foundry (retired) | 3.82 / 4.68 | 161 / 257 k | 1.80 | 115 / 99 k |

Every zone costs less per frame than every retired biome, and draws fewer calls. Triangles are up to 290 k against a 500 k cap. One D1 run showed a single 152 ms max frame at load 9, and two reruns both peaked at 8 ms.

The art a course fetches at track entry (`idsFor`) is below. The totals include the shared banners; the figure in brackets is what lies beyond the boot set. Zones: coast 469 KB (179), alpine 502 (212), quarry 475 (185), snowline 557 (267). Retired biomes: industrial 967 (317), foundry 974 (365), canyon 351 (60), night city 381 (91). The round-2 deck paintings are canvas textures generated in the page (about 1.7 MB of GPU memory per zone), so they add no bytes to the download.
