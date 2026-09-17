/** Decode EXT_meshopt_compression buffer views without altering accessors or scene data.
 *  Copied verbatim (minus this header) from prototypes/hero-garage/tools/unpack-art-lossless.mjs so the hero-art
 *  recipe survives the prototype's retirement. Usage: node assets/blender/unpack_meshopt.mjs in.glb out.glb */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const [input,output]=process.argv.slice(2);assert(input&&output,'Usage: node unpack-art-lossless.mjs input.glb output.glb');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(input);assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
let doc,bin;for(let at=12;at<bytes.length;){const size=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+size);if(type===0x4e4f534a)doc=JSON.parse(chunk.toString());else if(type===0x004e4942)bin=chunk;at+=8+size;}
assert(doc&&bin);assert(!doc.buffers[0].uri,'Only embedded GLB source buffers supported');await MeshoptDecoder.ready;
const metadataBefore=JSON.stringify({accessors:doc.accessors,meshes:doc.meshes,nodes:doc.nodes,skins:doc.skins,animations:doc.animations,images:doc.images,materials:doc.materials});
const parts=[],proof=[];let offset=0,decoded=0;
for(const [index,view] of doc.bufferViews.entries()){
 let payload;const ex=view.extensions?.EXT_meshopt_compression;
 if(ex){assert.equal(ex.buffer,0,'Compressed stream must be embedded GLB buffer0');assert.equal(ex.count*ex.byteStride,view.byteLength);assert((ex.byteOffset??0)+ex.byteLength<=bin.length);const compressed=bin.subarray(ex.byteOffset??0,(ex.byteOffset??0)+ex.byteLength);payload=new Uint8Array(view.byteLength);MeshoptDecoder.decodeGltfBuffer(payload,ex.count,ex.byteStride,compressed,ex.mode,ex.filter??'NONE');decoded++;delete view.extensions.EXT_meshopt_compression;if(!Object.keys(view.extensions).length)delete view.extensions;}
 else {assert.equal(view.buffer,0,'Refusing stale or absent fallback buffer');assert((view.byteOffset??0)+view.byteLength<=bin.length);payload=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);}
 const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}view.buffer=0;view.byteOffset=offset;parts.push(Buffer.from(payload));proof.push({index,decoded:!!ex,bytes:payload.length,sha256:sha(payload),offset});offset+=payload.length;
}
const pad=(4-offset%4)%4;if(pad)parts.push(Buffer.alloc(pad));const resultBin=Buffer.concat(parts);doc.buffers=[{byteLength:offset}];
for(const field of ['extensionsUsed','extensionsRequired'])if(doc[field]){doc[field]=doc[field].filter(x=>x!=='EXT_meshopt_compression');if(!doc[field].length)delete doc[field];}
assert.equal(JSON.stringify({accessors:doc.accessors,meshes:doc.meshes,nodes:doc.nodes,skins:doc.skins,animations:doc.animations,images:doc.images,materials:doc.materials}),metadataBefore);
for(const p of proof)assert.equal(sha(resultBin.subarray(p.offset,p.offset+p.bytes)),p.sha256);
const js=Buffer.from(JSON.stringify(doc)),jsonPad=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]),header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPad.length+resultBin.length,8);header.writeUInt32LE(jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(resultBin.length);bh.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([header,jsonPad,bh,resultBin]);fs.writeFileSync(output,result);
function times(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView];assert.equal(a.componentType,5126);assert.equal(a.type,'SCALAR');const vals=[];for(let k=0;k<a.count;k++)vals.push(resultBin.readFloatLE(v.byteOffset+(a.byteOffset??0)+k*(v.byteStride??4)));return vals;}
const animations=(doc.animations??[]).map(a=>{const t=a.samplers.flatMap(s=>times(s.input));return{name:a.name,startSeconds:Math.min(...t),endSeconds:Math.max(...t),durationSeconds:Math.max(...t)-Math.min(...t)};});
console.log(JSON.stringify({input,output,sourceSHA256:sha(bytes),decodedSHA256:sha(result),sourceBytes:bytes.length,decodedBytes:result.length,decodedBufferViews:decoded,retainedBufferViews:proof.length-decoded,bufferViewsVerified:proof.length,sceneAndAccessorMetadataUnchanged:true,animations}));
