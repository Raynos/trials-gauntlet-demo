/**
 * The in-game review inbox (the "✎ NOTE" control on the run HUD, `?review=1` to enable).
 *
 * Loaded lazily by `DomHud` on the first tap (a dynamic import: the inline loader and the core
 * bundle never carry it). The sheet is DOM only — it pauses the run through the HUD's ordinary
 * `pause` action and never touches physics, so replays / hashes are unaffected. A note is the
 * reviewer's words plus the auto-captured context (track, tick, run time, faults, bike, rider,
 * quality / dpr / canvas, version + build, UA) and a JPEG of the canvas, POSTed to `/api/inbox`
 * with the password stored once under `trials.reviewPassword`. Offline or failed sends queue in
 * localStorage and retry on the next open / `online` event. The pull side is `scripts/inbox-pull.ts`.
 */
import type { TrialsHook } from '../core/types';
import { conceal, reveal } from './live';

export const PASSWORD_KEY = 'trials.reviewPassword';
export const QUEUE_KEY = 'trials.reviewQueue';
export const INBOX_URL = '/api/inbox';
export const SHOT_MAX_W = 1280;
export const SHOT_MAX_BYTES = 300 * 1024;
export const SHOT_QUALITY = 0.7;
const QUEUE_MAX = 20;

declare const __BUILD_ID__: string | undefined;

export interface NoteContext {
  trackId: string;
  trackName: string;
  tick: number;
  runTime: number;
  faults: number;
  phase: string;
  checkpoint: number;
  bike: string;
  seed: number;
  device: string;
  quality: string;
  qualityWhy: string;
  dpr: number;
  canvas: string;
  tier: string;
  deviceClass: string;
  riderModel: string;
  riderOutfit: string;
  bikeModel: string;
  version: string;
  build: string;
  ua: string;
  viewport: string;
  url: string;
  at: string;
}

export interface QueuedNote {
  note: string;
  context: NoteContext;
  screenshot: string | null;
  queuedAt: string;
}

/** What the HUD hands over on open (the only coupling to `hud.ts`). */
export interface InboxHost {
  /** The HUD's own view of the run (track name, device); everything else comes from `window.__trials`. */
  hud(): { trackName: string; device: string };
  /** Pause the run (the HUD's `pause` action) — a no-op when already paused or not in a run. */
  pause(): void;
  parent?: HTMLElement;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const safeStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** The control is offered when a password is stored or the URL carries `?review=1` (which opens the password prompt). */
export function reviewEnabled(search = location.search, storage = safeStorage()): boolean {
  if (/[?&]review=1(&|$)/.test(search)) return true;
  try {
    return !!storage?.getItem(PASSWORD_KEY);
  } catch {
    return false;
  }
}

export function loadPassword(storage = safeStorage()): string | null {
  try {
    return storage?.getItem(PASSWORD_KEY) || null;
  } catch {
    return null;
  }
}

export function savePassword(pw: string | null, storage = safeStorage()): void {
  try {
    if (pw) storage?.setItem(PASSWORD_KEY, pw);
    else storage?.removeItem(PASSWORD_KEY);
  } catch {
    /* storage off */
  }
}

/** Everything the agent needs to reproduce, read from the hook + storage; every field is a string or number (chips + JSON). */
export function captureContext(hook: TrialsHook | undefined, hud: { trackName: string; device: string }, storage = safeStorage(), nav: { userAgent: string } = navigator, win: { innerWidth: number; innerHeight: number; devicePixelRatio: number; location: { href: string } } = window): NoteContext {
  const info = hook?.info();
  const st = hook?.getState();
  const render = (info?.render ?? {}) as Record<string, unknown>;
  const s = (v: unknown, d = ''): string => (v === undefined || v === null ? d : String(v));
  const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const get = (k: string): string => {
    try {
      return storage?.getItem(k) ?? '';
    } catch {
      return '';
    }
  };
  return {
    trackId: s(info?.trackId),
    trackName: hud.trackName,
    tick: n(st?.tick),
    runTime: Math.round(n(hook?.runTime()) * 1000) / 1000,
    faults: n(hook?.faults()),
    phase: s(hook?.phase(), 'menu'),
    checkpoint: n(st?.checkpoint, -1),
    bike: s(info?.bike, 'rookie'),
    seed: n(info?.seed),
    device: hud.device,
    quality: s(info?.quality),
    qualityWhy: s(info?.qualityWhy),
    dpr: n(render['dpr'], win.devicePixelRatio),
    canvas: render['canvasW'] !== undefined ? `${s(render['canvasW'])}×${s(render['canvasH'])}` : '',
    tier: s(render['tier']),
    deviceClass: s(render['deviceClass']),
    riderModel: get('trials.riderModel'),
    riderOutfit: get('trials.riderOutfit'),
    bikeModel: get('trials.bikeModel'),
    version: s(info?.version),
    build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
    ua: nav.userAgent,
    viewport: `${win.innerWidth}×${win.innerHeight}@${win.devicePixelRatio}`,
    url: win.location.href,
    at: new Date().toISOString(),
  };
}

/** The chips under the textarea: the fields a reader scans first. */
export function contextChips(c: NoteContext): [string, string][] {
  const chips: [string, string][] = [
    ['track', c.trackId || '—'],
    ['tick', String(c.tick)],
    ['time', c.runTime.toFixed(3)],
    ['faults', String(c.faults)],
    ['phase', c.phase],
    ['bike', c.bike],
    ['quality', [c.quality, c.tier && c.tier !== c.quality ? c.tier : '', c.deviceClass].filter(Boolean).join(' ')],
    ['dpr', String(c.dpr)],
    ['canvas', c.canvas || '—'],
    ['rider', [c.riderModel, c.riderOutfit].filter(Boolean).join(' / ') || 'default'],
    ['build', `${c.version} ${c.build}`],
  ];
  return chips;
}

/** The renderer skips a frame identical to the last drawn one (perf cut #1) and forces a draw after SKIP_MAX = 30 skips; one more than that is always a drawn frame. */
const FORCE_DRAW_TRIES = 40;

/**
 * JPEG of the WebGL canvas. The drawing buffer is not preserved between frames, so a frame is drawn
 * synchronously and read back in the same task. A paused game (the sheet opened from the pause menu)
 * renders an unchanged frame, which the renderer skips — so `render()` is repeated until the frame
 * counter moves (its skip valve draws by the 31st call), then read back. Scaled to ≤ SHOT_MAX_W,
 * quality stepped down until ≤ SHOT_MAX_BYTES. Null when there is no canvas / no 2D context.
 */
export function captureScreenshot(canvas: HTMLCanvasElement | null, hook?: TrialsHook, doc: Document = document): string | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    if (hook) {
      const before = hook.renderedFrames();
      for (let i = 0; i < FORCE_DRAW_TRIES && hook.renderedFrames() === before; i++) hook.render();
    }
    const scale = Math.min(1, SHOT_MAX_W / canvas.width);
    const off = doc.createElement('canvas');
    off.width = Math.max(1, Math.round(canvas.width * scale));
    off.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, off.width, off.height);
    let url = '';
    for (const q of [SHOT_QUALITY, 0.55, 0.4, 0.3]) {
      url = off.toDataURL('image/jpeg', q);
      if (dataUrlBytes(url) <= SHOT_MAX_BYTES) break;
    }
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch {
    return null;
  }
}

export function dataUrlBytes(url: string): number {
  const i = url.indexOf(',');
  const b64 = i < 0 ? url : url.slice(i + 1);
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

// -- transport ---------------------------------------------------------------

export type SendResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function postNote(entry: QueuedNote, password: string, fetchImpl: typeof fetch = fetch, url = INBOX_URL): Promise<SendResult> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, note: entry.note, context: entry.context, screenshot: entry.screenshot }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (res.ok && body.id) return { ok: true, id: body.id };
    return { ok: false, status: res.status, error: body.error ?? `http ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network' };
  }
}

/** Notes that failed to send (offline, 5xx) wait in localStorage; `flush` retries them oldest first and stops at the first failure. */
export class NoteQueue {
  constructor(private readonly storage: StorageLike | null = safeStorage()) {}

  list(): QueuedNote[] {
    try {
      const raw = this.storage?.getItem(QUEUE_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? (arr as QueuedNote[]) : [];
    } catch {
      return [];
    }
  }

  push(entry: QueuedNote): void {
    const arr = this.list();
    arr.push(entry);
    while (arr.length > QUEUE_MAX) arr.shift();
    this.write(arr);
  }

  /** Returns the number sent. A 401 stops the flush without dropping anything (the password is the problem, not the note). */
  async flush(password: string, send: (e: QueuedNote, pw: string) => Promise<SendResult> = (e, pw) => postNote(e, pw)): Promise<{ sent: number; failed: SendResult | null }> {
    let sent = 0;
    let arr = this.list();
    while (arr.length > 0) {
      const r = await send(arr[0]!, password);
      if (!r.ok) return { sent, failed: r };
      arr = arr.slice(1);
      this.write(arr);
      sent++;
    }
    return { sent, failed: null };
  }

  private write(arr: QueuedNote[]): void {
    try {
      if (arr.length === 0) this.storage?.removeItem(QUEUE_KEY);
      else {
        // Drop screenshots first when the store is tight (a 300 KB JPEG × 20 exceeds Safari's quota).
        try {
          this.storage?.setItem(QUEUE_KEY, JSON.stringify(arr));
        } catch {
          this.storage?.setItem(QUEUE_KEY, JSON.stringify(arr.map((e) => ({ ...e, screenshot: null }))));
        }
      }
    } catch {
      /* storage off: the note is lost, the toast says so */
    }
  }
}

// -- the sheet ---------------------------------------------------------------

const ICON = '✎';

export class InboxSheet {
  readonly root: HTMLDivElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly pwRow: HTMLDivElement;
  private readonly pwInput: HTMLInputElement;
  private readonly chipsEl: HTMLDivElement;
  private readonly shotEl: HTMLImageElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly statusEl: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private context: NoteContext | null = null;
  private screenshot: string | null = null;
  private sending = false;
  private toastTimer = 0;
  readonly queue: NoteQueue;

  constructor(
    private readonly host: InboxHost,
    private readonly hook: () => TrialsHook | undefined = () => window.__trials,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    storage: StorageLike | null = safeStorage(),
  ) {
    this.queue = new NoteQueue(storage);
    const parent = host.parent ?? document.body;
    this.root = document.createElement('div');
    this.root.className = 'inbox';
    this.root.innerHTML = `
      <div class="inbox-card" role="dialog" aria-label="Review note">
        <div class="inbox-head"><b>${ICON} Review note</b><button type="button" class="inbox-close" aria-label="Close">✕</button></div>
        <div class="inbox-body">
          <img class="inbox-shot" alt="" hidden>
          <textarea class="inbox-text" rows="4" placeholder="What is wrong, what did you expect? (the screenshot + run state ride along)" maxlength="4000" autocapitalize="sentences"></textarea>
          <div class="inbox-chips"></div>
          <div class="inbox-pw" hidden><label>Review password <input type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"></label><small>Stored on this device; asked once.</small></div>
          <div class="inbox-status"></div>
        </div>
        <div class="inbox-foot"><button type="button" class="btn inbox-cancel">Cancel</button><button type="button" class="btn primary inbox-send">Send</button></div>
      </div>`;
    // The toast outlives the sheet (it confirms a send after the close), so it is a sibling, not a child.
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'inbox-toast';
    this.textarea = this.root.querySelector('.inbox-text') as HTMLTextAreaElement;
    this.pwRow = this.root.querySelector('.inbox-pw') as HTMLDivElement;
    this.pwInput = this.pwRow.querySelector('input') as HTMLInputElement;
    this.chipsEl = this.root.querySelector('.inbox-chips') as HTMLDivElement;
    this.shotEl = this.root.querySelector('.inbox-shot') as HTMLImageElement;
    this.sendBtn = this.root.querySelector('.inbox-send') as HTMLButtonElement;
    this.statusEl = this.root.querySelector('.inbox-status') as HTMLDivElement;
    (this.root.querySelector('.inbox-close') as HTMLButtonElement).addEventListener('click', () => this.close());
    (this.root.querySelector('.inbox-cancel') as HTMLButtonElement).addEventListener('click', () => this.close());
    this.sendBtn.addEventListener('click', () => void this.send());
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void this.send();
      e.stopPropagation(); // keys typed into the note never reach the game's keyboard input
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    parent.append(this.root, this.toastEl);
    if (typeof window !== 'undefined') window.addEventListener('online', () => void this.retryQueued());
  }

  get open(): boolean {
    return this.root.classList.contains('show');
  }

  /** Tap on the HUD control: pause, capture (the frame the reviewer is looking at), show. */
  show(): void {
    this.host.pause();
    const hook = this.hook();
    this.context = captureContext(hook, this.host.hud());
    this.screenshot = captureScreenshot(document.querySelector('canvas'), hook);
    this.shotEl.hidden = !this.screenshot;
    if (this.screenshot) this.shotEl.src = this.screenshot;
    this.chipsEl.innerHTML = contextChips(this.context)
      .map(([k, v]) => `<span class="chip"><i>${escapeHtml(k)}</i>${escapeHtml(v)}</span>`)
      .join('');
    const pw = loadPassword();
    this.pwRow.hidden = !!pw;
    this.setStatus(this.queue.list().length ? `${this.queue.list().length} queued note(s) will retry on send.` : '');
    this.root.classList.add('show');
    reveal(this.root, { surface: this.root.querySelector('.inbox-card') as HTMLElement });
    (pw ? this.textarea : this.pwInput).focus();
    if (pw) void this.retryQueued();
  }

  close(): void {
    conceal(this.root);
    this.root.classList.remove('show');
    this.textarea.blur();
  }

  private setStatus(text: string, kind: '' | 'bad' | 'good' = ''): void {
    this.statusEl.textContent = text;
    this.statusEl.className = `inbox-status ${kind}`;
  }

  toast(text: string, kind: 'good' | 'bad' = 'good'): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `inbox-toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  private password(): string | null {
    const stored = loadPassword();
    if (stored) return stored;
    const typed = this.pwInput.value.trim();
    if (!typed) return null;
    savePassword(typed);
    this.pwRow.hidden = true;
    return typed;
  }

  async send(): Promise<SendResult | null> {
    if (this.sending || !this.context) return null;
    const note = this.textarea.value.trim();
    if (!note) {
      this.setStatus('Write a note first.', 'bad');
      this.textarea.focus();
      return null;
    }
    const pw = this.password();
    if (!pw) {
      this.setStatus('Enter the review password once.', 'bad');
      this.pwInput.focus();
      return null;
    }
    this.sending = true;
    this.sendBtn.disabled = true;
    this.setStatus('Sending…');
    const entry: QueuedNote = { note, context: this.context, screenshot: this.screenshot, queuedAt: new Date().toISOString() };
    const r = await postNote(entry, pw, this.fetchImpl);
    this.sending = false;
    this.sendBtn.disabled = false;
    if (r.ok) {
      this.textarea.value = '';
      this.close();
      this.toast(`Sent ✓ ${r.id.slice(-8)}`);
      void this.retryQueued();
    } else if (r.status === 401) {
      savePassword(null);
      this.pwRow.hidden = false;
      this.pwInput.value = '';
      this.setStatus('Wrong password — try again.', 'bad');
      this.pwInput.focus();
    } else if (r.status === 400 || r.status === 413) {
      this.setStatus(`Rejected: ${r.error}`, 'bad');
    } else {
      // Offline / 5xx / 429: keep it, retry later.
      this.queue.push(entry);
      this.textarea.value = '';
      this.close();
      this.toast(`Queued (${r.error}) — retries when online`, 'bad');
    }
    return r;
  }

  async retryQueued(): Promise<number> {
    const pw = loadPassword();
    if (!pw || this.queue.list().length === 0) return 0;
    const { sent, failed } = await this.queue.flush(pw, (e, p) => postNote(e, p, this.fetchImpl));
    if (sent > 0) this.toast(`Sent ${sent} queued note${sent === 1 ? '' : 's'} ✓`);
    if (failed && !failed.ok && failed.status === 401) savePassword(null);
    return sent;
  }
}

let sheet: InboxSheet | null = null;

/** Entry point for the HUD's lazy import: one sheet per page. */
export function openInbox(host: InboxHost): InboxSheet {
  if (!sheet) sheet = new InboxSheet(host);
  sheet.show();
  return sheet;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
