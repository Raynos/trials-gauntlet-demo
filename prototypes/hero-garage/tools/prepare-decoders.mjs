import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(root,'public/decoders/basis'),{recursive:true});
for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])await copyFile(path.join(root,'node_modules/three/examples/jsm/libs/basis',name),path.join(root,'public/decoders/basis',name));
await copyFile(path.join(root,'art/ktx-runtime/basis-LICENSE.txt'),path.join(root,'public/decoders/basis/LICENSE.txt'));
