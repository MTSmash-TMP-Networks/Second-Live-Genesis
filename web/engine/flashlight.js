import * as THREE from 'three';

// Local phone lamp. One reusable, distance-limited light; no account or network state.
export function createFlashlight(quality='1k'){
 const light=new THREE.SpotLight(0xfff4df,260,28,Math.PI/7,.68,2);
 light.name='Phone flashlight';light.castShadow=true;
 light.shadow.mapSize.set(quality==='2k'?1024:512,quality==='2k'?1024:512);
 light.shadow.camera.near=.08;light.shadow.camera.far=28;
 light.shadow.bias=-.0002;light.shadow.normalBias=.025;
 return light;
}
export function updateFlashlight(light,scene,beam){
 if(!scene||!beam){
  light.removeFromParent();light.target.removeFromParent();return;
 }
 const {origin,direction}=beam;
 // The source follows the character's eye, not the displaced third-person camera.
 const length=Math.hypot(...direction);
 if(!Number.isFinite(length)||length<1e-6||!origin.every(Number.isFinite)){
  light.removeFromParent();light.target.removeFromParent();return;
 }
 const d=direction.map(v=>v/length);
 if(light.parent!==scene)scene.add(light);
 if(light.target.parent!==scene)scene.add(light.target);
 light.position.set(origin[0]+d[0]*.28,origin[1]+d[1]*.28-.08,origin[2]+d[2]*.28);
 light.target.position.set(light.position.x+d[0]*8,light.position.y+d[1]*8,light.position.z+d[2]*8);
}
