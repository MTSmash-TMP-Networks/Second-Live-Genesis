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
export function poseHand(source,side,wristPosition,palmPosition){
  const model=clone(source);const {nodes,skin}=inspectHand(model);
  const wrist=nodes.get('wrist'),middle=nodes.get('middle-finger-phalanx-proximal'),index=nodes.get('index-finger-phalanx-proximal'),little=nodes.get('pinky-finger-phalanx-proximal');
  if([...nodes.values()].some(n=>n.parent!==wrist.parent))throw Error('Unerwartete Handskelett-Hierarchie');
  const inward=new THREE.Vector3(side==='left'?1:-1,0,0);
  for(const f of fingers){
    const chain=['proximal','intermediate','distal'].map(n=>nodes.get(f+'-finger-phalanx-'+n));chain.push(nodes.get(f+'-finger-tip'));
    for(let i=0;i<3;i++){
      const a=chain[i],b=chain[i+1],dir=b.position.clone().sub(a.position).normalize(),axis=dir.clone().cross(inward).normalize();
      if(axis.lengthSq()<.5)continue;
      const turn=new THREE.Quaternion().setFromAxisAngle(axis,[.58,.70,.40][i]);
      const pivot=a.position.clone();
      for(let j=i;j<chain.length;j++){const bone=chain[j];bone.position.sub(pivot).applyQuaternion(turn).add(pivot);bone.quaternion.premultiply(turn);}
    }
  }
  const forward=middle.position.clone().sub(wrist.position).normalize(),width=little.position.clone().sub(index.position);width.addScaledVector(forward,-width.dot(forward)).normalize();
  const normal=forward.clone().cross(width).normalize();
  const targetForward=V(palmPosition).sub(V(wristPosition)).normalize();
  const targetNormal=side==='left'?new THREE.Vector3(0,1,0):new THREE.Vector3(-1,.25,0);
  targetNormal.addScaledVector(targetForward,-targetNormal.dot(targetForward)).normalize();if(normal.dot(inward)<0)targetNormal.negate();
  const targetWidth=targetNormal.clone().cross(targetForward).normalize();
  const from=new THREE.Matrix4().makeBasis(forward,width,normal),to=new THREE.Matrix4().makeBasis(targetForward,targetWidth,targetNormal),q=new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
  // Pose in source armature coordinates, then locate its wrist at the cuff.
  model.updateMatrixWorld(true);const worldWrist=wrist.getWorldPosition(new THREE.Vector3());
  const outer=new THREE.Group(),inner=new THREE.Group();inner.add(model);inner.position.copy(worldWrist).negate();outer.add(inner);outer.quaternion.copy(q);outer.scale.setScalar(.82);outer.position.copy(V(wristPosition));
  skin.material=new THREE.MeshPhysicalMaterial({color:0xbd9378,roughness:.79,metalness:0,envMapIntensity:.22,sheen:.14,sheenColor:0xf4c5aa,sheenRoughness:1});
  skin.castShadow=false;skin.receiveShadow=true;skin.frustumCulled=false;outer.updateMatrixWorld(true);return outer;
}
