import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const records = [
  { id:'target01', source:'../../assets/design/hero-targets/01-street-barehead.png', output:'target01.png', role:'Original AI concept: primary design authority', admission:'approved design by user; not a runtime render' },
  { id:'turnaround', source:'../../assets/design/hero-targets/reconstruction/street-mustard-turnaround.png', output:'turnaround.png', role:'Existing generated supplementary front/profile/back design', admission:'provisionally admitted by parent: front and hidden surfaces only; original profile has priority; not recovered geometry or rendered evidence' },
];
await mkdir(path.join(root,'public/references'),{recursive:true});
for (const record of records) {
 const source=path.resolve(root,record.source);
 const bytes=await readFile(source);
 record.sha256=createHash('sha256').update(bytes).digest('hex');
 await copyFile(source,path.join(root,'public/references',record.output));
}
await writeFile(path.join(root,'references/manifest.json'),JSON.stringify({version:1,authority:'Original source files remain authoritative; public copies are disposable build inputs.',records},null,2)+'\n');
console.log('Prepared 2 hash-recorded reference copies.');
