import * as THREE from 'three';

// Select one coherent visual assembly from a library scene containing variants
// and loose display props. Pure render asset processing; no mechanical model.
export function isolateDisplayProp(scene,reference){
  scene.updateMatrixWorld(true);reference.updateMatrixWorld(true);
  const pieces=[];
  scene.traverseVisible(o=>{if(o.isMesh&&o.geometry?.attributes?.position&&!o.isSkinnedMesh){
    o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const s=b.getSize(new THREE.Vector3()),span=Math.max(s.x,s.y,s.z);
    if(Number.isFinite(span)&&span>0)pieces.push({o,b,span});
  }});
  if(!pieces.length||pieces.length>180)throw Error('Keine isolierbare Spielrequisite');
  const longest=Math.max(...pieces.map(p=>p.span)),gap=longest*.018;
  // Connect only touching or very close mesh bounds; do not combine distant variants.
  const groups=[];const remaining=new Set(pieces);
  while(remaining.size){const seed=remaining.values().next().value;remaining.delete(seed);const group=[seed];
    for(let i=0;i<group.length;i++){const b=group[i].b.clone().expandByScalar(gap);for(const other of remaining)if(b.intersectsBox(other.b)){group.push(other);remaining.delete(other);}}
    groups.push(group);
  }
  const bounds=g=>g.reduce((b,p)=>b.union(p.b),new THREE.Box3());
  const score=g=>{const s=bounds(g).getSize(new THREE.Vector3());return Math.max(s.x,s.y,s.z);};
  groups.sort((a,b)=>score(b)-score(a)||b.length-a.length);
  const selected=groups[0],root=new THREE.Group(),visual=new THREE.Group();root.add(visual);
  for(const p of selected){const m=new THREE.Mesh(p.o.geometry,p.o.material);m.matrix.copy(p.o.matrixWorld);m.matrixAutoUpdate=false;visual.add(m);}
  visual.updateMatrixWorld(true);let box=new THREE.Box3().setFromObject(visual),s=box.getSize(new THREE.Vector3());
  if(s.y>Math.max(s.x,s.z)*1.05)throw Error('Unerwartete Ausrichtung der Spielrequisite');
  if(s.x>s.z){visual.rotation.y=Math.PI/2;visual.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(visual);s=box.getSize(new THREE.Vector3());}
  // Choose the less tall end as the forward-facing silhouette (display only).
  const samples=[[],[]];visual.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position;const step=Math.max(1,Math.floor(pos.count/4000));for(let i=0;i<pos.count;i+=step){const p=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);if(p.z<box.min.z+s.z*.25)samples[0].push(p.y);if(p.z>box.max.z-s.z*.25)samples[1].push(p.y);}});
  const spread=a=>a.length?a.reduce((m,x)=>Math.max(m,x),-Infinity)-a.reduce((m,x)=>Math.min(m,x),Infinity):0;
  if(spread(samples[0])>spread(samples[1])*1.18){visual.rotation.y+=Math.PI;visual.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(visual);s=box.getSize(new THREE.Vector3());}
  if(s.z<=0||s.x>s.z*.85||s.y>s.z*1.05)throw Error('Mehrfachmodell oder unplausible Spielsilhouette');
  const ref=new THREE.Box3().setFromObject(reference),refSize=ref.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=refSize.z/s.z;const holder=new THREE.Group();root.remove(visual);holder.add(visual);root.add(holder);holder.scale.setScalar(scale);holder.position.copy(ref.getCenter(new THREE.Vector3())).addScaledVector(center,-scale);
  root.updateMatrixWorld(true);const result=new THREE.Box3().setFromObject(root);
  if(!Number.isFinite(result.min.z)||result.isEmpty())throw Error('Leeres Darstellungsmodell');
  root.userData.front=[result.getCenter(new THREE.Vector3()).x,result.getCenter(new THREE.Vector3()).y,result.min.z];root.visible=false;
  return root;
}
