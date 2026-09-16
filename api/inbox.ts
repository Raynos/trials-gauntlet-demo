/**
 * `/api/inbox` — the in-game review inbox (Vercel Node function, web-standard handlers).
 *
 *   POST { password, note, context, screenshot? }   → { id }    writes inbox/<id>.json (+ .jpg) to Vercel Blob
 *   GET  ?list=1                                    → { entries: [{ id, json, jpg, uploadedAt, size }] }
 *   GET  ?id=<id>&file=json|jpg                     → the blob's bytes (the store is private; this proxies it)
 *
 * The password rides in the JSON body (POST) or the `x-review-password` header (GET) and is checked
 * against `REVIEW_PASSWORD` with a constant-time compare. Bodies are capped at 1 MB. A light per-IP
 * rate limit (30 / min, per warm instance) keeps a leaked password from filling the store.
 * The client is `src/ui/inbox.ts`; the pull side is `scripts/inbox-pull.ts` (`pnpm inbox:pull`).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, list, put } from '@vercel/blob';

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_NOTE_CHARS = 4000;
export const RATE_LIMIT_PER_MIN = 30;
const PREFIX = 'inbox/';
const ID_RE = /^[0-9TZ.-]{20,32}-[0-9a-f]{8}$/;

export interface InboxPost {
  password?: unknown;
  note?: unknown;
  context?: unknown;
  /** `data:image/jpeg;base64,…` or bare base64. */
  screenshot?: unknown;
}

export interface InboxEntry {
  id: string;
  json: string;
  jpg: string | null;
  uploadedAt: string;
  size: number;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

/** Constant-time password check; a missing/empty `REVIEW_PASSWORD` rejects everything. */
export function passwordOk(given: unknown, expected: string | undefined = process.env['REVIEW_PASSWORD']): boolean {
  if (typeof given !== 'string' || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// -- rate limit (per warm instance; the goal is "not a firehose", not a guarantee) --
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now = Date.now(), limit = RATE_LIMIT_PER_MIN): boolean {
  const cut = now - 60_000;
  const arr = (hits.get(ip) ?? []).filter((t) => t > cut);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 500) for (const k of hits.keys()) if (k !== ip) hits.delete(k);
  return arr.length > limit;
}
export function resetRateLimit(): void {
  hits.clear();
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]!.trim() || 'unknown';
}

/** `2026-09-16T08-05-12.345Z-1a2b3c4d`: sortable by time, unguessable tail. */
export function newId(now = new Date(), rand: () => string = () => randomBytes(4).toString('hex')): string {
  return `${now.toISOString().replace(/:/g, '-')}-${rand()}`;
}

function decodeScreenshot(s: unknown): Buffer | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  const b64 = s.startsWith('data:') ? s.slice(s.indexOf(',') + 1) : s;
  const buf = Buffer.from(b64, 'base64');
  // JPEG SOI marker; anything else is dropped rather than stored under a .jpg name.
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 ? buf : null;
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'body too large' });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: 'body too large' });
  let body: InboxPost;
  try {
    body = JSON.parse(raw) as InboxPost;
  } catch {
    return json(400, { error: 'bad json' });
  }
  if (!process.env['REVIEW_PASSWORD']) return json(503, { error: 'inbox not configured' });
  if (!passwordOk(body.password)) return json(401, { error: 'bad password' });
  if (rateLimited(clientIp(req))) return json(429, { error: 'slow down' });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_CHARS) : '';
  if (!note) return json(400, { error: 'empty note' });
  const context = body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : {};
  const id = newId();
  const jpg = decodeScreenshot(body.screenshot);
  const record = {
    id,
    receivedAt: new Date().toISOString(),
    note,
    context,
    screenshot: jpg ? `${id}.jpg` : null,
    ip: clientIp(req),
    ua: req.headers.get('user-agent') ?? '',
  };
  await put(`${PREFIX}${id}.json`, JSON.stringify(record, null, 2), { access: 'private', addRandomSuffix: false, contentType: 'application/json' });
  if (jpg) await put(`${PREFIX}${id}.jpg`, jpg, { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' });
  return json(200, { id });
}

export async function GET(req: Request): Promise<Response> {
  if (!process.env['REVIEW_PASSWORD']) return json(503, { error: 'inbox not configured' });
  const url = new URL(req.url);
  const given = req.headers.get('x-review-password') ?? url.searchParams.get('password');
  if (!passwordOk(given)) return json(401, { error: 'bad password' });
  if (rateLimited(clientIp(req), Date.now(), RATE_LIMIT_PER_MIN * 4)) return json(429, { error: 'slow down' });
  const id = url.searchParams.get('id');
  if (id) {
    if (!ID_RE.test(id)) return json(400, { error: 'bad id' });
    const file = url.searchParams.get('file') === 'jpg' ? 'jpg' : 'json';
    const hit = await get(`${PREFIX}${id}.${file}`, { access: 'private', useCache: false });
    if (!hit || !hit.stream) return json(404, { error: 'not found' });
    return new Response(hit.stream, { status: 200, headers: { 'content-type': file === 'jpg' ? 'image/jpeg' : 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const byId = new Map<string, InboxEntry>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const b of page.blobs) {
      const m = /^inbox\/(.+)\.(json|jpg)$/.exec(b.pathname);
      if (!m) continue;
      const e = byId.get(m[1]!) ?? { id: m[1]!, json: '', jpg: null, uploadedAt: new Date(b.uploadedAt).toISOString(), size: 0 };
      if (m[2] === 'json') e.json = b.pathname;
      else e.jpg = b.pathname;
      e.size += b.size;
      byId.set(e.id, e);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const entries = [...byId.values()].filter((e) => e.json).sort((a, b) => (a.id < b.id ? -1 : 1));
  return json(200, { entries });
}
