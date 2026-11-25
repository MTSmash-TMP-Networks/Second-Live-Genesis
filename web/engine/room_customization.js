// Private, embedded GLB furnishings and one live planar mirror.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function normalizeRoomModel(model){
 model.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const longest=Math.max(size.x,size.y,size.z);
 if(bounds.isEmpty()||!Number.isFinite(longest)||longest<1e-6||longest>1e8||
    ![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))throw Error('Modell besitzt keine nutzbare Geometrie');
 const root=new THREE.Group(),inner=new THREE.Group();
 inner.add(model);inner.scale.setScalar(1/longest);
 inner.position.set(-center.x/longest,-bounds.min.y/longest,-center.z/longest);root.add(inner);
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 return {root,size:size.multiplyScalar(1/longest).toArray()};
}
export function modelCollision(row,size){
 const a=row.rotation*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),e=row.extent;
 const h=Math.max(.015,size[1]*e),w=Math.max(.015,(c*size[0]+s*size[2])*e),d=Math.max(.015,(s*size[0]+c*size[2])*e);
 return {id:row.id,p:[row.x,row.y+h/2,row.z],s:[w,h,d]};
}
function disposeModel(root){
 const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
 for(const t of textures){if(t.image?.close)images.add(t.image);t.dispose();}
 for(const image of images)image.close();
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.removeFromParent();
}
export class RoomModels{
 constructor(scene){
  this.root=new THREE.Group();this.root.name='Private imported room models';scene.add(this.root);
  this.entries=new Map();this.queue=[];this.active=false;this.boxes=[];
 }
 sync(rows,fetchBytes){
  this.fetchBytes=fetchBytes;
  const wanted=new Map(rows.filter(row=>row.placed).map(row=>[row.id,row]));
  for(const [id,e] of this.entries)if(!wanted.has(id)){this.remove(e);this.entries.delete(id);}
  for(const [id,row] of wanted){
   let e=this.entries.get(id);
   if(!e){e={row,status:'loading',root:null,cancelled:false};this.entries.set(id,e);this.queue.push(e);}
   else e.row=row;
   if(e.root)this.place(e);
  }
  this.updateBoxes();this.pump();
 }
 place(e){const r=e.row;e.root.position.set(r.x,r.y,r.z);e.root.rotation.y=r.rotation*Math.PI/180;e.root.scale.setScalar(r.extent);}
 remove(e){e.cancelled=true;e.controller?.abort();if(e.root){disposeModel(e.root);e.root=null;}}
 retry(id){
  const old=this.entries.get(id);if(!old||old.status!=='error')return;
  const row=old.row;this.remove(old);const e={row,status:'loading',root:null,cancelled:false};
  this.entries.set(id,e);this.queue.push(e);this.pump();
 }
 status(id){return this.entries.get(id);}
 colliders(){return this.boxes;}
 updateBoxes(){this.boxes=[...this.entries.values()].filter(e=>e.root&&e.row.solid).map(e=>modelCollision(e.row,e.size));}
 async pump(){
  if(this.active)return;
  let e;while(this.queue.length){const next=this.queue.shift();if(!next.cancelled){e=next;break;}}
  if(!e)return;
  this.active=true;let raw=null;
  const controller=new AbortController();e.controller=controller;
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const bytes=await this.fetchBytes(e.row.id,controller.signal);
   if(e.cancelled)return;
   if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==e.row.bytes||bytes.byteLength<28||new DataView(bytes).getUint32(0,true)!==0x46546c67)throw Error('Ungültige GLB-Datei');
   const manager=new THREE.LoadingManager();
   manager.setURLModifier(url=>{if(!url.startsWith('blob:'))throw Error('Externe Modellressource abgelehnt');return url;});
   const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');raw=gltf.scene;
   if(e.cancelled)return;
   const fitted=normalizeRoomModel(raw);e.root=fitted.root;e.size=fitted.size;raw=null;
   this.place(e);this.root.add(e.root);e.status='ready';
  }catch(err){
   if(!e.cancelled){e.status='error';e.error=String(err?.message||err).slice(0,180);}
  }finally{
   if(raw)disposeModel(raw);
   clearTimeout(timer);e.controller=null;this.active=false;this.updateBoxes();this.pump();
  }
 }
 clear(){for(const e of this.entries.values())this.remove(e);this.entries.clear();this.queue=[];this.updateBoxes();}
}
export function withMirrorActors(owner,render){
 const avatar=owner.localCharacter,weapon=owner.weaponRoot,oldAvatar=avatar?.visible,oldWeapon=weapon?.visible;
 try{
  if(avatar&&owner.reflectPlayer)avatar.visible=true;
  if(weapon)weapon.visible=false;
  return render();
 }finally{
  if(avatar)avatar.visible=oldAvatar;
  if(weapon)weapon.visible=oldWeapon;
 }
}
export function buildRoomMirror(owner){
 const root=new THREE.Group();root.name='Hotel room mirror';
 root.position.set(-4.82,1.43,1.27);root.rotation.y=Math.PI/2;
 const frame=new THREE.MeshStandardMaterial({color:0x39332d,metalness:.55,roughness:.32});
 const glass=new THREE.MeshStandardMaterial({color:0xb5c3cc,metalness:.96,roughness:.08});
 const w=.82,h=1.72,b=.045;
 const piece=(sx,sy,sz,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
 piece(w+2*b,h+2*b,.045,0,0,0,frame);
 piece(w,h,.012,0,0,.03,glass);
 for(const x of [-1,1])piece(b,h+2*b,.06,x*(w+b)/2,0,.025,frame);
 for(const y of [-1,1])piece(w,b,.06,0,y*(h+b)/2,.025,frame);
 const reflector=new Reflector(new THREE.PlaneGeometry(w,h),{
  color:0xeeeeee,textureWidth:owner.quality==='2k'?768:512,textureHeight:owner.quality==='2k'?1024:768,
  clipBias:.003,multisample:0
 });
 reflector.position.z=.039;reflector.name='Live planar reflection';root.add(reflector);
 const original=reflector.onBeforeRender;
 reflector.onBeforeRender=function(renderer,scene,camera,...rest){
  if(owner.xrMode?.active)return;
  return withMirrorActors(owner,()=>original.call(this,renderer,scene,camera,...rest));
 };
 owner.scene.add(root);
 return {root,reflector};
}
