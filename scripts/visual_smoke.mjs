// Runs against actual Three.js math and meshes during Docker build, without a GPU.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DECOR, pillowGeometry, quiltGeometry, hotelDrape, fitDecor, buildRoomDecor } from './room_decor.js';
import { ShotEffects } from './shotfx.js';
import { HOTEL_LAYOUT, createHotelModel, hotelMaterials } from './hotel_room.js';
for(const geo of [pillowGeometry(.62,.47,.17),quiltGeometry(1.56,1.62,.65,true),quiltGeometry(1.56,1.62,.65,false),hotelDrape(1.56,2.14,.70,.15,.45,.012,true)]){
  assert.ok(geo.index.count>100);assert.ok([...geo.attributes.position.array].every(Number.isFinite));
  geo.computeBoundingBox();assert.ok(geo.boundingBox.max.x>geo.boundingBox.min.x);assert.ok([...geo.attributes.normal.array].every(Number.isFinite));
}
const model=new THREE.Mesh(new THREE.BoxGeometry(2,.65,.85),new THREE.MeshStandardMaterial());
const fitted=fitDecor(model,DECOR.bed);const bounds=new THREE.Box3().setFromObject(fitted.root),size=bounds.getSize(new THREE.Vector3());
assert.ok(Math.abs(bounds.min.y)<1e-5);assert.ok(size.z>size.x);assert.ok(size.x<=DECOR.bed.s[0]+1e-5&&size.z<=DECOR.bed.s[2]+1e-5);
const scene=new THREE.Scene(),r={quality:'1k',textured:{oak_veneer_01:new THREE.MeshStandardMaterial()},staticGroup:scene,realismStatus:{},shadowTexture:null};
await buildRoomDecor(r,{decor_models:{nightstand:'/ok'}},s=>s,{async loadAsync(){return {scene:new THREE.Mesh(new THREE.BoxGeometry(.5,.6,.4),new THREE.MeshStandardMaterial())};}});
assert.equal(r.realismStatus.bed,'hotel');assert.equal(r.realismStatus.nightstand,'hotel');
assert.ok(r.hotelLights.length>=5);assert.ok(hotelMaterials(r).stripe.map.isDataTexture);
for(const id of ['surface_wardrobe','table','chair','sofa','coffee_table','crate']){
 const g=createHotelModel(r,id);g.updateMatrixWorld(true);
 const b=new THREE.Box3().setFromObject(g),s=HOTEL_LAYOUT[id].s;
 assert.ok(b.min.y>=-.01,id+' below floor');
 assert.ok(b.max.y<=s[1]+.09,id+' above collider');
 assert.ok(b.min.x>=-s[0]/2-.05&&b.max.x<=s[0]/2+.05,id+' width');
 assert.ok(b.min.z>=-s[2]/2-.05&&b.max.z<=s[2]/2+.05,id+' depth');
 let meshes=0;g.traverse(o=>{if(o.isMesh){meshes++;assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));}});assert.ok(meshes>8,id+' incomplete furniture');
}
for(const [id,o] of Object.entries(HOTEL_LAYOUT)){
 if(!o.s||id==='window')continue;
 assert.ok(Math.abs(o.p[0])+o.s[0]/2<=4.85&&Math.abs(o.p[2])+o.s[2]/2<=4.85,id+' outside room');
}
console.log('Hotel geometry, fabric textures and shared layout bounds OK');
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

// The actual visual geometry must have a genuine through-opening, not a decal.
import { WallMeshes } from './wall_mesh.js';
import { WALLS, REMOVED, cellBox, site, planeAxes } from './wall_layout.js';
const w=WALLS.surface_6,wallScene=new THREE.Group(),wallImpacts=new ImpactMarks(),walls=new WallMeshes(wallImpacts);
const wall=new THREE.Mesh(new THREE.BoxGeometry(...w.s),material);wall.position.set(...w.p);wallScene.add(wall);wallScene.updateMatrixWorld(true);wallImpacts.register('surface_6',wall,'wall');walls.register('surface_6',wall);
const cell=cellBox(w,4,3),origin=[cell.p[0]-1,cell.p[1],cell.p[2]],direction=[1,0,0];
let wallHit=wallImpacts.cast(origin,direction,[wallScene]);assert.equal(wallHit.id,'surface_6');
const wallMark={id:7,target:'surface_6',...wallHit.mark,severity:1};wallImpacts.sync([wallMark]);const firstDecal=wallImpacts.live.get(7);assert.ok(firstDecal);
wallImpacts.sync([{...wallMark,severity:3}]);assert.ok(wallImpacts.live.get(7));assert.notEqual(wallImpacts.live.get(7),firstDecal);assert.equal(firstDecal.parent,null);
walls.sync({surface_6:[[4,3,REMOVED]]});wallScene.updateMatrixWorld(true);assert.equal(wallImpacts.cast(origin,direction,[wallScene]).id,null);assert.equal(wallImpacts.live.size,0);
const adjacent=cellBox(w,5,3);assert.equal(wallImpacts.cast([adjacent.p[0]-1,adjacent.p[1],adjacent.p[2]],direction,[wallScene]).id,'surface_6');
assert.equal(wall.geometry.groups.length,2);assert.ok(wall.geometry.groups[1].count>0);
walls.sync({});wallScene.updateMatrixWorld(true);assert.equal(wallImpacts.cast(origin,direction,[wallScene]).id,'surface_6');
console.log('Three.js: progressive decal rebuild, real wall opening, cut faces and repair');

for(const id of ['surface_0','surface_1']){
  const w=WALLS[id],root=new THREE.Group(),im=new ImpactMarks(),wm=new WallMeshes(im),mesh=new THREE.Mesh(new THREE.BoxGeometry(...w.s),material);mesh.position.set(...w.p);root.add(mesh);root.updateMatrixWorld(true);im.register(id,mesh,'wall');wm.register(id,mesh);
  const [u,v,b]=planeAxes(w),q=site(w,10,10),o=[...w.p],d=[0,0,0];o[u]+=q[0];o[v]+=q[1];o[b]-=1;d[b]=1;
  assert.equal(im.cast(o,d,[root]).id,id);wm.sync({[id]:[[10,10,REMOVED]]});root.updateMatrixWorld(true);assert.equal(im.cast(o,d,[root]).id,null);assert.equal(mesh.geometry.groups.length,2);wm.sync({});root.updateMatrixWorld(true);assert.equal(im.cast(o,d,[root]).id,id);
}
console.log('Three.js: irregular slab openings and repair');

// Portal fit, local fallback and unlocked state use actual Three geometry.
import { fitDoor,buildPortalDoor,PORTAL_SIDES } from './portal_door.js';
const doorModel=new THREE.Mesh(new THREE.BoxGeometry(1.07,2.19,.2),new THREE.MeshStandardMaterial());
const fittedDoor=fitDoor(doorModel);const doorBounds=new THREE.Box3().setFromObject(fittedDoor);assert.ok(Math.abs(doorBounds.min.y)<1e-5);assert.ok(Math.abs(doorBounds.max.y-2.2)<1e-5);assert.ok(Math.abs(doorBounds.max.x-.56)<1e-5);assert.equal(PORTAL_SIDES.length,2);
const doorScene=new THREE.Group(),doorRenderer={staticGroup:doorScene,quality:'1k',realismStatus:{}};
const door=await buildPortalDoor(doorRenderer,{door_models:{}},s=>s,{});assert.equal(doorRenderer.realismStatus.door,'local');door.setOpen(true);door.setOpen(false);assert.equal(doorScene.children.length,2);
console.log('Portal geometry and optional door fallback OK');
