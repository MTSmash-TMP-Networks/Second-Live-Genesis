import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VillageDamageMask,VillageRubble,villageParts} from './village_damage.js';
import {VillageRoads,VillageForest} from './village_landscape.js';

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
  this.box(group,[fx+front*.035,1.12,0],[.10,2.24,1.25],this.door);
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
  wrapper.add(clone);placed.add(wrapper);placed.position.set(min[0]+s[0]/2,0,min[2]+s[2]/2);
  if(entry.row.label)this.sign(placed,entry.row.label,front*(s[0]/2+.04),s[1]*.49,0,front*Math.PI/2);
  const release=entry.mask.attach(placed);
  this.buildingRoot.remove(entry.fallback);entry.release?.();entry.fallback=null;entry.release=release;this.buildingRoot.add(placed);entry.imported=placed;
 }
 setRoads(roads){this.roads.set(roads);}
 set(rows,roads){
  this.setRoads(roads||[]);
  const buildings=rows.filter(r=>r.kind!=='tree'),active=new Set(buildings.map(r=>r.id));
  for(const [id,entry] of this.buildings)if(!active.has(id)){
   this.buildingRoot.remove(entry.imported||entry.fallback);entry.release?.();entry.mask.dispose();this.buildings.delete(id);
  }
  for(const row of buildings){
   const current=this.buildings.get(row.id);
   if(current){
    const old=current.row.damage||{};
    if(JSON.stringify(old)!==JSON.stringify(row.damage||{})){
     for(const part of villageParts(row))if(part.stage===4&&(old[part.index]||0)<4)this.rubble.spawn(part);
    }
    current.row=row;current.mask.update(row);continue;
   }
   const entry={row,key:row.kind+'-'+(row.variant<3?'a':'b'),fallback:this.fallbackBuilding(row),imported:null,mask:new VillageDamageMask(row)};
   entry.release=entry.mask.attach(entry.fallback);
   this.buildings.set(row.id,entry);this.buildingRoot.add(entry.fallback);this.installModel(entry);
  }
  this.forest.set(rows.filter(r=>r.kind==='tree'));
 }
}
