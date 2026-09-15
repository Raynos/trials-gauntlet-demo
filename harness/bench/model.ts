/**
 * Frame-cost models for the bench (docs/plans/PERF.md §2 states the coefficients and their provenance).
 *
 * Two models, both first order and both stated in phone milliseconds:
 *
 * 1. GPU work model — what a tile-based phone GPU has to do for the frame, from the pass list
 *    (`debugInfo().rtPasses` / `PostChain.passWrites()`), the draw count and the triangle count:
 *
 *      work = Σ_pass px_pass × bytes_pass × w_pass   (weighted MB written)
 *      ms_gpu ≈ MS_PER_WMB × work + MS_PER_KTRI × ktris + MS_PER_DRAW_GPU × calls
 *
 *    The per-pass weight is the shading cost per byte relative to a plain copy: the scene pass
 *    shades every covered fragment with a PBR material (overdraw ≈ 2–3× on the deck + volumetrics),
 *    SSAO takes 16 depth taps + a blur, the composite reads scene + bloom + AO + up to 8 smear taps,
 *    the bloom mips are 5-tap separable blurs, the shadow pass is depth-only.
 *
 * 2. Phone frame model — the whole frame the RAF sees:
 *
 *      ms_phone ≈ A·rtMpx + B·calls + C·ktris + D·texMB_touched + E
 *
 *    A = fill (ms per Mpx of RT writes, weighted-average pass), B = CPU per draw (three.js
 *    material/uniform setup + ANGLE-on-Metal encode, the dominant term on Safari), C = vertex work,
 *    D = texture bandwidth touched per frame (a proxy — MB resident × fraction sampled), E = constant
 *    (Game.render + HUD DOM + audio + Safari RAF/compositor overhead).
 *
 *    Calibration (2026-09-14, see PERF.md §2): two readings from the user's iPhone at the phone
 *    geometry — 24–28 fps at a 30 cap on the pre-r12 `low` (5.17 Mpx / 157 calls / 234 ktris /
 *    70 MB) and on the post-r12 `medium` (7.64 Mpx / 207 calls / 164 ktris / 70 MB). With a 30 cap
 *    on a 60 Hz RAF, 24–28 fps means the frame straddles the 16.7 ms slot: ≈ 17 ms and ≈ 19 ms.
 *    Two points for five unknowns — the fill term is pinned near 0.9 ms/Mpx by the 2.5 Mpx gap
 *    between them, the rest are priors. The coefficients below are priors from published
 *    mobile figures constrained by those two points; confidence is low until the `?bench=1` device
 *    report gives tier-by-tier numbers (the `recalibrate` note at the bottom says what to fit).
 */

export interface PassWrite {
  name: string;
  width: number;
  height: number;
  bytesPerPixel: number;
}

/** Shading cost per byte written, relative to a plain copy. */
export function passWeight(name: string): number {
  if (name.startsWith('shadow')) return 0.5;
  if (name.startsWith('scene')) return 2.5;
  if (name.startsWith('ao')) return 1.5;
  if (name.startsWith('bloom:add')) return 0.3;
  if (name.startsWith('bloom:bright')) return 1.0;
  if (name.startsWith('bloom:composite')) return 1.2;
  if (name.startsWith('bloom')) return 1.0;
  if (name.startsWith('composite')) return 1.6;
  return 1.0;
}

/** Phone GPU: ms per weighted MB written (A17-class: ~2 Gpx/s × 4 B ≈ 8 GB/s effective → 0.125 ms/MB, ×1.6 for bandwidth contention). */
export const MS_PER_WMB = 0.2;
/** Phone GPU: ms per 1000 triangles (≈ 300 Mtri/s with a skinned share). */
export const MS_PER_KTRI = 0.0035;
/** Phone GPU: ms per draw on the GPU side (state changes on a TBDR; small next to the CPU per-draw cost). */
export const MS_PER_DRAW_GPU = 0.005;

export interface GpuWork {
  /** Weighted MB written per frame. */
  weightedMB: number;
  /** Plain MB written per frame (what `debugInfo().rtMB` reports, recomputed). */
  rawMB: number;
  mpx: number;
  byPass: { name: string; mpx: number; mb: number; weightedMB: number }[];
  /** Model ms on a phone GPU. */
  msGpu: number;
}

export function gpuWork(passes: PassWrite[], calls: number, tris: number): GpuWork {
  let weightedMB = 0;
  let rawMB = 0;
  let mpx = 0;
  const byPass = passes.map((p) => {
    const px = p.width * p.height;
    const mb = (px * p.bytesPerPixel) / 1048576;
    const w = mb * passWeight(p.name);
    weightedMB += w;
    rawMB += mb;
    mpx += px / 1e6;
    return { name: p.name, mpx: px / 1e6, mb, weightedMB: w };
  });
  const msGpu = MS_PER_WMB * weightedMB + MS_PER_KTRI * (tris / 1000) + MS_PER_DRAW_GPU * calls;
  return { weightedMB, rawMB, mpx, byPass, msGpu };
}

/**
 * Phone frame model coefficients (ms) — recalibrated 2026-09-15 from device report #1
 * (docs/device/2026-09-15-5649aa6.md; iPhone, iOS 18.7, 874×330 @ 3):
 *   low  at cap 60: 59.5 fps, JS tick 2.1 ms, 116 calls / 125 ktris / 0.55 Mpx (holds, ~14 ms spare)
 *   high at cap 30: interval p95 47 ms, 207 calls / 262 ktris / 6.57 Mpx (2048² shadow, SSAO, HDR) — ≈ 35–45 ms
 *   medium at cap 30: holds, 184 calls / 191 ktris / 2.08 Mpx (≤ 33 ms; unmeasured at 60)
 * The JS frame is 2.1 ms (the cap-30 `submit` of ~5 ms is driver back-pressure, not JS), so E + B·calls ≈ 2.2;
 * the fill term carries the GPU: (40 − 6) / (6.57 − 0.55) ≈ 4.4 ms per raw Mpx written, shadow included
 * (a depth-only 2048² map is not free on this GPU). Cross-check: medium → 14.7 ms (60 fps borderline —
 * consistent with "holds 30, unmeasured at 60"); phone-high (PERF.md §3.1) → ≈ 10 ms.
 */
export const PHONE = {
  /** ms per effective Mpx of render-target writes (`effectiveMpx`: raw px, the trivial additive bloom pass at 0.3). */
  A: 4.4,
  /** ms per draw call on the main thread (Safari three.js + ANGLE/Metal encode). */
  B: 0.02,
  /** ms per 1000 triangles. */
  C: 0.004,
  /** ms per MB of texture touched per frame (unresolved by the report; kept small). */
  D: 0.0,
  /** constant: Game.render + HUD DOM + audio + RAF (the report's 2.1 ms JS minus B·116). */
  E: 1.0,
  /** ± on the estimate: three device points, one of them (high) a bound not a reading. */
  confidence: 0.25,
} as const;

/** Raw Mpx written per frame with the pass' cost class: a plain additive quad over the canvas counts 0.3, everything else 1. */
export function effectiveMpx(passes: PassWrite[]): number {
  let mpx = 0;
  for (const p of passes) mpx += ((p.width * p.height) / 1e6) * (p.name.startsWith('bloom:add') ? 0.3 : 1);
  return mpx;
}

export interface PhoneEstimate {
  ms: number;
  parts: { fill: number; draws: number; tris: number; textures: number; constant: number };
  fps: number;
  lo: number;
  hi: number;
}

/** `texMBTouched`: resident texture MB × the fraction a riding frame samples (≈ 0.5 — half the world's skins are behind the camera or in another chunk). */
export function phoneEstimate(rtMpx: number, calls: number, tris: number, texMBResident: number, touchedFraction = 0.5): PhoneEstimate {
  // A skipped frame (perf cut #1: 0 draws) writes no render target either.
  const fill = calls === 0 && tris === 0 ? 0 : PHONE.A * rtMpx;
  const draws = PHONE.B * calls;
  const trisMs = PHONE.C * (tris / 1000);
  const textures = PHONE.D * texMBResident * touchedFraction;
  const ms = fill + draws + trisMs + textures + PHONE.E;
  return { ms, parts: { fill, draws, tris: trisMs, textures, constant: PHONE.E }, fps: 1000 / ms, lo: ms * (1 - PHONE.confidence), hi: ms * (1 + PHONE.confidence) };
}

/**
 * What the device report must give us to fit A–E properly: for one track (b1), each tier at the
 * phone geometry, frame ms p50/p95 with the cap off (60), plus the same on `low` at DPR 0.5
 * (halves rtMpx at equal calls/tris → isolates A) and with `?perf=1` fields on screen. Five points,
 * five unknowns; a sixth (h3 medium: 287 calls) pins B.
 */
export const RECALIBRATE_NOTE = 'fit A–E from: b1 low/medium/high at cap 60, b1 low at DPR 0.5, h3 medium';
