/** Structural ledger only. Passing this check makes no claim about character art. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args=process.argv.slice(2);
const outputIndex=args.indexOf('--output');
if(outputIndex>=0&&!args[outputIndex+1])throw new Error('--output requires a report path');
const reportPath=outputIndex>=0?path.resolve(args[outputIndex+1]):path.join(root,'reports/asset-ledger.json');
const assets=args.filter((x,i)=>outputIndex<0||(i!==outputIndex&&i!==outputIndex+1)).filter(x=>!x.startsWith('--'));
const files = assets.length ? assets.map(x => path.resolve(x)) : fs.readdirSync(path.join(root, 'public/assets')).filter(x => x.endsWith('.glb')).map(x => path.join(root, 'public/assets', x));
function dimensions(b) {
  if (b.subarray(1, 4).toString() === 'PNG') return { width:b.readUInt32BE(16), height:b.readUInt32BE(20), sourceFormat:'PNG', gpuEstimateFormat:'RGBA8' };
  if (b[0] === 255 && b[1] === 216) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p++] !== 255) continue;
      const marker = b[p++];
      if (marker === 217 || marker === 218) break;
      const n = b.readUInt16BE(p);
      if ([192,193,194].includes(marker)) return { width:b.readUInt16BE(p+5), height:b.readUInt16BE(p+3), sourceFormat:'JPEG', gpuEstimateFormat:'RGBA8 (conservative)' };
      if (n < 2) break;
      p += n;
    }
  }
  return { sourceFormat:'unknown', gpuEstimateFormat:'unknown', residentBytesWithMipmaps:null };
}
function inspect(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii',0,4) !== 'glTF' || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) throw new Error('Invalid GLB header or declared length');
  let doc, bin;
  for(let p=12;p<b.length;) { const n=b.readUInt32LE(p), type=b.readUInt32LE(p+4); if(p+8+n>b.length) throw new Error('Truncated chunk'); const chunk=b.subarray(p+8,p+8+n); if(type===0x4e4f534a) doc=JSON.parse(chunk.toString()); if(type===0x004e4942) bin=chunk; p+=8+n; }
  if (!doc) throw new Error('Missing JSON');
  const primitives=(doc.meshes??[]).flatMap(m=>(m.primitives??[]).map(p=>({mesh:m.name??null, ...p})));
  const textureRows=(doc.images??[]).map((im,index)=>{
    let data;
    if(im.bufferView!==undefined) {const v=doc.bufferViews[im.bufferView]; if(v.buffer!==0||!bin) throw new Error('Unsupported image buffer'); data=bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);}
    else if(im.uri?.startsWith('data:')) data=Buffer.from(im.uri.split(',')[1],'base64');
    else if(im.uri) data=fs.readFileSync(path.resolve(path.dirname(file),im.uri));
    else throw new Error('Image has no data');
    const d=dimensions(data); let resident=null;
    if(d.width&&d.height) { let w=d.width,h=d.height; resident=0; while(true){resident+=w*h*4;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);} }
    return {index,name:im.name??null,encodedBytes:data.length,...d,residentBytesWithMipmaps:resident};
  });
  const tris=primitives.map(p=>{ const count=doc.accessors[p.indices??p.attributes.POSITION]?.count??0;const mode=p.mode??4;return mode===4?count/3:([5,6].includes(mode)?Math.max(0,count-2):0);});
  return {file:path.relative(root,file),sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length,generator:doc.asset.generator,triangles:tris.reduce((a,b)=>a+b,0),primitives:primitives.length,materials:(doc.materials??[]).map(m=>({name:m.name,alphaMode:m.alphaMode??'OPAQUE',doubleSided:!!m.doubleSided})),uvPrimitives:primitives.filter(p=>p.attributes.TEXCOORD_0!==undefined).length,normalPrimitives:primitives.filter(p=>p.attributes.NORMAL!==undefined).length,skins:(doc.skins??[]).map(s=>({name:s.name,joints:s.joints.length})),animations:(doc.animations??[]).map(a=>({name:a.name,channels:a.channels.length})),morphPrimitiveCount:primitives.filter(p=>p.targets?.length).length,textures:textureRows,estimatedImageResidencyBytes:textureRows.every(t=>t.residentBytesWithMipmaps!==null)?textureRows.reduce((s,t)=>s+t.residentBytesWithMipmaps,0):null,limits:'RGBA8 full-mip image estimate excludes render targets, shadow maps, buffers, duplicate uploads, driver allocations. No compressed GPU format assumed. UV presence does not establish unwrap quality.'};
}
const report={createdAt:new Date().toISOString(),scope:'GLB structure; no art or deformation acceptance',assets:files.map(file=>{try{return inspect(file);}catch(e){return {file,error:String(e)};}})};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!files.length || report.assets.some(a=>a.error)) process.exitCode=1;
