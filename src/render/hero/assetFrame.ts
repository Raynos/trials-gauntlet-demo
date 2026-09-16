/**
 * The bike glb's authored attachment frame (merge #3, blender-work -> main).
 *
 * On the Astra branch this table was `BIKE_GEOMETRY_V2` in `src/physics/v2/tuning.ts` and the solver was built
 * from it (a hinged rear wheel on `swingPivot` / `swingRadius`, the fork on `forkAxis`). The merge keeps `main`'s
 * physics wholesale, whose suspension is two straight axes (`tuning.ts suspension.rear/front`), so the table
 * moves to render as a description of the ASSET: where Blender put the axle markers, in the reference (axle)
 * frame, and how that frame sits on the chassis COM (`chassisToAxle`). `gltfBike.ts` never reads it — it reads
 * the markers from the file and the wheel positions from the physics frame — the tests and the hero census do.
 *
 * Alignment with `main`'s physics (measured, see docs/tasks/blender-branch-merge.md Merge #3): the asset's
 * rear reference axle (chassis (-0.585, -0.21)) IS `main`'s rear rest axle; the front reference axle sits 5 mm
 * from `main`'s (0.715, -0.215). Under travel `main`'s rear wheel moves on the straight axis (0.12, 0.99) while
 * the swingarm arc's tangent at reference is (-0.23, 0.97): the wheel leaves the arm's end by a few cm at full
 * compression — `GltfBike.debug.armLengthError` reports it per frame.
 */
import type { SuspensionV2 } from '../../physics/v2/tuning';

export const BIKE_GEOMETRY_V2 = {
  chassisToAxle: { x: 0.065, y: -0.21 },
  wheelbase: 1.3,
  rear: { x: -0.65, y: 0 },
  front: { x: 0.65, y: 0 },
  swingPivot: { x: -0.22, y: 0.1 },
  swingRadius: Math.sqrt(0.43 ** 2 + 0.1 ** 2),
  rearReferenceCompression: 0.07,
  frontReferenceCompression: 0.05,
  forkAxis: { x: -0.22 / Math.sqrt(0.22 ** 2 + 0.5 ** 2), y: 0.5 / Math.sqrt(0.22 ** 2 + 0.5 ** 2) },
} as const;

/** Chassis-local wheel centre for a suspension coordinate on `main`'s straight-axis suspension. */
export function suspensionPoint(s: SuspensionV2, compression: number): { x: number; y: number } {
  return { x: s.axle.x + s.axis.x * compression, y: s.axle.y + s.axis.y * compression };
}
