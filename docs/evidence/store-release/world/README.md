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
