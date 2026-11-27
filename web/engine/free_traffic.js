// Server-owned traffic presentation. Cars remain playable without optional GLBs.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createCharacter,animateCharacter,disposeCharacter} from './character.js';
import {applyRoomAvatarPose,resetRoomAvatarPose} from './avatar_room_pose.js';

const WIDTH=1.95,LENGTH=4.8,HALF_W=WIDTH/2,HALF_L=LENGTH/2;
const KINDS=new Set(['sedan','hatchback','suv','taxi']);
const wheelNames=['wheel_FL','wheel_FR','wheel_RL','wheel_RR'];
const templates=new Map();
const box=new RoundedBoxGeometry(1,1,1,3,.08);
const tire=new THREE.CylinderGeometry(.34,.34,.23,24);tire.rotateZ(Math.PI/2);
const hub=new THREE.CylinderGeometry(.225,.225,.238,16);hub.rotateZ(Math.PI/2);
const colors={
 black:new THREE.MeshStandardMaterial({color:0x212426,roughness:.92}),
 chrome:new THREE.MeshStandardMaterial({color:0x9ba4aa,metalness:.7,roughness:.32}),
 interior:new THREE.MeshStandardMaterial({color:0x404342,roughness:.89}),
 glass:new THREE.MeshStandardMaterial({color:0x839da9,roughness:.18,metalness:.10,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide}),
 plate:new THREE.MeshStandardMaterial({color:0xdde0d6,roughness:.7}),
 taxi:new THREE.MeshStandardMaterial({color:0xf3cb50,emissive:0xffce38,emissiveIntensity:.25,roughness:.6})
};
function solid(root,material,p,s,geometry=box,rotation=null){
 const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.scale.set(...s);
 if(rotation)m.rotation.set(...rotation);m.castShadow=!material.transparent;m.receiveShadow=true;root.add(m);return m;
}
function panel(root,material,points){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
 const mesh=solid(root,material,[0,0,0],[1,1,1],g);mesh.userData.vehicleOwnedGeometry=true;return mesh;
}
function fallback(row){
 const root=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color:row.color,metalness:.44,roughness:.38});
 const tall=row.kind==='suv',short=row.kind==='hatchback',roof=tall?1.60:1.42,back=short?1.2:1.04;
 solid(root,colors.black,[0,.27,0],[1.86,.24,4.65]);
 solid(root,paint,[0,.59,0],[1.87,.52,4.76]);
 solid(root,paint,[0,.85,-1.50],[1.86,.23,1.64]);
 solid(root,paint,[0,.80,1.60],[1.84,.26,1.45]);
 solid(root,paint,[0,roof-.04,.12],[1.50,.12,1.55]);
 const base=.88,top=roof-.09;
 for(const x of [-1,1]){
  panel(root,colors.glass,[[x*.90,base,-1.0],[x*.90,base,back+.38],[x*.72,top,back-.13],[x*.72,top,-.60]]);
  for(const z of [-.85,.20,back]){
   const rz=z<0?-.61:z>1?back-.15:.20;
   const a=new THREE.Vector3(x*.89,base,z),b=new THREE.Vector3(x*.72,roof,rz);
   const m=solid(root,paint,a.clone().add(b).multiplyScalar(.5).toArray(),[.095,a.distanceTo(b),.10]);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());
  }
  for(const z of [-.35,.60])solid(root,colors.chrome,[x*.947,.83,z],[.025,.045,.19]);
  solid(root,paint,[x*1.0,.94,-.72],[.23,.14,.25]);
  solid(root,colors.black,[x*.92,.42,0],[.10,.12,4.0]);
 }
 panel(root,colors.glass,[[-.90,base,-1.02],[.90,base,-1.02],[.72,top,-.60],[-.72,top,-.60]]);
 panel(root,colors.glass,[[-.90,base,back+.38],[-.72,top,back-.13],[.72,top,back-.13],[.90,base,back+.38]]);
 for(const x of [-.43,.43]){
  solid(root,colors.interior,[x,.54,.12],[.49,.17,.56]);
  solid(root,colors.interior,[x,.83,.40],[.50,.52,.16]);
  solid(root,colors.interior,[x,.55,.98],[.49,.16,.52]);
 }
 solid(root,colors.interior,[0,.88,-.72],[1.67,.25,.40]);
 const steering=new THREE.Mesh(new THREE.TorusGeometry(.17,.024,10,30),colors.black);steering.position.set(-.43,.98,-.49);steering.rotation.x=-.30;root.add(steering);steering.userData.vehicleOwnedGeometry=true;
 solid(root,colors.black,[0,.55,-2.39],[1.14,.28,.04]);solid(root,colors.chrome,[0,.58,-2.42],[.95,.055,.035]);
 solid(root,colors.plate,[0,.45,2.40],[.47,.115,.03]);
 const wheels=[];
 for(const x of [-.87,.87])for(const z of [-1.47,1.47]){
  const pivot=new THREE.Group();pivot.position.set(x,.34,z);root.add(pivot);
  const spin=new THREE.Group();pivot.add(spin);
  solid(spin,colors.black,[0,0,0],[1,1,1],tire);solid(spin,colors.chrome,[x<0?-.025:.025,0,0],[1,1,1],hub);
  wheels.push({pivot,spin,front:z<0});
 }
 if(row.kind==='taxi'){
  solid(root,colors.taxi,[0,roof+.09,.06],[.53,.16,.27]);
  solid(root,colors.black,[0,roof+.185,.06],[.48,.025,.22]);
 }
 root.userData.ownedPaint=paint;return {root,wheels,steering};
}
function findWheel(root,name){let result=null;root.traverse(o=>{if(o.name.toLowerCase()===name.toLowerCase())result=o;});return result;}
async function template(kind,lod){
 const key=kind+':'+lod;if(!templates.has(key)){
  templates.set(key,(async()=>{
   const r=await fetch('/assets/polyhaven/vehicles/'+kind+'-lod'+lod+'.glb');
   if(!r.ok)throw Error('vehicle unavailable');
   const gltf=await new GLTFLoader().parseAsync(await r.arrayBuffer(),'');
   const raw=gltf.scene;raw.updateMatrixWorld(true);
   const wheels=wheelNames.map(n=>findWheel(raw,n));if(wheels.some(w=>!w))throw Error('missing wheel pivots');
   const front=wheels[0].getWorldPosition(new THREE.Vector3()).add(wheels[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
   const rear=wheels[2].getWorldPosition(new THREE.Vector3()).add(wheels[3].getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
   const delta=front.sub(rear);if(Math.hypot(delta.x,delta.z)<.5)throw Error('invalid wheel anchors');
   const aligned=new THREE.Group();raw.rotation.y+=Math.PI-Math.atan2(delta.x,delta.z);aligned.add(raw);aligned.updateMatrixWorld(true);
   // Rotate the front into -Z. Measure after the rotation; never trust file units.
   let b=new THREE.Box3().setFromObject(aligned),s=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
   if(![s.x,s.y,s.z].every(v=>Number.isFinite(v)&&v>.25)||s.z<s.x*1.25)throw Error('invalid vehicle bounds');
   aligned.position.set(-center.x,-b.min.y,-center.z);
   const root=new THREE.Group();root.add(aligned);root.scale.set(WIDTH/s.x,Math.min(1,1.84/s.y),LENGTH/s.z);
   return root;
  })().catch(()=>null));
 }return templates.get(key);
}
function imported(templateRoot,row){
 const root=templateRoot.clone(true),wheels=[],owned=new Set();root.updateMatrixWorld(true);
 const materials=new Map();
 root.traverse(o=>{
  if(!o.isMesh)return;
  const repaint=m=>{
   if(row.kind==='taxi'||!/(paint|body.?color|bodywork|car.?body|exterior.?body)/i.test(m.name||''))return m;
   if(!materials.has(m)){const n=m.clone();n.color.set(row.color);materials.set(m,n);owned.add(n);}return materials.get(m);
  };
  o.material=Array.isArray(o.material)?o.material.map(repaint):repaint(o.material);
  const transparent=Array.isArray(o.material)?o.material.some(m=>m.transparent):o.material?.transparent;
  o.castShadow=!transparent;o.receiveShadow=true;
 });
 for(const name of wheelNames){
  const node=findWheel(root,name);if(!node)continue;
  const q=node.quaternion.clone(),world=node.getWorldQuaternion(new THREE.Quaternion()).invert();
  wheels.push({node,base:q,axis:new THREE.Vector3(1,0,0).applyQuaternion(world).normalize(),front:name.includes('_F'),parentUp:new THREE.Vector3(0,1,0).applyQuaternion(node.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize()});
 }
 root.userData.ownedMaterials=owned;return {root,wheels,steering:findWheel(root,'steering_wheel')};
}
function releaseModel(model){
 if(!model)return;model.root.removeFromParent();
 model.root.userData.ownedPaint?.dispose();for(const m of model.root.userData.ownedMaterials||[])m.dispose();
 model.root.traverse(o=>{if(o.userData.vehicleOwnedGeometry)o.geometry?.dispose();});
}
function lamps(root){
 const head=new THREE.MeshStandardMaterial({color:0xfff0ce,emissive:0xffedbd,emissiveIntensity:.05,roughness:.34});
 const rear=new THREE.MeshStandardMaterial({color:0xa72721,emissive:0xff2414,emissiveIntensity:.10,roughness:.5});
 const blink=[-1,1].map(()=>new THREE.MeshStandardMaterial({color:0xc27c21,emissive:0xff9911,emissiveIntensity:.05,roughness:.45}));
 for(const [i,x] of [-.68,.68].entries()){
  solid(root,head,[x,.73,-2.38],[.39,.14,.10]);solid(root,rear,[x,.75,2.38],[.35,.15,.10]);
  for(const z of [-2.36,2.36])solid(root,blink[i],[x*1.26,.67,z],[.15,.09,.09]);
 }
 return {head,rear,blink};
}
export function vehicleBlocked(rows,x,y,z,height=1.6){
 for(const c of rows||[]){
  if(!c.position||y+height<c.position[1]+.12||y>c.position[1]+1.77)continue;
  const dx=x-c.position[0],dz=z-c.position[2],a=Math.cos(c.yaw),b=Math.sin(c.yaw);
  if(Math.abs(dx*a-dz*b)<HALF_W+.30&&Math.abs(dx*b+dz*a)<HALF_L+.30)return true;
 }
 return false;
}
export function nearestVehicle(rows,p){
 return (rows||[]).filter(c=>c.driverSlot==null&&Array.isArray(c.position)&&Math.hypot(c.position[0]-p.x,c.position[1]-p.y,c.position[2]-p.z)<=3.6)
  .sort((a,b)=>Math.hypot(a.position[0]-p.x,a.position[2]-p.z)-Math.hypot(b.position[0]-p.x,b.position[2]-p.z))[0]||null;
}
export class TrafficView{
 constructor(scene){this.scene=scene;this.cars=new Map();this.departed=new Map();this.time=0;this.parking=null;this.headlights=null;}
 showParking(){
  if(this.parking)return;
  const root=new THREE.Group();root.name='Hotel taxi bay';this.scene.add(root);this.parking=root;
  const ground=new THREE.MeshStandardMaterial({color:0x56595a,roughness:.96});
  solid(root,ground,[5.8,.045,133],[5.1,.074,7.1]);
  for(const x of [3.65,7.95])solid(root,colors.taxi,[x,.089,133],[.09,.012,6.0]);
  solid(root,colors.taxi,[5.8,.089,136.0],[4.3,.012,.09]);
  solid(root,colors.chrome,[8.15,.75,136],[.085,1.5,.085]);
  solid(root,colors.taxi,[8.15,1.52,136],[.40,.30,.07]);
  root.userData.parkingMaterial=ground;
  const lightRoot=new THREE.Group();lightRoot.name='Nearest traffic headlights';this.scene.add(lightRoot);
  this.headlights={root:lightRoot,lights:[-1,1].map(()=>{
   const l=new THREE.SpotLight(0xffeed0,0,35,.27,.55,2);l.castShadow=false;l.visible=false;lightRoot.add(l,l.target);return l;
  })};
 }
 sync(rows,departed=[]){
  if(rows?.length)this.showParking();
  const seen=new Set();
  for(const r of rows||[]){
   if(!KINDS.has(r.kind)||!r.position?.every(Number.isFinite)||!Number.isFinite(r.yaw))continue;
   seen.add(r.id);let a=this.cars.get(r.id);
   if(!a){
    const root=new THREE.Group();root.name='Traffic '+r.id;root.position.set(...r.position);root.rotation.y=r.yaw;this.scene.add(root);
    const model=fallback(r);root.add(model.root);
    a={root,model,row:r,phase:0,lights:lamps(root),lod:-1,wanted:-1,pending:false,driver:null,signature:''};this.cars.set(r.id,a);
   }
   a.row=r;
  }
  for(const [id,a] of this.cars)if(!seen.has(id)){this.remove(a);this.cars.delete(id);}
  const gone=new Set();
  for(const d of departed||[]){
   gone.add(d.id);let e=this.departed.get(d.id);
   if(!e){const root=createCharacter(d.avatar);root.position.set(...d.position);this.scene.add(root);e={root};this.departed.set(d.id,e);}
   e.row=d;
  }
  for(const [id,e] of this.departed)if(!gone.has(id)){disposeCharacter(e.root);this.departed.delete(id);}
 }
 remove(a){if(a.driver)disposeCharacter(a.driver);releaseModel(a.model);a.root.removeFromParent();a.lights.head.dispose();a.lights.rear.dispose();for(const m of a.lights.blink)m.dispose();}
 load(a,lod){
  if(a.pending||a.wanted===lod||typeof document==='undefined')return;
  a.wanted=lod;a.pending=true;
  template(a.row.kind,lod).then(t=>{
   if(!t||this.cars.get(a.row.id)!==a)return;
   const m=imported(t,a.row);releaseModel(a.model);a.model=m;a.root.add(m.root);a.lod=lod;
  }).catch(()=>{}).finally(()=>{a.pending=false;});
 }
 step(dt,player,own,first,night){
  this.time+=dt;const t=1-Math.exp(-dt*10);let ownPose=null;
  for(const a of this.cars.values()){
   const r=a.row,dist=Math.hypot(a.root.position.x-player.x,a.root.position.z-player.z);
   const target=new THREE.Vector3(...r.position);
   if(a.root.position.distanceTo(target)>12)a.root.position.copy(target);else a.root.position.lerp(target,t);
   a.root.rotation.y+=Math.atan2(Math.sin(r.yaw-a.root.rotation.y),Math.cos(r.yaw-a.root.rotation.y))*t;
   a.root.visible=dist<190||r.id===own;
   if(a.root.visible)this.load(a,dist<48||r.id===own?1:2);
   a.phase=(a.phase+(Number(r.speed)||0)*dt/.34)%(2*Math.PI);
   const steer=-(r.steer||0)*.40;
   for(const w of a.model.wheels){
    if(w.pivot){w.pivot.rotation.y=w.front?steer:0;w.spin.rotation.x=-a.phase;}
    else{
     const spin=new THREE.Quaternion().setFromAxisAngle(w.axis,-a.phase);
     const q=w.base.clone().multiply(spin);
     if(w.front)q.premultiply(new THREE.Quaternion().setFromAxisAngle(w.parentUp,steer));
     w.node.quaternion.copy(q);
    }
   }
   a.lights.head.emissiveIntensity=.08+night*2.5;a.lights.rear.emissiveIntensity=r.brake?2.6:.12+night*.6;
   for(let i=0;i<2;i++)a.lights.blink[i].emissiveIntensity=r.indicator===(i===0?-1:1)&&Math.sin(this.time*8)>0?2.3:.04;
   const signature=r.avatar&&dist<70?JSON.stringify(r.avatar):'';
   if(signature!==a.signature){
    if(a.driver)disposeCharacter(a.driver);a.driver=null;a.signature=signature;
    if(signature){a.driver=createCharacter(r.avatar);a.driver.scale.setScalar(.82);a.driver.position.set(-.43,.24,.10);a.root.add(a.driver);}
   }
   if(a.driver){
    a.driver.visible=!(r.id===own&&first);
    if(a.driver.visible){resetRoomAvatarPose(a.driver);animateCharacter(a.driver,dt,false,'walk');applyRoomAvatarPose(a.driver,{kind:'sit',hip:.49},null);}
   }
   if(r.id===own)ownPose={x:a.root.position.x,y:a.root.position.y,z:a.root.position.z,yaw:a.root.rotation.y,speed:r.speed};
  }
  for(const e of this.departed.values()){
   e.root.position.lerp(new THREE.Vector3(...e.row.position),t);e.root.rotation.y=e.row.yaw;
   animateCharacter(e.root,dt,!!e.row.moving,'walk');
  }
  if(this.headlights){
   const nearest=this.cars.get(own)||[...this.cars.values()].sort((a,b)=>Math.hypot(a.root.position.x-player.x,a.root.position.z-player.z)-Math.hypot(b.root.position.x-player.x,b.root.position.z-player.z))[0];
   const on=!!nearest&&night>.10&&Math.hypot(nearest.root.position.x-player.x,nearest.root.position.z-player.z)<45;
   for(const [i,l] of this.headlights.lights.entries()){
    l.visible=on;l.intensity=on?140*night:0;
    if(on){const a=nearest.root;a.updateWorldMatrix(true,false);l.position.copy(a.localToWorld(new THREE.Vector3(i===0?-.68:.68,.73,-2.38)));l.target.position.copy(a.localToWorld(new THREE.Vector3(i===0?-.80:.80,.20,-25)));}
   }
  }
  return ownPose;
 }
 clear(){if(this.headlights){for(const l of this.headlights.lights)l.dispose?.();this.headlights.root.removeFromParent();this.headlights=null;}if(this.parking){this.parking.userData.parkingMaterial.dispose();this.parking.removeFromParent();this.parking=null;}for(const a of this.cars.values())this.remove(a);this.cars.clear();for(const e of this.departed.values())disposeCharacter(e.root);this.departed.clear();}
}
