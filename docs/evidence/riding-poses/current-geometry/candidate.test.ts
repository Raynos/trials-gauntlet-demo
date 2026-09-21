// Executes existing handling assertions unchanged against candidate tuning via a local factory mock.
// Never included by the normal project's Vitest config. No runtime source file is modified.
import { vi } from 'vitest';
import type * as PhysicsModule from '../../../../src/physics/v2/bike';
import type { PartialTuningV2 } from '../../../../src/physics/v2/tuning';
type Endpoint = {hipX:number;hipY:number;torso:number};
vi.mock('../../../../src/physics/v2/bike', async importOriginal => {
 const original = await importOriginal<typeof PhysicsModule>();
 const { readFileSync } = await import('node:fs');
 const sweep = JSON.parse(readFileSync('docs/evidence/riding-poses/current-geometry/sweep-results.json','utf8'));
 const candidate = process.env.POSE_CANDIDATE === 'balanced' ? sweep.candidates.find((c:{back:Endpoint;forward:Endpoint})=>c.back.hipX===-.66&&c.back.hipY===.46&&c.back.torso===40&&c.forward.hipX===-.12&&c.forward.hipY===.9&&c.forward.torso===24) : sweep.candidates[0];
 const poses = candidate.poses;
 const migration = process.env.POSE_TUNE ? JSON.parse(readFileSync('docs/evidence/riding-poses/current-geometry/migration-tune.json','utf8')).rows[Number(process.env.POSE_TUNE)].over.rider : null;
 return {...original, createBikePhysicsV2: (hz:number, over?:PartialTuningV2) => original.createBikePhysicsV2(hz,{...over,rider:{...(migration ?? {poses}),...over?.rider}})};
});
import '../../../../src/physics/v2/feel.test';
import '../../../../src/physics/v2/r2.test';
import '../../../../src/physics/v2/r3.test';
import '../../../../src/physics/v2/r4.test';
import '../../../../src/physics/v2/r5.test';
import '../../../../src/physics/v2/r6.test';
import '../../../../src/physics/v2/r7.test';
import '../../../../src/physics/v2/r8.test';
