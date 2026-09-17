// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrialsHook } from '../core/types';
import { InboxSheet, NoteQueue, PASSWORD_KEY, QUEUE_KEY, captureContext, captureScreenshot, contextChips, dataUrlBytes, postNote, reviewEnabled, type QueuedNote, type SendResult } from './inbox';
import { LIVE_DELAY_MS, resetLive, setLiveClock, tickLive } from './live';

let now = 0;
beforeEach(() => {
  now = 0;
  setLiveClock(() => now);
  localStorage.clear();
  document.head.innerHTML = '<style>* { opacity: 1; }</style>';
});
afterEach(() => {
  resetLive();
  setLiveClock(() => performance.now());
  document.body.innerHTML = '';
  localStorage.clear();
});

function fakeHook(over: Partial<ReturnType<TrialsHook['info']>> = {}): TrialsHook {
  return {
    info: () => ({ version: '0.2.1-core', physicsHz: 120, trackId: 'b1', seed: 7, bike: 'pro', harness: false, quality: 'high', qualityWhy: 'governor start high', render: { dpr: 1.5, canvasW: 1398, canvasH: 645, tier: 'high', deviceClass: 'phone' }, ...over }),
    getState: () => ({ tick: 4321, checkpoint: 2 }) as unknown as ReturnType<TrialsHook['getState']>,
    runTime: () => 36.0166667,
    faults: () => 3,
    phase: () => 'riding',
    render: vi.fn(() => 0),
  } as unknown as TrialsHook;
}

const entry = (note = 'the seesaw launches me'): QueuedNote => ({ note, context: captureContext(fakeHook(), { trackName: 'Basics', device: 'touch' }), screenshot: null, queuedAt: '2026-09-16T00:00:00.000Z' });

function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

describe('review inbox: context capture', () => {
  it('reads the reproduction state from the hook, storage and the HUD, every field a string or number', () => {
    localStorage.setItem('trials.riderModel', 'gltf');
    localStorage.setItem('trials.riderOutfit', 'street-mustard');
    const c = captureContext(fakeHook(), { trackName: 'Basics', device: 'touch' }, localStorage, { userAgent: 'UA/1' }, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 3, location: { href: 'http://x/?review=1' } });
    expect(c).toMatchObject({ trackId: 'b1', trackName: 'Basics', tick: 4321, runTime: 36.017, faults: 3, phase: 'riding', checkpoint: 2, bike: 'pro', seed: 7, device: 'touch', quality: 'high', dpr: 1.5, canvas: '1398×645', tier: 'high', deviceClass: 'phone', riderModel: 'gltf', riderOutfit: 'street-mustard', version: '0.2.1-core', build: 'dev', ua: 'UA/1', viewport: '932×430@3', url: 'http://x/?review=1' });
    for (const v of Object.values(c)) expect(['string', 'number']).toContain(typeof v);
    expect(Date.parse(c.at)).not.toBeNaN();
  });

  it('survives a missing hook (menu / before ready) with defaults', () => {
    const c = captureContext(undefined, { trackName: '', device: 'keyboard' });
    expect(c.trackId).toBe('');
    expect(c.tick).toBe(0);
    expect(c.phase).toBe('menu');
    expect(c.checkpoint).toBe(-1);
  });

  it('chips lead with track / tick / time / faults and end with the build', () => {
    const keys = contextChips(captureContext(fakeHook(), { trackName: 'Basics', device: 'touch' })).map(([k]) => k);
    expect(keys.slice(0, 4)).toEqual(['track', 'tick', 'time', 'faults']);
    expect(keys.at(-1)).toBe('build');
  });

  it('captureScreenshot renders until a frame is actually drawn (a paused game skips unchanged frames)', () => {
    let frames = 0;
    let calls = 0;
    const hook = { renderedFrames: () => frames, render: () => { if (++calls === 31) frames++; return 0; } } as unknown as TrialsHook;
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;
    captureScreenshot(canvas, hook); // jsdom has no 2D context: the readback is null, the draw loop still runs
    expect(calls).toBe(31);
    calls = 0;
    frames = 0;
    const live = { renderedFrames: () => frames, render: () => { calls++; frames++; return 0; } } as unknown as TrialsHook;
    captureScreenshot(canvas, live);
    expect(calls).toBe(1);
    expect(captureScreenshot(null, live)).toBeNull();
  });

  it('dataUrlBytes counts the decoded payload', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,/9j/4A==')).toBe(4);
    expect(dataUrlBytes('AAAA')).toBe(3);
  });
});

describe('review inbox: password gating', () => {
  it('is off by default, on with ?review=1 or a stored password', () => {
    expect(reviewEnabled('', localStorage)).toBe(false);
    expect(reviewEnabled('?review=1', localStorage)).toBe(true);
    expect(reviewEnabled('?a=1&review=1&b=2', localStorage)).toBe(true);
    expect(reviewEnabled('?review=10', localStorage)).toBe(false);
    localStorage.setItem(PASSWORD_KEY, 'pw');
    expect(reviewEnabled('', localStorage)).toBe(true);
  });

  it('asks for the password once, stores it, and sends it with the note', async () => {
    const fetchImpl = fetchReturning(200, { id: '2026-09-16T00-00-00.000Z-deadbeef' });
    const pause = vi.fn();
    const sheet = new InboxSheet({ hud: () => ({ trackName: 'Basics', device: 'touch' }), pause }, () => fakeHook(), fetchImpl, localStorage);
    sheet.show();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(sheet.open).toBe(true);
    const pwRow = sheet.root.querySelector<HTMLElement>('.inbox-pw')!;
    expect(pwRow.hidden).toBe(false);
    (sheet.root.querySelector('.inbox-text') as HTMLTextAreaElement).value = 'hello';
    // No password typed: nothing is sent.
    expect(await sheet.send()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    pwRow.querySelector('input')!.value = 's3cret';
    const r = await sheet.send();
    expect(r).toEqual({ ok: true, id: '2026-09-16T00-00-00.000Z-deadbeef' });
    expect(localStorage.getItem(PASSWORD_KEY)).toBe('s3cret');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/inbox');
    const body = JSON.parse(init.body as string) as { password: string; note: string; context: { trackId: string; tick: number }; screenshot: null };
    expect(body.password).toBe('s3cret');
    expect(body.note).toBe('hello');
    expect(body.context.trackId).toBe('b1');
    expect(body.context.tick).toBe(4321);
    expect(sheet.open).toBe(false);
    // Second open: no prompt.
    sheet.show();
    expect(pwRow.hidden).toBe(true);
  });

  it('a 401 clears the stored password and re-asks', async () => {
    localStorage.setItem(PASSWORD_KEY, 'stale');
    const sheet = new InboxSheet({ hud: () => ({ trackName: '', device: 'keyboard' }), pause: () => undefined }, () => fakeHook(), fetchReturning(401, { error: 'bad password' }), localStorage);
    sheet.show();
    (sheet.root.querySelector('.inbox-text') as HTMLTextAreaElement).value = 'x';
    const r = (await sheet.send()) as SendResult;
    expect(r.ok).toBe(false);
    expect(localStorage.getItem(PASSWORD_KEY)).toBeNull();
    expect(sheet.root.querySelector<HTMLElement>('.inbox-pw')!.hidden).toBe(false);
    expect(sheet.open).toBe(true);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull(); // a bad password never queues
  });

  it('the sheet takes pointers only under the touch-navigation invariant and swallows keys', () => {
    const sheet = new InboxSheet({ hud: () => ({ trackName: '', device: 'touch' }), pause: () => undefined }, () => fakeHook(), fetchReturning(200, {}), localStorage);
    sheet.show();
    expect(sheet.root.classList.contains('live')).toBe(false);
    tickLive(now);
    now += LIVE_DELAY_MS;
    tickLive(now);
    expect(sheet.root.classList.contains('live')).toBe(true);
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    (sheet.root.querySelector('.inbox-text') as HTMLTextAreaElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener('keydown', seen);
    sheet.close();
    expect(sheet.root.classList.contains('live')).toBe(false);
  });
});

describe('review inbox: queue and retry', () => {
  it('postNote maps network failure to status 0 and http errors to their status', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await postNote(entry(), 'pw', down)).toEqual({ ok: false, status: 0, error: 'Failed to fetch' });
    expect(await postNote(entry(), 'pw', fetchReturning(503, { error: 'nope' }))).toEqual({ ok: false, status: 503, error: 'nope' });
  });

  it('an offline send queues the note; the next open with a password flushes it', async () => {
    localStorage.setItem(PASSWORD_KEY, 'pw');
    let online = false;
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      calls.push((JSON.parse(init.body as string) as { note: string }).note);
      if (!online) throw new TypeError('offline');
      return new Response(JSON.stringify({ id: `id-${calls.length}` }), { status: 200 });
    }) as unknown as typeof fetch;
    const sheet = new InboxSheet({ hud: () => ({ trackName: '', device: 'touch' }), pause: () => undefined }, () => fakeHook(), fetchImpl, localStorage);
    sheet.show();
    (sheet.root.querySelector('.inbox-text') as HTMLTextAreaElement).value = 'first';
    const r = (await sheet.send()) as SendResult;
    expect(r.ok).toBe(false);
    expect(sheet.open).toBe(false);
    const queued = JSON.parse(localStorage.getItem(QUEUE_KEY)!) as QueuedNote[];
    expect(queued).toHaveLength(1);
    expect(queued[0]!.note).toBe('first');
    expect(queued[0]!.context.trackId).toBe('b1');
    online = true;
    sheet.show(); // retries on open
    await vi.waitFor(() => expect(localStorage.getItem(QUEUE_KEY)).toBeNull());
    expect(calls).toEqual(['first', 'first']);
  });

  it('NoteQueue.flush sends oldest first, stops at the first failure, keeps the rest', async () => {
    const q = new NoteQueue(localStorage);
    q.push(entry('a'));
    q.push(entry('b'));
    q.push(entry('c'));
    let n = 0;
    const send = vi.fn(async (e: QueuedNote): Promise<SendResult> => (++n === 2 ? { ok: false, status: 503, error: 'x' } : { ok: true, id: e.note }));
    const r = await q.flush('pw', send);
    expect(r.sent).toBe(1);
    expect(r.failed).toEqual({ ok: false, status: 503, error: 'x' });
    expect(q.list().map((e) => e.note)).toEqual(['b', 'c']);
    const r2 = await q.flush('pw', async (e) => ({ ok: true, id: e.note }));
    expect(r2.sent).toBe(2);
    expect(q.list()).toEqual([]);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it('the queue survives a storage that throws on write by dropping screenshots, and is capped at 20', () => {
    const q = new NoteQueue(localStorage);
    for (let i = 0; i < 25; i++) q.push(entry(`n${i}`));
    expect(q.list()).toHaveLength(20);
    expect(q.list()[0]!.note).toBe('n5');
    let calls = 0;
    const tight = {
      getItem: (k: string) => localStorage.getItem(k),
      removeItem: (k: string) => localStorage.removeItem(k),
      setItem: (k: string, v: string) => {
        if (++calls === 1) throw new Error('QuotaExceededError');
        localStorage.setItem(k, v);
      },
    };
    localStorage.clear();
    const q2 = new NoteQueue(tight);
    q2.push({ ...entry('shot'), screenshot: 'data:image/jpeg;base64,AAAA' });
    expect(q2.list()[0]!.screenshot).toBeNull();
    expect(q2.list()[0]!.note).toBe('shot');
  });
});
