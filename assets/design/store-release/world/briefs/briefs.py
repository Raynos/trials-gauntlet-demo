#!/usr/bin/env python3
"""World owner, store release Phase 2: writes the codex image_gen briefs (one .md per run) for the
four zones' far plates + skies and the world map painting. `gen.sh <run>` feeds one to codex."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

COMMON = """You are generating ONE image with the built-in image_gen tool. Generate exactly one image at the size stated below. Then copy the generated PNG to the exact output path given at the end of this prompt (mkdir -p the folder). Do not edit any other file. Report the saved path.

Context: ROCKHOP is an original 2.5D side-on motorbike physics game shipping to the App Store and Google Play. Its world has four zones: COAST (a coastal scrapyard harbour, teal/rust daylight), ALPINE (pine forest trail with a sawmill, warm afternoon), QUARRY (desert open-pit sandstone quarry, cream/ochre/rose stone under a teal sky, late-afternoon light) and SNOWLINE (glacier and ski lifts, cold blue/white, low sun). The attached reference images are the approved look: painterly, richly detailed, sunlit, saturated but natural, the rendering quality of a premium mobile game key art.
Hard rules: absolutely NO text, NO letters, NO numbers, NO logos, NO signs with writing, NO UI, NO labels, NO map markers, NO pins, NO icons, NO frames, NO letterbox bars, NO people, NO riders. No real brands.
"""

MAP = """## THIS IMAGE: the WORLD MAP painting (the level-select continent), 1536 x 1024 landscape, full bleed
Paint ONLY the terrain of the attached W-worldmap mockup, as a clean illustrated map plate with every UI element removed: no zone names, no track labels, no diamonds, no flags, no lock icons, no cards, no buttons, no counters, no route dashes drawn as UI. A high oblique bird's-eye view (about 50 degrees down), painterly, crisp detail, warm daylight from the upper left.
Layout (keep it close to the mockup): ONE continent. Bottom-left and the whole left edge: open turquoise sea with a shared rocky coastline running from the lower left up to the upper left; on the coast a COASTAL SCRAPYARD harbour - piers on piles, stacks of teal / rust / blue containers, three or four gantry cranes, rusted beached ship hulls and a half-sunk wreck in the shallows, a red and white lighthouse on a rocky islet far upper-left, sea stacks, gulls. Centre-left to centre: ALPINE FOREST - dense dark-green pine forest on rolling hills and grey cliffs, a timber sawmill with a water wheel beside a river, log stacks, a waterfall dropping from a cliff, a second waterfall and a timber trestle bridge lower right of centre, mountains fading in the far distance top-centre. Upper-right third: the DESERT QUARRY - a huge terraced open pit cut in cream / ochre / rose sandstone benches, a turquoise pool at the pit floor, rusted headframes and conveyor gantries, mesas beyond. Top-right corner: SNOWLINE - snow-capped peaks, a glacier, ski-lift cables and towers with small chairs, snowy pines.
A single continuous painted dirt TRAIL (a warm tan footpath, painted as part of the terrain, not a UI line) winds from the harbour piers at the bottom-left, along the coast, into the forest past the sawmill, over the trestle bridge, up through the quarry terraces and on into the snowline at the top right. Leave calm uncluttered terrain around the trail so markers can be placed on it later. Keep the bottom 12 percent and the right edge free of important landmarks (UI sits there).
"""

PLATE_HEAD = "A distant side-on panorama for a 2.5D game's far background layer, seen from a low eye level. Spread detail evenly left to right so the strip can tile horizontally (no single dominant object in the centre, nothing cut by the left or right edge that would look odd when repeated). Everything distant and slightly hazy (aerial perspective)."

PLATES = {
    'coast': "Flat sea horizon exactly across the middle of the image. The SKY occupies the top 45 percent: clear bright blue with a few soft white cumulus near the horizon. Middle band: the far side of a harbour bay - a calm turquoise-to-teal sea with small white wave glints, a rocky low headland, several rusted ship hulls and a half-sunk wreck far out on the water, two teal gantry container cranes with stacks of rust-red and teal containers on a quay, a small red-and-white lighthouse on a rocky islet, hazy blue-grey hills and cliffs on the far shore. The bottom 35 percent of the image is plain open sea water, slightly darker toward the bottom edge, with no objects. Daylight, sun high from the upper left.",
    'alpine': "The land horizon across the middle of the image. The SKY occupies the top 35 percent: warm clear blue with a few soft white clouds. Middle band: a range of jagged snow-capped granite mountains in the distance (blue-grey with white snowfields, lit warm by afternoon sun from the right), below them layered ridges of dark pine forest receding into blue haze, and a calm alpine lake reflecting the forest and sky across part of the width. The bottom 30 percent is a dense continuous band of dark green pine treetops (the nearest forest ridge), no ground visible, no buildings.",
    'quarry': "The horizon across the middle of the image. The SKY occupies the top 35 percent: deep teal-blue desert sky, a few thin high clouds, warm late-afternoon light from the right. Middle band: the far walls of an enormous open-pit sandstone quarry cut in many horizontal terraced benches, banded cream, ochre, pale rose and salmon, with dusty haul roads zig-zagging between benches, two small rusted mining headframes and long thin conveyor gantries on the far rim, and red-brown mesas and buttes on the horizon behind in hazy atmosphere. The bottom 30 percent: lower quarry benches of pale cut stone in soft shadow, dusty, with a glimpse of a turquoise pool at the pit floor in one or two places.",
    'snowline': "The horizon across the middle of the image. The SKY occupies the top 35 percent: cold clear pale blue, a low golden winter sun glow near the horizon on the right, a few thin clouds. Middle band: a wall of jagged snow-covered alpine peaks and ridges (white snow, blue shadows, bare dark rock outcrops), a glacier tongue with pale turquoise crevassed ice, a line of small ski-lift towers with cable and tiny chairs climbing a slope, snowy pine groves, distant avalanche fences. The bottom 30 percent: rolling snowfields and snow-laden pines in soft blue shadow, no buildings.",
}

SKIES = {
    'coast': 'bright clear blue sky with soft white cumulus clouds scattered near the horizon and a few higher wisps, a few distant seagulls',
    'alpine': 'warm clear blue sky, soft white fair-weather cumulus near the horizon, golden afternoon light',
    'quarry': 'deep teal-blue desert sky, thin high cirrus streaks, warm late-afternoon peach glow near the horizon',
    'snowline': 'cold pale-blue winter sky, thin cirrus, a warm low-sun glow near the horizon on one side',
}


def write(name: str, body: str) -> None:
    with open(os.path.join(HERE, name + '.md'), 'w') as f:
        f.write(COMMON + '\n' + body)


write('map', MAP)
for z, d in PLATES.items():
    write(f'plate-{z}', f"## THIS IMAGE: {z.upper()} far backdrop panorama, 1536 x 1024 landscape\n{PLATE_HEAD} {d}\n")
for z, d in SKIES.items():
    write(f'sky-{z}', f"## THIS IMAGE: {z.upper()} sky panorama, 1536 x 1024 landscape\nSky only, a seamless wide panorama for a game's sky dome: {d}. The bottom 20 percent is a soft pale horizon haze (no land, no sea, no objects at all). Evenly distributed clouds left to right so it tiles horizontally; no sun disc in frame.\n")
print('briefs written')
