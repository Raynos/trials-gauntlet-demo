/**
 * Deterministic transcendental functions for the physics hot path.
 *
 * `Math.sin/cos/atan2` are not required to be correctly rounded by the
 * ECMAScript spec and differ in the last ulp between V8, JSC and
 * SpiderMonkey. Everything here is built from `+ - * /` and `Math.sqrt`,
 * which ARE correctly rounded under IEEE-754 in every engine, so a replay
 * hashes identically on desktop Chromium and iOS Safari.
 *
 * Accuracy: |err| < 1e-9 rad over the full range (tested in dmath.test.ts).
 */

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const QUARTER_PI = 0.7853981633974483;
const INV_TWO_PI = 0.15915494309189535;

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a: number): number {
  const k = Math.floor((a + PI) * INV_TWO_PI);
  return a - k * TWO_PI;
}

/** sin on [-PI/2, PI/2] by Taylor series to degree 17 (error < 1e-11 at PI/2). */
function sinCore(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 *
                    (1 / 362880 +
                      x2 *
                        (-1 / 39916800 +
                          x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000 + x2 * (1 / 355687428096000)))))))))
  );
}

export function sin(a: number): number {
  let x = wrapAngle(a);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  return sinCore(x);
}

export function cos(a: number): number {
  return sin(a + HALF_PI);
}

/** atan on [-tan(PI/8), tan(PI/8)] by Taylor series to degree 23. */
function atanCore(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 3 +
          x2 *
            (1 / 5 +
              x2 *
                (-1 / 7 +
                  x2 *
                    (1 / 9 +
                      x2 *
                        (-1 / 11 +
                          x2 *
                            (1 / 13 +
                              x2 *
                                (-1 / 15 +
                                  x2 * (1 / 17 + x2 * (-1 / 19 + x2 * (1 / 21 + x2 * (-1 / 23))))))))))))
  );
}

const TAN_PI_8 = 0.41421356237309503;

export function atan(x: number): number {
  if (x < 0) return -atan(-x);
  if (x > 1) return HALF_PI - atan(1 / x);
  if (x > TAN_PI_8) return QUARTER_PI + atanCore((x - 1) / (x + 1));
  return atanCore(x);
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function hypot2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
