// Runs against actual Three.js math and meshes during Docker build, without a GPU.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DECOR, pillowGeometry, quiltGeometry, hotelDrape, fitDecor, buildRoomDecor } from './room_decor.js';
import { ShotEffects } from './shotfx.js';
import { HOTEL_LAYOUT, createHotelModel, hotelMaterials, upholsteredGeometry, REFERENCE_TEXTURES } from './hotel_room.js';
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
assert.equal(hotelMaterials(r).wall.map,null);assert.equal(hotelMaterials(r).ceiling.aoMap,null);
for(const [name,len] of [['wall',963],['carpet',1537],['gold',757]]){
 const b=Buffer.from(REFERENCE_TEXTURES[name],'base64');assert.equal(b.length,len);assert.equal(b.readUInt16BE(0),0xffd8);assert.equal(b.readUInt16BE(b.length-2),0xffd9);
}
const plush=upholsteredGeometry(.7,.20,.80,5);assert.ok(plush.attributes.position.count>1200);assert.ok([...plush.attributes.normal.array].every(Number.isFinite));
const drape=hotelDrape(1.56,2.14,.744);const drapePos=drape.attributes.position;
for(let i=0;i<drapePos.count;i++)if(Math.abs(drapePos.getX(i))<.68&&drapePos.getZ(i)>-.84&&drapePos.getZ(i)<.80)assert.ok(drapePos.getY(i)>.66,'Duvet clips through top of mattress');

for(const id of ['surface_wardrobe','table','chair','sofa','coffee_table','crate']){
 const g=createHotelModel(r,id);g.updateMatrixWorld(true);
 const b=new THREE.Box3().setFromObject(g),s=HOTEL_LAYOUT[id].s;
 assert.ok(b.min.y>=-.01,id+' below floor');
 assert.ok(b.max.y<=s[1]+(id==='table'?.40:.09),id+' above collider');
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
const doorScene=new THREE.Group(),doorRenderer={staticGroup:doorScene,quality:'1k',realismStatus:{},textured:{}};
doorRenderer.textured.hotel_wall=hotelMaterials(doorRenderer).wall;
doorRenderer.textured.white_plaster_02=new THREE.MeshStandardMaterial({color:0xffffff});
const door=await buildPortalDoor(doorRenderer,{door_models:{}},s=>s,{});
assert.equal(doorRenderer.realismStatus.door,'local');door.setOpen(true);door.setOpen(false);assert.equal(doorScene.children.length,2);
const infill=doorScene.getObjectByName('Door wall infill');assert.equal(infill.children.length,2);
for(const panel of infill.children){
 assert.equal(panel.material,doorRenderer.textured.hotel_wall);
 assert.notEqual(panel.material,doorRenderer.textured.white_plaster_02);
 assert.equal(panel.geometry.type,'BoxGeometry');
 panel.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(panel);
 assert.ok(Math.abs(bounds.max.z-(-4.9))<1e-6,'Wall infill must meet room wall face');
 assert.ok(Math.abs(bounds.min.y)<1e-6&&Math.abs(bounds.max.y-2.2)<1e-6);
}
assert.ok(Math.abs(new THREE.Box3().setFromObject(infill).min.x+1)<1e-6);
assert.ok(Math.abs(new THREE.Box3().setFromObject(infill).max.x-1)<1e-6);
console.log('Portal geometry and optional door fallback OK');

// Exercise actual animated curtain roots and ray intersections without a GPU.
import {buildArchitecture,curtainBounds,curtainPose} from './architecture.js';
const curtainScene=new THREE.Group(),curtainDynamic=new THREE.Group(),curtainImpacts=new ImpactMarks();
const curtainRenderer={quality:'1k',textured:{},staticGroup:curtainScene,dynamicGroup:curtainDynamic,impacts:curtainImpacts,models:{},windowDaylight:{fill:{intensity:4},spill:{intensity:42}},
 makeBox(s,p,m,g){const o=new THREE.Mesh(new THREE.BoxGeometry(...s),m);o.position.set(...p);g.add(o);return o;},
 makeCylinder(a,b,h,n,p,m,g,rot=[0,0,0]){const o=new THREE.Mesh(new THREE.CylinderGeometry(a,b,h,n),m);o.position.set(...p);o.rotation.set(...rot);g.add(o);return o;}
};
buildArchitecture(curtainRenderer,{});
const control=curtainRenderer.curtainControl;
assert.equal(control.progress,0);
const left=curtainImpacts.targets.get('surface_curtain_l').root,right=curtainImpacts.targets.get('surface_curtain_r').root;
const open=curtainBounds('surface_curtain_l',0);
assert.ok(open.p[2]+open.s[2]/2<-1.5);
control.setClosed(true);
for(let i=0;i<5;i++)control.step(.1);
assert.ok(control.progress>0&&control.progress<1);
for(let i=0;i<8;i++)control.step(.1);
assert.equal(control.progress,1);
const closedL=curtainBounds('surface_curtain_l',1),closedR=curtainBounds('surface_curtain_r',1);
assert.ok(closedL.p[2]+closedL.s[2]/2>=closedR.p[2]-closedR.s[2]/2);
assert.ok(curtainRenderer.windowDaylight.fill.intensity<1);
assert.ok(curtainRenderer.windowDaylight.spill.intensity<5);
curtainScene.updateMatrixWorld(true);
for(const z of [-2,-1,0]){
 const hit=curtainImpacts.cast([-3,1.6,z],[-1,0,0],[curtainScene]);
 assert.ok(['surface_curtain_l','surface_curtain_r'].includes(hit.id),'Closed curtain blocks view at '+z);
}
assert.ok(left.scale.z>2&&right.scale.z>2);
control.step(.016,{surface_curtain_l:4,surface_curtain_r:4});
assert.equal(curtainRenderer.windowDaylight.fill.intensity,4);
control.setClosed(false,true);
assert.equal(control.progress,0);assert.equal(left.scale.z,1);assert.equal(right.scale.z,1);
assert.equal(curtainRenderer.windowDaylight.spill.intensity,42);
console.log('Curtain animation, centre coverage, ray hits and daylight OK');

// Rug uses the same persistent impact ID; moving its root moves the mesh.
const rugScene=new THREE.Group(),rugMarks=new ImpactMarks(),rugRenderer={quality:'1k',textured:{},staticGroup:rugScene,realismStatus:{},shadowTexture:null,impacts:rugMarks};
await buildRoomDecor(rugRenderer,{},s=>s,{});
const rugRoot=rugMarks.targets.get('surface_rug').root;const rugSpec=HOTEL_LAYOUT.surface_rug;
assert.ok(rugSpec.decor&&rugSpec.s[1]<=.02);assert.ok(rugRoot.position.distanceTo(new THREE.Vector3(...rugSpec.p))<1e-6);
rugRoot.position.set(0,.009,0);rugRoot.rotation.y=Math.PI/2;rugScene.updateMatrixWorld(true);
const rugHit=rugMarks.cast([0,1.5,0],[0,-1,0],[rugScene]);assert.equal(rugHit.id,'surface_rug');
console.log('Hotel rug root, persistent target and rotated ray hit OK');

// Shared corridor: actual layout, scene and animated remote guests (no GPU).
import {LOBBY_LAYOUT,LOBBY_CAPACITY,lobbyDoor,lobbyDoorAt,lobbyWalkable} from './lobby_layout.js';
import {HotelLobbyView} from './hotel_lobby.js';
{
 const L=LOBBY_LAYOUT;
 assert.equal(LOBBY_CAPACITY,24);assert.equal(L.halfLength*2,42);
 assert.ok(lobbyWalkable(0,0));assert.ok(!lobbyWalkable(L.halfWidth,0));assert.ok(!lobbyWalkable(0,L.halfLength));assert.equal(lobbyDoor(24),null);
 const numbers=new Set();
 for(let i=0;i<LOBBY_CAPACITY;i++){
  const d=lobbyDoor(i);numbers.add(d.number);
  assert.equal(lobbyDoorAt([0,1.65,d.z],[d.side,0,0]).slot,i);
  assert.equal(lobbyDoorAt([0,1.65,d.z+1.3],[d.side,0,0]),null);
  assert.equal(lobbyDoorAt([0,2.7,d.z],[d.side,0,0]),null);
 }
 assert.equal(numbers.size,24);
 const savedDocument=globalThis.document;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}};}};
 try{
  const lobby=new HotelLobbyView({textured:{hotel_carpet:new THREE.MeshStandardMaterial(),hotel_wall:new THREE.MeshStandardMaterial(),hotel_ceiling:new THREE.MeshStandardMaterial()}});
  assert.equal(lobby.signs.length,24);lobby.setOwn(0);
  lobby.sync([{slot:1,position:[0,0,-2],yaw:0}]);assert.equal(lobby.peers.size,1);
  lobby.sync([{slot:1,position:[0,0,-1],yaw:1}]);lobby.step(.1,{x:0,y:0,z:0,yaw:0});
  assert.ok(lobby.peers.get(1).g.position.z>-2&&lobby.peers.get(1).g.position.z<-1);
  lobby.sync([{slot:0,position:[0,0,0],yaw:0}]);assert.equal(lobby.peers.size,0);
  lobby.clear();assert.equal(lobby.own,null);
 }finally{if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
}
console.log('Shared lobby: layout, doors, avatar interpolation and cleanup OK');
