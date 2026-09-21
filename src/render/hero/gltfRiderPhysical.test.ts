import { readFile } from 'node:fs/promises';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { InputRecording } from '../../core/replay';
import { Game } from '../../game/game';
import { createBikePhysicsV2 } from '../../physics/v2/bike';
import { FrameBuilder } from '../frame';
import type { GameRenderer } from '../index';
import { loadRig } from './gltfTestUtils';
import { AVAILABLE_RIDER_PRESETS } from '../../core/riderPresets';
import { prepareHero } from './lod';

import { fixture, poseFrame, expectContactsAndMass } from './riderPoseTestUtils';

// Every shipped outfit and detail goes through the production decoder and preparation.
const subjects: { file: string; load: () => Promise<GLTF> }[] = AVAILABLE_RIDER_PRESETS.flatMap(p =>
  [`rider-${p.id}.glb`, `rider-${p.id}-lod.glb`].map(file => ({ file, load: async () => { const g = await loadRig(file); await prepareHero(g); return g; } })));

describe.each(subjects)('$file physical pose', ({ file, load }) => {
  let gltf: GLTF;
  beforeAll(async () => { gltf = await load(); });

  it.each(['rookie', 'pro'] as const)('%s retains real sockets, lengths, elbow side and independent COM through a pose grid', cls => {
    const rig = fixture(gltf, cls);
    for (const [hipX, hipY, torso] of [[-.57, .60, 55], [-.28, .85, 40], [-.22, .90, 26], [-.38, .78, 28], [-.14, .96, 40], [-.40, .70, 40]]) {
      for (const angle of [-2.8, -.5, 0, .7, 3.1]) {
        const f = poseFrame(hipX!, hipY!, torso!, angle);
        rig.update(f);
        expectContactsAndMass(rig, f, JSON.stringify({ file, cls, hipX, hipY, torso, angle }));
      }
    }
  });

  it.each(['rookie', 'pro'] as const)('%s freezes a finish pose exactly and restores after ragdoll/restart', cls => {
    const live = fixture(gltf, cls), fresh = fixture(gltf, cls);
    const f = poseFrame(-.4, .70, 40, .8);
    f.finished = true; f.tSim = 78.433; f.cut = false;
    live.update(f);
    const held = live.snapshot();
    for (let i = 0; i < 180; i++) live.update(f);
    expect(live.snapshot()).toEqual(held);
    expectContactsAndMass(live, f, 'held finish (synthetic; not the reported finish recording)');
    f.finished = false;
    f.ragdoll = (['pelvis', 'torso', 'head', 'upperArm', 'forearm', 'thigh', 'shin'] as const).map((id, i) => ({ id, pos: { x: 3 + i * .1, y: .8 + i * .1 }, angle: .4 }));
    for (let i = 0; i < 6; i++) { f.tSim += f.dt; live.update(f); }
    expect(live.rider.debug.physicalPose).toBe(false);
    expect(live.rider.debug.handOnGrip).toEqual([false, false]);
    expect(live.rider.debug.footOnPeg).toEqual([false, false]);
    const restarted = poseFrame(-.28, .85, 40, 0);
    live.update(restarted); fresh.update(restarted);
    expect(live.snapshot()).toEqual(fresh.snapshot());
    expectContactsAndMass(live, restarted, 'restart');
  });

  it.each(['rookie', 'pro'] as const)('%s follows actual production Game playback through the E2 impact window', async cls => {
    const rec = JSON.parse(await readFile(new URL(`../../../harness/inputs/e2-rear-wheel-first/bot-3${cls === 'pro' ? '-pro' : ''}.json`, import.meta.url), 'utf8')) as InputRecording;
    expect(rec.header.physics).toBe('v2');
    expect(rec.header.physicsHz).toBe(120);
    expect(rec.header.bike).toBe(cls);
    const physics = createBikePhysicsV2(rec.header.physicsHz);
    const game = new Game({ physics, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer,
      physicsHz: rec.header.physicsHz, autoSkipCountdown: true, ghostEnabled: false });
    game.loadTrack(rec.header.trackId, rec.header.seed, cls);
    const rig = fixture(gltf, cls), frames = new FrameBuilder();
    // These legacy controls exercise impacts; this test is not a claim that they still clear E2.
    // Reach/fault behavior is physical: the renderer keeps fixed bone lengths and reports the
    // actual contact shortfall, rather than moving the pelvis back into a cosmetic pose envelope.
    const worst = { grip: 0, sole: 0, length: 0, elbowPole: Infinity, com: 0 };
    let tick = 0, ridden = 0, reachable = 0, worstResidual = 0;
    outer: for (const [count, throttle, brake, lean, flags] of rec.runs) for (let i = 0; i < count!; i++) {
      if (++tick > 900) break outer;
      game.setInput({ throttle: throttle! / 255, brake: brake! / 255, lean: lean! / 127, hop: Boolean(flags! & 1), restart: Boolean(flags! & 2) });
      game.step(1);
      const st = game.getState();
      const f = frames.build(st, 1);
      rig.update(f);
      if (f.ragdoll) { expect(rig.snapshot().every(Number.isFinite)).toBe(true); continue; }
      ridden++;
      const context = `E2 ${cls} input ${tick}`;
      const e = expectContactsAndMass(rig, f, context, { grip: .02001, sole: .02001, length: 1e-6, elbowPole: -1e-6, com: .01 });
      const dbg = rig.rider.debug;
      const wristErr = Math.max(dbg.wristErr[0]!, dbg.wristErr[1]!), ankleErr = Math.max(dbg.ankleErr[0]!, dbg.ankleErr[1]!);
      if (wristErr === 0 && ankleErr < 1e-5) {
        reachable++;
        expect(e.grip, `grip in reach ${context}`).toBeLessThan(1e-5);
        expect(e.sole, `sole in reach ${context}`).toBeLessThan(1e-5);
        expect(e.com, `measured COM in reach ${context}`).toBeLessThan(1e-5);
      }
      // Out of reach the miss IS the shortfall (wristErr is rounded to 1e-4; the foot is rigid on the shin).
      expect(e.grip, `grip shortfall ${context}`).toBeLessThan(wristErr + 1.1e-4);
      expect(e.sole, `sole shortfall ${context}`).toBeLessThan(ankleErr + 1e-5);
      worst.grip = Math.max(worst.grip, e.grip); worst.sole = Math.max(worst.sole, e.sole); worst.com = Math.max(worst.com, e.com);
      worstResidual = Math.max(worstResidual, dbg.comResidual);
    }
    // This checks pose mapping on ridden states, not whether old controls still clear E2.
    expect(tick).toBe(901);
    expect(ridden).toBeGreaterThan(0);
    expect(reachable).toBeGreaterThan(400);
    expect(worstResidual).toBeLessThan(1e-6);
    // Riding contacts stay within the plan's 2cm bar (plus 10µm export arithmetic).
    expect(worst.grip).toBeLessThan(.02001);
    expect(worst.sole).toBeLessThan(.02001);
    expect(worst.com).toBeLessThan(.01);

  });
});
