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
const curtainRenderer={quality:'1k',textured:{},staticGroup:curtainScene,dynamicGroup:curtainDynamic,impacts:curtainImpacts,models:{},windowDaylight:{fill:{intensity:4},spill:{intensity:42}},roomSun:{intensity:2.5},roomHemi:{intensity:.36},scene:{environmentIntensity:.36},roomIndoorLight:false,
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
assert.equal(curtainRenderer.windowDaylight.fill.intensity,0);
assert.equal(curtainRenderer.windowDaylight.spill.intensity,0);
assert.equal(curtainRenderer.roomSun.intensity,0);
assert.equal(curtainRenderer.roomHemi.intensity,.055);
assert.equal(curtainRenderer.scene.environmentIntensity,.035);
curtainRenderer.roomIndoorLight=true;control.step(0);
assert.ok(Math.abs(curtainRenderer.roomHemi.intensity-.155)<1e-9);
assert.ok(Math.abs(curtainRenderer.scene.environmentIntensity-.135)<1e-9);
assert.equal(curtainRenderer.roomSun.intensity,0);
curtainRenderer.roomIndoorLight=false;control.step(0);
assert.equal(curtainRenderer.roomHemi.intensity,.055);
assert.equal(curtainRenderer.scene.environmentIntensity,.035);
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
assert.equal(curtainRenderer.roomHemi.intensity,.36);
assert.equal(curtainRenderer.scene.environmentIntensity,.36);
console.log('Curtain animation, centre coverage, ray hits, daylight and dim-room visibility OK');

// Rug uses the same persistent impact ID; moving its root moves the mesh.
const rugScene=new THREE.Group(),rugMarks=new ImpactMarks(),rugRenderer={quality:'1k',textured:{},staticGroup:rugScene,realismStatus:{},shadowTexture:null,impacts:rugMarks};
await buildRoomDecor(rugRenderer,{},s=>s,{});
const rugRoot=rugMarks.targets.get('surface_rug').root;const rugSpec=HOTEL_LAYOUT.surface_rug;
assert.ok(rugSpec.decor&&rugSpec.s[1]<=.02);assert.ok(rugRoot.position.distanceTo(new THREE.Vector3(...rugSpec.p))<1e-6);
rugRoot.position.set(0,.009,0);rugRoot.rotation.y=Math.PI/2;rugScene.updateMatrixWorld(true);
const rugHit=rugMarks.cast([0,1.5,0],[0,-1,0],[rugScene]);assert.equal(rugHit.id,'surface_rug');
console.log('Hotel rug root, persistent target and rotated ray hit OK');

// Shared corridor: actual layout, scene and animated remote guests (no GPU).
import {LOBBY_LAYOUT,LOBBY_CAPACITY,lobbyDoor,lobbyDoorAt,lobbyWalkable,pairedRoom,roomHallTransform,hallToRoom} from './lobby_layout.js';
import {NeighborRoomView,HallFacadeViews,hotelOpenings} from './hotel_connections.js';
import {HotelLobbyView} from './hotel_lobby.js';
import {CHARACTER_OPTIONS,DEFAULT_CHARACTER,normalizeCharacter,createCharacter,createHotelNpc,animateCharacter,disposeCharacter,CharacterStudio,sculptedMesh} from './character.js';
{
 const L=LOBBY_LAYOUT;
 assert.equal(LOBBY_CAPACITY,24);assert.equal(L.halfLength*2,132);
 assert.ok(lobbyWalkable(0,0));assert.ok(!lobbyWalkable(L.halfWidth,0));assert.ok(!lobbyWalkable(0,L.halfLength));assert.equal(lobbyDoor(24),null);
 const numbers=new Set();
 for(let i=0;i<LOBBY_CAPACITY;i++){
  const d=lobbyDoor(i);numbers.add(d.number);
  const origin=hallToRoom(i,[d.x,0,d.z]),partner=lobbyDoor(pairedRoom(i)),adjacent=hallToRoom(i,[partner.x,0,partner.z]);
  assert.ok(Math.abs(origin[0])<1e-8&&Math.abs(origin[2]+5.1)<1e-8);
  assert.ok(Math.abs(adjacent[0]-10)<1e-8&&Math.abs(adjacent[2]+5.1)<1e-8);assert.equal(pairedRoom(pairedRoom(i)),i);
  assert.equal(lobbyDoorAt([0,1.65,d.z],[d.side,0,0]).slot,i);
  assert.equal(lobbyDoorAt([0,1.65,d.z+1.3],[d.side,0,0]),null);
  assert.equal(lobbyDoorAt([0,2.7,d.z],[d.side,0,0]),null);
 }
 assert.equal(numbers.size,24);
 const savedDocument=globalThis.document;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}};}};
 try{
  const lobby=new HotelLobbyView({textured:{hotel_carpet:new THREE.MeshStandardMaterial(),hotel_wall:new THREE.MeshStandardMaterial(),hotel_ceiling:new THREE.MeshStandardMaterial()}});
  assert.equal(lobby.signs.length,24);lobby.setOwn(0,{nickname:'Alpha',avatar:DEFAULT_CHARACTER});
  const oldName=lobby.nameplates[1].material.map;lobby.setRooms([{slot:0,nickname:'Alpha'},{slot:1,nickname:'Beta'}]);assert.equal(lobby.roomNames.get(1),'Beta');assert.notEqual(lobby.nameplates[1].material.map,oldName);
  // Regression: recursive room-geometry rays do not have a rendering camera.
  // Hidden sprites are still visited by Three.js raycasting; neither hidden
  // nor visible name labels may require a camera or report a solid hit.
  const noCameraRay=new THREE.Raycaster(new THREE.Vector3(.62,2.13,-1),new THREE.Vector3(0,0,-1));
  assert.equal(noCameraRay.camera,null);
  const npcLabel=lobby.npc.children.find(o=>o.isSprite);assert.ok(npcLabel);
  assert.equal(noCameraRay.intersectObject(npcLabel,true).length,0);
  assert.doesNotThrow(()=>noCameraRay.intersectObject(lobby.guestRoot,true));
  lobby.syncNpc({position:[.62,0,-4],yaw:Math.PI,walking:true});assert.equal(lobby.npc.visible,true);assert.ok(lobby.npc.position.distanceTo(new THREE.Vector3(.62,0,-4))<1e-8);
  lobby.scene.updateMatrixWorld(true);
  assert.equal(noCameraRay.intersectObject(npcLabel,true).length,0);
  assert.doesNotThrow(()=>noCameraRay.intersectObject(lobby.guestRoot,true));
  lobby.syncNpc({position:[.62,0,-3],yaw:Math.PI,walking:true});lobby.greetNpc();lobby.step(.1,{x:0,y:0,z:-3});assert.ok(lobby.npc.position.z>-4&&lobby.npc.position.z<-3);assert.ok(lobby.npcGreeting>0);assert.equal(lobby.npc.userData.hotelGreeting,lobby.npcGreeting);lobby.syncNpc(null);assert.equal(lobby.npc.visible,false);assert.equal(lobby.npc.userData.hotelGreeting,0);
  lobby.sync([{slot:1,position:[0,0,-2],yaw:0}]);assert.equal(lobby.peers.size,1);
  const peerLabel=lobby.peers.get(1).g.userData.nameTag;assert.ok(peerLabel.isSprite);
  assert.equal(noCameraRay.intersectObject(peerLabel,true).length,0);
  assert.doesNotThrow(()=>noCameraRay.intersectObject(lobby.guestRoot,true));
  lobby.sync([{slot:1,position:[0,0,-1],yaw:1}]);lobby.step(.1,{x:0,y:0,z:0,yaw:0});
  assert.ok(lobby.peers.get(1).g.position.z>-2&&lobby.peers.get(1).g.position.z<-1);
  lobby.sync([{slot:1,position:[0,0,-1],yaw:1,stance:'crouch'}]);lobby.step(.1,{x:0,y:0,z:0,yaw:0});assert.ok(lobby.peers.get(1).g.userData.body.position.y<-.1);
  const oldAvatar=lobby.peers.get(1).g;lobby.sync([{slot:1,nickname:'Beta',avatar:{...DEFAULT_CHARACTER,hair:4},position:[0,0,-1],yaw:1}]);assert.notEqual(lobby.peers.get(1).g,oldAvatar);assert.equal(lobby.peers.get(1).g.userData.character.hair,4);
  lobby.sync([{slot:0,position:[0,0,0],yaw:0}]);assert.equal(lobby.peers.size,0);assert.equal(lobby.roomNames.get(1),'Beta');
  const roomScene=new THREE.Scene(),projected=new THREE.Group();roomScene.add(projected);
  // Rays through the north wall must hit corridor geometry, not the old outdoor photo.
  const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  for(const slot of [0,1,12,13,23]){
   lobby.projectInto(projected,slot);assert.equal(lobby.root.parent,projected);assert.equal(lobby.guestRoot.parent,projected);
   assert.equal(lobby.wallSections[slot].visible,false);assert.equal(lobby.doorSections[slot].visible,false);
   const opposite=(slot+L.roomsPerSide)%LOBBY_CAPACITY;assert.equal(lobby.wallSections[opposite].visible,true);
   roomScene.updateMatrixWorld(true);
   for(const x of [-3,3]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,1.4,-4.8),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObject(projected,true).find(h=>visible(h.object));
    assert.ok(hit&&hit.distance>3.5&&hit.distance<4.2,'corridor opposite wall blocks outdoor view');
   }
   lobby.restoreProjection();assert.equal(lobby.root.parent,lobby.scene);assert.equal(lobby.wallSections[slot].visible,true);
  }
  lobby.clear();assert.equal(lobby.own,null);
 }finally{if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
}
console.log('Shared lobby: layout, named doors, avatar interpolation and cleanup OK');
{
 const assertCharacter=(profile)=>{const g=createCharacter(profile);g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g);assert.ok(bounds.max.y>1.55&&bounds.max.y<2.15);assert.ok(bounds.min.y>-.13&&bounds.min.y<.13);assert.equal(g.userData.arms.length,2);assert.equal(g.userData.knees.length,2);let meshes=0;g.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.geometry.attributes.position.count>0);assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));}});assert.ok(meshes>25);animateCharacter(g,.2,true);assert.notEqual(g.userData.legs[0].rotation.x,0);disposeCharacter(g);};
 assert.equal(Object.keys(CHARACTER_OPTIONS).length,15);assert.equal(normalizeCharacter({hair:999}).hair,DEFAULT_CHARACTER.hair);
 for(const [key,opt] of Object.entries(CHARACTER_OPTIONS))for(let i=0;i<opt.values.length;i++)assertCharacter({...DEFAULT_CHARACTER,[key]:i});
 const mesh=sculptedMesh([[0,.1,.1],[1,.1,.1]],12);const normal=mesh.attributes.normal;assert.ok(normal.getZ(0)>0);mesh.dispose();
 const studio=new CharacterStudio();studio.set(DEFAULT_CHARACTER);const old=studio.root;studio.set({...DEFAULT_CHARACTER,skin:0});assert.notEqual(studio.root,old);studio.turn(.3);let renders=0;studio.render({render(scene,camera){assert.equal(scene,studio.scene);assert.equal(camera,studio.camera);renders++;}},1.8,.016);studio.render({render(){renders++;}},.6,.016);assert.equal(renders,2);disposeCharacter(studio.root);
}
{
 const npc=createHotelNpc();assert.equal(npc.userData.hotelNpc,true);assert.equal(npc.userData.hotelGreeting,0);assert.equal(npc.userData.character.model,9);assert.equal(npc.userData.character.top,1);npc.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(npc);
 assert.ok(bounds.max.y>1.85&&bounds.max.y<2.1);assert.ok(bounds.min.y>-.13);
 const c=createCharacter(DEFAULT_CHARACTER);
 for(let i=0;i<20;i++)animateCharacter(c,.05,true,'crouch');
 assert.ok(c.userData.body.position.y<-.3);assert.ok(c.userData.knees[0].rotation.x<-1.5);
 for(let i=0;i<20;i++)animateCharacter(c,.05,true,'sprint');
 assert.ok(Math.abs(c.userData.body.position.y)<.06);assert.ok(c.userData.crouchBlend<.001);
 disposeCharacter(npc);disposeCharacter(c);
}
// Keep only the last completed preview while a replacement is loading.
{
 const studio=new CharacterStudio();studio.set(DEFAULT_CHARACTER);
 const ready=studio.root;ready.userData.realisticStatus='ready';
 studio.set({...DEFAULT_CHARACTER,hair:2});const waiting=studio.root;
 assert.equal(studio.previous,ready);assert.equal(ready.parent,studio.scene);
 studio.set({...DEFAULT_CHARACTER,hair:3});
 assert.equal(waiting.parent,null);assert.equal(studio.previous,ready);
 studio.root.userData.realisticStatus='ready';
 studio.render({render(){}},1.8,.016);
 assert.equal(ready.parent,null);assert.equal(studio.previous,null);
 studio.clear();assert.equal(studio.root,null);
}
console.log('Character models: all variants, concierge, sprint and crouch checks OK');

{
 assert.deepEqual(hotelOpenings({surface_8:[[1,1,3]],surface_6:[[2,2,3]]}),{hall:false,neighbor:false});
 assert.deepEqual(hotelOpenings({surface_9:[[1,1,REMOVED]],surface_6:[[2,2,REMOVED]]}),{hall:true,neighbor:true});
 assert.deepEqual(hotelOpenings({surface_2:[[1,1,REMOVED]],surface_7:[[2,2,REMOVED]]}),{hall:false,neighbor:false});
 const scene=new THREE.Scene(),staticGroup=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0xaabbcc});
 scene.add(staticGroup);
 const east=new THREE.Mesh(new THREE.BoxGeometry(...WALLS.surface_6.s),mat);east.position.set(...WALLS.surface_6.p);staticGroup.add(east);
 const decor=new THREE.Mesh(new THREE.BoxGeometry(...HOTEL_LAYOUT.surface_rug.s),mat);staticGroup.add(decor);
 const table=new THREE.Group();table.add(new THREE.Mesh(new THREE.BoxGeometry(1,.5,.7),mat));
 const rv=new NeighborRoomView({scene,staticGroup,models:{table:{root:table}},walls:{entries:new Map([['surface_6',{mesh:east}]])},impacts:{targets:new Map([['surface_rug',{root:decor}]])},textured:{hotel_wall:mat,hotel_carpet:mat,hotel_ceiling:mat}},HOTEL_LAYOUT);
 assert.ok(!rv.clones.has(east));assert.equal(rv.root.visible,false);
 rv.setVisible(true);rv.setSnapshot({room:{placements:{table:[1,.39,-2]},rotations:{table:90},objects:{table:100},decor:{surface_rug:4},lights_on:false}});
 assert.equal(rv.furnished.visible,true);assert.equal(rv.shell.visible,false);
 assert.equal(rv.items.get('surface_rug').root.visible,false);
 assert.equal(rv.light.intensity,0);assert.equal(rv.items.get('table').root.rotation.y,Math.PI/2);
 scene.updateMatrixWorld(true);const point=rv.items.get('table').root.getWorldPosition(new THREE.Vector3());
 assert.ok(Math.abs(point.x-9)<1e-8&&Math.abs(point.z+2)<1e-8);
 assert.ok(table.position.length()===0);assert.equal(east.visible,true);
 rv.setSnapshot(null);assert.equal(rv.shell.visible,true);assert.equal(rv.furnished.visible,false);
 rv.setVisible(false);assert.equal(rv.root.visible,false);
}
console.log('Connected hotel: 24 aligned rooms, corridor rays, visibility, mirrored neighbour layout and repair gating OK');

{
 const savedDocument=globalThis.document;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}};}};
 try{
  const scene=new THREE.Scene(),staticGroup=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  scene.add(staticGroup);
  const walls=new Map();for(const id of ['surface_8','surface_9','surface_10']){
   const w=WALLS[id],mesh=new THREE.Mesh(new THREE.BoxGeometry(...w.s),material);mesh.position.set(...w.p);staticGroup.add(mesh);walls.set(id,{mesh});
  }
  const renderer={scene,staticGroup,models:{},walls:{entries:walls,edge:material},impacts:{targets:new Map()},textured:{hotel_carpet:material,hotel_wall:material,hotel_ceiling:material}};
  renderer.lobby=new HotelLobbyView(renderer);
  const facade=new HallFacadeViews(renderer,HOTEL_LAYOUT);
  const w=WALLS.surface_9,[u,v]=site(w,6,4),[su,sv]=site(w,2,4),damage={surface_9:[[6,4,4]]};
  for(let slot=0;slot<LOBBY_CAPACITY;slot++){
   facade.sync([{slot,walls:damage}],null,null);
   const entry=facade.entries.get(slot);assert.ok(entry);assert.equal(renderer.lobby.wallSections[slot].wallSolid.visible,false);
   renderer.lobby.scene.updateMatrixWorld(true);
   const origin=entry.group.localToWorld(new THREE.Vector3(0,0,-5.1)),door=lobbyDoor(slot);
   assert.ok(origin.distanceTo(new THREE.Vector3(door.x,0,door.z))<1e-8);
   const cast=(x,y,z,dir)=>new THREE.Raycaster(entry.group.localToWorld(new THREE.Vector3(x,y,z)),new THREE.Vector3(0,0,dir).transformDirection(entry.group.matrixWorld)).intersectObjects(entry.meshes,false);
   for(const [z,dir] of [[-6.9,1],[-4.5,-1]]){
    assert.equal(cast(w.p[0]+u,w.p[1]+v,z,dir).length,0,'same aperture from both faces '+slot);
    assert.ok(cast(w.p[0]+su,w.p[1]+sv,z,dir).length>0,'intact cell blocks '+slot);
   }
   facade.sync([],null,null);assert.equal(facade.entries.size,0);assert.equal(renderer.lobby.wallSections[slot].wallSolid.visible,true);
  }
  facade.sync([],0,{walls:damage});assert.equal(facade.entries.get(0).own,true);
  facade.sync([{slot:0,walls:damage}],0,{walls:{}});assert.equal(facade.entries.size,0);
  facade.sync([{slot:0,walls:{surface_9:[[6,4,3]]}}],null,null);assert.equal(facade.entries.size,0);
 }finally{if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
}
console.log('Shared facade: matching bidirectional holes in all 24 rooms, immediate own repair and remote repair');

import {patrolPose,advancePatrolClock,LOBBY_LAYOUT as patrolLayout} from './lobby_layout.js';
import {stabilizePatrolClip} from './realistic_character.js';
{
 let clock=0,phase=0,age=0,prev=patrolPose(0).position[2];
 for(let i=1;i<=900;i++){
  const dt=1/60;age+=dt;
  if(i%15===0){phase=i*dt-(i%30===0?.08:0);age=0;}
  const next=advancePatrolClock(clock,phase,age,dt);
  assert.ok(next>=clock);const z=patrolPose(next).position[2];
  assert.ok(z>=prev&&z-prev<.05,'Continuous forward patrol without backwards steps');
  clock=next;prev=z;
 }
 const edge=patrolLayout.halfLength-2,turn=(2*edge-4)/patrolLayout.npcSpeed;
 assert.equal(patrolPose(turn+patrolLayout.npcTurnSeconds/2).walking,false);
 assert.ok(Math.abs(patrolPose(turn+patrolLayout.npcTurnSeconds/2).yaw-Math.PI*1.5)<1e-8);
 assert.ok(patrolPose(turn+patrolLayout.npcTurnSeconds+.2).position[2]<edge);
 const model=new THREE.Group(),hip=new THREE.Bone();hip.name='mixamorigHips';hip.position.set(0,1,0);model.add(hip);
 const track=new THREE.VectorKeyframeTrack('mixamorigHips.position',[0,.5,1],[0,1,0,.1,1.1,.4,.2,1.03,.9]);
 const clip=new THREE.AnimationClip('Walk',1,[track]),fixed=stabilizePatrolClip(clip,model).tracks[0].values;
 for(let i=0;i<3;i++){assert.ok(Math.abs(fixed[i*3])<1e-6);assert.ok(Math.abs(fixed[i*3+2])<1e-6);}
 assert.ok(Math.abs(fixed[1]-fixed[7])<1e-6);assert.ok(fixed[4]>fixed[1]);assert.ok(track.values[8]>.8);
}
console.log('Hotel patrol: steady route clock, stationary turns and horizontal root-motion removal verified');

import {freeBounds,freeRay,freePlacement,freeBlocked,freeGround,freeExitAt,validFreeGrid,freeSkyState,freeModelPlacement} from './free_world.js';
import {freeWorldDoorAt} from './lobby_layout.js';
{
 const hit=freeRay([0,1.5,0],[0,-1,0],[]);
 assert.equal(hit.normal[1],1);
 const floor=freePlacement(hit,[2,2,2],[]);
 assert.equal(floor.cell[1],0);
 const blocks=[{...floor,id:1}];
 assert.equal(freePlacement(hit,[2,2,2],blocks),null);
 const top=freeRay([0,2,0],[0,-1,0],blocks);
 assert.equal(top.id,1);
 const stacked=freePlacement(top,[2,1,2],blocks);
 assert.equal(stacked.cell[1],2);
 assert.equal(freeGround(blocks,0,1.2,0),1);
 assert.ok(freeBlocked(blocks,0,.1,0));
 assert.ok(!freeBlocked(blocks,0,1,0));
 assert.equal(freeBounds(stacked).s[1],.5);
 assert.ok(validFreeGrid([0,0,70],[2,2,2]));
 assert.ok(!validFreeGrid([0,0,290],[2,2,2]));
 assert.ok(freeExitAt([0,1.5,148],[0,0,1]));
 assert.ok(freeWorldDoorAt([0,1.5,-64],[0,0,-1]));
 assert.ok(!freeWorldDoorAt([0,1.5,-64],[0,0,1]));
 const wall=freeRay([148,1.5,0],[1,0,0],[]);
 assert.equal(wall.normal[0],-1);
 assert.equal(freePlacement(wall,[1,4,4],[]).cell[0],299);
 assert.ok(!freeBlocked([],149,0,149));assert.ok(freeBlocked([],150,0,150));
}
console.log('Free World raster, wall/floor placement, stacking, collision and portal tests passed');

{
 assert.ok(freeSkyState(.5).day>.99);assert.equal(freeSkyState(0).day,0);
 assert.ok(freeSkyState(.25).twilight>.99);assert.ok(freeSkyState(.75).twilight>.99);
 assert.equal(freeRay([0,23,0],[0,1,0],[]),null);
 const broken={id:2,cell:[-1,0,-1],dims:[2,2,2],hp:0};
 assert.ok(!freeBlocked([broken],0,.1,0));assert.equal(freeGround([broken],0,2,0),0);
 assert.equal(freeRay([0,2,0],[0,-1,0],[broken]).id,null);
 assert.equal(freeRay([0,2,0],[0,-1,0],[broken],8,true).id,2);
}
console.log('Free World open sky, solar cycle and destroyed-object collision checks passed');

{
 const first=freeModelPlacement([10,0,10],.9,90,[]);assert.ok(first);
 assert.equal(first.pose.extent,.9);assert.equal(first.pose.rotation,90);
 const model={id:3,hp:100,...first};assert.equal(freeBounds(model).s[0],.9);
 assert.ok(freeBlocked([model],10,0,10));assert.ok(!freeBlocked([model],11,0,10));
 assert.equal(freeModelPlacement([10,0,10],.4,0,[model]),null);
 assert.ok(freeModelPlacement([11,0,10],.4,180,[model]));
 assert.equal(freeModelPlacement([150,0,0],.9,0,[]),null);
 assert.ok(validFreeGrid([20,0,20],[3,3,3]));
}
console.log('Independent model metric placement, rotation and block grid sizes passed');
