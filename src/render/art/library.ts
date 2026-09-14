/**
 * ArtLibrary (round 8): the generated art pack (`public/art/manifest.json`) for the
 * world — far plates + skies, container stencils + grime masks, posters / signs /
 * graffiti, sponsor banners, crowd sheets, tyre marks. Loading starts in the renderer
 * constructor; `whenSettled` resolves once every world/plate asset has either decoded or
 * failed (a failure just means the procedural fallback stays). The world is (re)built from
 * whatever is present, so a capture is either all-art or all-procedural, never a mix that
 * changes mid-run — `ThreeRenderer.ready` waits for `settled` so the first captured frame
 * is the final look.
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

export class ArtLibrary {
  readonly entries = new Map<string, ArtEntry>();
  private readonly bitmaps = new Map<string, ImageBitmap>();
  private readonly textures = new Map<string, THREE.Texture>();
  /** True once the manifest and every wanted asset has loaded or failed. */
  settled = false;
  /** True when the manifest parsed and at least one asset decoded. */
  ok = false;
  /** Compressed bytes of the assets that decoded (the budget counts these, as delivered). */
  bytesDelivered = 0;
  /** Wall ms from load() to settled (diagnostic only). */
  loadMs = 0;
  readonly whenSettled: Promise<void>;
  private resolveSettled: () => void = () => undefined;
  private started = false;
  private readonly listeners: (() => void)[] = [];
  /** Progress: assets decoded / wanted (for the loading screen). */
  progress = { done: 0, total: 0 };
  onProgress: ((done: number, total: number) => void) | null = null;

  constructor(private readonly base = 'art/') {
    this.whenSettled = new Promise<void>((r) => (this.resolveSettled = r));
  }

  /** Called once when the library settles (the renderer rebuilds the world). */
  onSettled(fn: () => void): void {
    if (this.settled) fn();
    else this.listeners.push(fn);
  }

  /** Kick off the load (idempotent). */
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
    const run = async (): Promise<void> => {
      let manifest: { assets?: unknown[] } | null = null;
      try {
        const res = await fetch(this.base + 'manifest.json', { cache: 'force-cache' });
        if (res.ok) manifest = (await res.json()) as { assets?: unknown[] };
      } catch {
        manifest = null;
      }
      const assets = Array.isArray(manifest?.assets) ? manifest!.assets! : [];
      const wanted: ArtEntry[] = [];
      for (const raw of assets) {
        const o = raw as Record<string, unknown>;
        const path = typeof o['path'] === 'string' ? (o['path'] as string) : '';
        const id = typeof o['id'] === 'string' ? (o['id'] as string) : '';
        if (!id || !path || path.startsWith(SKIP_PREFIX)) continue;
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
        wanted.push(e);
      }
      this.progress.total = wanted.length;
      const tick = (): void => {
        this.progress.done++;
        this.onProgress?.(this.progress.done, this.progress.total);
      };
      await Promise.all(
        wanted.map(async (e) => {
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
            tick();
          }
        }),
      );
    };
    return run().catch(() => undefined).then(finish);
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
