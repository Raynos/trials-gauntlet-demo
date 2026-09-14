/**
 * ArtLibrary (round 8, tiered in round 9): the generated art pack (`public/art/manifest.json`)
 * for the world — far plates + skies, container stencils + grime masks, posters / signs /
 * graffiti, sponsor banners, crowd sheets, tyre marks.
 *
 * Round 9 (user on 3G saw the title at ~70 s: the constructor fetched all 2.8 MB): the pack
 * loads in tiers. `load()` fetches the manifest and the **boot set** — only what the showcase
 * biome (industrial: the title's backdrop) shows near the start gate (plate, stencils, grime,
 * banners, crowd, tyre mark; ≈ 0.9 MB). `request(ids)` fetches anything else on demand; the
 * renderer asks for `idsFor(biome)` in `setTrack` (the other biomes' plates + skies, the wall
 * decals, the night crowd) and `whenReady()` waits for that request, so frame 0 of a run is
 * art-complete while the title never waits for canyon's sky. Every fetch is one `fetch` +
 * `createImageBitmap` (decode off the main thread); a failure just keeps that item
 * procedural. The world is (re)built from whatever is present, so a capture is either
 * all-art or all-procedural, never a mix that changes mid-run.
 *
 * Bitmaps are decoded with `imageOrientation: 'flipY'` (three ignores `texture.flipY` for
 * ImageBitmap), so canvas compositing goes through `drawArt`, which flips back.
 */
import * as THREE from 'three';

export type ArtKind = 'stencil' | 'mask' | 'sign' | 'graffiti' | 'banner' | 'crowd' | 'plate-far' | 'sky' | string;

export interface ArtEntry {
  id: string;
  path: string;
  kind: ArtKind;
  biome?: string;
  w: number;
  h: number;
  bytes: number;
  tileX?: boolean;
  alpha?: boolean;
  alphaFadeBottom?: number;
  time?: 'day' | 'night';
  figures?: number;
}

/** Entries the renderer never needs (menu art is the UI owner's). */
const SKIP_PREFIX = 'art/menu/';

/** Assets the art owner rejected in the manifest (`rejected[]`) — never fetched, never drawn. */
const REJECTED = new Set(['stencil-apex', 'stencil-taro', 'tyremark-straight', 'mask-rivet-drips', 'mask-rust-streaks']);

/** What every track shows near its start gate (barrier strips, flags, crowd, deck decals). */
const COMMON_IDS = ['banner-vortex-oil', 'banner-kestrel-tyres', 'banner-nordvik', 'banner-apex-suspension', 'banner-bolt-energy', 'banner-ironworks-series', 'crowd-day', 'tyremark-arc'];
/** The hall's container skins (industrial + foundry). */
const HALL_SKIN_IDS = ['stencil-hkr', 'stencil-nordvik', 'stencil-weights', 'stencil-hazard', 'stencil-serial', 'stencil-arrows', 'mask-edge-grime', 'mask-grime-spatter'];
/** Back-wall decals (industrial + foundry): not needed for the title, requested with the track. */
const HALL_DECAL_IDS = ['poster-trials-night', 'poster-tyres', 'sign-hard-hat', 'sign-overhead-crane', 'sign-forklift', 'sign-exit', 'graffiti-rise', 'graffiti-grind', 'graffiti-nofear', 'graffiti-skull', 'graffiti-tag-wall', 'graffiti-wheel'];

/** Ids a biome's world draws (loaded ones are used; missing ones fall back to procedural). */
export function idsFor(biome: string): string[] {
  switch (biome) {
    case 'industrial':
      return [...COMMON_IDS, ...HALL_SKIN_IDS, 'plate-industrial', ...HALL_DECAL_IDS];
    case 'foundry':
      return [...COMMON_IDS, 'crowd-night', ...HALL_SKIN_IDS, 'plate-foundry', ...HALL_DECAL_IDS];
    case 'canyon':
      return [...COMMON_IDS, 'plate-canyon', 'sky-canyon'];
    case 'snow':
      return [...COMMON_IDS, 'plate-snow', 'sky-snow'];
    case 'nightCity':
      return [...COMMON_IDS, 'crowd-night', 'plate-nightcity', 'sky-nightcity'];
    default:
      return [...COMMON_IDS];
  }
}

/** The boot set: the showcase biome (industrial) minus its back-wall decals. */
export const BOOT_IDS: readonly string[] = [...COMMON_IDS, ...HALL_SKIN_IDS, 'plate-industrial'];

export class ArtLibrary {
  readonly entries = new Map<string, ArtEntry>();
  private readonly bitmaps = new Map<string, ImageBitmap>();
  private readonly textures = new Map<string, THREE.Texture>();
  /** In-flight or finished fetches by id (a failed fetch resolves too; it is not retried). */
  private readonly fetches = new Map<string, Promise<void>>();
  /** True once the manifest and the boot set have loaded or failed. */
  settled = false;
  /** True when the manifest parsed and at least one asset decoded. */
  ok = false;
  /** Compressed bytes of the assets that decoded (the budget counts these, as delivered). */
  bytesDelivered = 0;
  /** Wall ms from load() to settled (diagnostic only). */
  loadMs = 0;
  /** Resolves when the manifest and the boot set have settled. */
  readonly whenSettled: Promise<void>;
  private resolveSettled: () => void = () => undefined;
  private started = false;
  private manifestP: Promise<void> | null = null;
  private manifestDone = false;
  private readonly listeners: (() => void)[] = [];
  /** Progress of the current phase: assets decoded / wanted, bytes delivered so far (for the loading screen). */
  progress = { done: 0, total: 0, bytes: 0, bytesTotal: 0, label: 'art pack' };
  onProgress: ((done: number, total: number, label: string, bytes: number, bytesTotal: number) => void) | null = null;
  /** Fires after any request settles (the renderer rebuilds an undrawn world). */
  onRequestSettled: (() => void) | null = null;

  constructor(private readonly base = 'art/') {
    this.whenSettled = new Promise<void>((r) => (this.resolveSettled = r));
  }

  /** Called once when the boot set settles (the renderer rebuilds the world). */
  onSettled(fn: () => void): void {
    if (this.settled) fn();
    else this.listeners.push(fn);
  }

  private async loadManifest(): Promise<void> {
    if (this.manifestP) return this.manifestP;
    this.manifestP = (async () => {
      let manifest: { assets?: unknown[] } | null = null;
      try {
        const res = await fetch(this.base + 'manifest.json', { cache: 'force-cache' });
        if (res.ok) manifest = (await res.json()) as { assets?: unknown[] };
      } catch {
        manifest = null;
      }
      const assets = Array.isArray(manifest?.assets) ? manifest!.assets! : [];
      for (const raw of assets) {
        const o = raw as Record<string, unknown>;
        const path = typeof o['path'] === 'string' ? (o['path'] as string) : '';
        const id = typeof o['id'] === 'string' ? (o['id'] as string) : '';
        if (!id || !path || path.startsWith(SKIP_PREFIX) || REJECTED.has(id)) continue;
        const e: ArtEntry = {
          id,
          path,
          kind: String(o['kind'] ?? ''),
          w: Number(o['w'] ?? 0),
          h: Number(o['h'] ?? 0),
          bytes: Number(o['bytes'] ?? 0),
        };
        if (typeof o['biome'] === 'string') e.biome = o['biome'] as string;
        if (o['tileX'] === true) e.tileX = true;
        if (o['alpha'] === true) e.alpha = true;
        if (typeof o['alphaFadeBottom'] === 'number') e.alphaFadeBottom = o['alphaFadeBottom'] as number;
        if (o['time'] === 'day' || o['time'] === 'night') e.time = o['time'];
        if (typeof o['figures'] === 'number') e.figures = o['figures'] as number;
        this.entries.set(id, e);
      }
      this.manifestDone = true;
    })();
    return this.manifestP;
  }

  /** Fetch + decode one asset (memoised; a failure resolves and leaves the item procedural). */
  private fetchOne(e: ArtEntry): Promise<void> {
    const had = this.fetches.get(e.id);
    if (had) return had;
    const p = (async () => {
      try {
        // Manifest paths are `art/...`; the base already ends in `art/`.
        const url = e.path.startsWith('art/') ? this.base + e.path.slice(4) : this.base + e.path;
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return;
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        this.bitmaps.set(e.id, bmp);
        this.bytesDelivered += e.bytes || blob.size;
        this.ok = true;
      } catch {
        /* missing asset → procedural fallback */
      } finally {
        this.settledIds.add(e.id);
      }
    })();
    this.fetches.set(e.id, p);
    return p;
  }

  /**
   * Fetch a set of ids (those not already in flight), reporting `label` progress with bytes.
   * Resolves when every one has decoded or failed. Ids the manifest does not list are ignored.
   */
  async request(ids: readonly string[], label = 'art'): Promise<void> {
    await this.loadManifest();
    // Boot priority: a per-track request queues behind the boot set so the title's art is
    // not contending with canyon's sky on a slow link.
    if (this.started && label !== 'art pack' && !this.settled) await this.whenSettled;
    const wanted: ArtEntry[] = [];
    const inFlight: Promise<void>[] = [];
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e) continue;
      const had = this.fetches.get(id);
      if (had) inFlight.push(had);
      else wanted.push(e);
    }
    // Round 10: a request for ids another request is already fetching must still resolve only
    // once they have landed (a second `setTrack` for the same biome used to resolve at once, so
    // `whenReady()` returned before the back-wall decals were in and the world stayed procedural).
    if (!wanted.length) {
      await Promise.all(inFlight);
      return;
    }
    const total = wanted.length;
    const bytesTotal = wanted.reduce((a, e) => a + e.bytes, 0);
    let done = 0;
    let bytes = 0;
    this.progress = { done: 0, total, bytes: 0, bytesTotal, label };
    // Round 10: a throwing loader callback must never abort the fetches (it did: the game's
    // report callback threw once the loader had closed, `request` rejected before `fetchOne`
    // ran, `whenReady` resolved on the swallowed rejection and every harness capture rendered
    // the industrial hall without its back-wall decals — `debugInfo().art.inWorld === false`).
    const progress = (d: number, by: number): void => {
      this.progress = { done: d, total, bytes: by, bytesTotal, label };
      try {
        this.onProgress?.(d, total, label, by, bytesTotal);
      } catch (err) {
        console.warn('[render] art progress callback threw', err);
      }
    };
    progress(0, 0);
    await Promise.all([
      ...inFlight,
      ...wanted.map(async (e) => {
        await this.fetchOne(e);
        done++;
        if (this.bitmaps.has(e.id)) bytes += e.bytes;
        progress(done, bytes);
      }),
    ]);
    try {
      this.onRequestSettled?.();
    } catch (err) {
      console.warn('[render] art settle callback threw', err);
    }
  }

  /** True when the manifest is in and every listed id has either decoded or failed (nothing in flight). */
  requested(ids: readonly string[]): boolean {
    if (!this.manifestDone) return false;
    for (const id of ids) {
      if (!this.entries.has(id)) continue;
      if (!this.settledIds.has(id)) return false;
    }
    return true;
  }
  /** Ids whose fetch has finished (decoded or failed). */
  private readonly settledIds = new Set<string>();

  /** Bytes the manifest lists for the ids that are not yet fetched (what a request would download). */
  pendingBytes(ids: readonly string[]): number {
    let b = 0;
    for (const id of ids) {
      const e = this.entries.get(id);
      if (e && !this.fetches.has(id)) b += e.bytes;
    }
    return b;
  }

  /** Kick off the boot load: manifest + the showcase set (idempotent). */
  load(): Promise<void> {
    if (this.started) return this.whenSettled;
    this.started = true;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const finish = (): void => {
      this.loadMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
      this.settled = true;
      this.resolveSettled();
      for (const fn of this.listeners) fn();
      this.listeners.length = 0;
    };
    return this.request(BOOT_IDS, 'art pack')
      .catch(() => undefined)
      .then(finish);
  }

  has(id: string): boolean {
    return this.bitmaps.has(id);
  }

  entry(id: string): ArtEntry | null {
    return this.entries.get(id) ?? null;
  }

  /** Decoded bitmap (flipped vertically — draw it with `drawArt`). */
  bitmap(id: string): ImageBitmap | null {
    return this.bitmaps.get(id) ?? null;
  }

  /** Ids of a kind (manifest order), loaded ones only. */
  ids(kind: ArtKind, filter?: (e: ArtEntry) => boolean): string[] {
    const out: string[] = [];
    for (const e of this.entries.values()) if (e.kind === kind && this.bitmaps.has(e.id) && (!filter || filter(e))) out.push(e.id);
    return out;
  }

  /**
   * GPU texture for an asset (memoised, shared). `srgb` for photo/colour assets, false for
   * masks used as alpha. `userData.deliveredBytes` carries the compressed size so
   * `estimateTextureMB` counts the art as delivered.
   */
  texture(id: string, srgb = true, repeatX = false): THREE.Texture | null {
    const cached = this.textures.get(id);
    if (cached) return cached;
    const bmp = this.bitmaps.get(id);
    if (!bmp) return null;
    const t = new THREE.Texture(bmp);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.name = `art:${id}`;
    t.userData['deliveredBytes'] = this.entries.get(id)?.bytes ?? 0;
    t.needsUpdate = true;
    this.textures.set(id, t);
    return t;
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const b of this.bitmaps.values()) b.close?.();
    this.bitmaps.clear();
  }
}

/** Draw a (vertically flipped) art bitmap upright into a 2D context. */
export function drawArt(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, x: number, y: number, w: number, h: number, sx = 0, sy = 0, sw = bmp.width, sh = bmp.height): void {
  ctx.save();
  ctx.translate(x, y + h);
  ctx.scale(1, -1);
  // Source rows are flipped too: a crop at `sy` from the top of the upright image sits at
  // `bmp.height - sy - sh` in the flipped bitmap.
  ctx.drawImage(bmp, sx, bmp.height - sy - sh, sw, sh, 0, 0, w, h);
  ctx.restore();
}

/**
 * Tint a white-on-black mask: returns a canvas of size w×h holding `color` where the mask
 * is white (alpha = mask luminance × strength), transparent elsewhere. Used for grime and
 * rust on container skins and stencil paint.
 */
export function tintMask(bmp: ImageBitmap, w: number, h: number, color: string, strength = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  drawArt(g, bmp, 0, 0, w, h);
  // Luminance → alpha: multiply by white keeps the mask, then 'destination-in' with the
  // mask itself squares soft edges slightly (acceptable), so use the mask as alpha via
  // 'source-in' from a colour fill drawn over a luminance-to-alpha copy.
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) / 255;
    d[i + 3] = Math.round(Math.min(1, lum * strength) * 255);
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  return c;
}

/** Deterministic pick of an id from a list by an integer key (empty list → null). */
export function pickId(ids: string[], key: number): string | null {
  if (!ids.length) return null;
  return ids[((key % ids.length) + ids.length) % ids.length]!;
}
