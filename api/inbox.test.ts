import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  put: vi.fn(async (pathname: string, _body: unknown, _opts: unknown) => ({ url: `https://blob/${pathname}`, pathname })),
  list: vi.fn(async () => ({ blobs: [] as { pathname: string; size: number; uploadedAt: Date }[], hasMore: false, cursor: undefined })),
  get: vi.fn(async () => null as null | { stream: ReadableStream }),
}));
vi.mock('@vercel/blob', () => blob);

import { GET, MAX_BODY_BYTES, POST, newId, passwordOk, rateLimited, resetRateLimit } from './inbox';

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request('http://x/api/inbox', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  process.env['REVIEW_PASSWORD'] = 'hunter2';
  resetRateLimit();
  blob.put.mockClear();
  blob.list.mockClear();
  blob.get.mockClear();
});
afterEach(() => {
  delete process.env['REVIEW_PASSWORD'];
});

describe('api/inbox: validation', () => {
  it('passwordOk is a constant-time equality that rejects when unconfigured', () => {
    expect(passwordOk('hunter2', 'hunter2')).toBe(true);
    expect(passwordOk('hunter', 'hunter2')).toBe(false);
    expect(passwordOk('hunter2', '')).toBe(false);
    expect(passwordOk(42, 'hunter2')).toBe(false);
    expect(passwordOk('hunter2')).toBe(true); // the default is the env var
    delete process.env['REVIEW_PASSWORD'];
    expect(passwordOk('hunter2')).toBe(false);
  });

  it('503 when REVIEW_PASSWORD is unset, 401 on a wrong password, 400 on bad json / empty note', async () => {
    delete process.env['REVIEW_PASSWORD'];
    expect((await POST(post({ password: 'hunter2', note: 'x' }))).status).toBe(503);
    process.env['REVIEW_PASSWORD'] = 'hunter2';
    expect((await POST(post({ password: 'nope', note: 'x' }))).status).toBe(401);
    expect((await POST(post('{not json'))).status).toBe(400);
    expect((await POST(post({ password: 'hunter2', note: '   ' }))).status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('413 over 1 MB, by declared length or by body', async () => {
    expect((await POST(post({ password: 'hunter2', note: 'x' }, { 'content-length': String(MAX_BODY_BYTES + 1) }))).status).toBe(413);
    expect((await POST(post({ password: 'hunter2', note: 'x', screenshot: 'A'.repeat(MAX_BODY_BYTES) }))).status).toBe(413);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('writes <id>.json and <id>.jpg privately with unguessable sortable ids and returns the id', async () => {
    const res = await POST(post({ password: 'hunter2', note: '  the seesaw launches me  ', context: { trackId: 'b1', tick: 12 }, screenshot: JPG }, { 'user-agent': 'iPhone' }));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{8}$/);
    expect(blob.put).toHaveBeenCalledTimes(2);
    const [jsonPath, jsonBody, jsonOpts] = blob.put.mock.calls[0] as unknown as [string, string, { access: string; addRandomSuffix: boolean; contentType: string }];
    expect(jsonPath).toBe(`inbox/${id}.json`);
    expect(jsonOpts).toMatchObject({ access: 'private', addRandomSuffix: false, contentType: 'application/json' });
    const rec = JSON.parse(jsonBody) as { note: string; context: { trackId: string }; screenshot: string; ua: string; ip: string };
    expect(rec.note).toBe('the seesaw launches me');
    expect(rec.context.trackId).toBe('b1');
    expect(rec.screenshot).toBe(`${id}.jpg`);
    expect(rec.ua).toBe('iPhone');
    expect(rec.ip).toBe('9.9.9.9');
    const [jpgPath, jpgBody, jpgOpts] = blob.put.mock.calls[1] as unknown as [string, Buffer, { access: string; contentType: string }];
    expect(jpgPath).toBe(`inbox/${id}.jpg`);
    expect(jpgBody[0]).toBe(0xff);
    expect(jpgOpts).toMatchObject({ access: 'private', contentType: 'image/jpeg' });
  });

  it('a screenshot that is not a JPEG is dropped, not stored', async () => {
    const res = await POST(post({ password: 'hunter2', note: 'n', screenshot: 'data:image/png;base64,iVBORw0KGgo=' }));
    expect(res.status).toBe(200);
    expect(blob.put).toHaveBeenCalledTimes(1);
    expect((JSON.parse(blob.put.mock.calls[0]![1] as string) as { screenshot: string | null }).screenshot).toBeNull();
  });

  it('rate-limits a chatty IP at 30 / min and forgets after a minute', async () => {
    for (let i = 0; i < 30; i++) expect(rateLimited('1.1.1.1', 1000)).toBe(false);
    expect(rateLimited('1.1.1.1', 1000)).toBe(true);
    expect(rateLimited('2.2.2.2', 1000)).toBe(false);
    expect(rateLimited('1.1.1.1', 1000 + 61_000)).toBe(false);
    resetRateLimit();
    for (let i = 0; i < 30; i++) await POST(post({ password: 'hunter2', note: 'n' }));
    expect((await POST(post({ password: 'hunter2', note: 'n' }))).status).toBe(429);
  });

  it('newId is time-sorted with an 8-hex tail', () => {
    const a = newId(new Date('2026-09-16T08:05:12.345Z'), () => 'deadbeef');
    expect(a).toBe('2026-09-16T08-05-12.345Z-deadbeef');
    expect(newId(new Date('2026-09-16T08:05:13.000Z'), () => '00000000') > a).toBe(true);
  });
});

describe('api/inbox: GET (the pull side)', () => {
  it('needs the password (header or query) and lists entries paired by id, oldest first', async () => {
    blob.list.mockResolvedValueOnce({
      blobs: [
        { pathname: 'inbox/2026-09-16T08-05-12.345Z-bbbbbbbb.json', size: 100, uploadedAt: new Date('2026-09-16T08:05:13Z') },
        { pathname: 'inbox/2026-09-16T08-05-12.345Z-bbbbbbbb.jpg', size: 900, uploadedAt: new Date('2026-09-16T08:05:13Z') },
        { pathname: 'inbox/2026-09-16T07-00-00.000Z-aaaaaaaa.json', size: 50, uploadedAt: new Date('2026-09-16T07:00:01Z') },
        { pathname: 'inbox/orphan.jpg', size: 1, uploadedAt: new Date() },
      ],
      hasMore: false,
      cursor: undefined,
    });
    expect((await GET(new Request('http://x/api/inbox?list=1'))).status).toBe(401);
    const res = await GET(new Request('http://x/api/inbox?list=1', { headers: { 'x-review-password': 'hunter2' } }));
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as { entries: { id: string; jpg: string | null; size: number }[] };
    expect(entries.map((e) => e.id)).toEqual(['2026-09-16T07-00-00.000Z-aaaaaaaa', '2026-09-16T08-05-12.345Z-bbbbbbbb']);
    expect(entries[1]).toMatchObject({ jpg: 'inbox/2026-09-16T08-05-12.345Z-bbbbbbbb.jpg', size: 1000 });
    expect(entries[0]!.jpg).toBeNull();
    expect(blob.list).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'inbox/' }));
    expect((await GET(new Request('http://x/api/inbox?list=1&password=hunter2'))).status).toBe(200);
  });

  it('proxies one private blob by id and file, rejecting ids that are not ours', async () => {
    blob.get.mockResolvedValueOnce({ stream: new Response('{"id":"x"}').body! });
    const ok = await GET(new Request('http://x/api/inbox?id=2026-09-16T08-05-12.345Z-bbbbbbbb&file=json', { headers: { 'x-review-password': 'hunter2' } }));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('{"id":"x"}');
    expect(blob.get).toHaveBeenCalledWith('inbox/2026-09-16T08-05-12.345Z-bbbbbbbb.json', expect.objectContaining({ access: 'private' }));
    expect((await GET(new Request('http://x/api/inbox?id=../secret&file=json', { headers: { 'x-review-password': 'hunter2' } }))).status).toBe(400);
    expect((await GET(new Request('http://x/api/inbox?id=2026-09-16T08-05-12.345Z-cccccccc&file=jpg', { headers: { 'x-review-password': 'hunter2' } }))).status).toBe(404);
  });
});
