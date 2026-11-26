import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VillageDamageMask,VillageRubble,villageParts,VILLAGE_DOOR_INDEX} from './village_damage.js';
import {VillageRoads,VillageForest} from './village_landscape.js';

// Vertex ranges in the four prepared CC0 assemblies. Verify the source bounds
// and exact triangle counts before separating a leaf; arbitrary custom models
// are left intact and use the fitted procedural door instead.
const DOOR_RANGES={
 'house-a':{'MI_Trim_MetalConcrete':[0,980,980,676]},
 'house-b':{'MI_Trim_MetalConcrete':[0,980,980,676]},
 'shop-a':{'MI_Trim_MetalConcrete':[856,268,3960,184],'MI_Glass':[125,4,769,2]},
 'shop-b':{'MI_Trim_MetalConcrete':[0,268,268,184],'MI_Glass':[116,4,584,2]}
};
export function preparedDoorTriangles(key,name,geometry){
 const range=DOOR_RANGES[key]?.[name],p=geometry.attributes.position;
 if(!range||!p||!geometry.index||p.count!==range[2])return null;
 const [start,count,,triangles]=range,end=start+count,keep=[],take=[],idx=geometry.index.array;
 for(let i=start;i<end;i++)if(Math.abs(p.getX(i))>.501||p.getY(i)<-.011||p.getY(i)>2.201||p.getZ(i)<4.765||p.getZ(i)>5.032)return null;
 for(let i=0;i<idx.length;i+=3){
  const tri=[idx[i],idx[i+1],idx[i+2]],inside=tri.filter(j=>j>=start&&j<end).length;
  if(inside&&inside!==3)return null;
  (inside?take:keep).push(...tri);
 }
 return take.length===triangles*3?{take,keep}:null;
}
// The authoritative server provides all scenery coordinates, collision sizes and health.
// A small local model bank may replace these original procedural facade meshes.
export class VillageView{
 constructor(scene){
  this.root=new THREE.Group();this.root.name='Hidden village';scene.add(this.root);
  this.treeRoot=new THREE.Group();this.buildingRoot=new THREE.Group();this.roadRoot=new THREE.Group();
  this.root.add(this.treeRoot,this.buildingRoot,this.roadRoot);
  this.cube=new THREE.BoxGeometry(1,1,1);
  this.forest=new VillageForest(this.treeRoot);
  this.roads=new VillageRoads(this.roadRoot,(...args)=>this.box(...args));
  this.walls=[0xb98d6c,0xd7bd9c,0xa5917c,0xb78a7a,0xd8c4ad,0x9f846d].map(color=>new THREE.MeshStandardMaterial({color,roughness:.93}));
  this.trim=new THREE.MeshStandardMaterial({color:0xb8ada0,roughness:.88});
  this.roof=new THREE.MeshStandardMaterial({color:0x43484b,roughness:.95});
  this.glass=new THREE.MeshStandardMaterial({color:0x567079,roughness:.28,metalness:.12});
  this.door=new THREE.MeshStandardMaterial({color:0x4b3c30,roughness:.78});
  this.signMat=new THREE.MeshStandardMaterial({color:0x375567,roughness:.85});

  this.buildings=new Map();this.assetBank=new Map();this.roadKey='';this.treeKey='';
  this.rubble=new VillageRubble(scene);this.assetReady=this.loadModels();
 }
 box(parent,p,s,mat){
  const m=new THREE.Mesh(this.cube,mat);m.position.set(...p);m.scale.set(...s);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
 }
 sign(parent,label,x,y,z,angle){
  if(!label)return;
  const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');
  ctx.fillStyle='#375567';ctx.fillRect(0,0,256,64);ctx.fillStyle='#f6e9cb';ctx.font='bold 39px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,128,32);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(3.2,.66),new THREE.MeshStandardMaterial({map:tex,roughness:.85}));
  m.position.set(x,y,z);m.rotation.y=angle;parent.add(m);
 }
 fallbackBuilding(row){
  const [min,s]=row.bounds,[w,h,d]=s;const group=new THREE.Group();
  const p=[min[0]+w/2,0,min[2]+d/2];group.position.set(...p);
  const wall=this.walls[row.variant%this.walls.length],shop=row.kind==='shop';
  // A shell rather than the former completely solid building cube.
  const tx=w*.085,tz=d*.085,base=h*.025,roof=h*.14,wh=h-base-roof;
  this.box(group,[0,base/2,0],[w,base,d],this.trim);
  for(const side of [-1,1]){
   this.box(group,[side*(w-tx)/2,base+wh/2,0],[tx,wh,d],wall);
   this.box(group,[0,base+wh/2,side*(d-tz)/2],[w-2*tx,wh,tz],wall);
  }
  this.box(group,[0,h-roof/2,0],[w,roof,d],this.roof);
  this.box(group,[0,.16,0],[w+.15,.32,d+.15],this.trim);
  this.box(group,[0,h-.13,0],[w+.32,.26,d+.32],this.roof);
  this.box(group,[0,h-.48,0],[w+.18,.18,d+.18],this.trim);
  const front=p[0]<-65?1:-1,fx=front*w/2;
  for(const side of [-1,1]){
   for(let floor=1;floor<Math.floor(h/2.5)+1;floor++){
    const y=1.5+floor*2.25;if(y+.62>=h-.4)continue;
    for(const offset of [-3,0,3]){
     this.box(group,[side*(w/2+.02),y,offset],[.10,1.35,1.42],this.trim);
     this.box(group,[side*(w/2+.08),y,offset],[.05,1.12,1.18],this.glass);
     this.box(group,[offset,y,side*(d/2+.03)],[1.42,1.35,.10],this.trim);
     this.box(group,[offset,y,side*(d/2+.09)],[1.18,1.12,.05],this.glass);
    }
   }
  }
  if(!row.door)this.box(group,[fx+front*.035,1.12,0],[.10,2.24,1.25],this.door);
  for(const offset of [-2.9,2.9]){
   this.box(group,[fx+front*.04,1.55,offset],[.12,shop?2.25:1.4,shop?3.1:1.55],this.trim);
   this.box(group,[fx+front*.11,1.55,offset],[.05,shop?2.02:1.18,shop?2.85:1.32],this.glass);
  }
  if(shop){
   this.box(group,[fx+front*.7,2.95,0],[1.4,.18,8.9],this.signMat);
   this.sign(group,row.label,fx+front*.06,3.5,0,front*Math.PI/2);
  }
  return group;
 }
 // Separate the original prepared Quaternius door triangles from the merged
 // facade. No second model download is necessary. Custom assets use a fitted leaf.
 extractOriginalDoor(wrapper,asset,key){
  if(asset.size.x<9.8||asset.size.x>10.4||asset.box.max.z<4.95||asset.box.max.z>5.25)return null;
  wrapper.updateMatrixWorld(true);
  const pieces=[],owned=[],edits=[];
  wrapper.traverse(mesh=>{
   if(!mesh.isMesh||Array.isArray(mesh.material))return;
   const name=mesh.material.name||'';
   if(!['MI_Trim_MetalConcrete','MI_Glass'].includes(name))return;
   const g=mesh.geometry,split=preparedDoorTriangles(key,name,g);
   if(split)edits.push({mesh,g,...split});
  });
  if(edits.length!==Object.keys(DOOR_RANGES[key]||{}).length||!edits.some(e=>(e.mesh.material.name||'')==='MI_Trim_MetalConcrete'))return null;
  const center=asset.box.getCenter(new THREE.Vector3()),hinge=new THREE.Vector3(.5-center.x,-asset.box.min.y,4.90-center.z).applyMatrix4(wrapper.matrixWorld);
  for(const {mesh,g,keep,take} of edits){
   const remaining=g.clone();remaining.setIndex(keep);mesh.geometry=remaining;owned.push(remaining);
   const leaf=g.clone();leaf.setIndex(take);leaf.applyMatrix4(mesh.matrixWorld);leaf.translate(-hinge.x,-hinge.y,-hinge.z);
   const part=new THREE.Mesh(leaf,mesh.material);part.castShadow=true;part.receiveShadow=true;pieces.push(part);owned.push(leaf);
  }
  return {hinge,pieces,owned};
 }
 installDoor(entry,original=null){
  entry.doorPivot?.removeFromParent();
  for(const g of entry.doorGeometries||[])g.dispose();
  const row=entry.row,d=row.door;if(!d)return;
  const [min,s]=row.bounds,center=new THREE.Vector3(min[0]+s[0]/2,0,min[2]+s[2]/2);
  const pivot=new THREE.Group();pivot.name='Village door '+row.id;
  if(original){
   pivot.position.copy(center).add(original.hinge);pivot.add(...original.pieces);entry.doorGeometries=original.owned;
  }else{
   pivot.position.set(d.front-d.side*.08,0,d.z-d.side*d.width/2);
   this.box(pivot,[0,d.height/2,d.side*d.width/2],[.10,d.height,d.width],this.door);
   this.box(pivot,[d.side*.085,d.height*.49,d.side*d.width*.81],[.10,.08,.13],this.trim);
   entry.doorGeometries=[];
  }
  // Swing inward, about the original hinge. The doorway collider is shared
  // by the server; an open leaf is parked beside the passage.
  pivot.rotation.y=d.open?-Math.PI/2:0;entry.doorPivot=pivot;
  this.buildingRoot.add(pivot);this.updateDoor(entry);
 }
 updateDoor(entry){
  const p=entry.doorPivot,d=entry.row.door;if(!p||!d)return;
  p.visible=(entry.row.damage?.[VILLAGE_DOOR_INDEX]||0)<4;
  entry.doorAngle=d.open?-Math.PI/2:0;
 }
 step(dt){
  const t=1-Math.exp(-Math.max(0,dt)*10);
  for(const e of this.buildings.values())if(e.doorPivot)e.doorPivot.rotation.y+=(e.doorAngle-e.doorPivot.rotation.y)*t;
 }
 async loadModels(){
  // Only same-origin, administrator-installed GLBs. Missing optional art never blocks gameplay.
  try{
   const r=await fetch('/assets/village/manifest.json',{cache:'no-store'});if(!r.ok)return;
   const manifest=await r.json(),loader=new GLTFLoader();
   await Promise.all(['house-a','house-b','shop-a','shop-b'].filter(k=>manifest.includes(k)).map(async key=>{
    try{
     const gltf=await loader.loadAsync('/assets/village/'+key+'.glb');
     const model=gltf.scene,box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
     if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>.001))return;
     this.assetBank.set(key,{model,box,size});
     for(const entry of this.buildings.values())if(entry.key===key)this.installModel(entry);
    }catch(e){console.warn('Optional village model',key,e.message);}
   }));
  }catch(e){console.warn('Optional village assets:',e.message);}
 }
 installModel(entry){
  const asset=this.assetBank.get(entry.key);if(!asset||entry.imported)return;
  const clone=asset.model.clone(true),[min,s]=entry.row.bounds;
  const placed=new THREE.Group(),wrapper=new THREE.Group();
  const front=min[0]+s[0]/2<-65?1:-1;
  // Prepared models have their entrances on local +Z, facing the village street after rotation.
  const factor=new THREE.Vector3(s[2]/asset.size.x,s[1]/asset.size.y,s[0]/asset.size.z);
  const center=asset.box.getCenter(new THREE.Vector3());
  wrapper.scale.copy(factor);wrapper.rotation.y=front*Math.PI/2;
  clone.position.x-=center.x;clone.position.y-=asset.box.min.y;clone.position.z-=center.z;
  clone.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  wrapper.add(clone);const original=entry.row.door?this.extractOriginalDoor(wrapper,asset,entry.key):null;
  // Align the prepared floor to the existing shallow physical foundation.
  clone.traverse(o=>{if(o.isMesh&&o.material?.name==='MI_InteriorFloor')o.position.y+=(s[1]*.025-.002)/factor.y-.10+asset.box.min.y;});
  placed.add(wrapper);placed.position.set(min[0]+s[0]/2,0,min[2]+s[2]/2);
  if(entry.row.label)this.sign(placed,entry.row.label,front*(s[0]/2+.04),s[1]*.49,0,front*Math.PI/2);
  const release=entry.mask.attach(placed);
  this.buildingRoot.remove(entry.fallback);entry.release?.();entry.fallback=null;entry.release=release;this.buildingRoot.add(placed);entry.imported=placed;this.installDoor(entry,original);
 }
 setRoads(roads){this.roads.set(roads);}
 set(rows,roads){
  this.setRoads(roads||[]);
  const buildings=rows.filter(r=>r.kind!=='tree'),active=new Set(buildings.map(r=>r.id));
  for(const [id,entry] of this.buildings)if(!active.has(id)){
   this.buildingRoot.remove(entry.imported||entry.fallback);entry.doorPivot?.removeFromParent();for(const g of entry.doorGeometries||[])g.dispose();entry.release?.();entry.mask.dispose();this.buildings.delete(id);
  }
  for(const row of buildings){
   const current=this.buildings.get(row.id);
   if(current){
    const old=current.row.damage||{};
    if(JSON.stringify(old)!==JSON.stringify(row.damage||{})){
     for(const part of villageParts(row))if(part.stage===4&&(old[part.index]||0)<4)this.rubble.spawn(part);
    }
    current.row=row;current.mask.update(row);this.updateDoor(current);continue;
   }
   const entry={row,key:row.kind+'-'+(row.variant<3?'a':'b'),fallback:this.fallbackBuilding(row),imported:null,mask:new VillageDamageMask(row)};
   entry.release=entry.mask.attach(entry.fallback);
   this.buildings.set(row.id,entry);this.buildingRoot.add(entry.fallback,entry.mask.cuts);this.installDoor(entry);this.installModel(entry);
  }
  this.forest.set(rows.filter(r=>r.kind==='tree'));
 }
}
