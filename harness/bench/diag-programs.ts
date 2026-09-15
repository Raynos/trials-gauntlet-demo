/**
 * Program churn diagnostic: `pnpm exec tsx harness/bench/diag-programs.ts [--track b1] [--tiers high,low]`
 *
 * three r186's `setProgram` re-acquires a material's program (getParameters + getProgramCacheKey +
 * uniform re-bind, ~100 µs and ~2 KB each) whenever the material's recorded state disagrees with
 * the object drawing it — the same material on an InstancedMesh and a Mesh, on a SkinnedMesh and a
 * Mesh, with and without an envMap, or when `material.needsUpdate` / the lights hash / the output
 * colour space flips. Steady state should re-acquire nothing. This wraps `renderBufferDirect`,
 * watches `properties.get(material).currentProgram` change between consecutive draws of the same
 * material within one frame, and names the offenders with the object kinds that share them.
 */
import { DEFAULT_PHYSICS_HZ, type QualityTier } from '../../src/core/types';
import { expandFrames } from '../../src/core/replay';
import { flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { chooseGolden } from '../lib/golden';
import { HookClient, openGame } from '../lib/hook';
import { loadRecording } from '../lib/recording';
import { startServer } from '../lib/server';
import { TRACKS } from './bench';

const SRC = `(function (inputs, tpf, frames) {
  var t = window.__trials; var R = window.__render; var gl = R.renderer;
  var props = gl.properties;
  var rbd = gl.__diagOrig || gl.renderBufferDirect.bind(gl);
  gl.__diagOrig = rbd;
  var byMat = new Map();
  var frameSwitches = 0, frameDraws = 0;
  var versions = new Map();
  var lightsVersions = new Map();
  gl.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    var p = props.get(material);
    var before = p.currentProgram;
    var vBefore = material.version;
    rbd(camera, scene, geometry, material, object, group);
    var vAfter = material.version;
    var after = props.get(material).currentProgram;
    frameDraws++;
    var kind = object.isInstancedMesh ? 'instanced' : object.isSkinnedMesh ? 'skinned' : object.isPoints ? 'points' : object.isLine ? 'line' : 'mesh';
    var e = byMat.get(material);
    if (!e) { e = { name: material.name || material.type, type: material.type, kinds: {}, objects: {}, switches: 0, draws: 0, sameFrameSwitch: 0, lastFrameId: -1, lastProgram: null, envMaps: {}, versionBumps: 0 }; byMat.set(material, e); }
    e.kinds[kind] = (e.kinds[kind] || 0) + 1;
    e.objects[object.name || '(unnamed)'] = (e.objects[object.name || '(unnamed)'] || 0) + 1;
    e.draws++;
    e.envMaps[String(!!(material.envMap || (scene && scene.environment)))] = 1;
    if (before && after && before !== after) { e.switches++; frameSwitches++; if (e.lastFrameId === R.frameCount) e.sameFrameSwitch++; }
    e.lastFrameId = R.frameCount;
    var v = versions.get(material); if (v !== undefined && v !== vBefore) e.versionBumps++; if (vAfter !== vBefore) e.bumpInside = (e.bumpInside || 0) + 1; versions.set(material, vAfter);
    e.flags = 'transparent=' + material.transparent + ' opacity=' + material.opacity.toFixed(2) + ' blending=' + material.blending + ' side=' + material.side + ' fog=' + material.fog + ' hooks=' + (material.onBeforeCompile !== material.constructor.prototype.onBeforeCompile) + ' ckey=' + (typeof material.customProgramCacheKey === 'function' ? String(material.customProgramCacheKey()).slice(0, 40) : '-');
    var lv = lightsVersions.get(material); var cur = props.get(material).lightsStateVersion; if (lv !== undefined && lv !== cur) e.lightsBumps = (e.lightsBumps || 0) + 1; lightsVersions.set(material, cur);
  };
  var perFrame = [];
  for (var i = 0; i < frames; i++) {
    for (var j = i * tpf; j < Math.min(inputs.length, (i + 1) * tpf); j++) { t.setInput(inputs[j]); t.step(1); }
    frameSwitches = 0; frameDraws = 0;
    t.render(false);
    perFrame.push([frameDraws, frameSwitches]);
    if (i % 30 === 29) R.finish();
  }
  gl.renderBufferDirect = rbd; gl.__diagOrig = null;
  var out = [];
  byMat.forEach(function (e) { if (e.switches > 0 || e.versionBumps > 0 || (e.lightsBumps || 0) > 0) out.push(e); });
  out.sort(function (a, b) { return (b.switches + b.versionBumps) - (a.switches + a.versionBumps); });
  var totalSwitches = 0; perFrame.forEach(function (f) { totalSwitches += f[1]; });
  return { materials: byMat.size, offenders: out, drawsPerFrame: perFrame[perFrame.length - 1][0], switchesPerFrame: totalSwitches / frames, frames: frames };
})`;

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const track = flagStr(flags, 'track', 'b1');
  const trackId = TRACKS[track] ?? track;
  const tiers = flagStr(flags, 'tiers', 'high,low').split(',') as QualityTier[];
  const tpf = DEFAULT_PHYSICS_HZ / 60;
  const golden = chooseGolden(trackId)!;
  const inputs = expandFrames(loadRecording(golden.file)).slice(0, 120 * tpf);
  const server = await startServer({ dev: true });
  const launched = await launchBrowser({ width: 932, height: 430 });
  try {
    const { page } = launched;
    await openGame(page, server.url);
    const hook = new HookClient(page);
    for (const tier of tiers) {
      await hook.loadTrack(trackId);
      await page.evaluate(([q]) => { window.__trials!.setQuality(q as QualityTier); (window as unknown as { __render: { resize(w: number, h: number, d: number): void } }).__render.resize(233, 108, 3); }, [tier] as const);
      for (let i = 0; i < 20; i++) await hook.render();
      const r = (await page.evaluate(`(${SRC})(${JSON.stringify(inputs)}, ${tpf}, 120)`)) as { materials: number; offenders: { name: string; type: string; kinds: Record<string, number>; objects: Record<string, number>; switches: number; draws: number; versionBumps: number; lightsBumps?: number; bumpInside?: number; flags?: string }[]; drawsPerFrame: number; switchesPerFrame: number };
      console.log(`== ${tier} ${trackId}: ${r.materials} materials, ${r.drawsPerFrame} draws/frame, ${r.switchesPerFrame.toFixed(1)} program re-acquisitions/frame`);
      for (const o of r.offenders.slice(0, 25)) {
        const objs = Object.entries(o.objects).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => `${n}×${(c / 120).toFixed(0)}`).join(', ');
        console.log(`  ${o.name.padEnd(28)} ${o.type.padEnd(22)} switches/frame ${(o.switches / 120).toFixed(1).padStart(5)}  versionBumps ${o.versionBumps} (inside draw ${o.bumpInside ?? 0})  lightsBumps ${o.lightsBumps ?? 0}  ${o.flags ?? ''}  kinds ${JSON.stringify(o.kinds)}  objects ${objs}`);
      }
    }
  } finally {
    await launched.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
