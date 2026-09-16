/**
 * Bench ledger + `latest.md`.
 *
 * `ledger.jsonl` holds one summary row per run (all shas, appended, tracked in git); `latest.md`
 * is rebuilt from the newest run of every key at the current sha, with the delta against the same
 * key's newest row from the previous sha that has it. With `--repeat N` the spread column proves
 * repeatability: max |x_i − median| / median over the repeats, per metric, worst key.
 */
import fs from 'node:fs';
import { PHONE, MS_PER_WMB, MS_PER_KTRI, MS_PER_DRAW_GPU } from './model';

export interface LedgerRow {
  sha: string;
  dirty: boolean;
  label: string;
  at: string;
  repeat: number;
  /** `<tier>-<track>-<geom>` or `idle-<screen>-<tier>-<geom>`. */
  key: string;
  tier: string;
  track: string;
  geom: string;
  frames: number;
  loadavg: number;
  /** ThreeRenderer.render CPU ms. */
  submitP50: number;
  submitP95: number;
  /** Hook render(false) total (Game.render: HUD + audio + renderer). */
  totalP50: number;
  gameP50: number;
  buildP50: number;
  rigP50: number;
  heroP50: number;
  shadowP50: number;
  drawsP50: number;
  traverseP50: number;
  postP50: number;
  otherP50: number;
  physicsP50: number;
  /** SwiftShader raster ms for one isolated frame at the full geometry (proxy, not phone ms). */
  rasterP50: number;
  rasterP95: number;
  calls: number;
  tris: number;
  programs: number;
  texMB: number;
  rtMpx: number;
  rtMB: number;
  heroTris: number;
  shadowMap: number;
  canvas: string;
  heapMB: number;
  blocked: number;
  weightedMB: number;
  modelGpuMs: number;
  phoneMs: number;
  finalHash: string;
  /** Idle scenarios only: the live RAF loop's rendered-callback ms (what the phone's RAF sees, CPU side) and the app-shell parts. */
  rafP50?: number;
  rafP95?: number;
  rafMax?: number;
  appFrameP50?: number;
  hudP50?: number;
  meshes?: number;
}

export function appendLedger(file: string, row: LedgerRow): void {
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
}

export function readLedger(file: string): LedgerRow[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length)
    .map((l) => JSON.parse(l) as LedgerRow);
}

/** Newest row per key from the newest *other* sha that has that key (the comparison base). */
export function previousRows(ledger: LedgerRow[], current: string): Map<string, LedgerRow> {
  const out = new Map<string, LedgerRow>();
  const others = ledger.filter((r) => (r.label || r.sha) !== current);
  for (const r of others) {
    const cur = out.get(r.key);
    if (!cur || r.at > cur.at) out.set(r.key, r);
  }
  return out;
}

const f1 = (n: number): string => n.toFixed(1);
const f2 = (n: number): string => n.toFixed(2);
const k = (n: number): string => `${(n / 1000).toFixed(0)}k`;

function delta(cur: number, prev: number | undefined, digits = 2, invert = false): string {
  if (prev === undefined || !Number.isFinite(prev)) return '';
  const d = cur - prev;
  if (Math.abs(d) < 0.5 * 10 ** -digits) return ' (=)';
  const pct = prev !== 0 ? ` ${d > 0 ? '+' : ''}${((d / prev) * 100).toFixed(0)}%` : '';
  const good = invert ? d > 0 : d < 0;
  return ` (${d > 0 ? '+' : ''}${d.toFixed(digits)}${pct}${good ? ' ↓' : ' ↑'})`;
}

export interface LatestMeta {
  wallMin: number;
  full: boolean;
  frames: number;
  gpuSamples: number;
}

function spreadTable(repeats: LedgerRow[][]): string {
  const metrics: (keyof LedgerRow)[] = ['submitP50', 'submitP95', 'totalP50', 'drawsP50', 'traverseP50', 'rasterP50', 'phoneMs', 'heapMB'];
  const lines = ['| metric | worst key | median | max spread |', '|---|---|---|---|'];
  const keys = new Set(repeats.flat().map((r) => r.key));
  for (const m of metrics) {
    let worst = { key: '', med: 0, spread: 0 };
    for (const key of keys) {
      const vals = repeats.map((rs) => rs.find((r) => r.key === key)?.[m] as number | undefined).filter((v): v is number => typeof v === 'number');
      if (vals.length < 2) continue;
      const s = [...vals].sort((a, b) => a - b);
      const med = s[s.length >> 1]!;
      const sp = med !== 0 ? Math.max(...vals.map((v) => Math.abs(v - med))) / Math.abs(med) : 0;
      if (sp > worst.spread) worst = { key, med, spread: sp };
    }
    lines.push(`| ${m} | ${worst.key} | ${worst.med.toFixed(2)} | ${(worst.spread * 100).toFixed(1)} % |`);
  }
  return lines.join('\n');
}

export function writeLatest(file: string, rows: LedgerRow[], ledger: LedgerRow[], repeats: LedgerRow[][] | null, meta: LatestMeta): string {
  const sha = rows[0]?.sha ?? '?';
  const current = rows[0]?.label || sha;
  const prev = previousRows(ledger, current);
  const prevSha = [...prev.values()].map((r) => r.label || r.sha)[0];
  const out: string[] = [];
  const shas = [...new Set(rows.map((r) => r.sha))].join(', ');
  out.push(`# Bench — ${rows[0]?.label ? `${rows[0].label} — ` : ''}${shas}${rows[0]?.dirty ? ' (dirty tree)' : ''}`);
  out.push('');
  out.push(
    `${rows[0]?.at.slice(0, 16).replace('T', ' ') ?? ''} UTC · ${meta.frames} frames/run (60 fps, 2 ticks/frame) · GPU proxy ${meta.gpuSamples} isolated synced frames at the full canvas · CPU pass at ${meta.full ? 'the full canvas' : 'a ¼-size canvas (CPU submit is pixel-independent)'} · ${meta.wallMin.toFixed(1)} min wall · loadavg per row · deltas vs ${prevSha ? `\`${prevSha}\`` : 'nothing (first ledger entry)'}. **SwiftShader raster ms are a proxy, not phone ms.** Phone ms = model (\`harness/bench/model.ts\`, recalibrated from device report #1: ${PHONE.A}·effMpx + ${PHONE.B}·calls + ${PHONE.C}·ktris + ${PHONE.E}; ±${PHONE.confidence * 100} %). Phone geometry = 874×330 @ 3 with the phone device class since 2026-09-15 (was 932×430).`,
  );
  out.push('');
  const idle = rows.filter((r) => r.key.startsWith('idle-'));
  const matrix = rows.filter((r) => !r.key.startsWith('idle-'));
  if (idle.length) {
    out.push('## Idle screens (phone geometry) — the fixed per-frame cost');
    out.push('');
    out.push('The garage / menu frame moves nothing; whatever it costs is paid by every riding frame too. `raf` = the live RAF loop\'s rendered callbacks (CPU, everything the app does per frame); `render` = ThreeRenderer.render; `game` = Game.render minus the renderer (HUD DOM, audio, getState); `app` = input poll + flow (`app.frame()`).');
    out.push('');
    out.push('| screen · tier | raf p50 / p95 / max | render p50 | draws | traverse | shadow | hero | post | other | game | app | hud | raster p50 | calls | tris | meshes | rt Mpx | canvas | model phone ms | heap/600 | load |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of idle) {
      const p = prev.get(r.key);
      out.push(
        `| ${r.track} · ${r.tier} | ${f2(r.rafP50 ?? 0)} / ${f2(r.rafP95 ?? 0)} / ${f1(r.rafMax ?? 0)}${delta(r.rafP50 ?? 0, p?.rafP50)} | ${f2(r.submitP50)}${delta(r.submitP50, p?.submitP50)} | ${f2(r.drawsP50)} | ${f2(r.traverseP50)} | ${f2(r.shadowP50)} | ${f2(r.heroP50)} | ${f2(r.postP50)} | ${f2(r.otherP50)} | ${f2(r.gameP50)} | ${f2(r.appFrameP50 ?? 0)} | ${f2(r.hudP50 ?? 0)} | ${f1(r.rasterP50)}${delta(r.rasterP50, p?.rasterP50, 0)} | ${r.calls}${delta(r.calls, p?.calls, 0)} | ${k(r.tris)} | ${r.meshes ?? ''} | ${r.rtMpx} | ${r.canvas} | ${f1(r.phoneMs)}${delta(r.phoneMs, p?.phoneMs, 1)} | ${r.heapMB >= 0 ? '+' : ''}${f2(r.heapMB)} | ${r.loadavg} |`,
      );
    }
    out.push('');
  }
  for (const geom of [...new Set(matrix.map((r) => r.geom))]) {
    const g = matrix.filter((r) => r.geom === geom);
    out.push(`## ${geom} — ${g[0]?.canvas ? '' : ''}riding, golden replay from tick 0`);
    out.push('');
    out.push('| tier · track | submit p50 / p95 | draws | traverse | shadow | hero | post | game | physics | raster p50 / p95 | calls | tris | prog | tex MB | rt Mpx / MB | hero tris | shadow | canvas | wMB | model gpu | model phone ms | heap | blk | load |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of g) {
      const p = prev.get(r.key);
      out.push(
        `| ${r.tier} · ${r.track} | ${f2(r.submitP50)}${delta(r.submitP50, p?.submitP50)} / ${f2(r.submitP95)} | ${f2(r.drawsP50)} | ${f2(r.traverseP50)} | ${f2(r.shadowP50)} | ${f2(r.heroP50)} | ${f2(r.postP50)} | ${f2(r.gameP50)} | ${f2(r.physicsP50)} | ${f1(r.rasterP50)}${delta(r.rasterP50, p?.rasterP50, 0)} / ${f1(r.rasterP95)} | ${r.calls}${delta(r.calls, p?.calls, 0)} | ${k(r.tris)}${delta(r.tris / 1000, p ? p.tris / 1000 : undefined, 0)} | ${r.programs} | ${f1(r.texMB)} | ${r.rtMpx} / ${r.rtMB}${delta(r.rtMpx, p?.rtMpx, 2)} | ${k(r.heroTris)} | ${r.shadowMap} | ${r.canvas} | ${f1(r.weightedMB)} | ${f2(r.modelGpuMs)} | ${f1(r.phoneMs)}${delta(r.phoneMs, p?.phoneMs, 1)} | ${r.heapMB >= 0 ? '+' : ''}${f2(r.heapMB)} | ${r.blocked} | ${r.loadavg} |`,
      );
    }
    out.push('');
    // Tier means for the plan's budget table.
    out.push(`Per-tier means (${geom}): ` + ['high', 'medium', 'low'].map((t) => {
      const rs = g.filter((r) => r.tier === t);
      if (!rs.length) return '';
      const mean = (f: (r: LedgerRow) => number): number => rs.reduce((a, r) => a + f(r), 0) / rs.length;
      return `**${t}** submit ${f2(mean((r) => r.submitP50))} ms · raster ${f1(mean((r) => r.rasterP50))} ms · ${mean((r) => r.calls).toFixed(0)} calls · ${k(mean((r) => r.tris))} tris · ${f2(mean((r) => r.rtMpx))} Mpx · model phone ${f1(mean((r) => r.phoneMs))} ms`;
    }).filter(Boolean).join(' · '));
    out.push('');
  }
  if (repeats && repeats.length > 1) {
    out.push(`## Repeatability — ${repeats.length} runs of the matrix in one process`);
    out.push('');
    out.push(spreadTable(repeats));
    out.push('');
  }
  out.push('## Columns');
  out.push('');
  out.push('- **submit** ThreeRenderer.render CPU ms (`window.__render.render`, wrapped); **draws** = `renderBufferDirect` outside the shadow pass (material + uniform setup + the GL call); **traverse** = scene-pass `renderer.render` − shadow − draws (projectObject, cull, sort, lights); **shadow** = `WebGLShadowMap.render` CPU; **hero** = bike + rider `update`; **post** = the composer\'s quad passes (CPU); **game** = hook total − render (Game.render: HUD DOM, audio, getState); **physics** = 2 ticks.');
  out.push(`- **raster** SwiftShader ms for one isolated frame (queue drained → render → 1×1 readPixels, minus the submit) at the full canvas. Monotone in fragment + vertex work; ≈ 100× a phone GPU and ~3× a pipelined SwiftShader frame.`);
  out.push(`- **wMB / model gpu** the GPU work model: Σ pass px × bytes × weight (scene 2.5, composite 1.6, ao 1.5, bloom 1–1.2, shadow 0.5) → ms = ${MS_PER_WMB}·wMB + ${MS_PER_KTRI}·ktris + ${MS_PER_DRAW_GPU}·calls.`);
  out.push('- **heap** JS heap delta over the CPU pass with a forced GC before and after (the hook path: game + renderer). **blk** frames over 20 ms in the CPU pass (GL ring back-pressure, not JS).');
  out.push('- **calls / tris** are the GPU pass\' median frame (all passes, shadow included); **rt Mpx / MB** every render-target write per frame incl. the shadow map.');
  const md = out.join('\n') + '\n';
  fs.writeFileSync(file, md);
  return md;
}
