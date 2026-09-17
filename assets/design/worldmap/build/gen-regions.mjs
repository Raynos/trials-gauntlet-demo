#!/usr/bin/env node
// World map region plates (docs/plans/WORLD_MAP.md § 3): one codex image_gen run per region, with the world plate
// (build/world/world-plate.png) and that region's crop guide (build/guides/<id>.png — derived, not kept: cut here by
// `magick -crop` from the plate at the crop in src/ui/worldMap.ts REGIONS, scaled to 1536 × 1024) as the two reference
// images, so the result is the same place at ~3× the detail. Writes build/regions/<id>.brief.md, runs the five in
// parallel, logs to build/logs/region-<id>.log.
//   node assets/design/worldmap/build/gen-regions.mjs [industrial canyon snow nightCity foundry]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync, closeSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const DESC = {
  industrial:
    'the INDUSTRIAL port and refinery in the south-west: the pier and container yard on the sea, gantry cranes, chimneys and steam, the grey hangar on its concrete apron, rail sidings, the coast road climbing north-east out of the port toward the river, the rocky headland and waterfalls on the right, sodium-orange lamp glow, warm sunset light',
  canyon:
    'the CANYON in the west: red sandstone mesas and slot canyons at the last of sunset, the winding river with its bridges, dry riverbeds, a single desert highway, scrub and pines in the gullies, the coast on the far left, the snow line beginning at the top right',
  snow: 'the SNOW range in the north: the great white summit at the top left, glaciers, the chairlift line with its pylons, the frozen turquoise lake, the ski slopes, the lit lodge and the pines, blue shadows on snow, the mountain pass falling away to the east under cloud',
  nightCity:
    'NIGHT CITY on its bay in the east: a dense neon metropolis at night, deep blue-purple towers, cyan and magenta signage, wet streets, elevated highways, the long lit bridge across the bay, the waterfront and harbour, the lighthouse on the point at the bottom, cloud and haze drifting through',
  foundry:
    'the FOUNDRY in the far north-east: a black-iron industrial hellscape lit from below, blast furnaces, tall stacks with smoke, slag rivers glowing molten orange, sparks, pipe bridges, the road along the shore, cold blue-grey haze over everything',
};
/** The region crops (map units of the 1536 × 1024 world plate) — keep in step with REGIONS in src/ui/worldMap.ts. */
const CROP = { industrial: [0, 460, 640, 427], canyon: [80, 150, 600, 400], snow: [560, 50, 480, 320], nightCity: [800, 350, 540, 360], foundry: [1120, 130, 416, 277] };
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DESC);
mkdirSync(join(here, 'regions'), { recursive: true });
mkdirSync(join(here, 'logs'), { recursive: true });
mkdirSync(join(here, 'guides'), { recursive: true });
for (const id of ids) {
  const [x, y, w, h] = CROP[id];
  execFileSync('magick', [join(here, 'world/world-plate.png'), '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-filter', 'Lanczos', '-resize', '1536x1024!', join(here, 'guides', `${id}.png`)]);
}

const brief = (id) => `You are generating ONE image with the built-in image_gen tool. Two reference images are attached. Generate exactly one image, 1536 wide by 1024 tall (landscape). Then copy the generated PNG to the exact output path given at the end of this prompt (mkdir -p the folder). Do not edit any other file. Report the saved path.

## Task: one REGION of the painted continent at three times the detail
- Image 1 is a painted world map: a tilted 3-D painterly continent seen from a high camera, dusk-to-night lighting.
- Image 2 is a CROP of image 1 (scaled up, so it is blurry): the region to paint, ${DESC[id]}.

Paint image 2's EXACT area as a finished, sharp, fully detailed painting: the same place, the same composition, every landmark in the same spot at the same size, the same camera tilt, the same palette and lighting and painterly style as image 1 — but at three times the detail: individual buildings, cranes, trees, rocks, ridges, road edges, lamps, vehicles, boats, texture in the water. The result must lay over image 2 as a sharper version of it: the framing is identical, edge to edge, no zoom in or out, no crop, no shift. The four edges of your image must show the same terrain as the four edges of image 2.

Rules: no text, no labels, no icons, no markers, no UI, no glowing route lines, no letterbox, no border, no watermark. Roads are painted as matte roads on the terrain. Keep the atmosphere light (the game draws its own fog). Film-grain-free, luminous, high dynamic range.

Output path (copy the generated PNG here, exactly): assets/design/worldmap/build/regions/${id}.png
`;

const runs = ids.map((id) => {
  const b = join(here, 'regions', `${id}.brief.md`);
  writeFileSync(b, brief(id));
  const log = openSync(join(here, 'logs', `region-${id}.log`), 'a');
  const t0 = Date.now();
  return new Promise((done) => {
    const p = spawn('codex', ['exec', '-s', 'workspace-write', '-i', 'assets/design/worldmap/build/world/world-plate.png', '-i', `assets/design/worldmap/build/guides/${id}.png`, '-o', `assets/design/worldmap/build/logs/region-${id}.last.md`, '-'], { cwd: repo, stdio: ['pipe', log, log] });
    p.stdin.end(brief(id));
    p.on('exit', (code) => {
      const line = `${id} exit=${code} seconds=${Math.round((Date.now() - t0) / 1000)}\n`;
      writeFileSync(join(here, 'logs', `region-${id}.log`), line, { flag: 'a' });
      closeSync(log);
      process.stdout.write(line);
      done(code);
    });
  });
});
await Promise.all(runs);
