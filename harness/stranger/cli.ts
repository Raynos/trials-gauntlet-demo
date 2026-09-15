/**
 * Stranger CLI: one shot per call, state on disk, node-side physics only.
 *
 *   tsx harness/stranger/cli.ts <cmd> [args] [--track <id>] [--session <id>] [--agent <name>]
 *
 *   start [--track flat-test] [--seed N]   create a session, print its id + `look`
 *   look                                    track card (name, technique, beginner hints, checkpoint xs) + numbers + ASCII side-view
 *   status                                  numbers only
 *   play "<slots>"                          e.g. "g8 gb4 c2"  (max 40 slots of 1/8 s); prints the side-view afterwards.
 *                                           A crash ends the call: the game's 1.0 s auto-respawn (rules.ts) is played out in-call.
 *   restart                                 give up a live attempt: back to the last checkpoint (an attempt)
 *   reset                                   back to the start line (an attempt)
 *   done                                    finalize session.json + metrics
 *   report <trackId> [<trackId>...] [--tracks a,b] [--stale]
 *                                           (parent) aggregate all sessions -> out/metrics/<track>.stranger.{json,md};
 *                                           several tracks print one summary table at the end
 *   prep --tracks a,b [--agents s1,s2] [--round r3]
 *                                           (parent) create agents x tracks fresh sessions and write
 *                                           out/stranger/rounds/<round>/{manifest.json,spawn.md}: one paste-ready
 *                                           stranger prompt per session (PROTOCOL block + track + session id)
 *
 * Exit codes: 0 ok, 1 error ({error} JSON), 2 budget exhausted ({budget:'exhausted'}).
 * See PROTOCOL.md (what the stranger is told) and docs/design/harness-metrics.md §3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BIKE, type BikeClass, type GameEvent, type InputFrame, type PhysicsState } from '../../src/core/types';
import { parseBike } from '../lib/sim';
import { encodeJSON } from '../../src/core/replay';
import { ACTIONS, COAST, RESTART_FRAME, formatActions, macroFrameAt, macroTicks, parseSlots, type MacroCtx } from '../bot/actions';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { attemptsFromEvents, countedFaults, faultsByCheckpoint, runMeta, srcFingerprint } from '../lib/metrics';
import { REPO_ROOT } from '../lib/paths';
import { writeJson } from '../lib/report';
import type { BestAttempt, StrangerSession } from '../lib/schema';
import { report as strangerReport } from './report';
import {
  STRANGER_OUT,
  appendLog,
  beginAttempt,
  budgetLeft,
  createSession,
  endAttempt,
  loadSession,
  resolveSessionDir,
  round,
  saveSession,
  stampId,
  wallMs,
  type LoadedSession,
  type PersistedEvent,
  type PersistedState,
} from './session';
import { asciiView } from './view';

const MAX_SLOTS = 40;

// ---------------------------------------------------------------------------
// Player-visible numbers
// ---------------------------------------------------------------------------

interface Numbers {
  x: number;
  y: number;
  vx: number;
  angle_deg: number;
  grounded: boolean;
  checkpoint: number;
  checkpointCount: number;
  faults: number;
  attempt: number;
  runTime: number;
  finishX: number;
  distanceToFinish: number;
  cleared: boolean;
  finishTime: number | null;
  /** After the line: the game owns the input and the bike coasts/brakes to a stop on the run-out. */
  runOut?: { x: number; stopped: boolean; frozen: boolean };
  budget: { callsLeft: number; secondsLeft: number };
}

function numbers(s: LoadedSession): Numbers {
  const st = s.sim.state();
  const faults = countedFaults(s.state.events).length;
  const b = budgetLeft(s);
  return {
    x: round(st.bike.pos.x, 2),
    y: round(st.bike.pos.y, 2),
    vx: round(st.bike.vel.x, 2),
    angle_deg: round((st.bike.angle * 180) / Math.PI, 1),
    grounded: st.wheels.rear.grounded || st.wheels.front.grounded,
    checkpoint: st.checkpoint,
    checkpointCount: s.sim.track.checkpoints.length,
    faults,
    attempt: 1 + faults,
    // The run clock freezes at the line (Game.runTime): the coast ticks after it do not count.
    runTime: s.state.cleared && s.state.finishTime !== null ? s.state.finishTime : round(s.state.runTicks / s.state.physicsHz, 3),
    finishX: s.sim.track.finishX,
    distanceToFinish: round(s.sim.track.finishX - st.bike.pos.x, 2),
    cleared: s.state.cleared,
    finishTime: s.state.finishTime,
    ...(s.state.cleared ? { runOut: { x: round(st.bike.pos.x, 2), stopped: isStopped(st), frozen: s.sim.rules.finishFrozen() } } : {}),
    budget: { callsLeft: b.callsLeft, secondsLeft: b.secondsLeft },
  };
}

function isStopped(st: PhysicsState): boolean {
  return Math.abs(st.bike.vel.x) < 0.05 && Math.abs(st.bike.vel.y) < 0.05 && (st.wheels.rear.grounded || st.wheels.front.grounded);
}

/** Longest the finish coast is played out per call (the bike normally stops well inside it). */
const FINISH_COAST_MAX_S = 4;

/**
 * Mirror of what the player watches after the line: the game feeds throttle 0 / lean 0 and a
 * 0 → 0.6 brake ramp (`Game.stepFinishCoast`, via `lib/rules.ts`), the bike rolls out and stops
 * on the run-out; a post-line fault is undone and the world freezes. The frames recorded here
 * are ignored by the finished game, so the replay hashes the same in the browser whatever they
 * hold; COAST keeps the recording honest about what the player did (let go).
 */
function finishCoast(s: LoadedSession): { seconds: number; stoppedAt: number; stopped: boolean; frozen: boolean } {
  const max = Math.round(FINISH_COAST_MAX_S * s.state.physicsHz);
  let n = 0;
  while (n < max && s.sim.phase() === 'finished' && !s.sim.rules.finishFrozen() && !isStopped(s.sim.state())) {
    tick(s, COAST);
    n++;
  }
  const st = s.sim.state();
  return { seconds: round(n / s.state.physicsHz, 2), stoppedAt: round(st.bike.pos.x, 2), stopped: isStopped(st), frozen: s.sim.rules.finishFrozen() };
}

/** The side-view; once the run is over the finish line stays in frame beside the stopped bike. */
function view(s: LoadedSession): string {
  return asciiView(s.sim.compiled, s.sim.state(), undefined, undefined, s.state.cleared ? s.sim.track.finishX : undefined);
}

/**
 * What the game shows on screen before/while riding, and nothing else: the HUD's
 * tier + name, the menu's technique one-liner, the beginner hint strip (the HUD shows
 * `meta.hints` for beginner tracks only), the progress strip's checkpoint marks and the
 * finish. No geometry, no bands, no `demands` (a player never sees those).
 */
function trackCard(s: LoadedSession): string {
  const t = s.sim.track;
  const lines = [`track ${t.id} (${t.tier}) "${t.name}"${t.meta?.technique ? ` — technique: ${t.meta.technique}` : ''}`];
  // The bike picker is on the menu: the player knows which class they took to the line.
  lines.push(`bike: ${s.sim.bike === 'pro' ? 'Pro (no wheelie ECU — the loop is yours at every lean; 22 m/s top)' : 'Rookie (wheelie ECU; 20 m/s top)'}`);
  const hints = t.tier === 'beginner' && t.meta?.hints?.length ? t.meta.hints : null;
  if (hints) lines.push(`hints: ${hints.join(' · ')}`);
  lines.push(`checkpoints at x = ${t.checkpoints.map((c) => c.x).join(', ')} m; finish at x = ${t.finishX} m`);
  return lines.join('\n');
}

/** The screen: numbers + side-view. Printed by look/start and after every play. */
function screen(s: LoadedSession): string {
  return `${JSON.stringify(numbers(s))}\n${view(s)}`;
}

function brief(st: PhysicsState): { x: number; vx: number; angle_deg: number } {
  return { x: round(st.bike.pos.x, 2), vx: round(st.bike.vel.x, 2), angle_deg: round((st.bike.angle * 180) / Math.PI, 1) };
}

// ---------------------------------------------------------------------------
// Stepping (everything the sim sees goes through the recorder)
// ---------------------------------------------------------------------------

type CompactEvent = { t: number; type: string; reason?: string; index?: number; checkpoint?: number };

function compact(e: PersistedEvent): CompactEvent {
  const t = round(e.runTick / 120, 3);
  const ev = e.event;
  if (ev.type === 'fault') return { t, type: 'fault', reason: ev.reason };
  if (ev.type === 'checkpoint') return { t, type: 'checkpoint', index: ev.index };
  if (ev.type === 'restart') return { t, type: 'respawn', checkpoint: ev.checkpoint };
  return { t, type: ev.type };
}

/** One recorded tick. Returns the persisted (non-land) events it produced. */
function tick(s: LoadedSession, frame: InputFrame): PersistedEvent[] {
  s.recorder.push(frame);
  const evs = s.sim.step(frame);
  s.state.runTicks++;
  const out: PersistedEvent[] = [];
  const cpNow = evs.length ? s.sim.state().checkpoint : -1;
  for (const event of evs) {
    if (event.type === 'land') continue;
    const pe: PersistedEvent = { event: event as Exclude<GameEvent, { type: 'land' }>, runTick: s.state.runTicks, checkpoint: cpNow };
    s.state.events.push(pe);
    out.push(pe);
    if (event.type === 'checkpoint' && s.state.firstCheckpointCalls === null) s.state.firstCheckpointCalls = s.state.calls;
    if (event.type === 'finish' && !s.state.cleared) {
      s.state.cleared = true;
      // The game's run clock (reset by a full restart, frozen at the line) — what the results panel shows.
      s.state.finishTime = round(s.sim.runTime(), 4);
    }
  }
  return out;
}

/**
 * If the sim is not riding at the expected checkpoint after a respawn, reset the
 * world directly and flag it: the recording cannot express that (never seen on the
 * real physics; kept as the safety net the metrics audit via `forcedResets`).
 */
function ensureRiding(s: LoadedSession, checkpoint: number): boolean {
  const st = s.sim.state();
  if (s.sim.phase() === 'riding' && st.checkpoint === checkpoint) return false;
  s.sim.world.reset(checkpoint);
  s.sim.world.drainEvents();
  s.state.forcedResets++;
  return true;
}

/**
 * The restart tap a player does to give up an attempt: restart held one tick (the
 * edge is the fault + checkpoint respawn), then a coast tick. Both recorded, so a
 * replay respawns at the same tick.
 */
function respawn(s: LoadedSession, checkpoint: number): { events: PersistedEvent[]; forcedReset: boolean } {
  const events = [...tick(s, RESTART_FRAME), ...tick(s, COAST)];
  return { events, forcedReset: ensureRiding(s, checkpoint) };
}

/**
 * What happens after a crash when the player does nothing: the bike tumbles and the
 * game respawns it at the checkpoint after `T.autoRespawn` (1.0 s) of run clock
 * (`harness/lib/rules.ts`, phase 'crashed'). Coast frames only: the player has let
 * go. Recorded, so a replay respawns at the same tick.
 */
function autoRespawn(s: LoadedSession, checkpoint: number): { events: PersistedEvent[]; forcedReset: boolean; waitTicks: number } {
  const events: PersistedEvent[] = [];
  let waitTicks = 0;
  const limit = s.sim.rules.T.autoRespawn + 2;
  while (s.sim.phase() === 'crashed' && waitTicks < limit) {
    events.push(...tick(s, COAST));
    waitTicks++;
  }
  return { events, forcedReset: ensureRiding(s, checkpoint), waitTicks };
}

interface PlayResult {
  attempt: number;
  slots: string;
  slotsPlayed: number;
  slotsRequested: number;
  before: ReturnType<typeof brief>;
  after: ReturnType<typeof brief>;
  events: CompactEvent[];
  faulted?: { reason: string; at: number; respawnedAt: number; respawnAfterS: number; forcedReset?: true };
  finished?: true;
  /** Played out in-call after the line: how far the bike rolled before it stopped (or froze on a post-line fault). */
  runOut?: { seconds: number; stoppedAt: number; stopped: boolean; frozen: boolean };
  checkpoint: number;
  grounded: boolean;
  faults: number;
  runTime: number;
  distanceToFinish: number;
  budget: { callsLeft: number; secondsLeft: number };
  note?: string;
}

function play(s: LoadedSession, text: string): { result: PlayResult; trace: string[] } {
  const ids = parseSlots(text, MAX_SLOTS);
  const before = brief(s.sim.state());
  const attemptAtStart = attemptsFromEvents(s.state.events);
  const events: PersistedEvent[] = [];
  const trace: string[] = [];
  let played = 0;
  let faulted: PlayResult['faulted'] | undefined;
  let finished = false;
  let runOut: PlayResult['runOut'] | undefined;
  let note: string | undefined;

  outer: for (const id of ids) {
    const code = ACTIONS[id]!.code;
    const ctx: MacroCtx = {};
    let slotFault: PersistedEvent | null = null;
    const marks: string[] = [];
    for (let i = 0; i < macroTicks(id); i++) {
      const evs = tick(s, macroFrameAt(id, i, () => s.sim.state(), ctx));
      events.push(...evs);
      for (const e of evs) {
        if (e.event.type === 'finish') finished = true;
        if (e.event.type === 'fault' && !slotFault) slotFault = e;
        if (e.event.type === 'checkpoint') marks.push(`CHECKPOINT ${e.event.index}`);
      }
      if (finished || slotFault) break;
    }
    if (finished) marks.push('FINISH');
    if (slotFault && slotFault.event.type === 'fault') marks.push(`CRASH (${slotFault.event.reason})`);
    played++;
    const st = s.sim.state();
    const g = st.wheels.rear.grounded || st.wheels.front.grounded;
    trace.push(
      `${String(played).padStart(2, '0')} ${code.padEnd(3)} x=${st.bike.pos.x.toFixed(1).padStart(6)} vx=${st.bike.vel.x.toFixed(1).padStart(5)} ang=${((st.bike.angle * 180) / Math.PI).toFixed(0).padStart(4)} ${g ? 'ground' : 'AIR'}${marks.length ? `  <- ${marks.join(', ')}` : ''}`,
    );
    if (finished) {
      // The successful attempt is not an ended one: strangerAttempts = 1 + faults. The game
      // now owns the input: play the run-out coast so the screen (and the clip) show the stop.
      runOut = finishCoast(s);
      break outer;
    }
    if (slotFault && slotFault.event.type === 'fault') {
      const reason = slotFault.event.reason;
      const cp = st.checkpoint;
      const crashX = st.bike.pos.x;
      endAttempt(s, 'fault', st, reason);
      const r = autoRespawn(s, cp);
      beginAttempt(s);
      events.push(...r.events);
      const after = s.sim.state();
      const waitS = round(r.waitTicks / s.state.physicsHz, 2);
      faulted = { reason, at: round(crashX, 2), respawnedAt: round(after.bike.pos.x, 2), respawnAfterS: waitS };
      if (r.forcedReset) faulted.forcedReset = true;
      note = `crashed (${reason}) at x=${crashX.toFixed(1)} after slot ${played}; the game respawned you ${waitS.toFixed(1)} s later at checkpoint ${cp} (x=${after.bike.pos.x.toFixed(1)}), stationary, facing +x. Remaining ${ids.length - played} slot(s) were NOT played; your next play starts here.`;
      break outer;
    }
  }

  const after = s.sim.state();
  const b = budgetLeft(s);
  const result: PlayResult = {
    attempt: attemptAtStart,
    slots: formatActions(ids),
    slotsPlayed: played,
    slotsRequested: ids.length,
    before,
    after: brief(after),
    events: events.map(compact),
    checkpoint: after.checkpoint,
    grounded: after.wheels.rear.grounded || after.wheels.front.grounded,
    faults: countedFaults(s.state.events).length,
    runTime: round(s.state.runTicks / s.state.physicsHz, 3),
    distanceToFinish: round(s.sim.track.finishX - after.bike.pos.x, 2),
    budget: { callsLeft: b.callsLeft, secondsLeft: b.secondsLeft },
  };
  if (faulted) result.faulted = faulted;
  if (finished) {
    result.finished = true;
    if (runOut) result.runOut = runOut;
    result.runTime = s.state.finishTime ?? result.runTime;
    result.note = `FINISHED at run time ${s.state.finishTime}s${runOut ? ` (the game then ${runOut.frozen ? 'froze the bike on a post-line tumble' : runOut.stopped ? 'braked you to a stop' : 'is still braking you'} at x=${runOut.stoppedAt.toFixed(1)} m on the run-out, ${runOut.seconds.toFixed(1)} s after the line)` : ''}. Call 'done'.`;
  } else if (note) result.note = note;
  return { result, trace };
}

function restart(s: LoadedSession): Record<string, unknown> {
  const st = s.sim.state();
  const cp = st.checkpoint;
  endAttempt(s, 'restart', st);
  const r = respawn(s, cp);
  beginAttempt(s);
  const after = s.sim.state();
  const b = budgetLeft(s);
  return {
    restarted: true,
    checkpoint: cp,
    at: brief(after),
    events: r.events.map(compact),
    forcedReset: r.forcedReset,
    faults: countedFaults(s.state.events).length,
    attempt: attemptsFromEvents(s.state.events),
    runTime: round(s.state.runTicks / s.state.physicsHz, 3),
    budget: { callsLeft: b.callsLeft, secondsLeft: b.secondsLeft },
    note: `back at checkpoint ${cp} (x=${after.bike.pos.x.toFixed(1)}), stationary; that cost one attempt. A crash respawns you here by itself: restart is only for giving up a live attempt.`,
  };
}

/** Back to the start line via the game's hold-restart rule (replayable). */
function reset(s: LoadedSession): Record<string, unknown> {
  const st = s.sim.state();
  endAttempt(s, 'reset', st);
  // Hold restart for the game's full-restart hold time (0.6 s): the first tick is a
  // restart edge (checkpoint respawn, counted as the fault), the hold then triggers the
  // full restart to the start line. Fully expressed in the recording, so replays agree.
  const events: PersistedEvent[] = [];
  // Game rule: the hold cannot fire until the restart key has been released once since GO /
  // the last full restart (`holdFired` starts true). One coast tick releases it when needed.
  if (s.sim.rules.counters().holdFired) events.push(...tick(s, COAST));
  for (let i = 0; i < s.sim.rules.T.holdRestart; i++) events.push(...tick(s, RESTART_FRAME));
  events.push(...tick(s, COAST));
  beginAttempt(s);
  const r = { events, forcedReset: false };
  const after = s.sim.state();
  const b = budgetLeft(s);
  return {
    reset: true,
    at: brief(after),
    events: r.events.map(compact),
    faults: countedFaults(s.state.events).length,
    attempt: attemptsFromEvents(s.state.events),
    runTime: round(s.state.runTicks / s.state.physicsHz, 3),
    budget: { callsLeft: b.callsLeft, secondsLeft: b.secondsLeft },
    note: `back at the start line (x=${after.bike.pos.x.toFixed(1)}); checkpoints forgotten, faults kept, that cost one attempt.`,
  };
}

// ---------------------------------------------------------------------------
// done: session.json + recording + metrics merge
// ---------------------------------------------------------------------------


async function done(s: LoadedSession): Promise<{ session: StrangerSession; metricsFile: string; line: string }> {
  const st = s.state;
  const faults = countedFaults(st.events);
  const strangerAttempts = 1 + faults.length;
  const attemptsBand = s.sim.track.meta?.attemptsBand ?? null;
  const b = budgetLeft(s);
  const wall = wallMs(s);

  // Recording: the whole run, one continuous input stream.
  const recRel = path.join('harness', 'inputs', st.trackId, `stranger-${st.sessionId}.json`);
  const recAbs = path.join(REPO_ROOT, recRel);
  fs.mkdirSync(path.dirname(recAbs), { recursive: true });
  fs.writeFileSync(recAbs, encodeJSON(s.recorder.toRecording()) + '\n');

  // Faults by checkpoint: the checkpoint the bike held when each counted fault fired.
  const faultCps = (faults as PersistedEvent[]).map((f) => ({ checkpoint: f.checkpoint }));

  // The attempt worth a clip: the clearing one (the whole-session recording from its
  // start tick), else the ended attempt that got furthest (its prefix recording).
  let bestAttempt: BestAttempt | null = null;
  if (st.cleared) {
    const last = st.attempts[st.attempts.length - 1];
    bestAttempt = { n: st.attempts.length + 1, cleared: true, x: round(s.sim.track.finishX, 3), startTick: st.attemptStartTick ?? last?.endTick ?? 0, endTick: st.runTicks, recordingFile: recRel };
  } else {
    const far = [...st.attempts].sort((a, b) => b.x - a.x)[0];
    if (far && far.recordingFile) bestAttempt = { n: far.n, cleared: false, x: far.x, startTick: far.startTick ?? 0, endTick: far.endTick ?? 0, recordingFile: far.recordingFile };
  }

  const session: StrangerSession = {
    ...runMeta('stranger', new Date(st.startedAt), { physics: st.physics }),
    kind: 'stranger',
    sessionId: st.sessionId,
    trackId: st.trackId,
    seed: st.seed,
    agent: st.agent,
    bike: s.sim.bike,
    cleared: st.cleared,
    attempts: st.attempts,
    strangerAttempts,
    finishTime: st.finishTime,
    calls: st.calls,
    budget: { calls: st.budget.calls, minutes: st.budget.minutes, exhausted: b.exhausted },
    faultsByCheckpoint: faultsByCheckpoint(faultCps, s.sim.track.checkpoints.length),
    firstCheckpointCalls: st.firstCheckpointCalls,
    recordingFile: recRel,
    replayVerified: null,
    replayFaults: null,
    attemptsBand,
    pass: attemptsBand ? strangerAttempts <= 1.5 * attemptsBand[1] : null,
    bestAttempt,
    log: st.log,
  };
  session.wallMs = wall;
  writeJson(path.join(s.dir, 'session.json'), { ...session, forcedResets: st.forcedResets });

  // The per-track metrics file is the aggregate of every session (stranger/report.ts).
  const { jsonFile: metricsFile } = await strangerReport(st.trackId);

  const line = `stranger ${st.trackId} session=${st.sessionId} attempts=${strangerAttempts} cleared=${st.cleared ? 'yes' : 'no'} finish=${st.finishTime === null ? '-' : `${st.finishTime.toFixed(3)}s`} calls=${st.calls} wall=${(wall / 1000).toFixed(1)}s${bestAttempt ? ` best=#${bestAttempt.n}@${bestAttempt.x.toFixed(1)}m` : ''}`;
  return { session, metricsFile, line };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const MUTATING = new Set(['play', 'restart', 'reset']);

/** The block of run-stranger.md the parent pastes, with the placeholders filled. */
function spawnBlock(trackId: string, sessionId: string): string {
  return [
    'You are playing a 2D motorbike trials track through a command-line tool. Your only briefing is',
    'the file below; read it in full, then follow its Setup section. Do not read, list or edit any',
    'other file in that folder, do not look at its source code or git history, and do not search',
    'the web: the track is meant to be discovered by riding it.',
    '',
    `Briefing: \`${path.join(REPO_ROOT, 'harness', 'stranger', 'PROTOCOL.md')}\``,
    '',
    `Track id: \`${trackId}\``,
    `Session id: \`${sessionId}\` (already created for you — skip \`start\`; pass \`--session ${sessionId}\` on every command)`,
    '',
    'Play until you cross the finish or you are out of ideas or budget, then run `done` and reply',
    'with the single word DONE followed by one sentence on what the hardest part was.',
  ].join('\n');
}

/**
 * Parent side: one fresh session per agent x track (so the stranger never picks a track or
 * an id), plus the exact prompt per session. Nothing here counts as a call.
 */
async function prep(tracks: string[], agents: string[], round: string, bike: BikeClass = DEFAULT_BIKE): Promise<{ dir: string; sessions: Array<{ trackId: string; sessionId: string; agent: string }> }> {
  const dir = path.join(STRANGER_OUT, 'rounds', round);
  fs.mkdirSync(dir, { recursive: true });
  const sessions: Array<{ trackId: string; sessionId: string; agent: string; seed: number; attemptsBand: [number, number] | null }> = [];
  const stamp = stampId(new Date());
  for (const trackId of tracks) {
    for (const agent of agents) {
      const sessionId = `${trackId}-${round}-${agent}-${stamp}`;
      const s = await createSession({ trackId, agent, sessionId, bike });
      saveSession(s);
      sessions.push({ trackId, sessionId, agent, seed: s.state.seed, attemptsBand: s.sim.track.meta?.attemptsBand ?? null });
    }
  }
  const md = [
    `# Stranger round ${round} — ${sessions.length} sessions (${agents.length} per track), created ${new Date().toISOString()}, src ${srcFingerprint()}`,
    '',
    'One fresh agent per block, no other context (harness/stranger/run-stranger.md). After each replies DONE:',
    '',
    '```',
    `pnpm harness:stranger report ${tracks.join(' ')}`,
    '```',
    '',
    ...sessions.flatMap((x) => [`## ${x.trackId} · ${x.agent} · \`${x.sessionId}\``, '', '---', '', spawnBlock(x.trackId, x.sessionId), '', '---', '']),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'spawn.md'), md);
  writeJson(path.join(dir, 'manifest.json'), { round, createdAt: new Date().toISOString(), srcFingerprint: srcFingerprint(), tracks, agents, sessions, report: `pnpm harness:stranger report ${tracks.join(' ')}` });
  return { dir, sessions };
}

async function main(): Promise<number> {
  const { positional, flags } = parseArgs();
  const cmd = positional[0];
  if (!cmd || flags['help'] === true) {
    console.log('usage: cli.ts <start|look|status|play "<slots>"|restart|reset|done> [--track id] [--session id] [--agent name] [--seed N] [--bike rookie|pro]\n       cli.ts report <trackId> [<trackId>...] [--stale]   (parent side: aggregate every session of each track)\n       cli.ts prep --tracks a,b [--agents s1,s2] [--round r3] [--bike rookie|pro]   (parent side: fresh sessions + paste-ready prompts)');
    return cmd ? 0 : 1;
  }
  const trackFlag = typeof flags['track'] === 'string' ? flags['track'] : undefined;
  const listFlag = (name: string): string[] => (typeof flags[name] === 'string' ? (flags[name] as string).split(',').map((x) => x.trim()).filter(Boolean) : []);
  if (cmd === 'report') {
    // Parent-side aggregation; touches no session and counts as no call.
    const ids = [...positional.slice(1), ...listFlag('tracks'), ...(trackFlag ? [trackFlag] : [])];
    if (ids.length === 0) throw new Error('usage: report <trackId> [<trackId>...] [--tracks a,b] [--stale]');
    const rows: string[] = [];
    for (const id of ids) {
      const r = await strangerReport(id, { fresh: !flagBool(flags, 'stale'), ...(flags['bike'] !== undefined ? { bike: parseBike(flags['bike']) } : {}) });
      console.log(r.markdown);
      const m = r.metrics;
      console.log(`report: ${r.jsonFile} (+ .md) sessions=${m.sessions.length} n=${m.census.n} (${m.bike ?? 'rookie'}, min ${m.census.minSessions}) censored=${m.census.censored.length} median attempts=${m.medianAttempts ?? '-'} verdict=${m.verdict}`);
      const band = m.attemptsBand ? `${m.attemptsBand[0]}–${m.attemptsBand[1]}` : '—';
      const asserted = m.asserted ? `${m.asserted.band[0]} ≤ med ≤ ${m.asserted.limit}` : '—';
      rows.push(`| ${id} | ${m.bike ?? 'rookie'} | ${band} | ${asserted} | ${m.sessions.length} | ${m.census.n} | ${m.census.censored.length} | ${m.clearedCount}/${m.census.n} | ${m.medianAttempts ?? '—'} | ${m.medianFinishTime === null ? '—' : `${m.medianFinishTime.toFixed(1)} s`} | ${m.medianCalls ?? '—'} | ${m.verdict} |`);
    }
    if (ids.length > 1) {
      console.log(`\n## Stranger summary — ${ids.length} tracks, src ${srcFingerprint()}${flagBool(flags, 'stale') ? ' (incl. stale)' : ''}\n`);
      console.log('| track | bike | band | asserted | sessions | n (completed, this src + bike) | censored | cleared | median attempts | median time | median calls | verdict |');
      console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const row of rows) console.log(row);
    }
    return 0;
  }
  if (cmd === 'prep') {
    const tracks = [...listFlag('tracks'), ...positional.slice(1)];
    if (tracks.length === 0) throw new Error('usage: prep --tracks a,b [--agents s1,s2] [--round r3]');
    const agents = listFlag('agents');
    const round = flagStr(flags, 'round', `r${stampId(new Date())}`);
    const r = await prep(tracks, agents.length ? agents : ['s1', 's2'], round, parseBike(flags['bike']));
    for (const x of r.sessions) console.log(`${x.trackId.padEnd(20)} ${x.agent.padEnd(4)} ${x.sessionId}`);
    console.log(`prep: ${r.sessions.length} sessions; paste blocks in ${path.join(r.dir, 'spawn.md')}; manifest ${path.join(r.dir, 'manifest.json')}`);
    return 0;
  }
  const sessionFlag = typeof flags['session'] === 'string' ? flags['session'] : process.env['TRIALS_STRANGER_SESSION'];
  const agent = flagStr(flags, 'agent', process.env['TRIALS_STRANGER_AGENT'] ?? 'stranger');

  let s: LoadedSession;
  if (cmd === 'start') {
    const opts: Parameters<typeof createSession>[0] = { trackId: trackFlag ?? 'flat-test', agent, bike: parseBike(flags['bike']) };
    if (typeof flags['seed'] === 'string') opts.seed = flagNum(flags, 'seed', 0) >>> 0;
    if (sessionFlag) opts.sessionId = sessionFlag;
    s = await createSession(opts);
  } else {
    s = await loadSession(resolveSessionDir(sessionFlag, trackFlag));
  }

  // Every call counts, and counts even if it throws below (pristine = pre-call state for that case).
  const pristine = JSON.stringify(s.state);
  s.state.calls++;
  if (!s.state.firstCallAt) s.state.firstCallAt = new Date().toISOString();
  const argText = positional.slice(1).join(' ');
  appendLog(s, `${cmd}${argText ? ` ${JSON.stringify(argText)}` : ''}`);

  try {
    if (MUTATING.has(cmd)) {
      const b = budgetLeft(s);
      // The budget covers calls 1..N; call N+1 is refused.
      if (s.state.calls > s.state.budget.calls || b.secondsLeft <= 0) {
        appendLog(s, 'budget exhausted');
        saveSession(s);
        console.log(JSON.stringify({ budget: 'exhausted', calls: s.state.calls, wallSeconds: Math.round(wallMs(s) / 1000), hint: "call 'done'" }));
        return 2;
      }
      if (s.state.cleared) {
        saveSession(s);
        console.log(JSON.stringify({ finished: true, finishTime: s.state.finishTime, note: "the run is over; call 'done'" }));
        return 0;
      }
    }

    switch (cmd) {
      case 'start': {
        saveSession(s);
        console.log(`session ${s.state.sessionId}`);
        console.log(trackCard(s));
        console.log(screen(s));
        break;
      }
      case 'look': {
        saveSession(s);
        console.log(trackCard(s));
        console.log(screen(s));
        break;
      }
      case 'status': {
        saveSession(s);
        console.log(JSON.stringify(numbers(s)));
        break;
      }
      case 'play': {
        if (!argText) throw new Error('play needs a slot string, e.g. play "g8 gb4"');
        const { result, trace } = play(s, argText);
        appendLog(s, `-> ${JSON.stringify({ ...result, budget: undefined })}`);
        saveSession(s);
        console.log(JSON.stringify(result));
        console.log(trace.join('\n'));
        // The screen after the move, as a player sees it: no `look` call needed (after the
        // finish: the bike stopped on the run-out, the line still in frame).
        console.log(view(s));
        break;
      }
      case 'restart': {
        const r = restart(s);
        appendLog(s, `-> ${JSON.stringify({ ...r, budget: undefined })}`);
        saveSession(s);
        console.log(JSON.stringify(r));
        console.log(view(s));
        break;
      }
      case 'reset': {
        const r = reset(s);
        appendLog(s, `-> ${JSON.stringify({ ...r, budget: undefined })}`);
        saveSession(s);
        console.log(JSON.stringify(r));
        console.log(view(s));
        break;
      }
      case 'done': {
        saveSession(s);
        const { session, metricsFile, line } = await done(s);
        console.log(line);
        console.log(JSON.stringify({ sessionFile: path.join(s.dir, 'session.json'), metricsFile, recordingFile: session.recordingFile, strangerAttempts: session.strangerAttempts, cleared: session.cleared, finishTime: session.finishTime, pass: session.pass }));
        break;
      }
      default:
        throw new Error(`unknown command '${cmd}' (start|look|status|play|restart|reset|done)`);
    }
    return 0;
  } catch (err) {
    // The call still counts; everything else rolls back to the pre-call state.
    appendLog(s, `error: ${(err as Error).message}`);
    try {
      const back = JSON.parse(pristine) as PersistedState;
      back.calls = s.state.calls;
      back.log = s.state.log;
      writeJson(path.join(s.dir, 'state.json'), back);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.log(JSON.stringify({ error: (err as Error).message ?? String(err) }));
    process.exit(1);
  },
);
