/**
 * Art manifest consumer (`public/art/manifest.json`, written by the art
 * owner). Tolerant of shape: an array of entries, `{ assets: [...] }`, or an
 * id → entry map; each entry has a `kind` plus `src`/`file`/`url`/`path` and
 * optional `track` / `tier` / `biome` / `medal` tags. Every lookup degrades
 * to `null` — callers always have a tinted fallback and never show a broken
 * image. Title-critical art is loaded first; cards/medals/plates lazily.
 */
import type { BiomeId, Medal, TrackTier } from '../core/types';
import { artTier, otherTier, type ArtTier } from '../boot/tier';

export type ArtKind = 'keyart' | 'plate-menu' | 'tier-card' | 'track-card' | 'medal' | 'results-bg' | string;

export interface ArtEntry {
  id: string;
  kind: ArtKind;
  /** Resolved, base-relative URL. */
  src: string;
  track?: string;
  tier?: TrackTier;
  biome?: BiomeId;
  medal?: Medal;
  width?: number;
  height?: number;
  /** Bytes when the manifest reports it (title budget check). */
  bytes?: number;
  /** Resolution variant (`1x` / `2x`) when the pack ships more than one. */
  variant?: string;
  /** Bike class for `kind: 'bike'` renders. */
  bike?: string;
}

const ART_BASE = 'art/';

function normalise(raw: unknown): ArtEntry[] {
  const out: ArtEntry[] = [];
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { assets?: unknown }).assets)
      ? ((raw as { assets: unknown[] }).assets)
      : raw && typeof raw === 'object'
        ? Object.entries(raw as Record<string, unknown>).map(([id, v]) => (v && typeof v === 'object' ? { id, ...(v as object) } : null))
        : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    // `path`/`file`/`url` are URLs; `src` is only used when it looks like one (the art pack uses `src` for the generation name).
    const looksLikeUrl = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && (/[./]/.test(v) || v.startsWith('data:'));
    const src = [o['path'], o['file'], o['url'], o['href'], o['webp'], o['png'], o['src']].find(looksLikeUrl);
    const id = typeof o['id'] === 'string' ? o['id'] : typeof o['name'] === 'string' ? o['name'] : src;
    const kind = typeof o['kind'] === 'string' ? o['kind'] : undefined;
    if (!src || !id || !kind) continue;
    // `?v=<8 hex of the file>` (ask 58): the art pack is not content-addressed by filename, so the
    // version travels in the query. That is what makes a one-month `Cache-Control` on /art/** safe —
    // a changed file is a changed URL, for the HTTP cache and for Cache Storage alike.
    const v = typeof o['v'] === 'string' ? `?v=${o['v']}` : '';
    const base = /^(https?:)?\/\//.test(src) || src.startsWith('/') || src.startsWith('data:') ? src : src.startsWith(ART_BASE) ? src : ART_BASE + src;
    const e: ArtEntry = { id, kind, src: src.startsWith('data:') ? base : base + v };
    if (typeof o['track'] === 'string') e.track = o['track'];
    if (typeof o['tier'] === 'string') e.tier = o['tier'] as TrackTier;
    if (typeof o['biome'] === 'string') e.biome = o['biome'] as BiomeId;
    if (typeof o['medal'] === 'string') e.medal = o['medal'] as Medal;
    if (typeof o['width'] === 'number') e.width = o['width'];
    if (typeof o['height'] === 'number') e.height = o['height'];
    if (typeof o['bytes'] === 'number') e.bytes = o['bytes'];
    if (typeof o['w'] === 'number') e.width = o['w'];
    if (typeof o['h'] === 'number') e.height = o['h'];
    if (typeof o['variant'] === 'string') e.variant = o['variant'];
    if (typeof o['bike'] === 'string') e.bike = o['bike'];
    out.push(e);
  }
  return out;
}

export class ArtManifest {
  private entries: ArtEntry[] = [];
  private loaded = false;
  private readonly waiters: (() => void)[] = [];
  private readonly probed = new Map<string, Promise<boolean>>();

  /** Parse an already-fetched manifest (tests, or an inlined one). */
  static from(raw: unknown): ArtManifest {
    const m = new ArtManifest();
    m.entries = normalise(raw);
    m.loaded = true;
    return m;
  }

  /** Fetch `art/manifest.json`; a missing or malformed file is an empty manifest. */
  async load(url: string = ART_BASE + 'manifest.json'): Promise<this> {
    if (this.loaded) return this;
    try {
      // No `cache: 'no-cache'`: that mode says "never trust what you already have", which is exactly
      // the B-SLOW bug (docs/plans/PWA_OFFLINE.md §5) — the art manifest is served by the worker from
      // Cache Storage, and the host revalidates it on its own.
      const res = await fetch(url);
      if (res.ok) this.entries = normalise(await res.json());
    } catch {
      this.entries = [];
    }
    this.loaded = true;
    for (const w of this.waiters.splice(0)) w();
    return this;
  }

  get ready(): boolean {
    return this.loaded;
  }

  whenReady(cb: () => void): void {
    if (this.loaded) cb();
    else this.waiters.push(cb);
  }

  all(): readonly ArtEntry[] {
    return this.entries;
  }

  find(pred: (e: ArtEntry) => boolean): ArtEntry | null {
    return this.entries.find(pred) ?? null;
  }

  /**
   * Pick this device's resolution tier out of a list that may hold both (ask 59). `artTier()` is the ONE
   * such decision in the tree — the offline pack fetches the tier this returns, so a second opinion here
   * would be a picture the device downloaded nothing for.
   */
  private atTier(list: readonly ArtEntry[]): ArtEntry | null {
    if (list.length === 0) return null;
    const tier = artTier();
    return list.find((e) => e.variant === tier) ?? list.find((e) => !e.variant) ?? list[0]!;
  }

  /**
   * The same picture at the other tier, when the pack ships one — what a device whose DPR changed after
   * the download degrades to rather than showing nothing (`applyBackground` uses it automatically).
   */
  altVariant(entry: ArtEntry | null): ArtEntry | null {
    if (!entry?.variant) return null;
    const want = otherTier(entry.variant as ArtTier);
    return this.entries.find((e) => e.kind === entry.kind && e.variant === want && e.biome === entry.biome && e.bike === entry.bike && e.medal === entry.medal) ?? null;
  }

  /** Key art for a biome (any biome as fallback), at this device's tier. */
  keyart(biome?: BiomeId): ArtEntry | null {
    const all = this.entries.filter((e) => e.kind === 'keyart');
    const pool = (biome && all.filter((e) => e.biome === biome)) || [];
    return this.atTier(pool.length ? pool : all);
  }

  trackCard(trackId: string): ArtEntry | null {
    return this.find((e) => (e.kind === 'track-card' || e.kind === 'track') && e.track === trackId);
  }

  /** Real-render thumbnail (`kind: 'thumb'`, art round 2) — preferred over the generated card when present. */
  trackThumb(trackId: string): ArtEntry | null {
    return this.find((e) => e.kind === 'thumb' && e.track === trackId);
  }

  /** Garage bike render for a class, at this device's tier (it used to hold its own 1600 px threshold). */
  bikeArt(bike: 'rookie' | 'pro'): ArtEntry | null {
    return this.atTier(this.entries.filter((e) => e.kind === 'bike' && e.bike === bike));
  }

  /** Any entry by id (`garage-plate`, `results-credits`, …). */
  byId(id: string): ArtEntry | null {
    return this.find((e) => e.id === id);
  }

  tierCard(tier: TrackTier): ArtEntry | null {
    return this.find((e) => e.kind === 'tier-card' && e.tier === tier);
  }

  /** The medal plate at this device's tier — it used to take whichever of the 512/256 pair came first. */
  medal(medal: Medal): ArtEntry | null {
    return this.atTier(this.entries.filter((e) => e.kind === 'medal' && e.medal === medal));
  }

  plate(kind: 'plate-menu' | 'results-bg' | 'loading', biome?: BiomeId): ArtEntry | null {
    return (biome && this.find((e) => e.kind === kind && e.biome === biome)) || this.find((e) => e.kind === kind);
  }

  /**
   * Decode an image once; resolves false on error (404, corrupt) so the
   * caller keeps its fallback. Cached per URL.
   */
  probe(src: string): Promise<boolean> {
    let p = this.probed.get(src);
    if (!p) {
      p = new Promise<boolean>((resolve) => {
        if (typeof Image === 'undefined') return resolve(false);
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = src;
      });
      this.probed.set(src, p);
    }
    return p;
  }

  /**
   * Resolve an entry to a URL that will actually decode: its own, else the other resolution tier's
   * (ask 59 — offline, a device that has changed DPR since the download has only the other one cached).
   */
  async resolve(entry: ArtEntry | null): Promise<string | null> {
    if (!entry) return null;
    if (await this.probe(entry.src)) return entry.src;
    const alt = this.altVariant(entry);
    return alt && (await this.probe(alt.src)) ? alt.src : null;
  }

  /** Apply an image as a background once it has decoded; adds `loaded` so CSS can fade it in. */
  applyBackground(el: HTMLElement, entry: ArtEntry | null): void {
    if (!entry) return;
    void this.resolve(entry).then((src) => {
      if (!src || !el.isConnected) return;
      el.style.backgroundImage = `url("${src}")`;
      el.classList.add('loaded');
    });
  }
}

/** Biome-tinted fallback gradient for cards without art. */
export const BIOME_TINT: Record<BiomeId, string> = {
  industrial: 'linear-gradient(160deg, #5a3e16 0%, #2a1d0c 55%, #120d07 100%)',
  canyon: 'linear-gradient(160deg, #a4552a 0%, #5a2a16 55%, #1c0f09 100%)',
  snow: 'linear-gradient(160deg, #40607f 0%, #1f2f44 55%, #0d1219 100%)',
  nightCity: 'linear-gradient(160deg, #4a2560 0%, #1c3550 55%, #0b0f18 100%)',
  foundry: 'linear-gradient(160deg, #b0400f 0%, #4a1706 55%, #170804 100%)',
  coast: 'linear-gradient(160deg, #2f8a8c 0%, #1b4a52 55%, #0b1d22 100%)',
  alpine: 'linear-gradient(160deg, #4f7a3a 0%, #24401f 55%, #0e170c 100%)',
  quarry: 'linear-gradient(160deg, #d09a5a 0%, #7a4a2c 55%, #241510 100%)',
};
