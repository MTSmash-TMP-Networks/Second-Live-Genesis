// Build-time regression: exercise embedded texture conversion, integrity and fallback.
import assert from 'node:assert/strict';
import { inflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertGLB, readGLB, writeGLB, normalizeDoors, normalizeTraffic, makeDecoder, encodePNG } from './convert_door.mjs';

const ktx = Buffer.alloc(80);
Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex').copy(ktx);
ktx.writeUInt32LE(2, 20); ktx.writeUInt32LE(2, 24);
const rgba = new Uint8Array([255,0,0,255, 5,17,240,130, 8,9,10,255, 201,202,203,204]);
const fakeModule = { KTX2File: class {
  isValid(){return true;} isETC1S(){return true;} isUASTC(){return false;} isHDR(){return false;}
  getWidth(){return 2;} getHeight(){return 2;} getLayers(){return 0;} getFaces(){return 1;} getLevels(){return 1;}
  startTranscoding(){return true;} getImageTranscodedSizeInBytes(...args){assert.deepEqual(args,[0,0,0,13]);return 16;}
  transcodeImage(dest,...args){assert.deepEqual(args,[0,0,0,13,0,-1,-1]);dest.set(rgba);return true;}
  close(){} delete(){}
}};
const decode = makeDecoder(fakeModule);
const basis = 'KHR_texture_basisu', meshopt = 'EXT_meshopt_compression';
const doc = {asset:{version:'2.0'},buffers:[{byteLength:84},{byteLength:128,extensions:{[meshopt]:{fallback:true}}}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:4},{buffer:0,byteOffset:4,byteLength:80}],
  images:[{bufferView:1,mimeType:'image/ktx2'}],textures:[{extensions:{[basis]:{source:0}}},{extensions:{[basis]:{source:0},other:{x:1}}}],
  extensionsUsed:[basis,meshopt],extensionsRequired:[basis,meshopt],meshes:[{}],scenes:[{}]};
const original = writeGLB(doc,Buffer.concat([Buffer.from('ABCD'),ktx]));
const result = await convertGLB(original,decode);
assert.equal(result.converted,1);
const {doc:out,bin} = readGLB(result.raw);
assert.deepEqual(out.extensionsUsed,[meshopt]);assert.deepEqual(out.extensionsRequired,[meshopt]);
assert.deepEqual(out.buffers[1],doc.buffers[1]);assert.deepEqual(out.bufferViews[0],doc.bufferViews[0]);
assert.deepEqual(bin.subarray(0,84),Buffer.concat([Buffer.from('ABCD'),ktx]));
assert.equal(out.textures[0].source,0);assert.equal(out.textures[1].source,0);assert.deepEqual(out.textures[1].extensions,{other:{x:1}});
assert.equal(out.images[0].mimeType,'image/png');
const view = out.bufferViews[out.images[0].bufferView];assert.equal(view.byteOffset%4,0);
const png = bin.subarray(view.byteOffset,view.byteOffset+view.byteLength);
assert.deepEqual(png,encodePNG(2,2,rgba));
assert.equal(png.readUInt32BE(16),2);assert.equal(png.readUInt32BE(20),2);
const idat=[];
for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8);assert.equal(png.readUInt32BE(p+8+n),crc32(png.subarray(p+4,p+8+n)));if(type==='IDAT')idat.push(png.subarray(p+8,p+8+n));p+=12+n;}
const rows=inflateSync(Buffer.concat(idat)),decoded=[];
for(let y=0;y<2;y++){assert.equal(rows[y*9],1);for(let x=0;x<8;x++)decoded.push((rows[y*9+1+x]+(x>=4?decoded[y*8+x-4]:0))&255);}
assert.deepEqual(decoded,[...rgba]);
await assert.rejects(convertGLB(original,()=>{throw Error('decoder unavailable');}),/decoder unavailable/);
await assert.rejects(convertGLB(original.subarray(0,-1),decode),/GLB header/);
const bad=Buffer.from(original);const loc=bad.indexOf(ktx);bad.writeUInt32LE(999999,loc+20);await assert.rejects(convertGLB(bad,decode),/pixel budget/);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sl-door-'));
try{
  fs.mkdirSync(path.join(root,'door'));
  const files=['1k','2k'].map(quality=>{const file=`door/${quality}.glb`;fs.writeFileSync(path.join(root,file),original);return{file,bytes:original.length,sha256:createHash('sha256').update(original).digest('hex'),license:'CC0-1.0'};});
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({files,bytes:original.length*2,door_models:{'1k':'/assets/polyhaven/door/1k.glb','2k':'/assets/polyhaven/door/2k.glb'},realism_status:{door:'downloaded'}}));
  let count=0;const m=await normalizeDoors(root,raw=>{if(++count===2)throw Error('test failed transcoding');return decode(raw);});
  assert.deepEqual(m.door_models,{'1k':'/assets/polyhaven/door/1k-png.glb'});
  assert.equal(m.files.length,1);const saved=fs.readFileSync(path.join(root,m.files[0].file));
  assert.equal(m.files[0].sha256,createHash('sha256').update(saved).digest('hex'));assert.equal(m.files[0].source_sha256,files[0].sha256);assert.equal(m.bytes,saved.length);
  assert(!fs.existsSync(path.join(root,'door/1k.glb')));assert(!fs.existsSync(path.join(root,'door/2k.glb')));assert(!fs.existsSync(path.join(root,'door/2k-png.glb')));
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('Door texture conversion, PNG pixel fidelity, manifest integrity and fallback OK (synthetic decoder)');

const vehicleRoot=fs.mkdtempSync(path.join(os.tmpdir(),'sl-traffic-'));
try{
 const dir=path.join(vehicleRoot,'vehicles');fs.mkdirSync(dir);
 const vehicleDoc=structuredClone(doc);vehicleDoc.nodes=['wheel_FL','wheel_FR','wheel_RL','wheel_RR'].map(name=>({name}));
 const model=writeGLB(vehicleDoc,Buffer.concat([Buffer.from('ABCD'),ktx]));
 const files=['taxi-lod0.glb','sedan-lod1.glb'].map(file=>{fs.writeFileSync(path.join(dir,file),model);return {file,sha256:createHash('sha256').update(model).digest('hex'),bytes:model.length};});
 files[1].sha256='bad';
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({files}));
 const m=await normalizeTraffic(vehicleRoot,decode);
 assert.equal(m.ready,1);assert.equal(m.format,'meshopt-png-v1');assert.equal(m.files[0].file,'taxi-lod0-png.glb');
 const output=readGLB(fs.readFileSync(path.join(dir,m.files[0].file))).doc;
 assert.equal(output.images[0].mimeType,'image/png');assert.deepEqual(output.extensionsRequired,[meshopt]);
 assert.equal(output.nodes.length,4);assert.ok(!fs.existsSync(path.join(dir,'taxi-lod0.glb')));
 assert.ok(!fs.existsSync(path.join(dir,'sedan-lod1-png.glb')));
}finally{fs.rmSync(vehicleRoot,{recursive:true,force:true});}
console.log('Traffic Basis texture normalization, wheel nodes, meshopt preservation and checksum fallback OK');
