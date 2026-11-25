import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeRoomModel,modelCollision,withMirrorActors,buildRoomMirror,RoomModels} from './room_customization.js';
const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,1),new THREE.MeshStandardMaterial());
mesh.position.set(12,9,-4);const raw=new THREE.Group();raw.add(mesh);
const fitted=normalizeRoomModel(raw);
const bounds=new THREE.Box3().setFromObject(fitted.root,true);
assert.ok(Math.abs(bounds.min.y)<1e-8);assert.ok(Math.abs(bounds.max.y-1)<1e-8);
assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).x)<1e-8);
assert.deepEqual(fitted.size,[.5,1,.25]);
const collision=modelCollision({id:'a',x:2,y:.3,z:-1,extent:2,rotation:90},fitted.size);
assert.equal(collision.id,'a');
assert.ok(Math.abs(collision.s[0]-.5)<1e-8&&Math.abs(collision.s[2]-1)<1e-8);
assert.ok(Math.abs(collision.p[1]-1.3)<1e-8);
const owner={scene:new THREE.Scene(),quality:'1k',localCharacter:new THREE.Group(),weaponRoot:new THREE.Group(),reflectPlayer:true};
owner.localCharacter.visible=false;owner.weaponRoot.visible=true;
assert.throws(()=>withMirrorActors(owner,()=>{assert.equal(owner.localCharacter.visible,true);assert.equal(owner.weaponRoot.visible,false);throw Error('test');}));
assert.equal(owner.localCharacter.visible,false);assert.equal(owner.weaponRoot.visible,true);
const mirror=buildRoomMirror(owner);owner.scene.updateMatrixWorld(true);
assert.equal(mirror.root.parent,owner.scene);
assert.ok(new THREE.Vector3(0,0,1).transformDirection(mirror.reflector.matrixWorld).distanceTo(new THREE.Vector3(1,0,0))<1e-8);
assert.equal(mirror.reflector.getRenderTarget().width,512);
mirror.reflector.dispose();
const imports=new RoomModels(owner.scene);imports.sync([],()=>{throw Error('Unexpected fetch');});
assert.deepEqual(imports.colliders(),[]);imports.clear();
console.log('Room customization: normalized floor placement, rotated collision, mirror orientation and visibility restoration OK');

import {roomRig,resetRoomAvatarPose,applyRoomAvatarPose,updateRoomAvatarProp,clearRoomAvatarProps} from './avatar_room_pose.js';
// Test the real Three.js hierarchy and Rocketbox-style bone names.
{
 const avatar=new THREE.Group(),pivot=new THREE.Group(),model=new THREE.Group();
 avatar.add(pivot);pivot.add(model);avatar.rotation.y=.7;avatar.position.set(2,.05,-1);
 const bone=(parent,name,x,y,z)=>{const b=new THREE.Bone();b.name='mixamorig'+name;b.position.set(x,y,z);parent.add(b);return b;};
 const hips=bone(model,'Hips',0,.96,0),head=bone(hips,'Head',0,.65,0);
 for(const [side,sign] of [['Left',-1],['Right',1]]){
  const thigh=bone(hips,side+'UpLeg',sign*.10,-.04,0),shin=bone(thigh,side+'Leg',0,-.43,0),foot=bone(shin,side+'Foot',0,-.42,0);bone(foot,side+'ToeBase',0,-.04,-.15);
  const arm=bone(hips,side+'Arm',sign*.20,.48,0),elbow=bone(arm,side+'ForeArm',0,-.29,0);bone(elbow,side+'Hand',0,-.26,0);
 }
 avatar.userData.realistic={model,pivot,morphMeshes:[]};
 const local=b=>avatar.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
 const rig=roomRig(avatar);
 applyRoomAvatarPose(avatar,{kind:'sit'},null,.3);
 assert.ok(Math.abs(local(hips).y-.69)<1e-6);
 assert.ok(local(rig.RightLeg).z<local(rig.RightUpLeg).z-.30);
 assert.ok(local(rig.RightFoot).y<local(rig.RightLeg).y-.30);
 resetRoomAvatarPose(avatar);assert.ok(Math.abs(local(hips).y-.96)<1e-6);
 applyRoomAvatarPose(avatar,{kind:'lie'});
 assert.ok(Math.abs(local(head).y-.86)<1e-6&&Math.abs(local(head).z)<1e-6);
 assert.ok(local(hips).z<local(head).z-.55);
 resetRoomAvatarPose(avatar);assert.ok(Math.abs(local(head).y-1.61)<1e-6);
 const material=new THREE.MeshStandardMaterial(),source=new THREE.Group();
 source.add(new THREE.Mesh(new THREE.BoxGeometry(.10,.15,.35),material));source.visible=false;
 const props={pistol:source,rifle:source,m16:source};
 applyRoomAvatarPose(avatar,null,'pistol');
 const display=updateRoomAvatarProp(avatar,props,'pistol');
 assert.ok(display.visible&&display.parent===avatar&&display.position.distanceTo(local(rig.RightHand))<1e-6);
 assert.equal(source.visible,false);assert.equal(source.children.length,1);
 assert.equal(display.children[0].children[0].material,material);
 const reflected={localCharacter:avatar,weaponRoot:source,reflectPlayer:true};avatar.visible=false;source.visible=true;
 withMirrorActors(reflected,()=>{assert.equal(avatar.visible,true);assert.equal(display.visible,true);assert.equal(source.visible,false);});
 assert.equal(avatar.visible,false);assert.equal(source.visible,true);
 resetRoomAvatarPose(avatar);applyRoomAvatarPose(avatar,null,'rifle');const long=updateRoomAvatarProp(avatar,props,'rifle');
 assert.equal(display.visible,false);assert.equal(long.visible,true);
 updateRoomAvatarProp(avatar,props,null);assert.equal(long.visible,false);
 clearRoomAvatarProps(avatar);assert.equal(display.parent,null);assert.equal(long.parent,null);
 resetRoomAvatarPose(avatar);assert.ok(Math.abs(local(hips).y-.96)<1e-6);
}
console.log('Room avatar: seated and lying bone poses, restoration, hand-attached cosmetic props and mirror visibility verified');
