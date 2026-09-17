/**
 * Astra's settled clip family → the game's additive clip names (ask 43). Physics stays the pose authority
 * (`riderBody`, docs/plans/RIDING_POSES.md); `gltfRider` layers a clip's delta from its rest frame on the physics
 * pose, never the clip itself. This module only says which frames of the delivered cycles those deltas come from.
 *
 * Delivered (prototypes/hero-garage/art/ART_HANDOFF.md): `sit_cruise` 59/30 s, `forward_attack` / `hang_back` 119/30 s,
 * `compression` / `extension` / `landing_absorption` 149/30 s. Measured on race-bluewhite.glb (clipAliases.test.ts):
 * every cycle starts and ends on the shared seated neutral; over 0–1.0 s it rises into ONE standing attack stance
 * (pelvis +13.9 cm and 18°, identical across the three 149/30 cycles — the seated neutral's forward torso offset, spine
 * 10°, eases away inside that entry), holds its target pose over ≈ 2.0–2.75 s, and settles back to the seated neutral
 * over 3.5–4.97 s. `sit_cruise` is a static hold: there is no authored breathing, so `idle_breathe` has no source
 * and the driver's rest gate does nothing on this family (a finding, not a fault).
 *
 * The game's clips are WINDOWS [from, to] of those cycles rested on the stance frame (`ref`), so the layered delta is
 * target − stance: the torso-offset ease is in neither term and is never applied to the physics pose. `pose` is the
 * window time the physics-weighted path samples (the hold); the v1 / mock-physics path plays the window through.
 */

/** How the driver reads one clip: the source clip and window, its rest reference and the frame physics samples (window times). */
export interface ClipWindow {
  source: string;
  from: number;
  to: number;
  ref: number;
  pose: number;
}

const STANCE = 1.0; // s into every 149/30 cycle: the shared standing attack stance (entry done, target not begun)
const SETTLE = 3.5; // s: the stance again, before the exit ease to the seated neutral

/** The delivered family's cycles as the game's clips; `source` names are the delivered ones. */
export const ASTRA_CLIP_WINDOWS: Readonly<Record<'stand_attack' | 'crouch' | 'extend' | 'land_absorb', ClipWindow>> = {
  // The stance itself: one frame, so the legacy rest-reference path (`gltfRider`) finds the same frame the windows rest on.
  stand_attack: { source: 'compression', from: STANCE, to: STANCE + 1 / 30, ref: STANCE, pose: 0 },
  // compression's hold (2.0–2.75 s): pelvis −7.7 cm below the stance, 28°.
  crouch: { source: 'compression', from: STANCE, to: SETTLE, ref: STANCE, pose: 2.25 - STANCE },
  // extension's hold (2.0–2.75 s): pelvis +8.8 cm above the stance, legs long (shin 55°).
  extend: { source: 'extension', from: STANCE, to: SETTLE, ref: STANCE, pose: 2.25 - STANCE },
  // landing_absorption: extended at 1.5–1.75 s, absorbed at 2.0–2.75 s (pelvis −8.8 cm, 25°), recovered by 3.5 s.
  land_absorb: { source: 'landing_absorption', from: STANCE, to: SETTLE, ref: STANCE, pose: 2.5 - STANCE },
};

/** Where the legacy authored clips are sampled by the physics path (frame 8 of 30 / 20; `gltfRider` round 13). */
const LEGACY_POSE_FRACTION: Readonly<Record<string, number>> = { land_absorb: 8 / 30, extend: 8 / 20 };

/**
 * The windows a document's clips are read through. Every authored clip passes through whole under its own name
 * (legacy: `stand_attack` is the rest of `land_absorb` / `extend`; Astra: the six references stay inspectable). The
 * Astra aliases are added only when their source exists and the game name was not authored, and a window is clamped
 * to its source's length so a re-timed export degrades to "the clip through" rather than a NaN.
 */
export function clipWindows(clips: readonly { name: string; duration: number }[]): Map<string, ClipWindow> {
  const out = new Map<string, ClipWindow>();
  const durations = new Map(clips.map((c) => [c.name, c.duration]));
  for (const c of clips) out.set(c.name, { source: c.name, from: 0, to: c.duration, ref: 0, pose: c.duration * (LEGACY_POSE_FRACTION[c.name] ?? 0) });
  for (const [name, w] of Object.entries(ASTRA_CLIP_WINDOWS)) {
    const duration = durations.get(w.source);
    if (duration === undefined || out.has(name)) continue;
    const to = Math.min(w.to, duration);
    const from = Math.min(w.from, to);
    out.set(name, { source: w.source, from, to, ref: Math.min(w.ref, duration), pose: Math.min(w.pose, to - from) });
  }
  return out;
}
