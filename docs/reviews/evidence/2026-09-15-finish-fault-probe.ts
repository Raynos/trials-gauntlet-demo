import { createBikePhysicsV2 } from '../../../src/physics/v2/bike';
import { Game } from '../../../src/game/game';
import type { GameRenderer } from '../../../src/render';
const physics = createBikePhysicsV2(120);
const renderer = {
  setTrack() {}, render() { return 0; }, onEvent() {},
  setRunInfo() {}, setGhost() {}, finish() {},
} as unknown as GameRenderer;
const game = new Game({ physics, renderer, autoSkipCountdown: true });
game.loadTrack('flat-test');
const finishX = game.currentTrack!.finishX;
const angle = -Math.PI / 2;
physics.teleport({ pos: { x: finishX, y: 0.34 }, angle, vel: { x: 8, y: 0 } });
const dx = finishX - 0.01 - physics.getState().wheels.front.pos.x;
physics.teleport({ pos: { x: finishX + dx, y: 0.34 }, angle, vel: { x: 8, y: 0 } });
const events: unknown[] = [];
game.onEvent(e => events.push(e));
console.info('before', { frontX: physics.getState().wheels.front.pos.x, finishX });
game.step(1);
console.info('after', {
  phase: game.phase(), faults: game.faults(),
  frontX: physics.getState().wheels.front.pos.x,
  physicsFault: physics.getState().faulted,
  finishTime: physics.getState().finishTime, events,
});
