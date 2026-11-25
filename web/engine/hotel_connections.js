import * as THREE from 'three';
import { WALLS, REMOVED } from './wall_layout.js';
import { curtainPose } from './architecture.js';

// A wall is open only if a physical wall cell has actually been removed.
// Scratches, cracks and bullet marks alone must not reveal neighbouring rooms.
export function hotelOpenings(walls={}){
 const open=id=>Array.isArray(walls[id])&&walls[id].some(c=>Array.isArray(c)&&c[2]>=REMOVED);
 return {hall:['surface_8','surface_9','surface_10'].some(open),neighbor:open('surface_6')};
}
export class NeighborRoomView{
 constructor(r,spec){
  this.root=new THREE.Group();this.root.name='Adjacent hotel room (read-only view)';this.root.position.x=10;this.root.scale.x=-1;this.root.visible=false;r.scene.add(this.root);
  this.furnished=new THREE.Group();this.shell=new THREE.Group();this.root.add(this.furnished,this.shell);
  this.clones=new Map();this.items=new Map();this.decor=new Map();this.materials=new Map();this.baseEmission=new Map();this.spec=spec;
  const exclude=new Set([r.walls.entries.get('surface_6')?.mesh,r.impacts.targets.get('surface_trim_e')?.root,r.impacts.targets.get('surface_crown_e')?.root,r.impacts.targets.get('surface_outlet')?.root].filter(Boolean));
  // Copy the pristine meshes before any personal save is loaded. Share geometry
  // but isolate materials, visibility and transforms from the player's own room.
  const material=m=>{if(!this.materials.has(m)){const c=m.clone();this.materials.set(m,c);this.baseEmission.set(c,c.emissiveIntensity||0);}return this.materials.get(m);};
  const copy=(o,parent)=>{
   if(!o||exclude.has(o)||o.isLight||o.isCamera)return null;
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
   if(id==='surface_6')continue;
   const m=w.kind==='floor'?r.textured.hotel_carpet:w.kind==='ceiling'?r.textured.hotel_ceiling:r.textured.hotel_wall;
   box(w.p,w.s,m);
  }
  box([0,1.1,-5],[2,2.2,.2],r.textured.hotel_wall);
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
