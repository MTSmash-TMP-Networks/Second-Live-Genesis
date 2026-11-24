import * as THREE from 'three';
export function axis(value,dead=.19){return Math.abs(value||0)<dead?0:Math.max(-1,Math.min(1,value));}
export function stick(gamepad){const a=gamepad?.axes||[];return a.length>=4?[axis(a[2]),axis(a[3])]:a.length>=2?[axis(a[0]),axis(a[1])]:[0,0];}
export class XRMode {
  constructor(owner){
    this.owner=owner;this.xr=owner.renderer.xr;this.rig=owner.rig;this.xr.enabled=true;this.xr.setReferenceSpaceType('local-floor');this.xr.setFramebufferScaleFactor(.82);this.xr.setFoveation(.75);
    this.sources=new Map();this.controllers=[];this.turnReady=true;this.onAction=null;this.onEnd=null;
    for(let i=0;i<2;i++){
      const controller=this.xr.getController(i),grip=this.xr.getControllerGrip(i);
      controller.visible=false;grip.visible=false;this.rig.add(controller,grip);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-2)]),new THREE.LineBasicMaterial({color:0x85ebd9,transparent:true,opacity:.65}));controller.add(line);
      const marker=new THREE.Mesh(new THREE.CapsuleGeometry(.032,.07,4,8),new THREE.MeshStandardMaterial({color:0x4a5156,roughness:.8}));marker.rotation.x=Math.PI/2;grip.add(marker);
      const entry={controller,grip,marker,source:null,prop:null,selected:null};this.controllers.push(entry);
      controller.addEventListener('connected',e=>{entry.source=e.data;this.sources.set(e.data,entry);controller.visible=true;grip.visible=true;});
      controller.addEventListener('disconnected',()=>{this.sources.delete(entry.source);entry.source=null;controller.visible=false;grip.visible=false;});
      const ray=()=>{this.rig.updateMatrixWorld(true);return {origin:controller.getWorldPosition(new THREE.Vector3()).toArray(),direction:new THREE.Vector3(0,0,-1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion())).toArray()};};
      controller.addEventListener('select',()=>{if(entry.source&&this.xr.isPresenting)this.onAction?.('select',ray());});
      controller.addEventListener('squeezestart',()=>{if(entry.source&&this.xr.isPresenting)this.onAction?.('repair',ray());});
    }
    this.xr.addEventListener('sessionend',()=>{this.rig.position.set(0,0,0);this.rig.rotation.set(0,0,0);this.owner.camera.position.set(0,0,0);this.owner.camera.quaternion.identity();this.owner.width=0;this.owner.height=0;this.turnReady=true;this.sources.clear();for(const e of this.controllers){e.source=null;e.controller.visible=false;e.grip.visible=false;}this.onEnd?.();});
  }
  async supported(){try{return !!globalThis.isSecureContext&&!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-vr');}catch{return false;}}
  async enter(){
    // Call directly from a user click, before waiting on any unrelated work.
    const session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor']});
    try{await this.xr.setSession(session);}catch(e){await session.end().catch(()=>{});throw e;}
  }
  async end(){const s=this.xr.getSession();if(s)await s.end();}
  get active(){return this.xr.isPresenting;}
  inputs(frame){
    if(!this.active)return {move:[0,0],turn:0,headYaw:0};
    const sources=Array.from(this.xr.getSession()?.inputSources||[]), left=sources.find(s=>s.handedness==='left'), right=sources.find(s=>s.handedness==='right');
    const move=stick(left?.gamepad||(!right?sources[0]?.gamepad:null)), turnAxis=stick(right?.gamepad)[0];
    let turn=0;if(this.turnReady&&Math.abs(turnAxis)>.72){turn=-Math.sign(turnAxis)*Math.PI/6;this.turnReady=false;}else if(Math.abs(turnAxis)<.3)this.turnReady=true;
    const pose=frame?.getViewerPose(this.xr.getReferenceSpace());let headYaw=0;
    if(pose){const q=pose.transform.orientation;const f=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));headYaw=Math.atan2(-f.x,-f.z);}
    return {move:[move[0],-move[1]],turn,headYaw};
  }
  place(player){if(this.active){this.rig.position.set(player.x,player.y,player.z);this.rig.rotation.set(0,player.yaw,0);this.rig.updateMatrixWorld(true);}}
  equip(id){
    for(const e of this.controllers){const wanted=e.source?.handedness==='right'?id:null;if(e.selected===wanted)continue;e.selected=wanted;if(e.prop){e.grip.remove(e.prop);e.prop=null;}e.marker.visible=!wanted;if(wanted&&this.owner.weaponModels[wanted]){e.prop=this.owner.weaponModels[wanted].clone(true);e.prop.visible=true;e.prop.position.set(0,0,-.06);e.prop.rotation.set(0,0,0);e.grip.add(e.prop);}}
  }
}
