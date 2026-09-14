/** Print each track's placed obstacles (kind @ x) and the tick the golden first reaches each x. */
import { expandFrames } from '../../src/core/replay';
import { loadRecording } from '../lib/recording';
import { createSim } from '../lib/sim';

async function main(): Promise<void> {
  for (const id of process.argv.slice(2)) {
    const rec = loadRecording(`harness/inputs/${id}/bot-3.json`);
    const sim = await createSim(id, rec.header.seed, rec.header.physicsHz);
    const frames = expandFrames(rec);
    const xs: number[] = [];
    for (const f of frames) {
      sim.step(f);
      xs.push(sim.state().bike.pos.x);
    }
    const hz = rec.header.physicsHz;
    const reach = (x: number): string => {
      const i = xs.findIndex((v) => v >= x);
      return i < 0 ? 'never' : `${(i / hz).toFixed(2)}s`;
    };
    console.log(`== ${id} placed=${sim.compiled.placed.length} finishX=${(sim.compiled as unknown as { finishX?: number }).finishX ?? '?'} checkpoints=${JSON.stringify((sim.compiled as unknown as { checkpoints?: unknown }).checkpoints ?? null)}`);
    for (const o of sim.compiled.placed as unknown as { kind: string; x?: number; x0?: number; x1?: number; id?: number }[]) {
      const x = o.x ?? o.x0 ?? NaN;
      console.log(`  ${(o.kind ?? '?').padEnd(14)} x=${Number.isFinite(x) ? x.toFixed(1) : JSON.stringify(o).slice(0, 80)} reached ${Number.isFinite(x) ? reach(x) : '-'}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
