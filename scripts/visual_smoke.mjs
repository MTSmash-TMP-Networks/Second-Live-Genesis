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

// Imported display scenes must not show a second separated copy or loose art props.
import { isolateDisplayProp } from './display_prop.js';
import { ImpactMarks } from './impact_marks.js';
const display=new THREE.Group(),material=new THREE.MeshStandardMaterial();
for(const x of [0,.7]){const body=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.5),material);body.position.x=x;display.add(body);const detail=new THREE.Mesh(new THREE.BoxGeometry(.11,.1,.12),material);detail.position.set(x,-.09,.17);display.add(detail);}
const loose=new THREE.Mesh(new THREE.BoxGeometry(.08,.11,.08),material);loose.position.set(1.5,0,0);display.add(loose);
const ref=new THREE.Mesh(new THREE.BoxGeometry(.12,.24,.5),material);
const isolated=isolateDisplayProp(display,ref);let count=0;isolated.traverse(o=>{if(o.isMesh)count++;});assert.equal(count,2);assert.ok(new THREE.Box3().setFromObject(isolated).getSize(new THREE.Vector3()).x<.3);
// World raycasts and clipped decals stay attached to moving targets; repairs clear them.
const impacts=new ImpactMarks(),room=new THREE.Group(),target=new THREE.Group();room.add(target);target.position.set(1,0,0);const cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);target.add(cube);room.updateMatrixWorld(true);impacts.register('crate',target,'wood');
const hit=impacts.cast([1,0,2],[0,0,-1],[room]);assert.equal(hit.id,'crate');assert.ok(Math.abs(hit.mark.point[2]-.5)<1e-5);assert.ok(hit.mark.normal[2]>.99);
const mark={id:1,target:'crate',...hit.mark};impacts.sync([mark]);assert.equal(impacts.live.size,1);const decal=impacts.live.get(1);assert.equal(decal.parent,target);assert.ok(decal.geometry.attributes.position.count>0);
const a=new THREE.Vector3().fromBufferAttribute(decal.geometry.attributes.position,0);const before=target.localToWorld(a.clone());target.position.x+=2;target.rotation.y=.3;target.updateMatrixWorld(true);const after=target.localToWorld(a.clone());assert.ok(before.distanceTo(after)>1);impacts.sync([mark]);assert.equal(impacts.live.get(1),decal);
const other=new THREE.Mesh(new THREE.BoxGeometry(1,1,.1),material);other.position.set(3,0,1.4);room.add(other);room.updateMatrixWorld(true);assert.equal(impacts.cast([3,0,2],[0,0,-1],[room]).id,null);
impacts.sync([]);assert.equal(impacts.live.size,0);assert.equal(decal.parent,null);
console.log('Single visual assembly, surface raycast, object-local decal, occlusion and repair OK');
