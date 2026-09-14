#!/usr/bin/env node
// Concurrent image generation via the Codex CLI image tool (OpenAI image generation).
// usage: node assets/art/generate.mjs <jobs.json> <outRoot> [concurrency] [filterRegex]
// Each job: { name, size: "WxH", prompt }. Output: <outRoot>/<name>/<name>.png (skipped if present).
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [jobsPath, outRoot, concStr = '6', filter] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8')).filter(j => !filter || new RegExp(filter).test(j.name));
const conc = Number(concStr);
const root = resolve(outRoot);
mkdirSync(root, { recursive: true });

function run(job) {
  return new Promise(res => {
    const dir = join(root, job.name);
    mkdirSync(dir, { recursive: true });
    const out = join(dir, job.name + '.png');
    if (existsSync(out)) { console.log('skip', job.name); return res({ name: job.name, ok: true, skipped: true }); }
    const prompt = `Use your image generation tool to generate one ${job.size} image: ${job.prompt} Save the resulting PNG into the current directory as ${job.name}.png and reply with only its absolute path.`;
    const t0 = Date.now();
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', prompt], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let so = '', se = '';
    p.stdout.on('data', d => so += d); p.stderr.on('data', d => se += d);
    p.on('close', code => {
      if (!existsSync(out)) {
        const pngs = readdirSync(dir).filter(f => f.endsWith('.png'));
        if (pngs.length) renameSync(join(dir, pngs[0]), out);
      }
      const ok = existsSync(out);
      const s = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(ok ? 'ok  ' : 'FAIL', job.name, s + 's', ok ? '' : (so + se).slice(-400).replace(/\n/g, ' | '));
      writeFileSync(join(dir, 'codex.log'), so + '\n---stderr---\n' + se);
      res({ name: job.name, ok, secs: Number(s), code });
    });
  });
}

let i = 0;
const results = [];
async function worker() { while (i < jobs.length) { const j = jobs[i++]; results.push(await run(j)); } }
await Promise.all(Array.from({ length: conc }, worker));
const failed = results.filter(r => !r.ok);
console.log(`done: ${results.length - failed.length}/${results.length} ok`, failed.map(f => f.name));
process.exit(failed.length ? 1 : 0);
