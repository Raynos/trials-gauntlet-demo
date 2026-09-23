// @vitest-environment jsdom
/**
 * The DOWNLOAD invariant across the ask-59 tier split: what the boot FETCHES and what the loader PROMISES
 * are the same bytes. The list is built at runtime from the shipped manifest; the number is summed by the
 * build into `plan.generated.ts`. Nothing holds them together except `packMembership` — so this test maps
 * every URL in the list back to its row in the byte table and checks the sum.
 *
 * jsdom is DPR 1 at 1024 px, so this is the `1x` device.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { offlinePackUrls, worldMapUrls } from './offline-pack';
import { OFFLINE_PACK_BYTES, PUBLIC_BYTES } from './plan.generated';
import { ArtManifest } from '../ui/art';
import { REGIONS } from '../ui/worldMap';

const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/art/manifest.json'), 'utf8')) as { assets: { id: string; path: string }[] };
const art = ArtManifest.from(raw);
const urls = offlinePackUrls(art.all());
const table = PUBLIC_BYTES as Readonly<Record<string, number>>;

/** A pack URL → its key in the build's byte table (the `?v=` the manifest adds is not part of the key). */
function tableKey(url: string): string {
  const clean = url.split('?')[0]!;
  if (clean.startsWith('art/worldmap/')) return clean;
  const e = art.all().find((a) => a.src === url);
  return `art:${e?.id ?? clean}`;
}

describe('the offline pack (ask 59: one tier, no link-preview card)', () => {
  it('fetches exactly the bytes the DOWNLOAD denominator declares for this device', () => {
    const summed = urls.reduce((n, [u]) => n + (table[tableKey(u)] ?? 0), 0);
    for (const [u] of urls) expect(table[tableKey(u)], `${u} is fetched but not in the byte table`).toBeGreaterThan(0);
    expect(summed).toBe(OFFLINE_PACK_BYTES['1x']);
  });

  it('takes one world-map tier, all five regions, and never the other tier', () => {
    const wm = worldMapUrls();
    expect(wm.filter((u) => u.includes('-1024.webp'))).toHaveLength(REGIONS.length + 1); // five regions + the world plate
    expect(wm.filter((u) => u.includes('-1536.webp'))).toHaveLength(0);
    expect(wm.some((u) => u.includes('worldmap.json'))).toBe(true);
  });

  // A variant with no sibling would be fetched by half the devices and drawn by all of them: offline, the
  // other half would have a tinted gradient where the picture belongs. The pack must ship pairs.
  it('ships every resolution variant as a pair', () => {
    const pairs = new Map<string, Set<string>>();
    for (const e of art.all()) {
      if (!e.variant) continue;
      const key = `${e.kind}/${e.biome ?? ''}/${e.bike ?? ''}/${e.medal ?? ''}`;
      const got = pairs.get(key) ?? new Set<string>();
      got.add(e.variant);
      pairs.set(key, got);
    }
    expect(pairs.size).toBeGreaterThan(0);
    for (const [key, got] of pairs) expect([...got].sort(), `${key} ships only ${[...got].join(' + ')}`).toEqual(['1x', '2x']);
  });

  it('takes one variant of every pair and leaves og.jpg on the server', () => {
    const picked = urls.map(([u]) => u);
    expect(picked.some((u) => u.includes('og.jpg'))).toBe(false); // ask 59 item 5: link previews only
    expect(picked.some((u) => u.includes('keyart-harbour-960'))).toBe(true);
    expect(picked.some((u) => u.includes('keyart-harbour-1920'))).toBe(false);
    expect(picked.some((u) => u.includes('medal-gold.png'))).toBe(true);
    expect(picked.some((u) => u.includes('medal-gold-512'))).toBe(false);
    expect(picked.some((u) => u.includes('bike-rookie-768'))).toBe(true);
    expect(picked.some((u) => u.includes('bike-rookie-1536'))).toBe(false);
  });
});
