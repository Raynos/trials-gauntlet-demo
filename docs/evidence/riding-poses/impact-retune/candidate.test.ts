import { vi } from 'vitest';
import type * as PhysicsModule from '../../../../src/physics/v2/bike';
import type { PartialTuningV2 } from '../../../../src/physics/v2/tuning';
vi.mock('../../../../src/physics/v2/bike', async importOriginal => {
 const original=await importOriginal<typeof PhysicsModule>();
 return {...original,createBikePhysicsV2:(hz:number,over?:PartialTuningV2)=>original.createBikePhysicsV2(hz,{...over,rider:{targetRateAng:Number(process.env.POSE_ANG),kd:Number(process.env.POSE_KD),...over?.rider}})};
});
import '../../../../src/physics/v2/property.test';
import '../../../../src/physics/v2/r2.test';
import '../../../../src/physics/v2/r3.test';
