#!/usr/bin/env node
/** Read catalog GLBs; export exact authored material descriptors and usage. No asset writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
let catalogPath=path.join(root,'public/assets/catalog.json'),out=path.join(root,'reports/material-contract.json');
for(let i=2;i<process.argv.length;i++){
 const a=process.argv[i];
 if(a==='--catalog'||a==='--out'){assert(process.argv[i+1],`${a} requires a path`);if(a==='--catalog')catalogPath=path.resolve(process.argv[++i]);else out=path.resolve(process.argv[++i]);}
 else throw Error(`Unknown argument ${a}; use --catalog PATH and optional --out PATH`);
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const local=(url,base)=>{assert(!/^[a-z]+:/i.test(url),'Only local catalog assets are supported');return url.startsWith('/')?path.join(root,'public',decodeURIComponent(url.slice(1))):path.resolve(base,decodeURIComponent(url));};
function parseGLB(file){
 const b=fs.readFileSync(file);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);let doc,bin;
 for(let at=12;at<b.length;){const n=b.readUInt32LE(at),type=b.readUInt32LE(at+4);assert(at+8+n<=b.length);const chunk=b.subarray(at+8,at+8+n);if(type===0x4e4f534a)doc=JSON.parse(chunk.toString());if(type===0x004e4942)bin=chunk;at+=8+n;}
 assert(doc,'GLB JSON missing');return {b,doc,bin};
}
function dimensions(b){
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {format:'PNG',width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(b.length>=28&&b.subarray(0,12).equals(Buffer.from([171,75,84,88,32,50,48,187,13,10,26,10])))return {format:'KTX2',width:b.readUInt32LE(20),height:b.readUInt32LE(24)};
 if(b.length>=4&&b[0]===255&&b[1]===216){
  for(let i=2;i+4<=b.length;){if(b[i++]!==255)continue;let marker=b[i++];while(marker===255&&i<b.length)marker=b[i++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const n=b.readUInt16BE(i);if(n<2||i+n>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&n>=7)return {format:'JPEG',width:b.readUInt16BE(i+5),height:b.readUInt16BE(i+3)};i+=n;}
  return {format:'JPEG',dimensionsUnavailable:true};
 }
 if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  const kind=b.toString('ascii',12,16);if(kind==='VP8X')return {format:'WebP',width:1+b.readUIntLE(24,3),height:1+b.readUIntLE(27,3)};return {format:'WebP',dimensionsUnavailable:true};
 }
 return {format:'unrecognized',dimensionsUnavailable:true};
}
const semantics={
 baseColorTexture:{rgb:'sRGB color → linear, multiplied by baseColorFactor.rgb',alpha:'linear coverage × baseColorFactor.a'},
 metallicRoughnessTexture:{r:'unused by this slot',g:'linear roughness × roughnessFactor',b:'linear metallic × metallicFactor'},
 normalTexture:{rgb:'linear tangent-space normal; decoded from [0,1] to [-1,1], xy multiplied by scale'},
 occlusionTexture:{r:'linear occlusion; strength blends with unoccluded'},
 emissiveTexture:{rgb:'sRGB color → linear × emissiveFactor'},
 specularTexture:{alpha:'linear specular strength × specularFactor'},
 specularColorTexture:{rgb:'sRGB color → linear × specularColorFactor'},
 clearcoatTexture:{r:'linear clearcoat amount'},clearcoatRoughnessTexture:{g:'linear clearcoat roughness'},clearcoatNormalTexture:{rgb:'linear tangent-space normal'},
 transmissionTexture:{r:'linear transmission'},thicknessTexture:{g:'linear volume thickness'},
 sheenColorTexture:{rgb:'sRGB sheen color'},sheenRoughnessTexture:{alpha:'linear sheen roughness'},
 anisotropyTexture:{rg:'linear direction',b:'linear strength'},iridescenceTexture:{r:'linear iridescence factor'},iridescenceThicknessTexture:{g:'linear iridescence thickness'},
};
function textureSlots(value,prefix='',rows=[]){
 if(!value||typeof value!=='object')return rows;
 for(const [k,v]of Object.entries(value)){if(k==='extras')continue;const at=prefix?`${prefix}.${k}`:k;if(k.endsWith('Texture')&&v&&Number.isInteger(v.index))rows.push({slot:at,textureIndex:v.index,texCoord:v.extensions?.KHR_texture_transform?.texCoord??v.texCoord??0,scale:v.scale??(k.endsWith('NormalTexture')||k==='normalTexture'?1:undefined),strength:v.strength??(k==='occlusionTexture'?1:undefined),channelSemantics:semantics[k]??{unknown:'Consult the named extension; no color-space inference made'},descriptor:v});else if(v&&typeof v==='object')textureSlots(v,at,rows);}
 return rows;
}
function inspect(file,registrations){
 const {b,doc,bin}=parseGLB(file);const active=new Set();const walk=i=>{if(active.has(i))return;active.add(i);for(const c of doc.nodes[i].children??[])walk(c);};for(const i of doc.scenes?.[doc.scene??0]?.nodes??[])walk(i);
 const images=(doc.images??[]).map((im,index)=>{
  let bytes,location;
  if(im.bufferView!==undefined){const view=doc.bufferViews[im.bufferView];assert(!view.extensions?.EXT_meshopt_compression,'Unexpected compressed image bufferView; descriptor export cannot decode it');assert.equal(view.buffer??0,0);assert(bin);const start=view.byteOffset??0;assert(start+view.byteLength<=bin.length);bytes=bin.subarray(start,start+view.byteLength);location={bufferView:im.bufferView};}
  else if(im.uri?.startsWith('data:')){const m=im.uri.match(/^data:([^;,]*)(;base64)?,(.*)$/s);assert(m);bytes=m[2]?Buffer.from(m[3],'base64'):Buffer.from(decodeURIComponent(m[3]));location={dataURI:true};}
  else if(im.uri){const imageFile=local(im.uri,path.dirname(file));bytes=fs.readFileSync(imageFile);location={uri:im.uri,path:imageFile};}
  return {index,name:im.name??null,mimeType:im.mimeType??null,...location,...(bytes?{bytes:bytes.length,sha256:sha(bytes),...dimensions(bytes)}:{dimensionsUnavailable:true}),extensions:im.extensions??{}};
 });
 const usages=new Map();
 for(const [nodeIndex,node]of(doc.nodes??[]).entries())if(node.mesh!==undefined)for(const [primitiveIndex,pr]of doc.meshes[node.mesh].primitives.entries()){
  const use={nodeIndex,nodeName:node.name??null,meshIndex:node.mesh,meshName:doc.meshes[node.mesh].name??null,primitiveIndex,activeInDefaultScene:active.has(nodeIndex)};
  const add=(id,extra={})=>{if(!usages.has(id))usages.set(id,[]);usages.get(id).push({...use,...extra});};add(pr.material??-1);
  for(const mapping of pr.extensions?.KHR_materials_variants?.mappings??[])add(mapping.material,{variantIndices:mapping.variants});
 }
 const materials=(doc.materials??[]).map((m,index)=>({index,name:m.name??null,activeInDefaultScene:(usages.get(index)??[]).some(u=>u.activeInDefaultScene),usage:usages.get(index)??[],pbrMetallicRoughness:{baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1],metallicFactor:m.pbrMetallicRoughness?.metallicFactor??1,roughnessFactor:m.pbrMetallicRoughness?.roughnessFactor??1},emissiveFactor:m.emissiveFactor??[0,0,0],alphaMode:m.alphaMode??'OPAQUE',alphaCutoff:m.alphaCutoff??.5,doubleSided:m.doubleSided??false,extensions:m.extensions??{},textures:textureSlots(m),authoredDescriptor:m}));
 const extensionsUsed=doc.extensionsUsed??[],extensionsRequired=doc.extensionsRequired??[];
 return {path:file,registrations,sha256:sha(b),bytes:b.length,defaultScene:doc.scene??0,extensionsUsed,extensionsRequired,dependencies:{meshoptDecoder:extensionsUsed.includes('EXT_meshopt_compression')||extensionsRequired.includes('EXT_meshopt_compression')?'Three.js MeshoptDecoder via GLTFLoader.setMeshoptDecoder; required to render compressed geometry, not to read this report':null,basisTranscoder:extensionsUsed.includes('KHR_texture_basisu')?'KTX2Loader plus Basis JS/WASM transcoder and renderer capability detection':null,descriptorReader:'Node.js built-ins only; no geometry or image pixel decoding'},materials,defaultMaterialUsage:usages.get(-1)??[],textures:(doc.textures??[]).map((t,index)=>({index,sourceImage:t.extensions?.KHR_texture_basisu?.source??t.extensions?.EXT_texture_webp?.source??t.source??null,sampler:{wrapS:10497,wrapT:10497,...(t.sampler!==undefined?doc.samplers[t.sampler]:{}),note:'Missing min/mag filters are implementation-selected per glTF; wrap defaults are REPEAT'},authoredDescriptor:t})),images};
}
const catalogBytes=fs.readFileSync(catalogPath),catalog=JSON.parse(catalogBytes);assert(Array.isArray(catalog.assets));const files=new Map();
for(const a of catalog.assets)for(const key of ['url','mobileUrl'])if(a[key]){const file=local(a[key],path.dirname(catalogPath));if(!files.has(file))files.set(file,[]);files.get(file).push({id:a.id,kind:a.kind,label:a.label,qualityField:key,url:a[key]});}
const report={version:1,catalog:{path:catalogPath,sha256:sha(catalogBytes),stage:catalog.stage},semantics:{factorColorSpace:'Authored material color factors are linear; texture transfer functions are per slot. Same image may serve differently interpreted slots.',alphaCutoff:'Only applied when alphaMode is MASK.',usage:'Active means reachable from GLB default scene, before viewer runtime visibility overrides. Variant usage is recorded but selection is not inferred.',runtime:'Catalog transforms, viewer lighting/tone mapping and custom runtime material overrides are outside the exported glTF contract.'},assets:[...files].map(([f,refs])=>inspect(f,refs)),limitations:['Header-only dimensions; JPEG/PNG/KTX2 and extended WebP headers supported. Other formats remain explicitly unknown.','No texture pixel decoding, rendering, appearance judgment or material mutation.','Exact authored descriptors are retained beside effective standard defaults; extension defaults not fabricated.']};
const text=JSON.stringify(report,null,2)+'\n';assert(out!==catalogPath&&!files.has(out),'Output must not overwrite catalog or an asset');fs.writeFileSync(out,text);console.log(JSON.stringify({output:out,assets:report.assets.length,materials:report.assets.reduce((n,a)=>n+a.materials.length,0),images:report.assets.reduce((n,a)=>n+a.images.length,0),unknownImageDimensions:report.assets.reduce((n,a)=>n+a.images.filter(i=>i.dimensionsUnavailable).length,0)}));
