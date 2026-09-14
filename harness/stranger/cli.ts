/**
 * Stranger CLI: one shot per call, state on disk, node-side physics only.
 *
 *   tsx harness/stranger/cli.ts <cmd> [args] [--track <id>] [--session <id>] [--agent <name>]
 *
 *   start [--track flat-test] [--seed N]   create a session, print its id + `look`
 *   look                                    numbers + ASCII side-view of the next 40 m
 *   status                                  numbers only
 *   play "<slots>"                          e.g. "g8 gb4 c2"  (max 40 slots of 1/8 s)
 *   restart                                 back to the last checkpoint (an attempt)
 *   reset                                   back to the start line (an attempt)
 *   done                                    finalize session.json + metrics
 *
 * Exit codes: 0 ok, 1 error ({error} JSON), 2 budget exhausted ({budget:'exhausted'}).
 * See PROTOCOL.md (what the stranger is told) and docs/design/harness-metrics.md §3.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameEvent, InputFrame, PhysicsState } from '../../src/core/types';
import { encodeJSON } from '../../src/core/replay';
import { ACTIONS, COAST, HOLD, RESTART_FRAME, formatActions, framesOf, parseSlots } from '../bot/actions';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { attemptsFromEvents, countedFaults, faultsByCheckpoint, median, runMeta } from '../lib/metrics';
import { REPO_ROOT } from '../lib/paths';
import { writeJson } from '../lib/report';
import type { StrangerSession } from '../lib/schema';
import {
  appendLog,
  budgetLeft,
  createSession,
  endAttempt,
  loadSession,
  resolveSessionDir,
  round,
  saveSession,
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
    runTime: round(s.state.runTicks / s.state.physicsHz, 3),
    finishX: s.sim.track.finishX,
    distanceToFinish: round(s.sim.track.finishX - st.bike.pos.x, 2),
    cleared: s.state.cleared,
    finishTime: s.state.finishTime,
    budget: { callsLeft: b.callsLeft, secondsLeft: b.secondsLeft },
  };
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
      s.state.finishTime = round(s.state.runTicks / s.state.physicsHz, 4);
    }
  }
  return out;
}

/**
 * The restart mash a player does after a crash: restart held one tick, then a
 * coast tick (both recorded, so a replay respawns at the same tick). If the
 * physics still reports a fault afterwards we reset the world directly and
 * flag it: the recording cannot express that.
 */
function respawn(s: LoadedSession, checkpoint: number): { events: PersistedEvent[]; forcedReset: boolean } {
  const events = [...tick(s, RESTART_FRAME), ...tick(s, COAST)];
  let forcedReset = false;
  const st = s.sim.state();
  if (s.sim.phase() !== 'riding' || st.checkpoint !== checkpoint) {
    s.sim.world.reset(checkpoint);
    s.sim.world.drainEvents();
    s.state.forcedResets++;
    forcedReset = true;
  }
  return { events, forcedReset };
}

interface PlayResult {
  attempt: number;
  slots: string;
  slotsPlayed: number;
  slotsRequested: number;
  before: ReturnType<typeof brief>;
  after: ReturnType<typeof brief>;
  events: CompactEvent[];
  faulted?: { reason: string; respawnedAt: number; forcedReset?: true };
  finished?: true;
  checkpoint: number;
  grounded: boolean;
  faults: number;
  runTime: number;
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
  let note: string | undefined;

  outer: for (const id of ids) {
    const frames = framesOf(id);
    const code = ACTIONS[id]!.code;
    let slotFault: PersistedEvent | null = null;
    for (let i = 0; i < HOLD; i++) {
      const evs = tick(s, frames[i]!);
      events.push(...evs);
      for (const e of evs) {
        if (e.event.type === 'finish') finished = true;
        if (e.event.type === 'fault' && !slotFault) slotFault = e;
      }
      if (finished || slotFault) break;
    }
    played++;
    const st = s.sim.state();
    const g = st.wheels.rear.grounded || st.wheels.front.grounded;
    trace.push(
      `${String(played).padStart(2, '0')} ${code.padEnd(3)} x=${st.bike.pos.x.toFixed(1).padStart(6)} vx=${st.bike.vel.x.toFixed(1).padStart(5)} ang=${((st.bike.angle * 180) / Math.PI).toFixed(0).padStart(4)} ${g ? 'ground' : 'AIR'}`,
    );
    if (finished) break outer; // the successful attempt is not an ended one: strangerAttempts = 1 + faults
    if (slotFault && slotFault.event.type === 'fault') {
      const reason = slotFault.event.reason;
      const cp = st.checkpoint;
      endAttempt(s, 'fault', st, reason);
      const r = respawn(s, cp);
      events.push(...r.events);
      const after = s.sim.state();
      faulted = { reason, respawnedAt: round(after.bike.pos.x, 2) };
      if (r.forcedReset) faulted.forcedReset = true;
      note = `crashed (${reason}) after slot ${played}; you are back at checkpoint ${cp} (x=${after.bike.pos.x.toFixed(1)}), stationary. Remaining ${ids.length - played} slot(s) were NOT played.`;
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
    budget: { callsLeft: b.callsLeft, secondsLeft: b.secondsLeft },
  };
  if (faulted) result.faulted = faulted;
  if (finished) {
    result.finished = true;
    result.note = `FINISHED at run time ${s.state.finishTime}s. Call 'done'.`;
  } else if (note) result.note = note;
  return { result, trace };
}

function restart(s: LoadedSession): Record<string, unknown> {
  const st = s.sim.state();
  const cp = st.checkpoint;
  endAttempt(s, 'restart', st);
  const r = respawn(s, cp);
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
  for (let i = 0; i < s.sim.rules.T.holdRestart; i++) events.push(...tick(s, RESTART_FRAME));
  events.push(...tick(s, COAST));
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
  };
}

// ---------------------------------------------------------------------------
// done: session.json + recording + metrics merge
// ---------------------------------------------------------------------------

interface StrangerMetricsFile {
  schema: 1;
  kind: 'stranger-metrics';
  trackId: string;
  attemptsBand: [number, number] | null;
  sessions: {
    sessionId: string;
    agent: string;
    strangerAttempts: number;
    cleared: boolean;
    finishTime: number | null;
    calls: number;
    wallMs: number;
  }[];
  medianAttempts: number | null;
  pass: boolean | null;
  updatedAt: string;
}

function done(s: LoadedSession): { session: StrangerSession; metricsFile: string; line: string } {
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

  const session: StrangerSession = {
    ...runMeta('stranger', new Date(st.startedAt), { physics: st.physics }),
    kind: 'stranger',
    sessionId: st.sessionId,
    trackId: st.trackId,
    seed: st.seed,
    agent: st.agent,
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
    log: st.log,
  };
  session.wallMs = wall;
  writeJson(path.join(s.dir, 'session.json'), { ...session, forcedResets: st.forcedResets });

  // Merge into the per-track metrics file.
  const metricsFile = path.join(REPO_ROOT, 'harness', 'out', 'metrics', `${st.trackId}.stranger.json`);
  let m: StrangerMetricsFile | null = null;
  if (fs.existsSync(metricsFile)) {
    try {
      m = JSON.parse(fs.readFileSync(metricsFile, 'utf8')) as StrangerMetricsFile;
      if (m.kind !== 'stranger-metrics') m = null;
    } catch {
      m = null;
    }
  }
  if (!m) m = { schema: 1, kind: 'stranger-metrics', trackId: st.trackId, attemptsBand, sessions: [], medianAttempts: null, pass: null, updatedAt: '' };
  m.attemptsBand = attemptsBand;
  m.sessions = m.sessions.filter((x) => x.sessionId !== st.sessionId);
  m.sessions.push({ sessionId: st.sessionId, agent: st.agent, strangerAttempts, cleared: st.cleared, finishTime: st.finishTime, calls: st.calls, wallMs: wall });
  m.medianAttempts = median(m.sessions.map((x) => x.strangerAttempts));
  m.pass = attemptsBand ? m.medianAttempts <= 1.5 * attemptsBand[1] && m.sessions.every((x) => x.cleared) : null;
  m.updatedAt = new Date().toISOString();
  writeJson(metricsFile, m);

  const line = `stranger ${st.trackId} session=${st.sessionId} attempts=${strangerAttempts} cleared=${st.cleared ? 'yes' : 'no'} finish=${st.finishTime === null ? '-' : `${st.finishTime.toFixed(3)}s`} calls=${st.calls} wall=${(wall / 1000).toFixed(1)}s`;
  return { session, metricsFile, line };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const MUTATING = new Set(['play', 'restart', 'reset']);

async function main(): Promise<number> {
  const { positional, flags } = parseArgs();
  const cmd = positional[0];
  if (!cmd || flags['help'] === true) {
    console.log('usage: cli.ts <start|look|status|play "<slots>"|restart|reset|done> [--track id] [--session id] [--agent name] [--seed N]');
    return cmd ? 0 : 1;
  }
  const trackFlag = typeof flags['track'] === 'string' ? flags['track'] : undefined;
  const sessionFlag = typeof flags['session'] === 'string' ? flags['session'] : process.env['TRIALS_STRANGER_SESSION'];
  const agent = flagStr(flags, 'agent', process.env['TRIALS_STRANGER_AGENT'] ?? 'stranger');

  let s: LoadedSession;
  if (cmd === 'start') {
    const opts: Parameters<typeof createSession>[0] = { trackId: trackFlag ?? 'flat-test', agent };
    if (typeof flags['seed'] === 'string') opts.seed = flagNum(flags, 'seed', 0) >>> 0;
    if (sessionFlag) opts.sessionId = sessionFlag;
    s = await createSession(opts);
  } else {
    s = await loadSession(resolveSessionDir(sessionFlag, trackFlag));
  }

  // Every call counts, and counts even if it throws below (pristine = pre-call state for that case).
  const pristine = JSON.stringify(s.state);
  s.state.calls++;
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
        console.log(JSON.stringify(numbers(s)));
        console.log(asciiView(s.sim.compiled, s.sim.state()));
        break;
      }
      case 'look': {
        saveSession(s);
        console.log(JSON.stringify(numbers(s)));
        console.log(asciiView(s.sim.compiled, s.sim.state()));
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
        break;
      }
      case 'restart': {
        const r = restart(s);
        appendLog(s, `-> ${JSON.stringify({ ...r, budget: undefined })}`);
        saveSession(s);
        console.log(JSON.stringify(r));
        break;
      }
      case 'reset': {
        const r = reset(s);
        appendLog(s, `-> ${JSON.stringify({ ...r, budget: undefined })}`);
        saveSession(s);
        console.log(JSON.stringify(r));
        break;
      }
      case 'done': {
        saveSession(s);
        const { session, metricsFile, line } = done(s);
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
