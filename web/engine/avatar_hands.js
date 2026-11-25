import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
const V=a=>new THREE.Vector3(...a);
const fingers=['index','middle','ring','pinky'];
export function inspectHand(root){
  const nodes=new Map();let skin=null;root.traverse(o=>{if(o.isBone)nodes.set(o.name,o);if(o.isSkinnedMesh)skin=o;});
  if(!skin||!nodes.has('wrist')||!nodes.has('thumb-tip')||fingers.some(f=>!nodes.has(f+'-finger-tip'))||nodes.size<25)throw Error('Handmodell ohne vollstaendiges Skelett');
  return {nodes,skin};
}
// The upstream generic-hand GLBs have a flat skeleton in one armature.
// These are stylized avatar poses, not physical interaction or weapon mechanics.
export function poseHand(source,side,wristPosition,palmPosition,options={}){
  const model=clone(source);const {nodes,skin}=inspectHand(model);
  const wrist=nodes.get('wrist'),middle=nodes.get('middle-finger-phalanx-proximal'),index=nodes.get('index-finger-phalanx-proximal'),little=nodes.get('pinky-finger-phalanx-proximal');
  if([...nodes.values()].some(n=>n.parent!==wrist.parent))throw Error('Unerwartete Handskelett-Hierarchie');
  const inward=new THREE.Vector3(side==='left'?1:-1,0,0);
  const palmLocal=wrist.position.clone().lerp(middle.position,.64);
  // A stable source-space bend axis is essential for the flat WebXR skeleton.
  // Recomputing it after every joint can reverse the curl as fingers fold back.
  const curl=options.curl||[.94,1.05,.64];
  for(const f of fingers){
    const chain=['proximal','intermediate','distal'].map(n=>nodes.get(f+'-finger-phalanx-'+n));chain.push(nodes.get(f+'-finger-tip'));
    const axis=chain[1].position.clone().sub(chain[0].position).normalize().cross(inward).normalize();
    if(axis.lengthSq()<.5)continue;
    for(let i=0;i<3;i++){
      const a=chain[i];
      const turn=new THREE.Quaternion().setFromAxisAngle(axis,curl[i]);
      const pivot=a.position.clone();
      for(let j=i;j<chain.length;j++){const bone=chain[j];bone.position.sub(pivot).applyQuaternion(turn).add(pivot);bone.quaternion.premultiply(turn);}
    }
  }
  // Bring the thumb toward the palm without collapsing the other fingers.
  const thumb=['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'].map(n=>nodes.get(n));
  if(thumb.every(Boolean)){
    const pivot=thumb[0].position.clone(),dir=thumb[2].position.clone().sub(pivot).normalize();
    const towards=palmLocal.clone().addScaledVector(inward,.024).sub(pivot).normalize();
    const rotation=new THREE.Quaternion().setFromUnitVectors(dir,towards);rotation.slerp(new THREE.Quaternion(),.45);
    for(const b of thumb){b.position.sub(pivot).applyQuaternion(rotation).add(pivot);b.quaternion.premultiply(rotation);}
  }
  const forward=middle.position.clone().sub(wrist.position).normalize(),width=little.position.clone().sub(index.position);width.addScaledVector(forward,-width.dot(forward)).normalize();
  const normal=forward.clone().cross(width).normalize();
  const targetForward=V(palmPosition).sub(V(wristPosition)).normalize();
  const targetNormal=options.normal?V(options.normal):side==='left'?new THREE.Vector3(0,1,0):new THREE.Vector3(-1,.25,0);
  targetNormal.addScaledVector(targetForward,-targetNormal.dot(targetForward)).normalize();if(normal.dot(inward)<0)targetNormal.negate();
  const targetWidth=targetNormal.clone().cross(targetForward).normalize();
  const from=new THREE.Matrix4().makeBasis(forward,width,normal),to=new THREE.Matrix4().makeBasis(targetForward,targetWidth,targetNormal),q=new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
  // Pose in source armature coordinates, then locate its wrist at the cuff.
  model.updateMatrixWorld(true);const worldWrist=wrist.getWorldPosition(new THREE.Vector3()),worldPalm=wrist.parent.localToWorld(palmLocal.clone());
  const outer=new THREE.Group(),inner=new THREE.Group();inner.add(model);inner.position.copy(worldWrist).negate();outer.add(inner);outer.quaternion.copy(q);outer.scale.setScalar(.82);outer.position.copy(V(wristPosition));
  if(options.contact){
    // Place the palm on the visual anchor, then derive the wrist/cuff from it.
    const offset=worldPalm.sub(worldWrist).multiplyScalar(.82).applyQuaternion(q);
    outer.position.copy(V(options.contact)).sub(offset);
  }
  outer.userData.wrist=outer.position.toArray();
  skin.material=new THREE.MeshPhysicalMaterial({color:0xbd9378,roughness:.79,metalness:0,envMapIntensity:.22,sheen:.14,sheenColor:0xf4c5aa,sheenRoughness:1});
  skin.castShadow=false;skin.receiveShadow=true;skin.frustumCulled=false;outer.updateMatrixWorld(true);return outer;
}

// Pose around a visual game-prop contact point; sleeve follows the solved wrist.
export function poseContactHand(source,side,contact,forward,normal,curl){
  const c=V(contact),f=V(forward).normalize();
  if(f.lengthSq()<.5)throw Error('Invalid visual hand direction');
  const model=poseHand(source,side,c.clone().addScaledVector(f,-.07).toArray(),c.toArray(),{contact,normal,curl});
  return model;
}
