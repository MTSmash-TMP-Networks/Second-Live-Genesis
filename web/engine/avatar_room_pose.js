// Local avatar presentation only; no camera, movement or weapon simulation changes.
import * as THREE from 'three';
const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0);
const keys=['Hips','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand',
 'LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'];
export function roomRig(root){
 const r=root.userData.realistic;if(!r)return null;
 if(r.roomRig)return r.roomRig;
 const bones={};
 r.model.traverse(o=>{
  if(!o.isBone)return;
  const name=o.name.toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const k of keys){const key=k.toLowerCase();if(name===key||name.endsWith('mixamorig'+key)||name.endsWith(key)&&!bones[k])bones[k]=o;}
 });
 return r.roomRig=bones;
}
function remember(root,node){
 const saved=root.userData.roomPoseSaved??=new Map();
 if(!saved.has(node))saved.set(node,{position:node.position.clone(),quaternion:node.quaternion.clone()});
}
export function resetRoomAvatarPose(root){
 const saved=root.userData.roomPoseSaved;if(!saved)return;
 for(const [node,value] of saved){node.position.copy(value.position);node.quaternion.copy(value.quaternion);}
 saved.clear();
}
function point(root,node){return root.worldToLocal(node.getWorldPosition(new THREE.Vector3()));}
function aimBone(root,bone,child,dir){
 if(!bone||!child||!bone.parent)return;
 const a=bone.getWorldPosition(new THREE.Vector3()),b=child.getWorldPosition(new THREE.Vector3());
 const from=b.sub(a);if(from.lengthSq()<1e-10)return;
 const target=new THREE.Vector3(...dir).normalize().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
 const delta=new THREE.Quaternion().setFromUnitVectors(from.normalize(),target);
 const world=delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
 const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
 remember(root,bone);bone.quaternion.copy(parent.multiply(world)).normalize();bone.updateWorldMatrix(true,true);
}
function bend(root,rig,side,upper,lower,end,d1,d2){
 aimBone(root,rig[side+upper],rig[side+lower],d1);
 aimBone(root,rig[side+lower],rig[side+end],d2);
}
function offsetTo(root,body,joint,target){
 if(!joint)return;
 remember(root,body);body.position.add(new THREE.Vector3(...target).sub(point(root,joint)));
 body.updateWorldMatrix(true,true);
}
function tiltForBed(root,body,head){
 remember(root,body);
 body.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(X,Math.PI/2));
 body.updateWorldMatrix(true,true);
 // The camera anchor is at the head end, not the standing feet.
 offsetTo(root,body,head,[0,.86,0]);
}
export function applyRoomAvatarPose(root,pose=null,weapon=null,lookYaw=0){
 const u=root.userData,r=u.realistic,rig=roomRig(root);
 if(pose?.kind==='sit'){
  if(r&&rig?.Hips){
   for(const side of ['Left','Right']){
    const sign=side==='Left'?-1:1;
    bend(root,rig,side,'UpLeg','Leg','Foot',[sign*.08,-.26,-1],[0,-1,.1]);
    aimBone(root,rig[side+'Foot'],rig[side+'ToeBase'],[0,-.10,-1]);
    bend(root,rig,side,'Arm','ForeArm','Hand',[sign*.18,-1,-.12],[0,-.38,-1]);
   }
   offsetTo(root,r.pivot,rig.Hips,[0,.69,0]);
   if(rig.Head&&rig.Head.parent){
    const angle=Math.max(-.65,Math.min(.65,lookYaw));
    const q=new THREE.Quaternion().setFromAxisAngle(Y,angle).multiply(rig.Head.getWorldQuaternion(new THREE.Quaternion()));
    remember(root,rig.Head);rig.Head.quaternion.copy(rig.Head.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
   }
  }else if(!r){
   remember(root,u.body);u.body.position.y=.69-.925*u.height;
   for(let i=0;i<2;i++){
    for(const part of [u.legs[i],u.knees[i],u.arms[i],u.elbows[i]])remember(root,part);
    u.legs[i].rotation.x=1.30;u.knees[i].rotation.x=-1.40;
    u.arms[i].rotation.x=.22;u.elbows[i].rotation.x=1.05;
   }
  }
 }else if(pose?.kind==='lie'){
  if(r&&rig?.Head)tiltForBed(root,r.pivot,rig.Head);
  else if(!r)tiltForBed(root,u.body,u.head);
  if(r&&pose.sleeping)for(const m of r.morphMeshes||[])for(const key of ['eyeBlinkLeft','eyeBlinkRight']){
   const i=m.morphTargetDictionary[key];if(i!==undefined)m.morphTargetInfluences[i]=1;
  }
 }else if(weapon){
  // A relaxed cosmetic carry pose; the authored leg animation remains untouched.
  if(r&&rig){
   bend(root,rig,'Right','Arm','ForeArm','Hand',[.16,-1,-.22],[.04,-.38,-1]);
   if(weapon!=='pistol')bend(root,rig,'Left','Arm','ForeArm','Hand',[-.12,-1,-.18],[.30,-.38,-1]);
  }else if(!r){
   remember(root,u.arms[1]);remember(root,u.elbows[1]);u.arms[1].rotation.x=.18;u.elbows[1].rotation.x=.95;
   if(weapon!=='pistol'){remember(root,u.arms[0]);remember(root,u.elbows[0]);u.arms[0].rotation.x=.20;u.elbows[0].rotation.x=.95;}
  }
 }
 root.updateWorldMatrix(true,true);
}
// Borrow render meshes from existing game assets, never first-person arms or
// camera transforms. Shared geometry/materials belong to the original renderer.
export function clearRoomAvatarProps(root){
 const props=root?.userData.roomAvatarProps;if(!props)return;
 for(const e of props.values())e.holder.removeFromParent();props.clear();
}
export function updateRoomAvatarProp(root,models,kind){
 const u=root.userData,props=u.roomAvatarProps??=new Map(),source=models?.[kind];
 for(const e of props.values())e.holder.visible=false;
 if(!source)return null;
 const rig=roomRig(root);
 let hand=null;
 if(rig?.RightHand)hand=point(root,rig.RightHand);
 else if(!u.realistic&&u.body.visible&&u.elbows?.[1])hand=root.worldToLocal(u.elbows[1].localToWorld(new THREE.Vector3(0,-.32,0)));
 if(!hand)return null;
 let entry=props.get(kind);
 if(entry?.source!==source){
  entry?.holder.removeFromParent();
  const holder=new THREE.Group(),visual=source.clone(true);visual.visible=true;
  holder.name='Avatar cosmetic prop '+kind;holder.add(visual);
  visual.traverse(o=>{if(o.isMesh){o.raycast=()=>{};o.castShadow=true;o.receiveShadow=true;}});
  holder.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(visual,true),size=bounds.getSize(new THREE.Vector3());
  if(bounds.isEmpty()||!Number.isFinite(size.length())||size.length()<1e-5)return null;
  const center=bounds.getCenter(new THREE.Vector3());center.z=bounds.min.z+size.z*.75;center.y=bounds.min.y+size.y*.30;
  visual.position.sub(center);root.add(holder);
  entry={source,holder};props.set(kind,entry);
 }
 entry.holder.position.copy(hand);entry.holder.rotation.set(-.40,0,0);
 entry.holder.visible=true;return entry.holder;
}
