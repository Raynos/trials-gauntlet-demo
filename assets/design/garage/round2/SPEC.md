# Garage round 2 — B's UI on E's set, three lighting variants (mockups, no decision)

Round subject: the user split the round-1 pick in two — *"for UI, it's B"* (controls column left, hero centre, metadata right) and *"E shutter door is the nicest graphical style"* — and asked for *"three variant new mockups combining the UI of B with how the garage looks in E."* **Nothing is decided here and no game code changed — the user picks one of BE1 / BE2 / BE3.**

- Contact sheet (B + E references, then BE1–BE3): `assets/design/garage/round2/contact-sheet.jpg`
- Variants, full-res PNG as generated (1536×1024, black letterbox): `BE1-e-as-drawn.png`, `BE2-wide-open-daylight.png`, `BE3-dusk.png`; letterbox cropped: `*.jpg`
- Briefs as given to the generator: `briefs/shared.md` (B's UI spelled out element by element, E's set spelled out in kind, the rule *"UI layout identical to reference B; environment identical in kind to reference E; only lighting / time of day / prop placement vary"*) + `briefs/BE{1,2,3}.md`
- Pipeline as round 1: `codex exec -s workspace-write -i current-932x430.png -i B-tool-wall.png -i E-shutter-door.png -o … -` reading `shared.md` + the variant brief from stdin, three runs in parallel: BE1 145 s, BE2 123 s, BE3 133 s (~2.5 min wall). Same seeded state in all three: Rookie / `Charcoal · open-face` / `Blender`, `‹ MENU` top-right, badge + `build a479a7b · 2026-09-16` top-left.

The UI held. All three reproduce B's architecture element for element — rail + tags left (BIKE 2 / OUTFIT 5 / RIDER 3, icons, colour bars, the amber selected states), hero side-on in the centre at ~75–80 % of the panel height, the typewriter clipboard top-right, `drag to rotate · pinch to zoom` under the rear wheel — so the three differ only in what the user asked to judge: light and time of day.

---

## 1. What varies

| | Shutter | Key light | Fill | Floor | Props | Mood |
|---|---|---|---|---|---|---|
| **BE1** E as drawn | half open, top edge at the rider's shoulder | cool overcast daylight from behind-left through the opening | warm tungsten work lamp, left wall, on the bike's near side | matte concrete, light grey where the daylight lands, long shadow toward the camera | bench + vice left behind the rail, NORDVIK drum + jerry can right under the clipboard | the reference — neutral, readable, the bike rim-lit |
| **BE2** Wide open, daylight key | three-quarters open, top edge above the helmet; apron, fence and a container visible outside | daylight, from behind-left and above, floods the bay | faint warm bounce only (lamp off) | matte, brightly lit, soft shadows | KESTREL tyre stack + stool pushed to the far left, drum / jerry can / VORTEX OIL crate to the far right; clear floor round the bike | brightest, coolest, most "showroom" |
| **BE3** Dusk | half open; evening sky, blue-orange, low over the apron | warm sodium work lamp, left wall, strong on the tank and forks | cool blue dusk from behind, a rim on the rider's back | **wet-look** dark concrete mirroring the opening and the bike's underside | as BE1 | most contrast, most atmosphere; the amber UI and the lamp are the same hue |

Drawn aspects: BE1 2.27:1, BE3 2.14:1 (both ≈ the phone's 2.17), BE2 1.88:1 — read BE2 as ~13 % shorter than pictured; its extra height went to the taller opening.

**Readability of the UI over each set** (the one thing the set can break): BE1 and BE3 keep the tag column over the dark stud wall and the clipboard over the dim shutter — both read. BE2's daylight comes up to the rail's right edge and behind the clipboard's left half; the tags survive because they are dark slabs, the clipboard survives because it is paper, but the grey `build …` stamp and the rotate hint sit on bright floor and lose contrast. In BE2 the UI needs its own scrim strips (a 30 % dark gradient behind the rail and under the clipboard).

---

## 2. Three.js build notes for the E set

A procedural stage for this set is already in the working tree, uncommitted: `src/render/world/garageStage.ts` (`buildGarageStage`, ≤ 18 draws, four 512² canvas maps, no lights of its own), with the constants the three variants map onto:

- **Shutter geometry.** `GARAGE_SHUTTER = { width 6.6, height 4.0, openTo 2.05 }` m — a slatted plane for the closed upper part (`shutterMap()` canvas: corrugation, IRONWORKS stencil, grime), the bottom rail, the rolled drum in its housing, two guide tracks; all merged into one mesh (`mesh('shutter', …)`, `MeshStandardMaterial` roughness .5 metalness .7). **BE1 / BE3 = `openTo` ≈ 2.05** (bottom edge at shoulder height); **BE2 = `openTo` ≈ 3.2** (above the helmet) — the slatted plane just gets shorter and the drum fatter. Outside the opening: a backdrop card (apron + fence + sky) at z ≈ −20 that is the only thing that changes per time of day — one 512×256 canvas per variant (overcast / bright overcast / dusk gradient), or the existing HDR sky PMREM (`environment.ts`) tinted.
- **Daylight spill = one spot + fog, not a second sun.** The rig already re-aims the sun through the opening (`LightingRig.setStage`) and the room's own `GARAGE_LAMPS` are the hall's follow spots parked at `(−4.2, 3.4, 3.6)` warm 150 and `(5.0, 3.0, 3.2)` cool 45. Per variant: **BE1** sun through the opening at intensity ≈ 2.5, colour `#dfe7f2`, lamp 150 warm as fill; **BE2** sun ≈ 4.0, `#eef2f8`, lamp 0–30; **BE3** sun ≈ 1.2, colour `#7f8fc8` (dusk blue), lamp 260 warm `#ffb060` as the key. The visible shaft is the stage's additive `shafts` object (hidden on `low`) — its opacity scales with the sun intensity, so BE2 gets the strongest beam, BE3 the faintest. Floor fog: `uFogFloor` (exponential floor fog in `environment.ts`) at a low height (≈ 0.6 m) with the sky colour gives the daylight "wash" on the floor without a second light; BE3 uses it for the blue ground haze outside.
- **Floor material.** The stage's floor is a subdivided plane with vertex colours (`floorGeometry()`: the lamp pool under the hero and the daylight patch from the opening) and a concrete canvas map. **BE1 / BE2**: roughness .85–.95, no env reflection. **BE3 wet-look**: roughness ≈ .25, metalness 0, `envMapIntensity` ≈ 1.2 with the PMREM sky, plus a darker base tint (`#2a2c30`) — the reflection of the opening comes from the environment map for free; the bike's underside reflection does not (no planar reflection in the renderer), and the mockup's mirror of the bike is the one thing BE3 cannot have at this cost. A cheap stand-in: the hero's contact-shadow blob at 1.6× scale and 0.5 alpha.
- **Contact shadow.** One shadow map follows the camera target already (`environment.ts`); the stage sits inside its frustum. BE1's long shadow toward the camera needs the sun *behind* the opening (it is, after `setStage`); BE3's needs the lamp to cast — `GARAGE_LAMPS[0]` as a `SpotLight` with `castShadow` is one more shadow map (≈ 1 ms on a phone) and can be skipped on `low` / `medium` in favour of the blob.
- **Props.** Bench + vice, pegboard pier, drums, jerry can, tyre stacks, ceiling tubes are all in `garageStage.ts` as merged / instanced meshes. BE2's "pushed to the edges" is a position change on the tyre stack and the stool (x ≈ ±8 instead of ±5), nothing new.
- **Camera.** The `orbit` mode in the uncommitted `CameraOverride` (`src/core/types.ts`, `rig.ts`: yaw / pitch / dist / `screenY`) is the model-explorer camera; B's layout wants the aim at `screenY` ≈ 0.55 and the hero at ~0.75 of the height (`dist` ≈ 3.2 m for the 1.9 m rider), side-on (yaw 0) as the rest pose — the mockups draw exactly that.
- **UI over the set.** B's rail and clipboard are DOM (`garage.ts`), not scene geometry; on BE2 add the two scrim strips noted above. Every tag 44 px: at 844×390 the six rows + three headings are ~340 px — the round-1 SPEC's B risk stands regardless of the set; put BIKE at the bottom of the rail for thumb reach.

Cost, all three share the stage; the variant is a lighting preset: `openTo`, sun intensity / colour, lamp intensity, floor roughness / tint, one backdrop canvas. ~half a day for the preset switch once the stage lands; BE3's lamp shadow and wet floor are the only extras (~2 h and 1 shadow map).

---

## 3. Recommendation

**BE1 for the ship, with BE3's floor as the one thing to steal.** Reasons:

1. **BE1 is the set the user picked, unchanged**, and it is the one whose UI needs no rescue: the dark wall behind the rail and the dim shutter behind the clipboard are the contrast the tags and the paper need. BE2 is the brightest and the least "garage" — the open door takes over the frame and the UI has to fight it with scrims.
2. **BE3 is the best-looking frame** — the amber lamp and the amber UI are one hue, the wet floor doubles the bike — but the blue dusk sky is a mood, not a default; it reads as a *moment* (a night-ride unlock, a finished career) rather than the place you come back to every session. It also costs the one shadow map and the reflective floor.
3. **The wet floor at roughness .25 is cheap** (a material preset; the env map is already there) and it lifts BE1 without changing its light. That is the hybrid: BE1's daylight, BE3's floor.

Pick **BE2** if the priority is the brightest possible read of the hero on a phone in sunlight — it is the highest-key frame — and accept the scrim strips. Pick **BE3** as-is for a launch still or the menu key art.

Whichever wins, the round that ships it needs a played clip on the phone harness: menu → garage → drag the bike round → tap an outfit → tap Pro → back, with the hero ≥ 45 % of the height in every frame, the tags readable over the set at 844×390, and the stage under budget (≤ 18 draws, `garageStage.ts`'s own bar) at the 30 fps garage cap.
