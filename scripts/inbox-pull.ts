/**
 * `pnpm inbox:pull [--url <site>] [--all]` — download every review note not yet in `.review/inbox/`
 * (or `.review/handled/`) as `<id>.json` + `<id>.jpg`, then print a table (time, track, tick, note).
 *
 * The password comes from `REVIEW_PASSWORD` in the environment, else from `.env.local` (what
 * `vercel env pull` writes; gitignored). The site defaults to production; `INBOX_URL` or `--url`
 * point it at a preview deployment. `--all` re-downloads entries already handled.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INBOX = path.join(ROOT, '.review', 'inbox');
const HANDLED = path.join(ROOT, '.review', 'handled');
const DEFAULT_URL = 'https://trials-gauntlet-demo.vercel.app';

interface Entry {
  id: string;
  json: string;
  jpg: string | null;
  uploadedAt: string;
  size: number;
}
interface Note {
  id: string;
  receivedAt: string;
  note: string;
  context: Record<string, unknown>;
  screenshot: string | null;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function envLocal(key: string): string | null {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=("?)(.*)\2$/.exec(line.trim());
      if (m && m[1] === key) return m[3] ?? null;
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

async function main(): Promise<void> {
  const base = (arg('--url') ?? process.env['INBOX_URL'] ?? DEFAULT_URL).replace(/\/$/, '');
  const password = process.env['REVIEW_PASSWORD'] ?? envLocal('REVIEW_PASSWORD');
  if (!password) {
    console.error('inbox-pull: no REVIEW_PASSWORD (env or .env.local — run `vercel env pull`)');
    process.exit(2);
  }
  const headers = { 'x-review-password': password };
  const res = await fetch(`${base}/api/inbox?list=1`, { headers });
  if (!res.ok) {
    console.error(`inbox-pull: ${base}/api/inbox → ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { entries } = (await res.json()) as { entries: Entry[] };
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(HANDLED, { recursive: true });
  const all = process.argv.includes('--all');
  const have = (id: string): boolean => fs.existsSync(path.join(INBOX, `${id}.json`)) || (!all && fs.existsSync(path.join(HANDLED, `${id}.json`)));
  let pulled = 0;
  const rows: Note[] = [];
  for (const e of entries) {
    const jsonPath = path.join(INBOX, `${e.id}.json`);
    if (!have(e.id)) {
      const j = await fetch(`${base}/api/inbox?id=${encodeURIComponent(e.id)}&file=json`, { headers });
      if (!j.ok) {
        console.error(`  ${e.id}: json ${j.status}`);
        continue;
      }
      fs.writeFileSync(jsonPath, Buffer.from(await j.arrayBuffer()));
      if (e.jpg) {
        const p = await fetch(`${base}/api/inbox?id=${encodeURIComponent(e.id)}&file=jpg`, { headers });
        if (p.ok) fs.writeFileSync(path.join(INBOX, `${e.id}.jpg`), Buffer.from(await p.arrayBuffer()));
        else console.error(`  ${e.id}: jpg ${p.status}`);
      }
      pulled++;
    }
    if (fs.existsSync(jsonPath)) rows.push(JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Note);
  }
  const pad = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.info(`inbox: ${entries.length} on the server, ${pulled} new, ${rows.length} in .review/inbox/ (${base})`);
  if (rows.length) {
    console.info(`${pad('time (UTC)', 20)} ${pad('track', 6)} ${pad('tick', 7)} ${pad('id', 34)} note`);
    for (const n of rows) {
      const c = n.context ?? {};
      const one = n.note.replace(/\s+/g, ' ').trim();
      console.info(`${pad(n.receivedAt.slice(0, 19).replace('T', ' '), 20)} ${pad(String(c['trackId'] ?? '—'), 6)} ${pad(String(c['tick'] ?? '—'), 7)} ${pad(n.id, 34)} ${one.length > 80 ? one.slice(0, 79) + '…' : one}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
