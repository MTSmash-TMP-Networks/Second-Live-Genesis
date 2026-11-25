import * as THREE from 'three';
import { WALLS, REMOVED, wallSignature } from './wall_layout.js';
import { wallGeometry } from './wall_mesh.js';
import { roomHallTransform, lobbyDoor } from './lobby_layout.js';
import { PORTAL_SIDES } from './portal_door.js';
const ENTRANCE=['surface_8','surface_9','surface_10'];
import { curtainPose } from './architecture.js';

// A wall is open only if a physical wall cell has actually been removed.
// Scratches, cracks and bullet marks alone must not reveal neighbouring rooms.
export function hotelOpenings(walls={}){
 const open=id=>Array.isArray(walls[id])&&walls[id].some(c=>Array.isArray(c)&&c[2]>=REMOVED);
 return {hall:['surface_8','surface_9','surface_10'].some(open),neighbor:open('surface_6')};
}
export class NeighborRoomView{
 constructor(r,spec,{hall=false}={}){
  this.root=new THREE.Group();this.root.name='Adjacent hotel room (read-only view)';this.root.position.x=10;this.root.scale.x=-1;this.root.visible=false;r.scene.add(this.root);
  this.furnished=new THREE.Group();this.shell=new THREE.Group();this.root.add(this.furnished,this.shell);
  this.clones=new Map();this.items=new Map();this.decor=new Map();this.materials=new Map();this.baseEmission=new Map();this.spec=spec;
  const exclude=new Set((hall?ENTRANCE.map(id=>r.walls.entries.get(id)?.mesh):[r.walls.entries.get('surface_6')?.mesh,r.impacts.targets.get('surface_trim_e')?.root,r.impacts.targets.get('surface_crown_e')?.root,r.impacts.targets.get('surface_outlet')?.root]).filter(Boolean));
  // Copy the pristine meshes before any personal save is loaded. Share geometry
  // but isolate materials, visibility and transforms from the player's own room.
  const material=m=>{if(!this.materials.has(m)){const c=m.clone();this.materials.set(m,c);this.baseEmission.set(c,c.emissiveIntensity||0);}return this.materials.get(m);};
  const copy=(o,parent)=>{
   if(!o||exclude.has(o)||o.isLight||o.isCamera||(hall&&o.name==='Door wall infill'))return null;
   const n=o.clone(false);this.clones.set(o,n);
   if(o.isMesh){n.material=Array.isArray(o.material)?o.material.map(material):material(o.material);n.castShadow=false;n.receiveShadow=false;}
   parent.add(n);
   for(const child of o.children)copy(child,n);
   return n;
  };
  for(const o of r.staticGroup.children)copy(o,this.furnished);
  // Movable non-decor assets are normally in the dynamic group. Clone only
  // the actual model roots, not projectiles, damage marks or the local player.
  for(const [id,entry] of Object.entries(r.models)){
   if(!spec[id])continue;
   const n=copy(entry.root,this.furnished);if(n){n.visible=true;this.items.set(id,{root:n,centered:!!entry.centered});}
  }
  for(const [id,target] of r.impacts.targets){
   const n=this.clones.get(target.root);if(!n)continue;
   if(id.startsWith('surface_')&&!WALLS[id])this.decor.set(id,n);
   if(spec[id]?.decor)this.items.set(id,{root:n,centered:id!=='surface_bed'});
  }
  // Vacant room is a real empty room rather than the exterior sky. A floor,
  // ceiling and the other partitions form a closed background for the hole.
  const box=(p,s,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(...s),m);o.position.set(...p);this.shell.add(o);};
  for(const [id,w] of Object.entries(WALLS)){
   if(hall?ENTRANCE.includes(id):id==='surface_6')continue;
   const m=w.kind==='floor'?r.textured.hotel_carpet:w.kind==='ceiling'?r.textured.hotel_ceiling:r.textured.hotel_wall;
   box(w.p,w.s,m);
  }
  if(!hall)box([0,1.1,-5],[2,2.2,.2],r.textured.hotel_wall);
  this.light=new THREE.PointLight(0xffe6c6,12,6,2);this.light.position.set(0,2.72,0);this.root.add(this.light);this.light.intensity=0;
  this.furnished.visible=false;this.shell.visible=true;
 }
 setSnapshot(snapshot){
  const state=snapshot?.room;
  this.furnished.visible=!!state;this.shell.visible=!state;
  this.light.intensity=state?.lights_on===false||!state?0:12;
  if(!state)return;
  for(const [id,root] of this.decor)root.visible=(state.decor?.[id]||0)<REMOVED;
  for(const [id,entry] of this.items){
   const spec=this.spec[id],p=state.placements?.[id]||spec.p,a=(state.rotations?.[id]||0)*Math.PI/180;
   entry.root.visible=spec.decor?(state.decor?.[id]||0)<REMOVED:(state.objects?.[id]??spec.max)>0;
   entry.root.rotation.set(0,id==='window'?0:a,0);
   entry.root.position.set(...p);
   if(!entry.centered)entry.root.position.y-=spec.s[1]/2;
  }
  for(const [side,id] of [['left','surface_curtain_l'],['right','surface_curtain_r']]){
   const root=this.decor.get(id);if(!root)continue;
   const p=curtainPose(side,state.curtains_closed?1:0);root.scale.z=p.scale;root.position.z=p.offset;
  }
  // Keep the neighbour's lighting independent of the local room switch.
  for(const [copy,base] of this.baseEmission)if(copy.emissive)copy.emissiveIntensity=state.lights_on===false?0:base;
 }
 setVisible(on){this.root.visible=!!on;}
}

// A facade occupies the exact inverse of the existing hall-to-room transform.
// Both faces of every opening use the same Voronoi-prism geometry, including
// fracture edges. No extra database, independent hall damage or duplicate hole.
export class HallFacadeViews{
 constructor(r,spec){
  this.lobby=r.lobby;this.wall=r.textured.hotel_wall;this.edge=r.walls.edge;this.entries=new Map();
  // Pristine copies are captured before a saved game is loaded. Other guests'
  // private furnishings are not transmitted; use a standard hotel room for them.
  this.template=new NeighborRoomView(r,spec,{hall:true});
  this.ownView=new NeighborRoomView(r,spec,{hall:true});
  for(const view of [this.template,this.ownView]){
   view.root.removeFromParent();view.root.position.set(0,0,0);view.root.scale.set(1,1,1);view.root.visible=true;
   view.setSnapshot({room:{}});view.light.intensity=0;
  }
 }
 remove(slot){
  const e=this.entries.get(slot);if(!e)return;
  if(this.ownView.root.parent===e.group)this.ownView.root.removeFromParent();
  e.group.removeFromParent();for(const mesh of e.meshes)mesh.geometry.dispose();
  this.lobby.wallSections[slot].wallSolid.visible=true;this.entries.delete(slot);
 }
 sync(rows,ownSlot,state){
  if(!Array.isArray(rows))return;
  const next=new Map();
  for(const row of rows){
   if(!lobbyDoor(row?.slot)||!row.walls)continue;
   const walls={};
   for(const id of ENTRANCE){
    const w=WALLS[id],cells=row.walls[id];
    if(!Array.isArray(cells))continue;
    walls[id]=cells.filter(c=>Array.isArray(c)&&Number.isInteger(c[0])&&Number.isInteger(c[1])&&c[0]>=0&&c[0]<w.cols&&c[1]>=0&&c[1]<w.rows&&c[2]===REMOVED);
   }
   if(ENTRANCE.some(id=>walls[id]?.length))next.set(row.slot,walls);
  }
  // Own authoritative state overrides a cached public snapshot immediately.
  if(lobbyDoor(ownSlot)&&state?.walls){
   if(hotelOpenings(state.walls).hall)next.set(ownSlot,state.walls);
   else next.delete(ownSlot);
  }
  for(const slot of this.entries.keys())if(!next.has(slot))this.remove(slot);
  for(const [slot,walls] of next){
   const signature=ENTRANCE.map(id=>wallSignature(walls[id]||[])).join('|'),own=slot===ownSlot;
   let e=this.entries.get(slot);
   if(e&&(e.signature!==signature||e.own!==own)){this.remove(slot);e=null;}
   if(!e){
    const group=new THREE.Group(),t=roomHallTransform(slot);
    group.name='Shared entrance partition '+slot;
    group.matrix.compose(new THREE.Vector3(...t.p),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),t.rotation),new THREE.Vector3(1,1,t.mirror)).invert();
    group.matrixAutoUpdate=false;group.matrixWorldNeedsUpdate=true;
    const section=this.lobby.wallSections[slot];section.add(group);section.wallSolid.visible=false;
    const meshes=[],add=(geo,p,material)=>{
     const mesh=new THREE.Mesh(geo,material);mesh.position.set(...p);mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);
    };
    for(const id of ENTRANCE){
     const w=WALLS[id],cells=walls[id]||[],damaged=!!wallSignature(cells);
     add(damaged?wallGeometry(w,cells):new THREE.BoxGeometry(...w.s),w.p,damaged?[this.wall,this.edge]:this.wall);
    }
    for(const side of PORTAL_SIDES)add(new THREE.BoxGeometry(...side.s),side.p,this.wall);
    if(own)group.add(this.ownView.root);
    else group.add(this.template.furnished.clone(true));
    e={group,meshes,signature,own,state:null};this.entries.set(slot,e);
   }
   if(own&&e.state!==state){
    this.ownView.setSnapshot({room:state||{}});this.ownView.light.intensity=0;e.state=state;
   }
  }
 }
}
