/**
 * G11 (Rider on Glass G5): the numbers that only a device — or the WebKit hero gate — can produce, as ship-gate rows.
 *
 *  device.*  read the newest `docs/device/<date>-<sha>.md` (a `?bench=1` report the user pasted, filed verbatim by
 *            the parent). The markdown table carries fps / worst ms per scenario × tier × cap; the trailing JSON line
 *            carries the build, the UA and the thermal proxy. Informational until `device.minReports` reports exist
 *            (three phones' worth of evidence before a number can fail the ship), then real thresholds.
 *  hero.*    read the newest `harness/out/hero-webkit/hero-webkit-*.json` (`pnpm harness:hero-webkit`, ANGLE-on-Metal
 *            WebKit over the phone's bench flow). The rider-drift row is a real check whenever a run exists: the arms
 *            bug (`2b48370`) was 2 600 mm of shoulder drift that no SwiftShader gate could see; 5 mm is the line.
 *
 * Every threshold lives in gate/thresholds.json (`device.*`, `hero.*`). Nothing here launches a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, HARNESS_DIR } from '../lib/paths';
import type { GateCheck } from '../lib/schema';

export interface DeviceScenarioRow {
  scenario: string;
  tier: string;
  cap: number | null;
  fps: number | null;
  dropped: number | null;
  worstMs: number | null;
}

export interface DeviceReportSummary {
  file: string;
  build: string | null;
  at: string | null;
  ua: string | null;
  rows: DeviceScenarioRow[];
  thermal: { scenario: string; fpsFirst5: number; fpsLast5: number; dropPct: number } | null;
}

export interface HeroWebkitSummary {
  file: string;
  at: string | null;
  track: string | null;
  /** Worst over the WebKit results (harness + app modes, both tiers). */
  driftMaxMm: number | null;
  worstReachCm: number | null;
  worstOverhangPx: number | null;
  results: number;
}

export interface GateDeviceRows {
  reports: number;
  minReports: number;
  armed: boolean;
  latest: DeviceReportSummary | null;
  hero: HeroWebkitSummary | null;
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const m = s.replace(/\*/g, '').replace(/\s/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** Parse one filed device report: the scenario table + the trailing `{"kind":"trials-bench",...}` line. */
export function parseDeviceReport(file: string): DeviceReportSummary {
  const text = fs.readFileSync(file, 'utf8');
  const rows: DeviceScenarioRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || /^-+$/.test(cells[0]!) || /^scenario$/i.test(cells[0]!)) continue;
    const scenario = cells[0]!.replace(/\*/g, '').trim();
    const tier = cells[1]!.replace(/\*/g, '').trim();
    rows.push({ scenario, tier, cap: num(cells[2]), fps: num(cells[3]), dropped: num(cells[4]), worstMs: num(cells[5]) });
  }
  let build: string | null = null;
  let at: string | null = null;
  let ua: string | null = null;
  let thermal: DeviceReportSummary['thermal'] = null;
  const json = text.split('\n').find((l) => l.startsWith('{"kind":"trials-bench"'));
  if (json) {
    try {
      const j = JSON.parse(json) as { build?: string; at?: string; device?: { ua?: string }; thermal?: DeviceReportSummary['thermal'] };
      build = j.build ?? null;
      at = j.at ?? null;
      ua = j.device?.ua ?? null;
      thermal = j.thermal ?? null;
    } catch {
      /* a hand-edited report: the table still counts */
    }
  }
  return { file: path.relative(REPO_ROOT, file), build, at, ua, rows, thermal };
}

export function deviceReports(dir = path.join(REPO_ROOT, 'docs', 'device')): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-[0-9a-f]{7}\.md$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

export function latestHeroWebkit(dir = path.join(HARNESS_DIR, 'out', 'hero-webkit')): HeroWebkitSummary | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /^hero-webkit-.*\.json$/.test(f)).sort();
  const last = files[files.length - 1];
  if (!last) return null;
  const file = path.join(dir, last);
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      track?: string;
      results?: { engine: string; driftMaxMm?: number; worstReachCm?: number; worstOverhangPx?: number }[];
    };
    const webkit = (j.results ?? []).filter((r) => r.engine === 'webkit');
    const max = (k: 'driftMaxMm' | 'worstReachCm' | 'worstOverhangPx'): number | null => {
      const vals = webkit.map((r) => r[k]).filter((v): v is number => typeof v === 'number');
      return vals.length ? Math.max(...vals) : null;
    };
    const stamp = last.match(/hero-webkit-(.+)\.json$/)?.[1] ?? null;
    return {
      file: path.relative(REPO_ROOT, file),
      at: stamp ? stamp.replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3Z') : null,
      track: j.track ?? null,
      driftMaxMm: max('driftMaxMm'),
      worstReachCm: max('worstReachCm'),
      worstOverhangPx: max('worstOverhangPx'),
      results: webkit.length,
    };
  } catch {
    return null;
  }
}

/** The b1 ride row at the given tier and cap (the report's "what the phone can actually do" line). */
export function rideRow(r: DeviceReportSummary, tier: string, cap: number): DeviceScenarioRow | null {
  return r.rows.find((x) => /^b1 ride$/i.test(x.scenario) && x.tier.toLowerCase() === tier && x.cap === cap) ?? null;
}

/**
 * The G11 rows. `t(key)` resolves a threshold (gate/thresholds.json); `headSha7` is stamped into the note so a
 * report from an older build is visibly stale (the numbers still count — a phone is a phone — but the note says which sha).
 */
export function deviceChecks(t: (key: string) => number, headSha7: string | null): { checks: GateCheck[]; device: GateDeviceRows } {
  const checks: GateCheck[] = [];
  const files = deviceReports();
  const minReports = t('device.minReports') || 3;
  const latest = files.length ? parseDeviceReport(files[files.length - 1]!) : null;
  const armed = files.length >= minReports;
  const stale = latest?.build && headSha7 && !latest.build.startsWith(headSha7) ? ` (report build ${latest.build.split(' ')[0]}, HEAD ${headSha7})` : '';

  const low60 = latest ? rideRow(latest, 'low', 60) : null;
  const fpsMin = t('device.fpsLow60Min') || 55;
  checks.push({
    id: 'device.fpsLow60',
    value: low60?.fps ?? null,
    limit: fpsMin,
    pass: armed && low60?.fps != null ? low60.fps >= fpsMin : true,
    note: latest
      ? `b1 ride · low · cap 60 on the user's phone: ${low60?.fps ?? '-'} fps, ${low60?.dropped ?? '-'} dropped / 20 s, worst ${low60?.worstMs ?? '-'} ms (${latest.file}${stale}); ${armed ? 'armed' : `informational until ${minReports} reports exist (${files.length} filed)`}`
      : 'no docs/device report filed yet (docs/device/README.md)',
  });

  const thermalMax = t('device.thermalDropPctMax') || 10;
  checks.push({
    id: 'device.thermalDropPct',
    value: latest?.thermal?.dropPct ?? null,
    limit: thermalMax,
    pass: armed && latest?.thermal ? latest.thermal.dropPct <= thermalMax : true,
    note: latest?.thermal
      ? `${latest.thermal.scenario}: ${latest.thermal.fpsFirst5} -> ${latest.thermal.fpsLast5} fps over 20 s (${latest.thermal.dropPct} % fall-off); ${armed ? 'armed' : 'informational'}`
      : 'no thermal proxy in the latest report',
  });

  const high = latest ? (rideRow(latest, 'high', 30) ?? rideRow(latest, 'high', 60)) : null;
  checks.push({
    id: 'device.worstMsHigh',
    value: high?.worstMs ?? null,
    limit: t('device.worstMsHighMax') || 50,
    pass: true,
    note: high
      ? `b1 ride · high · cap ${high.cap}: ${high.fps} fps, worst ${high.worstMs} ms — informational (the governor steps down from high on a phone; the perf plan's target is phone-high at 60)`
      : 'no high-tier row in the latest report',
  });

  const hero = latestHeroWebkit();
  const driftMax = t('hero.driftMaxMm') || 5;
  checks.push({
    id: 'hero.webkit.driftMaxMm',
    value: hero?.driftMaxMm ?? null,
    limit: driftMax,
    pass: hero?.driftMaxMm != null ? hero.driftMaxMm <= driftMax : true,
    note: hero
      ? `rider bone-position drift over the bench flow in WebKit (ANGLE-on-Metal), worst of ${hero.results} runs at ${hero.at}: ${hero.driftMaxMm} mm (the arms bug 2b48370 read 2 600 mm); reach ${hero.worstReachCm ?? '-'} cm, overhang ${hero.worstOverhangPx ?? '-'} px (${hero.file})`
      : 'no harness/out/hero-webkit run yet — pnpm harness:hero-webkit (informational)',
  });

  return { checks, device: { reports: files.length, minReports, armed, latest, hero } };
}
