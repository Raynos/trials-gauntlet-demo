import { describe, expect, it } from 'vitest';
import { ArtManifest } from './art';

describe('art manifest', () => {
  it('accepts an array, an {assets} wrapper, or an id map, and resolves src under art/', () => {
    const arr = ArtManifest.from([{ id: 'keyart-industrial', kind: 'keyart', biome: 'industrial', src: 'keyart-industrial.webp' }]);
    expect(arr.keyart('industrial')?.src).toBe('art/keyart-industrial.webp');
    const wrapped = ArtManifest.from({ assets: [{ name: 'track-b1-first-ride', kind: 'track-card', track: 'b1-first-ride', file: 'cards/b1.webp' }] });
    expect(wrapped.trackCard('b1-first-ride')?.src).toBe('art/cards/b1.webp');
    const map = ArtManifest.from({ 'medal-gold': { kind: 'medal', medal: 'gold', url: '/art/medal-gold.png' } });
    expect(map.medal('gold')?.src).toBe('/art/medal-gold.png');
  });

  it('falls back to null for anything missing or malformed — never a broken image', () => {
    const m = ArtManifest.from({ junk: 1, half: { kind: 'keyart' } });
    expect(m.keyart()).toBeNull();
    expect(m.trackCard('x')).toBeNull();
    expect(ArtManifest.from(null).all()).toHaveLength(0);
    expect(ArtManifest.from('nope').all()).toHaveLength(0);
  });

  it('reads the shipped pack shape: `path` is the URL, `src` is the generation name, variants pick by DPR', () => {
    const m = ArtManifest.from({
      assets: [
        { id: 'keyart-industrial-1920', path: 'art/menu/keyart-industrial-1920.webp', kind: 'keyart', biome: 'industrial', variant: '2x', w: 1920, h: 1280, bytes: 263302, src: 'keyart-industrial' },
        { id: 'keyart-industrial-960', path: 'art/menu/keyart-industrial-960.webp', kind: 'keyart', biome: 'industrial', variant: '1x', w: 960, h: 640, bytes: 92208, src: 'keyart-industrial' },
        { id: 'medal-gold', path: 'art/menu/medal-gold.png', kind: 'medal', medal: 'gold', src: 'medal-gold' },
        { id: 'track-b1-first-ride', path: 'art/menu/track-b1-first-ride.webp', kind: 'track-card', track: 'b1-first-ride', src: 'track-b1-first-ride' },
      ],
    });
    const k = m.keyart('industrial');
    expect(k?.src.startsWith('art/menu/keyart-industrial-')).toBe(true); // never the bare generation name
    expect(k?.src.endsWith('.webp')).toBe(true);
    expect(m.medal('gold')?.src).toBe('art/menu/medal-gold.png');
    expect(m.trackCard('b1-first-ride')?.src).toBe('art/menu/track-b1-first-ride.webp');
  });

  // Ask 59: the pack fetches ONE tier, so every picker must agree on which one. jsdom is DPR 1 / 1024 px → 1x.
  it('picks this device\'s tier for key art, bikes and medals, and names the other one for a degraded draw', () => {
    const m = ArtManifest.from([
      { id: 'k-hi', kind: 'keyart', biome: 'canyon', variant: '2x', src: 'k-hi.webp' },
      { id: 'k-lo', kind: 'keyart', biome: 'canyon', variant: '1x', src: 'k-lo.webp' },
      { id: 'b-hi', kind: 'bike', bike: 'rookie', variant: '2x', src: 'b-hi.webp' },
      { id: 'b-lo', kind: 'bike', bike: 'rookie', variant: '1x', src: 'b-lo.webp' },
      { id: 'm-hi', kind: 'medal', medal: 'gold', variant: '2x', src: 'm-hi.png' },
      { id: 'm-lo', kind: 'medal', medal: 'gold', variant: '1x', src: 'm-lo.png' },
    ]);
    expect(m.keyart('canyon')?.id).toBe('k-lo');
    expect(m.bikeArt('rookie')?.id).toBe('b-lo');
    expect(m.medal('gold')?.id).toBe('m-lo');
    expect(m.altVariant(m.keyart('canyon'))?.id).toBe('k-hi');
    expect(m.altVariant(m.medal('gold'))?.id).toBe('m-hi');
    expect(m.altVariant(m.trackCard('nothing'))).toBeNull();
  });

  it('keyart prefers the requested biome, then any keyart', () => {
    const m = ArtManifest.from([
      { id: 'k1', kind: 'keyart', biome: 'canyon', src: 'k1.webp' },
      { id: 'k2', kind: 'keyart', biome: 'industrial', src: 'k2.webp' },
    ]);
    expect(m.keyart('industrial')?.id).toBe('k2');
    expect(m.keyart('snow')?.id).toBe('k1');
  });
});
