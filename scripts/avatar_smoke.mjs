// Actual upstream GLB + Three.js skinning test. No GPU, no browser requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectHand,poseHand } from './avatar_hands.js';
const loader=new GLTFLoader();let tested=0;
for(const side of ['left','right']){
  const file=`/build/hands/${side}.glb`;
  if(!fs.existsSync(file)){console.log('Optional original hand missing:',side);continue;}
  const buf=fs.readFileSync(file),bytes=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  const gltf=await loader.parseAsync(bytes,'');const src=inspectHand(gltf.scene);
  assert.equal(src.nodes.size,25);assert.ok(src.skin.geometry.attributes.position.count>100);
  const wrist=[.08,-.13,.16],palm=[.03,-.07,.07];const model=poseHand(gltf.scene,side,wrist,palm);
  const hand=inspectHand(model);model.updateMatrixWorld(true);hand.skin.skeleton.update();
  assert.ok(hand.nodes.get('wrist').getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...wrist))<1e-4);
  assert.notEqual(hand.skin.skeleton,src.skin.skeleton);assert.ok([...hand.skin.skeleton.boneMatrices].every(Number.isFinite));
  const bounds=new THREE.Box3().setFromObject(model,true);assert.ok(!bounds.isEmpty()&&bounds.getSize(new THREE.Vector3()).length()<.5);
  tested++;
}
console.log(`Three.js imported hand skeletons: ${tested}/2 tested`);
