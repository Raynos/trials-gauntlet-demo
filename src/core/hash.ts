import type { PhysicsState } from './types';

/**
 * Streaming 64-bit FNV-1a over the IEEE-754 bytes of numbers. Two states hash
 * equal iff every number is bit-identical, which is exactly the determinism
 * contract the harness enforces.
 */
export class StateHasher {
  private hi = 0xcbf29ce4;
  private lo = 0x84222325;
  private readonly f64 = new Float64Array(1);
  private readonly u8 = new Uint8Array(this.f64.buffer);

  private byte(b: number): void {
    // h ^= b; h *= 0x100000001b3 (64-bit, done as two 32-bit halves)
    this.lo ^= b;
    // multiply (hi:lo) by 0x1b3 and add (lo << 32) [the 0x100000000 term]
    const loMul = this.lo * 0x1b3;
    const carry = Math.floor(loMul / 0x100000000);
    const newLo = loMul >>> 0;
    const newHi = ((this.hi * 0x1b3) >>> 0) + carry + this.lo;
    this.lo = newLo;
    this.hi = newHi >>> 0;
  }

  number(n: number): this {
    this.f64[0] = n;
    for (let i = 0; i < 8; i++) this.byte(this.u8[i] as number);
    return this;
  }

  bool(b: boolean): this {
    this.byte(b ? 1 : 0);
    return this;
  }

  string(s: string | null): this {
    if (s === null) {
      this.byte(0xff);
      return this;
    }
    this.byte(s.length & 0xff);
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i) & 0xff);
    return this;
  }

  digest(): string {
    return this.hi.toString(16).padStart(8, '0') + this.lo.toString(16).padStart(8, '0');
  }
}

/** Canonical hash of a physics snapshot. Field order is the contract. */
export function hashPhysicsState(s: PhysicsState): string {
  const h = new StateHasher();
  h.number(s.tick).number(s.time);
  h.number(s.bike.pos.x).number(s.bike.pos.y);
  h.number(s.bike.vel.x).number(s.bike.vel.y);
  h.number(s.bike.angle).number(s.bike.angVel);
  for (const w of [s.wheels.rear, s.wheels.front]) {
    h.number(w.pos.x).number(w.pos.y).number(w.spin).number(w.spinVel);
    h.number(w.compression).bool(w.grounded);
  }
  h.number(s.rider.lean).number(s.rider.crouch).number(s.rider.torsoPitch).number(s.rider.armExtend);
  // Physics v2 rider body: hashed only when present, so v1 / mock goldens are untouched.
  const rb = s.riderBody;
  if (rb) h.number(rb.pos.x).number(rb.pos.y).number(rb.angle).number(rb.vel.x).number(rb.vel.y).number(rb.angVel);
  h.number(s.checkpoint).bool(s.finished).string(s.faulted);
  h.number(s.finishTime ?? Number.NaN);
  h.number(s.input.throttle).number(s.input.brake).number(s.input.lean);
  h.number(s.engine.rpm).number(s.engine.throttleEff).bool(s.engine.limiter);
  h.string(s.contacts.rear).string(s.contacts.front);
  h.number(s.rearSlip).string(s.hopPhase);
  if (s.ragdoll) for (const b of s.ragdoll) h.string(b.id).number(b.pos.x).number(b.pos.y).number(b.angle);
  else h.string(null);
  for (const w of s.seesaws) h.number(w.id).number(w.angle).number(w.angVel);
  for (const d of s.drums) h.number(d.id).number(d.spin);
  return h.digest();
}
