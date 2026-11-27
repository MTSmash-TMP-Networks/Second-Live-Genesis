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
import { ImpactMarks, FreeWorldImpactMarks } from './impact_marks.js';
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
  const oak=new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture()});
  oak.map.repeat.set(3,4);oak.normalMap.repeat.set(2,2);
  const lobby=new HotelLobbyView({textured:{hotel_carpet:new THREE.MeshStandardMaterial(),hotel_wall:new THREE.MeshStandardMaterial(),hotel_ceiling:new THREE.MeshStandardMaterial(),oak_veneer_01:oak}});
  // Every hotel entrance uses the same detailed metric geometry, but retains
  // its own door number, card-reader marker and visibility in room projections.
  const first=lobby.doorSections[0].getObjectByName('Hotel room door assembly');
  assert.ok(first);assert.ok(first.children.length>=7&&first.children.length<=10);
  const doorBox=new THREE.Box3().setFromObject(first.clone(true));
  assert.ok(doorBox.min.x<-.65&&doorBox.max.x>.65&&doorBox.min.y>=-.002);
  assert.ok(doorBox.max.y>2.25&&doorBox.max.y<2.31&&doorBox.max.z>.17&&doorBox.max.z<.25);
  const veneer=first.getObjectByName('Hotel room door assembly / veneer');
  assert.ok(veneer&&veneer.material.map!==oak.map);
  assert.deepEqual(oak.map.repeat.toArray(),[3,4]);assert.deepEqual(oak.normalMap.repeat.toArray(),[2,2]);
  assert.equal(lobby.doorSections.length,LOBBY_CAPACITY);
  for(let i=0;i<LOBBY_CAPACITY;i++){
   const d=lobbyDoor(i),g=lobby.doorSections[i],door=g.getObjectByName('Hotel room door assembly');
   assert.deepEqual(g.position.toArray(),[d.x,0,d.z]);assert.equal(g.rotation.y,-d.side*Math.PI/2);
   assert.ok(door&&g.getObjectByName('Hotel wall sconce'));
   assert.equal(door.getObjectByName('Hotel room door assembly / veneer').geometry,veneer.geometry);
   g.updateWorldMatrix(true,true);
   const front=g.localToWorld(new THREE.Vector3(0,1,.18));
   assert.ok(Math.abs(front.x)<Math.abs(d.x),'door hardware faces corridor');
  }
  const entrance=lobby.root.getObjectByName('Free World double door assembly');
  assert.ok(entrance);assert.ok(entrance.getObjectByName('Free World double door assembly / frost'));
  const downlights=lobby.root.children.filter(o=>o.name==='Hotel recessed downlight');
  assert.equal(downlights.length,43);assert.equal(lobby.wallLightAnchors.length,24);
  const templates=[first,lobby.doorSections[0].getObjectByName('Hotel wall sconce'),downlights[0],entrance];
  for(const template of templates)for(const mesh of template.children){
   assert.ok(mesh.isMesh&&mesh.geometry.attributes.position.count>0);
   assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
  }
  assert.equal(lobby.lights.length,11);assert.ok(lobby.lights.every(l=>!l.castShadow&&l.intensity>0));
  for(const z of [-65,-30,0,30,65]){
   lobby.updateLighting(z);
   for(const [lights,anchors] of [[lobby.ceilingLights,lobby.ceilingLightAnchors],[lobby.wallLights,lobby.wallLightAnchors]]){
    assert.equal(new Set(lights.map(l=>l.position.toArray().join(','))).size,lights.length);
    assert.ok(lights.every(l=>anchors.some(a=>l.position.distanceTo(new THREE.Vector3(...a))<1e-8)));
    const selected=Math.max(...lights.map(l=>Math.abs(l.position.z-z)));
    const all=anchors.map(a=>Math.abs(a[2]-z)).sort((a,b)=>a-b);
    assert.ok(selected<=all[lights.length-1]+1e-8);
   }
  }
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
import {advanceVillageGait,stabilizePatrolClip} from './realistic_character.js';
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

import {freeBounds,freeRay,freePlacement,freeBlocked,freeGround,freeExitAt,freeSecretDoorAt,freeIceCliffData,validFreeGrid,freeSkyState,freeModelPlacement} from './free_world.js';
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

{
 assert.ok(freeSecretDoorAt([48,1.5,-148],[0,0,-1],[]));
 assert.ok(!freeSecretDoorAt([48,1.5,-146],[0,0,-1],[]));
 assert.ok(!freeSecretDoorAt([48,1.5,-148],[0,0,1],[]));
 assert.ok(!freeSecretDoorAt([50,1.5,-148],[0,0,-1],[]));
 assert.ok(!freeSecretDoorAt([48,1.5,-148],[0,0,-1],[{id:9,cell:[95,0,-299],dims:[2,4,1],hp:100}]));
 assert.ok(freeBlocked([],48,0,-150));
 for(let side=0;side<4;side++){
  const d=freeIceCliffData(side),n=d.positions.length/3,top=[];
  assert.ok(n>500&&d.colors.length===n*3&&d.uvs.length===n*2);
  assert.ok(d.positions.every(Number.isFinite)&&d.indices.every(i=>i>=0&&i<n));
  for(let i=0;i<n;i++){const y=d.positions[i*3+1],z=d.positions[i*3+2];if(y<=24)assert.ok(z<=0&&z>=-.120001);else top.push(y);}
  assert.ok(Math.min(...top)>24&&Math.max(...top)-Math.min(...top)>3);
 }
}
console.log('Ice geometry, gate range and collision checks passed');

import { createFlashlight, updateFlashlight } from './flashlight.js';
{
 const room=new THREE.Scene(),hall=new THREE.Scene(),world=new THREE.Scene();
 const light=createFlashlight('1k');
 assert.ok(light.isSpotLight&&light.castShadow&&light.distance===28);
 assert.equal(light.shadow.mapSize.x,512);
 assert.equal(createFlashlight('2k').shadow.mapSize.x,1024);
 const beam={origin:[1,1.65,2],direction:[0,0,-1]};
 updateFlashlight(light,room,beam);assert.equal(light.parent,room);assert.equal(light.target.parent,room);
 assert.ok(Math.abs(light.position.z-1.72)<1e-8);
 assert.ok(light.target.position.z<light.position.z);
 updateFlashlight(light,hall,{origin:[3,1,4],direction:[1,0,0]});assert.equal(light.parent,hall);assert.equal(light.target.parent,hall);
 assert.ok(!room.children.includes(light)&&!room.children.includes(light.target));assert.ok(light.target.position.x>light.position.x);
 updateFlashlight(light,world,beam);assert.equal(light.parent,world);assert.equal(light.target.parent,world);
 updateFlashlight(light,world,null);assert.equal(light.parent,null);assert.equal(light.target.parent,null);
 updateFlashlight(light,world,beam);assert.equal(light.parent,world);
 updateFlashlight(light,world,{origin:[0,0,0],direction:[0,0,0]});assert.equal(light.parent,null);
}
console.log('Phone flashlight: actual Three.js spotlight, aim, scene switch, shadow quality and off state checks passed');

{
 const scenery={id:'building-test',kind:'house',hp:100,bounds:[[-80,0,-30],[10,6,10]]};
 assert.deepEqual(freeBounds(scenery),{p:[-75,3,-25],s:[10,6,10]});
 assert.ok(freeBlocked([scenery],-75,0,-25));
 assert.ok(!freeBlocked([scenery],-69,0,-25));
 assert.equal(freeRay([-68,1.5,-25],[-1,0,0],[scenery]).id,'building-test');
 const tree={id:'tree-test',kind:'tree',hp:100,bounds:[[-40,0,10],[1,6,1]]};
 assert.ok(freeBlocked([tree],-39.5,0,10.5));
 tree.hp=0;assert.ok(!freeBlocked([tree],-39.5,0,10.5));
}
console.log('Hidden village metric scenery collider checks passed');

import {villageParts,villageFaces,villageColliders,villagePartIndex,villagePrismRay,villagePrismOverlap,VillageNpcMotion,villageFallPose,patchVillageShader,VillageDamageMask,VillageRubble} from './village_damage.js';
import {villageTreeParts,VillageForest,VillageRoads} from './village_landscape.js';
{
 const row={id:'building-test',kind:'house',bounds:[[0,0,0],[10,7.5,10]],damage:{}};
 assert.equal(villageParts(row).length,268);
 assert.equal(villageColliders(row).length,6);

 const cell=villageParts(row).find(p=>p.index===villagePartIndex(7,2,3));assert.ok(cell);
 assert.ok(cell.poly.length>=3&&cell.poly.some((p,i)=>{const q=cell.poly[(i+1)%cell.poly.length];return Math.abs(p[0]-q[0])>.01&&Math.abs(p[1]-q[1])>.01;}));
 const [u,v,n]=cell.axes,point=[0,0,0];point[u]=cell.site[0];point[v]=cell.site[1];point[n]=cell.bounds[0][n]+cell.bounds[1][n]/2;
 const origin=[...point];origin[0]=12;const direction=[-1,0,0];
 assert.ok(villagePrismRay(origin,direction,cell,8));
 assert.equal(freeRay(origin,direction,villageParts(row)).id,cell.id);
 assert.ok(villagePrismOverlap(point.map(n=>n-.01),[.02,.02,.02],cell));
 row.damage[cell.index]=3;assert.equal(villageColliders(row).length,6);
 row.damage[cell.index]=4;assert.ok(!villageColliders(row).some(c=>c.poly?villagePrismOverlap(point.map(n=>n-.01),[.02,.02,.02],c):c.bounds[0].every((n,i)=>point[i]>n&&point[i]<n+c.bounds[1][i])));
 assert.equal(villageParts(row).find(p=>p.id===cell.id).hp,0);
 const mask=new VillageDamageMask(row);
 const entry=villageFaces(row).flatMap((f,face)=>f.parts.map((p,j)=>({p,offset:(face*65+j+1)*4}))).find(v=>v.p.index===cell.index);
 assert.equal(mask.data[entry.offset+3],4);
 assert.ok(mask.cuts.geometry.attributes.position.count>0);
 const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());group.add(mesh);
 const release=mask.attach(group);
 const shader={uniforms:{},vertexShader:'void main(){vec3 transformed=position; #include <project_vertex>}',fragmentShader:'void main(){#include <clipping_planes_fragment> #include <color_fragment>}'};
 mesh.material.onBeforeCompile(shader,null);
 assert.ok(shader.fragmentShader.includes('if(villageStage>3.5)discard'));
 assert.ok(shader.fragmentShader.includes('#include <color_fragment>'));
 assert.ok(!shader.fragmentShader.includes('diffuseColor.rgb*=')&&!shader.fragmentShader.includes('float crack='));
 assert.ok(shader.vertexShader.includes('modelMatrix*vec4(transformed,1.0)'));
 assert.ok(!shader.vertexShader.includes('\\n')&&!shader.fragmentShader.includes('\\n'));
 assert.ok(shader.uniforms.villageSites.value===mask.texture);
 row.damage={};mask.update(row);assert.equal(mask.data[entry.offset+3],0);
 assert.equal(mask.cuts.geometry.attributes.position.count,0);
 assert.equal(villageColliders(row).length,6);release();mask.dispose();
 // 4 Hz server snapshots with alternating delay, including 20 FPS frames.
 const motion=new VillageNpcMotion();let position=0,last=0;
 const arrivals=Array.from({length:17},(_,i)=>({stamp:i*.25,arrive:i*.25+[.025,.085,.012,.095][i%4]}));
 let j=0;
 for(let i=0;i<230;i++){
  const time=i/60+(i%7===0?.014:0);
  if(time<last)continue;
  while(j<arrivals.length&&arrivals[j].arrive<=time){const stamp=arrivals[j++].stamp;motion.push({motionTime:stamp,position:[stamp*1.15,0,0],velocity:[1.15,0,0],moving:true,yaw:-Math.PI/2},time*1000);}
  const n=motion.frame(time*1000,time-last);last=time;if(!n)continue;
  assert.ok(n.position[0]>=position-.0001&&n.position[0]-position<.17);position=n.position[0];
  if(time>.8)assert.ok(n.moving);
 }
 assert.ok(position>3.7&&position<4.5);
 assert.equal(villageFallPose(0).tilt,0);assert.ok(villageFallPose(.3).tilt>0&&villageFallPose(.3).tilt<Math.PI/2);
 assert.ok(villageFallPose(.78).fallen);assert.equal(villageFallPose(8).tilt,Math.PI/2);

}
{
 const scene=new THREE.Scene(),trees=new THREE.Group();scene.add(trees);
 const oak={id:'oak',kind:'tree',hp:100,variant:0,height:10,bounds:[[0,0,0],[1,6.5,1]]};
 const pine={...oak,id:'pine',variant:1,bounds:[[5,0,0],[1,6.5,1]]};
 assert.deepEqual(villageTreeParts(oak),villageTreeParts(oak));
 assert.ok(villageTreeParts(oak).filter(p=>p.type==='branch').length>4);
 assert.equal(villageTreeParts(pine).filter(p=>p.type==='pine').length,7);
 const forest=new VillageForest(trees);forest.set([oak,pine]);
 assert.ok(trees.children.length>=4&&trees.children.every(m=>m.isInstancedMesh));
 forest.set([{...oak,hp:0}]);assert.equal(trees.children.length,1);
 assert.equal(villageTreeParts({...oak,hp:0})[0].type,'stump');
 forest.set([oak]);assert.ok(trees.children.length>1);
 const roadRoot=new THREE.Group(),cube=new THREE.BoxGeometry(1,1,1);
 const roads=new VillageRoads(roadRoot,(root,p,s,mat)=>{const o=new THREE.Mesh(cube,mat);o.position.set(...p);o.scale.set(...s);root.add(o);return o;});
 roads.set([{x:0,z:0,w:7,d:57,kind:'street'},{x:4.57,z:0,w:2,d:57,kind:'walk'},{x:0,z:2,w:7,d:3.1,kind:'crosswalk'}]);
 assert.ok(roadRoot.children.length>100);
 assert.ok(roads.materials.street.map.isDataTexture&&roads.materials.walk.map.isDataTexture);
 const count=roadRoot.children.length;
 roads.set([{x:0,z:0,w:7,d:57,kind:'street'},{x:4.57,z:0,w:2,d:57,kind:'walk'},{x:0,z:2,w:7,d:3.1,kind:'crosswalk'}]);assert.equal(roadRoot.children.length,count);
 const rubble=new VillageRubble(scene);rubble.spawn({bounds:[[0,1,0],[1,1,1]]});assert.equal(rubble.items.length,5);rubble.step(.1);rubble.clear();assert.equal(rubble.items.length,0);
}
console.log('Village shell damage, repair masks, NPC interpolation, road and forest checks passed');

// Regression for forward/backward jitter in the Free World NPCs.

{
 const motion=new VillageNpcMotion();
 let lastTime=0,lastPosition=0,lastClock=-Infinity;
 const events=[0,.25,.50,.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75,3,3.25,3.5,3.75,4,4.25,4.5,4.75,5].map((stamp,i)=>({stamp,arrive:stamp+[.03,.1,.01,.08][i%4]})).filter(e=>!(e.stamp>1&&e.stamp<2.25));
 // Long dropout plus a stale packet that arrives out of order after recovery.
 events.push({stamp:1.25,arrive:2.65},{stamp:2.25,arrive:2.70});
 events.sort((a,b)=>a.arrive-b.arrive);
 let j=0;
 for(let frame=0;frame<340;frame++){
  const time=frame/60,dt=time-lastTime;lastTime=time;
  while(j<events.length&&events[j].arrive<=time){
   const s=events[j++].stamp;
   motion.push({motionTime:s,position:[Math.min(s,1.0)*1.15+Math.max(0,s-2.25)*1.15,0,0],velocity:[1.15,0,0],moving:true,yaw:-Math.PI/2},time*1000);
  }
  const n=motion.frame(time*1000,dt);if(!n)continue;
  const p=n.position[0];
  assert.ok(motion.time>=lastClock-1e-8,'display clock must never run backwards');
  assert.ok(p>=lastPosition-1e-8,'NPC must not step backwards on packet arrival');
  assert.ok(p<=motion.samples.at(-1).position[0]+1e-8,'no extrapolation past authoritative position');
  assert.ok(p-lastPosition<.17,'no discontinuous step');
  if(time>1.8&&time<2.2)assert.ok(!n.moving,'stop gait when position stops during dropout');
  lastClock=motion.time;lastPosition=p;
 }
 assert.ok(lastPosition>3.8);
}

{
 const npc=createCharacter(DEFAULT_CHARACTER,{legacyOnly:true,villageNpc:true});assert.equal(npc.userData.villageNpc,true);disposeCharacter(npc);
 const player=createCharacter(DEFAULT_CHARACTER,{legacyOnly:true});assert.equal(player.userData.villageNpc,false);disposeCharacter(player);
}
console.log('Village NPC confirmed-sample interpolation and NPC-specific clip preparation verified');

// Long-running NPC gait at varying render rates, with jitter and a dropped packet.

for(const fps of [8,15,30,60,144]){
 const motion=new VillageNpcMotion(),actions={};
 for(const name of ['idle','walk'])actions[name]={weight:0,rate:1,setEffectiveWeight(v){this.weight=v;return this},setEffectiveTimeScale(v){this.rate=v;return this}};
 const r={actions,time:0,walkWeight:0,mixer:{update(dt){this.clock=(this.clock||0)+dt}}};
 const pace=1.35,events=Array.from({length:61},(_,i)=>({stamp:i*.2,arrive:i*.2+[.018,.055,.011,.095,.034][i%5]})).filter(e=>e.stamp!==4.4);
 let j=0,last=0,first=null,lastTime=0,walkFrames=0;
 for(let i=0;i<=fps*11;i++){
  const now=i/fps;
  while(j<events.length&&events[j].arrive<=now){
   const s=events[j++].stamp,trail=[];
   for(let n=31;n>=0;n--){const t=s-n*.05;if(t>=0)trail.push([t,t*pace,0,0,-Math.PI/2,pace])}
   motion.push({motionTime:s,motionTrail:trail,position:[s*pace,0,0],velocity:[pace,0,0],moving:true,yaw:-Math.PI/2},now*1000);
  }
  const pose=motion.frame(now*1000,now-lastTime);lastTime=now;if(!pose)continue;
  advanceVillageGait(r,pose.delta,pose.moving,pose.playback);
  assert.ok(pose.position[0]>=last-1e-7,'no reverse step at '+fps+' FPS');
  assert.ok(Math.abs(actions.idle.weight+actions.walk.weight-1)<1e-9,'normalized blend');
  last=pose.position[0];
  if(now>2){if(first===null)first={time:now,pos:last};assert.ok(pose.moving,'continuous gait at '+fps+' FPS');assert.ok(pose.playback>=.8&&pose.playback<=1.5,'normal stride rate');assert.ok(actions.walk.weight>.97,'walk stays blended in');walkFrames++}
 }
 const actual=(last-first.pos)/(11-first.time);
 assert.ok(Math.abs(actual-pace)<.09,'steady world speed at '+fps+' FPS: '+actual);
 assert.ok(walkFrames>fps*8);
 // A brief stop fades rather than resetting a clip. The two actions expose no reset method.
 for(let n=0;n<30;n++)advanceVillageGait(r,1/60,false,1);
 assert.ok(actions.walk.weight<.02,'fade to idle');
 for(let n=0;n<30;n++)advanceVillageGait(r,1/60,true,1);
 assert.ok(actions.walk.weight>.98,'resume existing walk');
}

console.log('Village NPC continuous gait, animation blending and low-FPS playback verified');

{
 const root=new THREE.Group(),cube=new THREE.BoxGeometry(1,1,1);
 const roads=new VillageRoads(root,(r,p,s,m)=>{const o=new THREE.Mesh(cube,m);o.position.set(...p);o.scale.set(...s);r.add(o);return o;});
 const plan=[{x:-65,z:-30,w:7,d:57,kind:'street'},{x:-69.57,z:-30,w:2,d:57,kind:'walk'},{x:-60.43,z:-30,w:2,d:57,kind:'walk'}];
 roads.set(plan);
 assert.equal(roads.lights.length,8);
 assert.ok(roads.lights.every(l=>l.isPointLight&&l.intensity===0&&!l.visible&&!l.castShadow));
 assert.ok(roads.lights.every(l=>l.distance===17&&l.decay===2&&l.position.y===3.2));
 assert.equal(new Set(roads.lights.map(l=>l.position.x+','+l.position.z)).size,8);
 roads.setNight(.5);assert.ok(roads.lights[0].intensity>0&&roads.lights[0].intensity<115);
 roads.setNight(1);assert.ok(roads.lights.every(l=>l.visible&&l.intensity===115));assert.ok(roads.lamp.emissiveIntensity>2);
 for(let x=-70.57;x<=-59.43;x+=.5)for(let z=-58.5;z<=-1.5;z+=.5){
  const contribution=roads.lights.reduce((sum,l)=>{const d=Math.hypot(x-l.position.x,z-l.position.z,l.position.y);const cutoff=Math.max(0,1-(d/l.distance)**4)**2;return sum+l.intensity*cutoff*l.position.y/(d*d*d);},0);
  assert.ok(contribution>.1,'street and sidewalk are within the modeled local light coverage');
 }
 const old=roads.lights.slice();roads.set(plan);assert.ok(roads.lights.every((l,i)=>l===old[i]));
 roads.set(plan.concat({x:-65,z:-1,w:3,d:18,kind:'path'}));
 assert.equal(roads.lights.length,8);assert.ok(roads.lights.every(l=>l.intensity===115));
 roads.setNight(0);assert.ok(roads.lights.every(l=>!l.visible&&l.intensity===0));
 assert.equal(roads.lamp.emissiveIntensity,.12);
 roads.set([]);assert.equal(roads.lights.length,0);
 cube.dispose();
}
console.log('Village streetlights: day/night, staggered coverage and scene rebuild checks passed');

{
 function simulateColdNpc(stale,withServerClock){
  const motion=new VillageNpcMotion(),pace=1.35,boot=20,epoch=boot+stale;
  motion.push({motionTime:boot,...(withServerClock?{serverTime:epoch}:{}),position:[0,0,0],moving:false,velocity:[0,0,0],yaw:-Math.PI/2,motionTrail:[]},0);
  const events=[];
  for(let i=1;i<=49;i++){
   const t=i*.25,stamp=epoch+t,trail=[];
   for(let n=31;n>=0;n--){const u=t-n*.05;if(u>=0)trail.push([epoch+u,Math.max(0,u-1)*pace,0,0,-Math.PI/2,u>1?pace:0]);}
   events.push({arrive:t+[.025,.05,.012,.08][i%4],packet:{motionTime:stamp,...(withServerClock?{serverTime:stamp+.018}:{}),motionTrail:trail,position:[Math.max(0,t-1)*pace,0,0],moving:t>1,velocity:[t>1?pace:0,0,0],yaw:-Math.PI/2}});
  }
  let j=0,prev=0,first=null;
  for(let i=0;i<=720;i++){
   const t=i/60;
   while(j<events.length&&events[j].arrive<=t)motion.push(events[j++].packet,t*1000);
   const pose=motion.frame(t*1000,1/60);if(!pose)continue;
   assert.ok(pose.position[0]>=prev-1e-8,'no backward step at cold start');
   if(t>=3){
    if(first===null)first=pose.position[0];
    assert.ok(pose.moving,'gait stays active after first appearance');
    assert.ok(pose.position[0]-prev<.04,'no packet-sized jump');
    assert.ok(motion.samples.at(-1).stamp-motion.time<.8,'timeline recovered');
   }
   prev=pose.position[0];
  }
  const speed=(prev-first)/9;
  assert.ok(Math.abs(speed-pace)<.08,'normal patrol speed: '+speed);
  return speed;
 }
 for(const seconds of [0,3,180,3600])for(const clock of [false,true])simulateColdNpc(seconds,clock);
 const motion=new VillageNpcMotion();
 const trail=Array.from({length:21},(_,i)=>[100+i*.05,i*.05*1.35,0,0,-Math.PI/2,1.35]);
 motion.push({motionTime:101,serverTime:101,position:[1.35,0,0],velocity:[1.35,0,0],moving:true,yaw:-Math.PI/2,motionTrail:trail},2000);
 const initial=motion.frame(2000,0),next=motion.frame(2016,0.016);
 assert.ok(Math.abs(initial.position[0]-.675)<1e-6);
 assert.ok(next.position[0]>initial.position[0]&&next.position[0]-initial.position[0]<.04);
}
console.log('Village NPC cold start, stale simulation timestamps and initial display pose verified');


import {villageReactionPose,applyVillageNpcReaction,resetRoomAvatarPose,applyRoomAvatarPose,applyVillageStaffUniform,applyVillageActivity} from './avatar_room_pose.js';
{
 
for(let frame=0;frame<=360;frame++){
 const phase=frame*Math.PI/30,healthy=villageReactionPose(Infinity,null,[],phase,true);
 assert.equal(healthy.roll,0);assert.equal(healthy.pitch,0);assert.equal(healthy.dip,0);assert.equal(healthy.leftBend,0);assert.equal(healthy.rightBend,0);
 const left=villageReactionPose(1,'left-leg',['left-leg'],phase,true);
 const right=villageReactionPose(1,'right-leg',['right-leg'],phase,true);
 assert.ok(left.roll<0&&right.roll>0);assert.ok(left.leftBend>0&&right.rightBend>0);assert.equal(left.rightBend,0);assert.equal(right.leftBend,0);
 const idle=villageReactionPose(1,'left-leg',['left-leg'],phase,false);
 assert.equal(idle.limp,0);assert.equal(idle.dip,0);
}
const hit=villageReactionPose(.275,'torso',[],0,false);
assert.ok(hit.flinch>.99&&hit.pitch>.20);
assert.equal(villageReactionPose(.55,'torso',[],0,false).flinch,0);
assert.ok(villageFallPose(.36,1,.36).fallen);assert.ok(!villageFallPose(.36).fallen);

 const avatar=createCharacter(DEFAULT_CHARACTER,{legacyOnly:true,villageNpc:true});
 animateCharacter(avatar,1/60,true,'walk');
 const body=avatar.userData.body,before=body.quaternion.clone(),height=body.position.y,knee=avatar.userData.knees[0],kneeBefore=knee.quaternion.clone();
 applyVillageNpcReaction(avatar,{age:.275,zone:'left-leg',legs:['left-leg'],moving:true});
 assert.ok(body.quaternion.angleTo(before)>.05);assert.ok(body.position.y<height);assert.ok(knee.quaternion.angleTo(kneeBefore)>.05);
 resetRoomAvatarPose(avatar);assert.ok(body.quaternion.angleTo(before)<1e-6);assert.ok(Math.abs(body.position.y-height)<1e-6);assert.ok(knee.quaternion.angleTo(kneeBefore)<1e-6);
 disposeCharacter(avatar);
}
{
 const scene=new THREE.Scene(),room=new ShotEffects(scene),world=new ShotEffects(scene,300);
 for(const effect of [room,world])effect.fire({origin:[0,1.58,0],direction:[1,0,0],distance:200,impact:true});
 assert.equal(room.items.find(e=>e.kind==='trail').to.x,8);
 const trail=world.items.find(e=>e.kind==='trail');
 assert.equal(trail.to.x,200);assert.equal(trail.length,200);
 world.update(.05);assert.ok(trail.mesh.position.x>8);
 for(let i=0;i<20;i++)world.update(.05);
 assert.ok(world.items.every(e=>e.kind!=='trail'));
 world.fire({origin:[0,1,0],direction:[1,0,0],distance:400,impact:false});
 assert.equal(world.items.find(e=>e.kind==='trail').to.x,300);
}
console.log('NPC regional reactions, reversible pose overlays and extended Free World tracer regression passed');

{
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial({visible:false}));root.position.set(80,1,0);root.add(mesh);
 const marks=new FreeWorldImpactMarks();
 const impact={id:1,target:'block:1',kind:'block',object:1,origin:[0,1,0],direction:[1,0,0],distance:79.5,severity:1};
 const resolve=()=>[{root,kind:'wall'}];
 marks.syncWorld([impact],resolve);assert.equal(marks.live.size,1);
 const decal=marks.live.get(1);assert.equal(decal.parent,root);assert.ok(decal.geometry.attributes.position.count>0);
 marks.syncWorld([impact],resolve);assert.equal(marks.live.get(1),decal);
 marks.syncWorld([] ,resolve);assert.equal(marks.live.size,0);assert.equal(decal.parent,null);
 marks.syncWorld([impact],()=>[]);assert.equal(marks.live.size,0);
 marks.syncWorld([impact],resolve);assert.equal(marks.live.size,1);
 marks.clearWorld();assert.equal(marks.live.size,0);
}
console.log('Free World hotel-style projected impacts, extended-distance surface projection and cleanup passed');

{
 // Building surfaces, decal masks and shadow materials must never apply
 // a whole-cell crack pattern or color change to surviving original textures.
 for(const kind of ['surface','decal','depth','distance']){
  const shader={uniforms:{},vertexShader:'void main(){ #include <project_vertex> }',fragmentShader:'void main(){ #include <clipping_planes_fragment> #include <color_fragment> }'};
  patchVillageShader(shader,{},kind==='surface');
  assert.ok(shader.fragmentShader.includes('if(villageStage>3.5)discard'));
  assert.ok(shader.fragmentShader.includes('#include <color_fragment>'));
  assert.ok(!shader.fragmentShader.includes('diffuseColor')&&!shader.fragmentShader.includes('float crack='));
 }
}
console.log('Village damage shader clips destroyed cells without painting crack patterns on intact surfaces');

import {preparedDoorTriangles,VillageView} from './village.js';
{
 // Two orientations, closed/open/destroyed door, adjacent intact walls,
 // front face prism clipping after damage, and the original asset leaf split.
 for(const side of [-1,1]){
  const x=side===1?-75:-55,z=-49,row={id:'door-test',kind:'house',variant:0,bounds:[[side===1?x-10:x,0,z-5],[10,7.5,10]],damage:{},door:{side,front:x,z,width:1.06,height:2.4,bounds:[[side===1?x-.85:x,0,z-.53],[.85,2.4,1.06]],open:false}};
  const floor=.1875,origin=[x+side*2,1.6,z],dir=[-side,0,0];
  assert.equal(villageParts(row).length,269);
  assert.ok(freeBlocked(villageColliders(row),x-side*.4,floor,z));
  assert.equal(freeRay(origin,dir,villageColliders(row),4).id,'door-test:448');
  row.door.open=true;
  assert.ok(!freeBlocked(villageColliders(row),x-side*.4,floor,z));
  assert.ok(!freeBlocked(villageColliders(row),x-side*2,floor,z));
  assert.ok(freeBlocked(villageColliders(row),x-side*.4,floor,z+1));
  assert.equal(freeRay(origin,dir,villageColliders(row),4),null);
  assert.equal(freeRay(origin,dir,villageParts(row).filter(p=>!p.doorLeaf),4),null);
  const floorTop=freeGround(villageColliders(row),x-side*.4,.20,z);assert.ok(Math.abs(floorTop-floor)<1e-8);
  // At high render rates a movement step can be shorter than the old
  // 3 cm mismatch between the support and character collision radii.
  const obstacles=villageColliders(row);
  for(const step of [.01,.025,.08]){
   let px=x+side*1.5,py=0;
   for(let i=0;i<Math.ceil(4/step);i++){
    const nx=px-side*step;
    if(!freeBlocked(obstacles,nx,py,z)){px=nx;}
    else{
     const top=freeGround(obstacles,nx,py+.20,z);
     if(top>py+.001&&top-py<=.20&&!freeBlocked(obstacles,nx,top,z)){px=nx;py=top;}
    }
    py=freeGround(obstacles,px,py,z);
   }
   assert.ok((x-px)*side>2.4,'walk across the doorway threshold without jumping');
   assert.ok(Math.abs(py-floor)<1e-8);
  }
  row.door.open=false;row.damage[448]=4;
  assert.ok(!freeBlocked(villageColliders(row),x-side*.4,floor,z));
  delete row.damage[448];assert.ok(freeBlocked(villageColliders(row),x-side*.4,floor,z));
  const mask=new VillageDamageMask(row);assert.equal(mask.uniforms.villageHasDoor.value,1);mask.dispose();
 }
 const makeGeometry=(count,start,length,tris)=>({attributes:{position:{count,getX:()=>0,getY:()=>1,getZ:()=>4.9}},index:{array:Array.from({length:tris*3},(_,i)=>start+i%length)}});
 const g=makeGeometry(3960,856,268,184);assert.equal(preparedDoorTriangles('shop-a','MI_Trim_MetalConcrete',g).take.length,552);
 assert.equal(preparedDoorTriangles('shop-b','MI_Trim_MetalConcrete',g),null);
 assert.equal(preparedDoorTriangles('shop-a','MI_Trim_MetalConcrete',makeGeometry(3960,856,268,183)),null);
 const fake=new THREE.Group();fake.rotation.y=0;const view={buildings:new Map([['test',{doorPivot:fake,doorAngle:-Math.PI/2}]])};
 for(let i=0;i<60;i++)VillageView.prototype.step.call(view,1/60);
 assert.ok(Math.abs(fake.rotation.y+Math.PI/2)<.001);
}
console.log('Village doors: physical opening, closed/destroyed leaf, asset extraction and animation verified');

import {VillageInterior,makeInteriorProp,interiorMaterials} from './village_interior.js';
{
 const types=['sofa','coffee','media','bed','dresser','kitchen','dining','chair','bookcase','shelf','checkout','produce','crate','cafe-counter','cafe-table','lamp','plant'];
 const materials=interiorMaterials(),root=new THREE.Group(),interior=new VillageInterior(root);
 const row={id:'interior-test',kind:'house',bounds:[[0,0,0],[10,7.5,10]],damage:{},interior:types.map((type,i)=>({index:512+i,type,theme:'home',side:1,bounds:[[i*3,.1875,0],[1.4,1.86,2.1]]}))};
 interior.set([row]);assert.equal(interior.entries.size,types.length);
 for(const item of row.interior){
  const e=interior.get(row.id+':'+item.index),box=new THREE.Box3().setFromObject(e.root);
  assert.ok(!box.isEmpty()&&[...box.min.toArray(),...box.max.toArray()].every(Number.isFinite));
  assert.ok(e.root.children.some(m=>m.isMesh));
 }
 const lamp=interior.get(row.id+':'+(512+types.indexOf('lamp'))),pos=lamp.root.position;
 interior.setNight(0,{x:pos.x,z:pos.z});assert.ok(lamp.root.userData.interiorLight.visible);
 const day=lamp.root.userData.interiorLight.intensity;
 interior.setNight(1,{x:pos.x,z:pos.z});assert.ok(lamp.root.userData.interiorLight.intensity>day);
 const furniture=villageParts(row).filter(p=>p.furniture);
 assert.equal(furniture.length,types.length);assert.ok(villageColliders(row).some(p=>p.id===furniture[0].id));
 row.damage[furniture[0].index]=4;interior.set([row]);
 assert.ok(!interior.get(furniture[0].id).root.visible);
 assert.ok(!villageColliders(row).some(p=>p.id===furniture[0].id));
 delete row.damage[furniture[0].index];interior.set([row]);assert.ok(interior.get(furniture[0].id).root.visible);
 interior.set([]);assert.equal(root.children.length,0);
}
console.log('Village furniture meshes, collision, repair and interior lighting verified');

{
 const avatar=createCharacter(DEFAULT_CHARACTER,{legacyOnly:true});
 animateCharacter(avatar,1/60,false,'walk');const body=avatar.userData.body,original=body.position.y;
 applyRoomAvatarPose(avatar,{kind:'sit',hip:.69},null);
 assert.ok(Math.abs(body.position.y-(.69-.925*avatar.userData.height))<1e-7);
 assert.ok(Math.abs(avatar.userData.legs[0].rotation.x-1.30)<1e-7);
 resetRoomAvatarPose(avatar);assert.ok(Math.abs(body.position.y-original)<1e-7);
 disposeCharacter(avatar);
}
console.log('Free World chair pose and standing restoration verified');

{
 for(const [role,model,topColor] of [['market',14,3],['cafe',5,0]]){
  const g=createCharacter({...DEFAULT_CHARACTER,model,top:2,topColor},{legacyOnly:true,villageNpc:true});
  const apron=applyVillageStaffUniform(g,role);
  assert.equal(apron.parent,g.userData.body);assert.equal(apron.children.length,4);
  assert.equal(applyVillageStaffUniform(g,role),apron);
  assert.equal(apron.children[0].material.color.getHex(),role==='market'?0x315c47:0x633e32);
  for(const mesh of apron.children)assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
  const arm=g.userData.arms[0],before=arm.quaternion.clone(),p=g.position.clone();
  for(let i=0;i<60;i++){resetRoomAvatarPose(g);applyVillageActivity(g,role==='market'?'checkout':'barista',false,1/60);}
  assert.ok(arm.quaternion.angleTo(before)>.025);assert.ok(g.position.equals(p));
  resetRoomAvatarPose(g);assert.ok(arm.quaternion.angleTo(before)<1e-6);
  disposeCharacter(g);
 }
 const player=createCharacter(DEFAULT_CHARACTER,{legacyOnly:true});
 assert.equal(applyVillageStaffUniform(player,'market'),null);disposeCharacter(player);
}
console.log('Free World shop staff uniforms, apron geometry and reversible work poses verified');

import {WEATHER_SECONDS,freeWeatherState,WeatherClock,RainShelter,FreeWeather} from './free_weather.js';
import {rainLoopWave,soundWave} from './audio.js';

{
 const period=WEATHER_SECONDS,base=period*3712345;
 assert.equal(freeWeatherState(base+40).label,'Heiter');
 assert.equal(freeWeatherState(base+128).label,'Bewölkt');
 assert.equal(freeWeatherState(base+200).label,'Regen');
 assert.equal(freeWeatherState(base+300).label,'Gewitter');
 assert.equal(freeWeatherState(base+470).rain,0);
 for(let t=0;t<period;t+=.1){
  const s=freeWeatherState(base+t),next=freeWeatherState(base+t+.1);
  assert.ok([s.cloud,s.rain,s.storm,s.flash].every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.ok(Math.abs(next.cloud-s.cloud)<.01&&Math.abs(next.rain-s.rain)<.01&&Math.abs(next.storm-s.storm)<.015);
 }
 assert.ok(Math.abs(freeWeatherState(base+period-.001).cloud-freeWeatherState(base+period).cloud)<1e-6);
 const flashes=new Set();
 for(let t=264;t<342;t+=.025){const s=freeWeatherState(base+t);if(s.flash>0){assert.ok(s.strike&&s.strike.age<.42);flashes.add(s.strike.id);}}
 assert.equal(flashes.size,5);
 const a=new WeatherClock(),b=new WeatherClock();a.sync(base,1000);b.sync(base,9000);
 assert.equal(a.time(1200),b.time(9200));
 a.sync(base+.19,1200);assert.ok(a.time(1200)>=base+.2-1e-7);
 a.sync(base+5,1400);assert.equal(a.time(1400),base+5);
 a.reset();assert.equal(a.time(2000),0);
 const roof={id:'roof',bounds:[[-25,6,-25],[50,.5,50]],hp:100};
 const shelter=new RainShelter(b=>b.bounds,freeRay);
 shelter.set([roof]);assert.equal(shelter.height(0,0),6.5);assert.equal(shelter.height(0,0,true),6.5);assert.equal(shelter.height(40,0),0);
 roof.hp=0;shelter.set([roof]);assert.equal(shelter.height(0,0),0);roof.hp=100;
 const scene=new THREE.Scene(),sky=new THREE.Group(),weather=new FreeWeather(scene,sky,b=>b.bounds,freeRay);scene.add(sky);
 weather.setObstacles([roof]);weather.sync(base+300,1000);
 let state=weather.update(1000,{x:0,y:0,z:0},{day:1,twilight:0});
 assert.ok(state.sheltered&&state.rain===1&&weather.rain.visible);
 assert.ok(weather.rainGeometry.drawRange.count>0&&weather.rainGeometry.drawRange.count<=2800);
 for(let i=0;i<weather.rainGeometry.drawRange.count;i++)assert.ok(weather.positions[i*3+1]>=6.5);
 roof.hp=0;weather.setObstacles([roof]);
 state=weather.update(1050,{x:0,y:0,z:0},{day:1,twilight:0});
 assert.ok(!state.sheltered);assert.ok(Array.from({length:weather.rainGeometry.drawRange.count/2},(_,i)=>weather.positions[i*6+1]).some(y=>y<6));
 let event=null;for(let t=264;t<290;t+=.02){const s=freeWeatherState(base+t);if(s.flash>.2){event={time:base+t-s.strike.age,...s.strike};break;}}
 assert.ok(event);
 weather.clear();weather.sync(event.time+.18,2000);weather.update(2000,{x:event.x,y:0,z:event.z},{day:0,twilight:0});
 assert.ok(weather.bolt.visible);assert.equal(weather.boltGeometry.drawRange.count,44);
 assert.ok([...weather.boltPositions].every(Number.isFinite));
 let thunder=0;for(let i=1;i<=180;i++){state=weather.update(2000+i*1000/60,{x:event.x,y:0,z:event.z},{day:0,twilight:0});if(state.thunder)thunder++;}
 assert.equal(thunder,1);
 weather.clear();assert.ok(!weather.rain.visible&&!weather.bolt.visible);assert.equal(weather.rainGeometry.drawRange.count,0);
}
{
 for(const rate of [16000,44100,48000]){
  const rain=rainLoopWave(rate),thunder=soundWave('thunder',rate);
  assert.equal(rain.length,rate*4);assert.equal(thunder.length,Math.ceil(rate*3.2));
  assert.ok(rain.every(x=>Number.isFinite(x)&&Math.abs(x)<1));
  assert.ok(thunder.every(x=>Number.isFinite(x)&&Math.abs(x)<=.851));
  assert.ok(Math.abs(rain[0]-rain.at(-1))<.5);
  assert.ok(thunder.some(x=>Math.abs(x)>.025));assert.equal(thunder[0],0);
  // Every synthesized effect and variant must start at canonical silence.
  // Keep the strict zero assertion so signed-zero regressions cannot slip through.
  for(const kind of ['shot','click','reload','impact','phone','door','thunder']){
   for(let variant=0;variant<4;variant++){
    const wave=kind==='thunder'&&variant===0?thunder:soundWave(kind,rate,variant);
    assert.equal(wave[0],0,`${kind} variant ${variant} at ${rate} Hz`);
    assert.ok(wave.every(Number.isFinite));
   }
  }
 }
}

console.log('Free World weather cycle, lightning, shelters and audio checks passed');

import {terrainHeight,terrainRay,terrainGeometry,terrainMaxHeight,trailGeometry,lakeGeometry} from './free_terrain.js';
import {foliageCardTexture,foliageCluster} from './free_nature.js';
{
 const heights=new Array(151*151).fill(0),k=75*151+75;heights[k]=1000;heights[k+1]=1200;heights[k+151]=1400;heights[k+152]=1600;
 const doc={version:1,half:150,step:2,heights,lakes:[],paths:[]};
 assert.equal(terrainHeight(doc,.5,.5),11.5);assert.equal(terrainHeight(doc,1.5,1.5),14.5);
 assert.equal(terrainMaxHeight(doc,[0,0,0],[2,1,2]),16);
 assert.ok(Math.abs(terrainRay(doc,[.5,20,.5],[0,-1,0],20).dist-8.5)<.001);
 const mesh=terrainGeometry(doc);assert.equal(mesh.attributes.position.count,151*151);assert.equal(mesh.attributes.position.getY(k),10);mesh.dispose();
 const trail=trailGeometry(doc,[[-5,-5],[0,0],[5,5]]);assert.ok(trail.attributes.position.array.every(Number.isFinite));trail.dispose();
 const lake=lakeGeometry(doc,{x:20,z:30,rx:6,rz:5,level:.72});assert.ok(lake.attributes.position.count>0);assert.ok(Math.abs(lake.attributes.position.getY(0)-.726)<.001);lake.dispose();
 for(const pine of [false,true]){const map=foliageCardTexture(pine),g=foliageCluster(pine);assert.ok(map.image.data.some((v,i)=>i%4===3&&v===0));assert.ok(map.image.data.some((v,i)=>i%4===3&&v===255));assert.ok(g.attributes.position.count>32);map.dispose();g.dispose();}
}
console.log('Natural terrain, lake geometry and foliage checks passed');

import {roadStations,roadGeometry,NatureSurface} from './free_nature.js';
{
 const heights=new Array(151*151).fill(0);
 // Exact uniform grade: all road vertices must stay on the heightfield,
 // including the wider gravel shoulder, round junctions and white paint.
 for(let z=0;z<151;z++)for(let x=0;x<151;x++)heights[z*151+x]=x*8;
 const doc={version:1,half:150,step:2,heights,lakes:[],paths:[],roadJunctions:[[0,0]],
  roads:[{id:'west',width:6,points:[[-25,-8],[-15,-8],[-8,-3],[0,0]]},
         {id:'east',width:6,points:[[0,0],[12,0],[25,5]]},
         {id:'south',width:6,points:[[0,0],[0,25]]}]};
 const stations=roadStations(doc.roads[0].points);
 assert.equal(stations[0].x,-25);assert.equal(stations.at(-1).x,0);
 assert.ok(stations.every((s,i)=>Number.isFinite(s.ox)&&Number.isFinite(s.oz)&&(!i||s.d>stations[i-1].d)));
 const layers=roadGeometry(doc);
 for(const [kind,g] of Object.entries(layers)){
  const p=g.attributes.position,n=g.attributes.normal;
  assert.ok(p.count>0&&g.index.count>0);
  for(let i=0;i<p.count;i++){
   const h=p.getY(i)-terrainHeight(doc,p.getX(i),p.getZ(i));
   assert.ok(h>.06&&h<.11,kind+' follows the actual terrain');
   assert.ok(n.getY(i)>.75,kind+' faces upward');
   if(kind==='paint')assert.ok(Math.hypot(p.getX(i),p.getZ(i))>3.0,'markings stop at the intersection');
  }
  g.dispose();
 }
 const root=new THREE.Group(),tex=new THREE.DataTexture(new Uint8Array([100,120,90,255]),1,1);
 const flat=new THREE.PlaneGeometry(300,300),ground=new THREE.Mesh(flat,new THREE.MeshStandardMaterial({map:tex}));root.add(ground);
 const nature=new NatureSurface(root,ground,{});
 nature.set(doc);
 assert.equal(nature.details.children.filter(m=>m.name.startsWith('Country roads /')).length,3);
 nature.update(1000,1,{rain:1,storm:.5},new THREE.Color(0xabccee),new THREE.Vector3(0,1,0));
 assert.ok(nature.roadMaterials.asphalt.roughness<.6);
 nature.clear();assert.equal(nature.details.children.length,0);assert.equal(ground.geometry,flat);
 nature.set(doc);assert.equal(nature.details.children.length,3);nature.clear();
}
console.log('Country roads, terrain-following meshes, junction markings and wet asphalt verified');

import {TrafficView,vehicleBlocked,nearestVehicle} from './free_traffic.js';
{
 const scene=new THREE.Scene(),traffic=new TrafficView(scene);
 const row={id:'car-test',kind:'taxi',color:'#efbd28',position:[0,0,0],yaw:0,speed:4,steer:.5,brake:true,indicator:1,npc:true,driverSlot:null,avatar:null};
 assert.ok(vehicleBlocked([row],0,0,0));assert.ok(!vehicleBlocked([row],4,0,0));
 assert.equal(nearestVehicle([row],{x:2,y:0,z:0}).id,row.id);
 assert.equal(nearestVehicle([{...row,driverSlot:0}],{x:2,y:0,z:0}),null);
 traffic.sync([row]);
 const a=traffic.cars.get(row.id);assert.equal(a.model.wheels.length,4);
 assert.equal(a.model.root.name,'Sculpted local taxi');
 const shell=a.model.root.getObjectByName('Curved bonnet and body crown');assert.ok(shell&&shell.geometry.attributes.position.count>1000);
 assert.ok(shell.geometry.attributes.position.array.every(Number.isFinite));
 assert.ok(a.model.root.userData.ownedPaint.isMeshPhysicalMaterial);
 assert.ok(a.model.root.userData.ownedPaint.clearcoat>.5);
 const pose=traffic.step(.1,{x:0,y:0,z:0},row.id,false,1);
 assert.equal(pose.speed,4);assert.ok(a.lights.head.emissiveIntensity>2);
 assert.ok(Math.abs(a.model.wheels[0].spin.rotation.x)>.5);
 assert.ok(Math.abs(a.model.wheels[0].pivot.rotation.y)>.1);
 traffic.sync([{...row,position:[1,0,-2]}]);traffic.step(.1,{x:0,y:0,z:0},row.id,false,1);
 assert.ok(a.root.position.z<0);
 traffic.clear();assert.equal(traffic.cars.size,0);assert.equal(scene.children.length,0);
}
console.log('Traffic fallback models, rotating wheels, vehicle targeting and cleanup verified');

import {normalizeVehicleTemplate,premiumModelSpec,createImportedVehicle} from './free_traffic.js';
{
 const names=['boxy-off-roader','grand-tourer','luxury-suv','mid-engine-supercar','muscle-coupe'];
 assert.equal(premiumModelSpec('__proto__'),null);
 for(const name of names){
  const spec=premiumModelSpec(name),raw=new THREE.Group();
  const paint=new THREE.MeshPhysicalMaterial({color:0x992222,clearcoat:.8});paint.name=spec.paint;
  const body=new THREE.Mesh(new THREE.BoxGeometry(...spec.size),paint);body.name='Body';
  body.position.set(0,spec.minY+spec.size[1]/2,-spec.centerZ);raw.add(body);
  for(const [i,key] of ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'].entries()){
   const wheel=new THREE.Mesh(new THREE.BoxGeometry(.2,.6,.6),new THREE.MeshStandardMaterial());wheel.name=key;
   wheel.position.set(i%2===0?.7:-.7,.31,i<2?1.3:-1.3);raw.add(wheel);
  }
  const steering=new THREE.Group();steering.name='Steering_Wheel';raw.add(steering);
  steering.position.set(spec.hip[0],spec.hip[1]+.25,spec.hip[2]+.5);
  const model=normalizeVehicleTemplate(raw,name),d=model.userData.driver;
  assert.ok(Math.abs(model.scale.x-model.scale.y)<1e-9&&Math.abs(model.scale.y-model.scale.z)<1e-9);
  const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  assert.ok(size.x<=1.951&&size.z<=4.801&&size.y<=1.741);
  assert.ok(d.eye[0]<0&&d.eye[1]>.65&&d.eye[1]<d.roof);
  assert.ok(d.position.every(Number.isFinite)&&d.scale>0);
  const front=model.getObjectByName('Wheel_FL').getWorldPosition(new THREE.Vector3());
  const rear=model.getObjectByName('Wheel_RL').getWorldPosition(new THREE.Vector3());assert.ok(front.z<rear.z);
  const taxi=name==='luxury-suv';
  const instance=createImportedVehicle(model,{kind:taxi?'taxi':'sedan',color:'#336699'});
  assert.equal(instance.wheels.length,4);assert.ok(instance.steering&&instance.steeringBase&&instance.premium);
  assert.equal(instance.root.getObjectByName('Body').material.color.getHex(),taxi?0xefbd28:0x336699);
  assert.equal(paint.color.getHex(),0x992222);
  assert.equal(!!instance.root.getObjectByName('Premium taxi roof sign'),taxi);
  for(const m of instance.root.userData.ownedMaterials)m.dispose();
  raw.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
 }
}
console.log('Premium vehicle orientation, proportional scaling, driver seats, steering pivots and taxi repaint verified');
