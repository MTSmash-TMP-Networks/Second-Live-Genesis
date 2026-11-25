import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// Existing 2 m scan portal retains its wall layout and legacy damage IDs.
export const DOOR_WIDTH=1.12, DOOR_HEIGHT=2.2;
export const PORTAL_SIDES=[-.78,.78].map(x=>({p:[x,1.1,-5],s:[.44,2.2,.2]}));
export function fitDoor(model){
  model.updateMatrixWorld(true);let b=new THREE.Box3().setFromObject(model),s=b.getSize(new THREE.Vector3());
  if(s.z>s.x){model.rotation.y+=Math.PI/2;model.updateMatrixWorld(true);b=new THREE.Box3().setFromObject(model);s=b.getSize(new THREE.Vector3());}
  if(![s.x,s.y,s.z].every(n=>Number.isFinite(n)&&n>0)||s.x/s.y<.35||s.x/s.y>.8||s.z/s.y>.35)throw Error('Unexpected door proportions');
  const scale=Math.min(DOOR_WIDTH/s.x,DOOR_HEIGHT/s.y),center=b.getCenter(new THREE.Vector3());
  // Fill the exact aperture with modest normalization; reject odd source geometry above.
  const root=new THREE.Group(),inner=new THREE.Group();inner.add(model);inner.scale.set(DOOR_WIDTH/s.x,DOOR_HEIGHT/s.y,Math.min(scale,.22/s.z));inner.position.set(-center.x*inner.scale.x,-b.min.y*inner.scale.y,-center.z*inner.scale.z);root.add(inner);root.position.z=-4.97;
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return root;
}
function box(group,size,p,material,r=.008){const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,3,Math.min(r,Math.min(...size)*.23)),material);mesh.position.set(...p);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;}
function localDoor(renderer){
  const frame=new THREE.Group(),leaf=new THREE.Group(),pivot=new THREE.Group();frame.position.z=-4.97;
  const paint=new THREE.MeshStandardMaterial({color:0xddd8ce,roughness:.62}),green=new THREE.MeshStandardMaterial({color:0x526d64,roughness:.69}),inset=new THREE.MeshStandardMaterial({color:0x405a52,roughness:.74}),edge=new THREE.MeshStandardMaterial({color:0x6b8277,roughness:.58}),metal=new THREE.MeshStandardMaterial({color:0xa28b5a,metalness:.8,roughness:.33});
  const wood=renderer.textured?.oak_veneer_01;if(wood?.normalMap){for(const m of [green,inset,edge]){m.normalMap=wood.normalMap;m.normalScale.set(.12,.12);}}
  for(const x of [-.52,.52]){box(frame,[.08,2.16,.19],[x,1.08,0],paint);box(frame,[.105,2.2,.04],[x,1.1,.103],paint);}
  box(frame,[1.12,.07,.19],[0,2.165,0],paint);box(frame,[1.12,.04,.045],[0,2.18,.105],paint);
  pivot.position.set(-.475,0,0);frame.add(pivot);leaf.position.x=.475;pivot.add(leaf);
  box(leaf,[.94,2.11,.058],[0,1.055,0],green,.012);
  for(const z of [-.033,.033])for(const x of [-.207,.207])for(const [y,h] of [[.59,.72],[1.53,.92]]){
    box(leaf,[.355,h,.017],[x,y,z],edge,.01);box(leaf,[.311,h-.055,.022],[x,y,z+Math.sign(z)*.008],inset,.008);box(leaf,[.27,h-.102,.018],[x,y,z+Math.sign(z)*.021],green,.012);
  }
  for(const z of [-.06,.06]){box(leaf,[.058,.175,.016],[.375,1.03,z],metal,.012);box(leaf,[.13,.026,.026],[.325,1.075,z+Math.sign(z)*.026],metal,.012);}
  for(const y of [.27,1.05,1.83]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,.105,12),metal);m.position.set(-.48,y,.05);frame.add(m);}
  return {frame,pivot};
}
export async function buildPortalDoor(renderer,manifest,path,loader){
  const fixed=new THREE.Group();fixed.name='Scan portal side panels';renderer.staticGroup.add(fixed);
  const plaster=renderer.textured?.white_plaster_02||new THREE.MeshStandardMaterial({color:0xd9d4c9,roughness:.82});
  for(const side of PORTAL_SIDES)box(fixed,side.s,side.p,plaster,.002);
  const {frame,pivot}=localDoor(renderer);renderer.staticGroup.add(frame);let original=null;
  const url=manifest.door_models?.[renderer.quality]||manifest.door_models?.['1k']||manifest.door_models?.['2k'];
  if(url)try{const gltf=await loader.loadAsync(path(url));original=fitDoor(gltf.scene);renderer.staticGroup.add(original);}catch(e){console.warn('Original door not usable; local panel door active',e);}
  renderer.realismStatus.door=original?'ready':'local';
  let last=null;const setOpen=open=>{open=!!open;if(open===last)return;last=open;if(original)original.visible=!open;frame.visible=!original||open;pivot.rotation.y=open?-Math.PI/2:0;};
  setOpen(false);return {setOpen};
}
