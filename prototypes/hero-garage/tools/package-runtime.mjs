import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'dist');
const output=path.join(root,'runtime-dist');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const selected=new Set(['index.html','identity.html','assets/catalog.json','decoders/basis/basis_transcoder.js','decoders/basis/basis_transcoder.wasm','decoders/basis/LICENSE.txt']);
const verifiedUrls=new Set();
function localPath(raw,from='index.html') {
  if(typeof raw!=='string'||!raw||/^[a-z][a-z\d+.-]*:/i.test(raw)||raw.startsWith('//')||raw.includes('\\'))throw new Error(`Unsupported external/path URL: ${raw}`);
  const value=decodeURIComponent(raw.split(/[?#]/)[0]);
  if(value.split('/').includes('..')||value.includes('\0'))throw new Error(`Traversal URL rejected: ${raw}`);
  const rel=value==='/'?'index.html':value.startsWith('/')?value.slice(1):path.posix.join(path.posix.dirname(from),value);
  if(!rel||rel.startsWith('../')||path.isAbsolute(rel))throw new Error(`Invalid local URL: ${raw}`);
  verifiedUrls.add(rel);return rel;
}
const catalog=JSON.parse(await fs.readFile(path.join(source,'assets/catalog.json'),'utf8'));
function catalogUrls(value){
  if(Array.isArray(value)){value.forEach(catalogUrls);return;}
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){
    if(/url$/i.test(key))selected.add(localPath(item));else catalogUrls(item);
  }
}
catalogUrls(catalog);
// Vite's JS/CSS chunks contain runtime imports and workers. Include the complete
// built code set, but never wildcard-copy art studies or source assets.
for(const name of await fs.readdir(path.join(source,'assets'))){
 if(/\.(?:js|css)$/.test(name))selected.add(`assets/${name}`);
}
for(const rel of [...selected]){
 if(!/\.(?:html|css)$/.test(rel))continue;
 const text=await fs.readFile(path.join(source,rel),'utf8');
 const refs=[...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g),...text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)];
 for(const match of refs){if(match[1].startsWith('#'))continue;selected.add(localPath(match[1],rel));}
}
const files=[];
for(const rel of [...selected].sort()){
 const absolute=path.resolve(source,rel);
 if(!absolute.startsWith(source+path.sep))throw new Error(`Path escaped dist: ${rel}`);
 const st=await fs.lstat(absolute);if(!st.isFile()||st.isSymbolicLink())throw new Error(`Not a regular distribution file: ${rel}`);
 const bytes=await fs.readFile(absolute);files.push({path:rel,bytes:bytes.length,sha256:sha(bytes),data:bytes});
}
// Libraries bundled into the runtime retain their original licenses.
for(const [name,rel] of [['three','node_modules/three/LICENSE'],['meshoptimizer','node_modules/meshoptimizer/LICENSE.md']]){
 const bytes=await fs.readFile(path.join(root,rel));files.push({path:`licenses/${name}.txt`,bytes:bytes.length,sha256:sha(bytes),data:bytes});
}
const notice=Buffer.from('Hero Garage prototype runtime package.\n\nThis package contains the current project-authored rider and bike, design reference images, and bundled Three.js / meshoptimizer / Basis transcoder code. Library licenses are retained beside this notice. Paused external head/hair studies are excluded. This package is for local prototype review; it does not assert final art approval, mobile-device validation, or public deployment.\n');
files.push({path:'licenses/NOTICE.txt',bytes:notice.length,sha256:sha(notice),data:notice});
files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
const staging=path.join(root,'.runtime-dist-staging');
await fs.rm(staging,{recursive:true,force:true});await fs.mkdir(staging,{recursive:true});
for(const file of files){const dest=path.join(staging,file.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.data);}
// Output is a dedicated generated directory; source dist is never modified.
await fs.rm(output,{recursive:true,force:true});await fs.rename(staging,output);
async function inventory(dir,prefix=''){
 const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const rel=path.posix.join(prefix,entry.name);if(entry.isDirectory())result.push(...await inventory(path.join(dir,entry.name),rel));else if(entry.isFile())result.push({path:rel,bytes:(await fs.stat(path.join(dir,entry.name))).size});}return result;
}
const sourceFiles=(await inventory(source)).sort((a,b)=>a.path.localeCompare(b.path,'en'));
for(const file of files){const actual=await fs.readFile(path.join(output,file.path));if(actual.length!==file.bytes||sha(actual)!==file.sha256)throw new Error(`Packaged file mismatch: ${file.path}`);}
const manifest={source:'dist',output:'runtime-dist',command:'node tools/package-runtime.mjs',files:files.map(({data,...rest})=>rest),totalBytes:files.reduce((s,f)=>s+f.bytes,0),sourceDistBytes:sourceFiles.reduce((s,f)=>s+f.bytes,0),excludedFiles:sourceFiles.filter(f=>!selected.has(f.path)),verifiedLocalUrls:[...verifiedUrls].sort(),notes:['Deterministic file contents and manifest; no timestamp fields.','Current desktop/mobile catalog GLBs, HTML, bundled code, identity references and runtime licenses only.','All catalog URLs reject external schemes, protocol-relative paths, backslashes and traversal.','This is a local prototype package, not a deployment or production completion claim.']};
await fs.mkdir(path.join(root,'reports'),{recursive:true});await fs.writeFile(path.join(root,'reports/runtime-package.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:files.length,totalBytes:manifest.totalBytes,sourceDistBytes:manifest.sourceDistBytes,output},null,2));
