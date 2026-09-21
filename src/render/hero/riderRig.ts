/** Shared rider anatomy and mass map. Physics, sensors and the rendered rig use one geometry. */
export { RIDER_PROFILE, RIDER_TORSO_REST, RIDER_SEAT, makeRiderRigPose, riderRigFromHips, riderRigFromCOM, riderPoseAtLean } from '../../core/riderGeometry';
export type { RigPoint, RiderRigPose } from '../../core/riderGeometry';
