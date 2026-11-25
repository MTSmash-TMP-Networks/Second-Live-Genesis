// Real rigged human avatars, loaded independently of the room assets.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {avatarRecipe} from './avatar_recipe.js';

const providerPath='/engine/realistic-avatar.bundle.js';
const pending=new Map(),cache=new Map(),queue=[];
let provider=null,active=0;
function pump(){
 while(active<1&&queue.length){
  const job=queue.shift();
  if([...job.users].every(u=>u.disposed)){
   pending.delete(job.key);job.reject(Error('Avatar no longer needed'));continue;
  }
  active++;
  if(!provider)provider=import(providerPath).catch(e=>{provider=null;throw e;});
  provider.then(m=>m.generateAvatar(job.recipe)).then(result=>{
   cache.set(job.key,result);while(cache.size>4)cache.delete(cache.keys().next().value);
   job.resolve(result);
  },job.reject).finally(()=>{pending.delete(job.key);active--;pump();});
 }
}
function requestModel(recipe,u){
 const key=JSON.stringify(recipe);
 if(cache.has(key)){const result=cache.get(key);cache.delete(key);cache.set(key,result);return Promise.resolve(result);}
 let job=pending.get(key);
 if(!job){
  job={key,recipe,users:new Set()};
  job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  pending.set(key,job);queue.push(job);
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
 for(const s of skeletons)s.dispose();
 for(const g of geometry)g.dispose();
 for(const t of textures)t.dispose();
 for(const m of materials)m.dispose();
 scene.removeFromParent();
}
const clipKey=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_loop$/,'').replace(/_$/,'');
export function prepareRealistic(root,a,options){
 if(typeof window==='undefined'||typeof Worker==='undefined')return;
 const u=root.userData;u.realisticStatus='loading';
 // Wait for rapid editor changes to settle before starting the worker.
 u.realisticTimer=setTimeout(async()=>{
  let model=null;
  const deadline=setTimeout(()=>{if(!u.disposed&&!u.realistic)u.realisticStatus='fallback';},45000);
  try{
   const {bytes,clips}=await requestModel(avatarRecipe(a,options),u);
   if(u.disposed)return;
   if(bytes.byteLength<20||new DataView(bytes).getUint32(0,true)!==0x46546c67)throw Error('Invalid avatar GLB');
   const gltf=await new GLTFLoader().parseAsync(bytes.slice(0),'');model=gltf.scene;
   if(u.disposed){releaseScene(model);model=null;return;}
   let skins=0;model.traverse(o=>{if(o.isSkinnedMesh){skins++;o.frustumCulled=false;}if(o.isMesh)o.raycast=()=>{};});
   if(!skins)throw Error('Avatar is missing its skeleton');
   const pivot=new THREE.Group();pivot.rotation.y=Math.PI;pivot.add(model);
   model.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3());
   if(bounds.isEmpty()||!Number.isFinite(size.y)||size.y<1.1||size.y>2.5)throw Error('Unexpected avatar dimensions');
   model.position.y-=bounds.min.y;
   const mixer=new THREE.AnimationMixer(model),actions={};
   for(const [id,name] of Object.entries(clips)){
    const clip=gltf.animations.find(c=>clipKey(c.name)===clipKey(name)||clipKey(c.name)===id);
    if(!clip)throw Error('Missing animation: '+id);
    actions[id]=mixer.clipAction(clip);
   }
   actions.idle.play();root.add(pivot);
   u.realistic={pivot,model,mixer,actions,current:actions.idle,height:size.y};
   model=null;u.body.visible=false;
   // A hidden fallback must not affect any of the camera-free scene raycasts.
   u.body.traverse(o=>{if(o.isMesh)o.raycast=()=>{};});
   u.realisticStatus='ready';
  }catch(e){
   if(model)releaseScene(model);
   if(!u.disposed){u.realisticStatus='fallback';console.warn('Second Live avatar:',e.message||e);}
  }finally{clearTimeout(deadline);}
 },180);
}
export function animateRealistic(root,dt,moving,stance){
 const u=root.userData,r=u.realistic;if(!r)return false;
 const crouch=stance==='crouch';
 const action=crouch?r.actions.crouch:moving?(stance==='sprint'?r.actions.run:r.actions.walk):r.actions.idle;
 if(action!==r.current){r.current.fadeOut(.18);action.reset().setEffectiveWeight(1).fadeIn(.18).play();r.current=action;}
 r.mixer.update(Math.max(0,Math.min(dt,.1)));
 if(u.nameTag)u.nameTag.position.y=r.height+.17-(crouch?.35:0);
 return true;
}
export function disposeRealistic(root){
 const u=root.userData;u.disposed=true;clearTimeout(u.realisticTimer);
 const r=u.realistic;if(!r)return;
 r.mixer.stopAllAction();r.mixer.uncacheRoot(r.model);
 releaseScene(r.model);r.pivot.removeFromParent();u.realistic=null;
}
