// Prepared, locally hosted Microsoft Rocketbox avatars. No browser mesh generation.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {resolveRocketboxLook,OUTFIT_PARTS,outfitParts,isGreetingTrack} from './rocketbox_look.js';

const base='/assets/avatars/data/',pending=new Map(),cache=new Map(),queue=[];
let active=0;
function pump(){
 while(active<3&&queue.length){
  const job=queue.shift();
  if([...job.users].every(u=>u.disposed)){pending.delete(job.file);job.reject(Error('Avatar no longer needed'));continue;}
  active++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  fetch(base+job.file+'?v=0.12.0',{signal:controller.signal}).then(async res=>{
   if(!res.ok)throw Error('Modell nicht verfügbar (HTTP '+res.status+')');
   const bytes=await res.arrayBuffer();
   if(bytes.byteLength!==job.size||new DataView(bytes).getUint32(0,true)!==0x46546c67)throw Error('Ungültige Modelldatei');
   cache.set(job.file,bytes);while(cache.size>4)cache.delete(cache.keys().next().value);
   job.resolve(bytes);
  }).catch(job.reject).finally(()=>{clearTimeout(timer);pending.delete(job.file);active--;pump();});
 }
}
function requestModel(entry,u){
 if(cache.has(entry.file)){const bytes=cache.get(entry.file);cache.delete(entry.file);cache.set(entry.file,bytes);return Promise.resolve(bytes);}
 let job=pending.get(entry.file);
 if(!job){
  job={file:entry.file,size:entry.size,users:new Set()};
  job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  pending.set(entry.file,job);queue.push(job);
 }
 job.users.add(u);pump();return job.promise.finally(()=>job.users.delete(u));
}
function releaseScene(scene){
 const geometry=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 scene.traverse(o=>{
  if(o.geometry)geometry.add(o.geometry);
  if(o.skeleton)skeletons.add(o.skeleton);
  for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){
   materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);
  }
 });
 for(const s of skeletons)s.dispose();for(const g of geometry)g.dispose();
 for(const t of textures)t.dispose();for(const m of materials)m.dispose();scene.removeFromParent();
}
const allParts=new Set(Object.values(OUTFIT_PARTS).flat());
function meshLabel(o){
 for(let n=o;n;n=n.parent){
  if(allParts.has(n.name))return n.name;
  const clean=n.name?.replace(/(?:[._]\d+)+$/,'');
  if(allParts.has(clean))return clean;
 }
 return o.name||'';
}
function prepareMaterials(model){
 const parts=[],originals=new Set(),morphMeshes=[];
 let skins=0;
 model.traverse(o=>{
  if(!o.isMesh)return;
  if(o.isSkinnedMesh){skins++;o.frustumCulled=false;}
  o.castShadow=true;o.receiveShadow=true;o.raycast=()=>{};
  const label=meshLabel(o),arr=Array.isArray(o.material)?o.material:[o.material];
  const materials=arr.map(src=>{
   originals.add(src);const m=src.clone();
   // Keep the shipped color, normal, roughness, AO and transparency maps.
   if(m.isMeshStandardMaterial){
    m.metalness=0;
    if(/^Hair/.test(label)){m.roughness=.78;if(m.map){m.alphaTest=Math.max(m.alphaTest||0,.3);m.side=THREE.DoubleSide;}}
    else if(/^(Body|Skin)/.test(label)){m.roughness=m.roughnessMap?1:.55;}
   }
   return m;
  });
  o.material=Array.isArray(o.material)?materials:materials[0];
  parts.push({mesh:o,label,materials,base:materials.map(m=>m.color?.clone())});
  if(o.morphTargetDictionary&&o.morphTargetInfluences)morphMeshes.push(o);
 });
 for(const m of originals)m.dispose();
 if(!skins)throw Error('Avatar besitzt kein animierbares Skelett');
 return {parts,morphMeshes};
}
function applyAppearance(r,look){
 const available=new Set(r.parts.map(p=>p.label)),{top,visible}=outfitParts(look.top,available);
 for(const p of r.parts){
  if(allParts.has(p.label))p.mesh.visible=visible.has(p.label);
  for(let i=0;i<p.materials.length;i++){
   const m=p.materials[i];if(!m.color||!p.base[i])continue;
   m.color.copy(p.base[i]);
   if(p.label==='Trousers')m.color.multiply(new THREE.Color(look.trousers));
   else if(look.tint&&/^(Outfit_|Top_)/.test(p.label)){
    m.color.multiply(new THREE.Color(look.tint));
    if(p.label.startsWith('Outfit_'))m.color.multiplyScalar(1.5);
   }
  }
 }
 r.pivot.scale.setScalar(look.height/r.nativeHeight);r.height=look.height;r.look=look;
 r.outfit=top;
}
const clipKey=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'');
function findClip(animations,id){return animations.find(c=>clipKey(c.name)===id);}
// The route controls world translation. Keep vertical hip motion and skeletal
// rotations, but remove horizontal root/hip displacement and its loop seam.
export function stabilizePatrolClip(source,model){
 const clip=source.clone();model.updateMatrixWorld(true);
 for(const track of clip.tracks){
  if(!track.name.endsWith('.position')||track.getValueSize()!==3)continue;
  const name=track.name.slice(0,-9),node=THREE.PropertyBinding.findNode(model,name);
  if(!node||!(node===model||/(?:hips?|pelvis|root|armature)$/i.test(node.name)))continue;
  const matrix=new THREE.Matrix3().setFromMatrix4(node.parent?.matrixWorld||new THREE.Matrix4());
  if(Math.abs(matrix.determinant())<1e-12)continue;
  const inverse=matrix.clone().invert(),base=node.position.clone(),v=new THREE.Vector3();
  const values=track.values,first=new THREE.Vector3().fromArray(values,0).sub(base).applyMatrix3(matrix);
  const last=new THREE.Vector3().fromArray(values,values.length-3).sub(base).applyMatrix3(matrix);
  const span=track.times[track.times.length-1]-track.times[0];
  for(let i=0;i<track.times.length;i++){
   v.fromArray(values,i*3).sub(base).applyMatrix3(matrix);
   const phase=span>0?(track.times[i]-track.times[0])/span:0;
   v.set(0,v.y-(last.y-first.y)*phase,0).applyMatrix3(inverse).add(base).toArray(values,i*3);
  }
 }
 return clip;
}

export function updateRealistic(root,a,options){
 const r=root?.userData?.realistic;if(!r)return false;
 const look=resolveRocketboxLook(a,options);if(look.model.file!==r.look.model.file)return false;
 applyAppearance(r,look);root.userData.character=a;return true;
}
export function prepareRealistic(root,a,options,studio=false){
 if(typeof window==='undefined')return;
 const u=root.userData;u.realisticStatus='loading';u.realisticError='';u.body.visible=false;
 const look=resolveRocketboxLook(a,options);
 u.realisticTimer=setTimeout(async()=>{
  let model=null;
  try{
   const bytes=await requestModel(look.model,u);if(u.disposed)return;
   const gltf=await new GLTFLoader().parseAsync(bytes.slice(0),'');model=gltf.scene;
   if(u.disposed){releaseScene(model);model=null;return;}
   const {parts,morphMeshes}=prepareMaterials(model);
   let idle=findClip(gltf.animations,'idle'),walk=findClip(gltf.animations,'walk');
   if(!idle||!walk)throw Error('Bewegungsanimationen fehlen');
   if(u.hotelNpc){idle=stabilizePatrolClip(idle,model);walk=stabilizePatrolClip(walk,model);}
   const mixer=new THREE.AnimationMixer(model),actions={idle:mixer.clipAction(idle),walk:mixer.clipAction(walk)};
   for(const id of ['run','crouch','crouchwalk']){const clip=findClip(gltf.animations,id);if(clip)actions[id]=mixer.clipAction(clip);}
   if(u.hotelNpc){
    const wave=findClip(gltf.animations,'wave');
    if(wave){
     const tracks=wave.tracks.filter(t=>isGreetingTrack(t.name)).map(t=>t.clone());
     if(tracks.length){
      const clip=new THREE.AnimationClip('HotelGreeting',wave.duration,tracks);
      actions.greeting=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);
      actions.greeting.clampWhenFinished=true;
     }
    }
   }
   actions.idle.play();mixer.update(0);model.updateMatrixWorld(true);
   // All shipped garments use the same body. Fit uniformly rather than distorting proportions.
   const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3());
   if(bounds.isEmpty()||!Number.isFinite(size.y)||size.y<1.1||size.y>2.5)throw Error('Ungültige Modellgröße');
   const center=bounds.getCenter(new THREE.Vector3());
   const offset=new THREE.Group();offset.position.set(-center.x,-bounds.min.y,-center.z);offset.add(model);
   const pivot=new THREE.Group();pivot.rotation.y=Math.PI;pivot.add(offset);
   const r={pivot,model,mixer,actions,current:actions.idle,parts,morphMeshes,nativeHeight:size.y,height:size.y,look,time:0,greetingActive:false};
   applyAppearance(r,look);root.add(pivot);u.realistic=r;model=null;
   u.body.visible=false;u.body.traverse(o=>{if(o.isMesh)o.raycast=()=>{};});
   u.realisticStatus='ready';
  }catch(e){
   if(model)releaseScene(model);
   if(!u.disposed){u.realisticStatus='fallback';u.realisticError=String(e?.message||e).slice(0,280);u.body.visible=!studio;console.warn('Second Live Rocketbox:',u.realisticError);}
  }
 },80);
}
export function animateRealistic(root,dt,moving,stance){
 const u=root.userData,r=u.realistic;if(!r)return false;
 // The shipped GLBs provide native idle/walk. Use native run/crouch if present;
 // otherwise adapt walk playback speed without inventing a distorted body shape.
 const crouch=stance==='crouch',sprint=stance==='sprint'&&moving;
 const action=crouch?(moving?(r.actions.crouchwalk||r.actions.crouch||r.actions.walk):(r.actions.crouch||r.actions.idle)):moving?(sprint?(r.actions.run||r.actions.walk):r.actions.walk):r.actions.idle;
 if(action!==r.current){action.reset().setEffectiveWeight(1).play().crossFadeFrom(r.current,.22,false);r.current=action;}
 action.setEffectiveTimeScale(action===r.actions.walk?(u.hotelNpc?(u.patrolPlayback||1):u.villageNpc?(u.villagePlayback||1):sprint?1.6:crouch?.65:1):1);
 const delta=Math.max(0,Math.min(dt,.1));
 // A separately weighted upper-body wave leaves the native walk cycle running.
 const greeting=r.actions.greeting,remaining=u.hotelGreeting||0;
 if(greeting){
  if(remaining>0){
   if(!r.greetingActive){greeting.reset().setDuration(1.7).play();r.greetingActive=true;}
   greeting.setEffectiveWeight(2*Math.max(0,Math.min(1,(1.7-remaining)*6+.1,remaining*5)));
  }else if(r.greetingActive){greeting.stop();r.greetingActive=false;}
 }
 r.mixer.update(delta);r.time+=delta;
 const phase=r.time%4.7,blink=Math.max(0,1-Math.abs(phase-.11)/.11);
 for(const m of r.morphMeshes)for(const key of ['eyeBlinkLeft','eyeBlinkRight']){
  const i=m.morphTargetDictionary[key];if(i!==undefined)m.morphTargetInfluences[i]=blink;
 }
 if(u.nameTag)u.nameTag.position.y=r.height+.17;
 return true;
}
export function disposeRealistic(root){
 const u=root.userData;u.disposed=true;clearTimeout(u.realisticTimer);
 const r=u.realistic;if(!r)return;
 r.mixer.stopAllAction();r.mixer.uncacheRoot(r.model);
 releaseScene(r.model);r.pivot.removeFromParent();u.realistic=null;
}
