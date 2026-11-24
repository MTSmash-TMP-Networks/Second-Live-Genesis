// Runs against actual Three.js math and meshes during Docker build, without a GPU.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DECOR, pillowGeometry, quiltGeometry, fitDecor, buildRoomDecor } from './room_decor.js';
import { ShotEffects } from './shotfx.js';
for(const geo of [pillowGeometry(.62,.47,.17),quiltGeometry(1.56,1.62,.65,true),quiltGeometry(1.56,1.62,.65,false)]){
  assert.ok(geo.index.count>100);assert.ok([...geo.attributes.position.array].every(Number.isFinite));
  geo.computeBoundingBox();assert.ok(geo.boundingBox.max.x>geo.boundingBox.min.x);assert.ok([...geo.attributes.normal.array].every(Number.isFinite));
}
const model=new THREE.Mesh(new THREE.BoxGeometry(2,.65,.85),new THREE.MeshStandardMaterial());
const fitted=fitDecor(model,DECOR.bed);const bounds=new THREE.Box3().setFromObject(fitted.root),size=bounds.getSize(new THREE.Vector3());
assert.ok(Math.abs(bounds.min.y)<1e-5);assert.ok(size.z>size.x);assert.ok(size.x<=DECOR.bed.s[0]+1e-5&&size.z<=DECOR.bed.s[2]+1e-5);
const scene=new THREE.Scene(),r={quality:'1k',textured:{oak_veneer_01:new THREE.MeshStandardMaterial()},staticGroup:scene,realismStatus:{},shadowTexture:null};
await buildRoomDecor(r,{decor_models:{nightstand:'/ok'}},s=>s,{async loadAsync(){return {scene:new THREE.Mesh(new THREE.BoxGeometry(.5,.6,.4),new THREE.MeshStandardMaterial())};}});
assert.equal(r.realismStatus.bed,'local');assert.equal(r.realismStatus.nightstand,'ready');
const fx=new ShotEffects(scene);fx.fire({origin:[0,1,0],direction:[0,0,-1],distance:2,impact:true});
assert.equal(fx.items.length,3);const shell=fx.items.find(i=>i.kind==='case');assert.equal(shell.mesh.parent,scene);for(let i=0;i<60;i++)fx.update(1/60);
assert.ok(shell.mesh.position.y>=.022);assert.ok(fx.items.every(i=>i.kind!=='trail'));for(let i=0;i<320;i++)fx.update(1/60);assert.equal(fx.items.length,0);
for(let i=0;i<80;i++)fx.fire({origin:[0,1,0],direction:[0,0,-1],distance:3,impact:false});assert.ok(fx.items.length<=32);
console.log('Three.js geometry, optional furniture replacement, bounded world-space VFX OK');
