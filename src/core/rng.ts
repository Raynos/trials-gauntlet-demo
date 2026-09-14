/**
 * Deterministic seeded PRNG (sfc32). Pure 32-bit integer arithmetic so the
 * sequence is identical in every JS engine and across replays.
 */
export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed: number) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    // Expand a single 32-bit seed with splitmix32 to fill the sfc32 state.
    let s = seed >>> 0;
    const next = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    // Warm up so weak seeds diverge.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  /** Uniform unsigned 32-bit integer. */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Snapshot for hashing / resume. */
  state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: readonly [number, number, number, number]): void {
    [this.a, this.b, this.c, this.d] = s;
  }
}

/** Hash a string to a 32-bit seed (FNV-1a). */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
