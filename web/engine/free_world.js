import * as THREE from 'three';
import layout from './free_world_layout.json';
import {RoomModels} from './room_customization.js';
import {ShotEffects} from './shotfx.js';
import {createCharacter,animateCharacter,disposeCharacter,normalizeCharacter} from './character.js';
import {resetRoomAvatarPose,applyRoomAvatarPose,updateRoomAvatarProp,clearRoomAvatarProps} from './avatar_room_pose.js';
export const FREE_LAYOUT=layout;
const H=layout.half,Y=layout.height,G=layout.grid;
export function freeBounds(block){return {p:block.cell.map((v,i)=>(v+block.dims[i]/2)*G),s:block.dims.map(v=>v*G)};}
export function freeOverlap(a,s,b,t){return a.every((v,i)=>v<b[i]+t[i]&&v+s[i]>b[i]);}
export function validFreeGrid(cell,dims){
 return cell.length===3&&dims.length===3&&cell.every(Number.isInteger)&&dims.every(v=>layout.sizes.includes(v))&&cell.every((v,i)=>v>=[-H/G,0,-H/G][i]&&v+dims[i]<=[H/G,Y/G,H/G][i])&&!freeOverlap(cell,dims,[-6,0,H/G-12],[12,Y/G,12]);
}
export function freeRayBox(origin,direction,min,size,limit=layout.reach){
 let lo=0,hi=limit,normal=null;
 for(let i=0;i<3;i++){
  const d=direction[i],o=origin[i],a=min[i],b=a+size[i];
  if(Math.abs(d)<1e-9){if(o<a||o>b)return null;continue;}
  const t0=(a-o)/d,t1=(b-o)/d,t=Math.min(t0,t1);
  if(t>=lo){lo=t;normal=[0,0,0];normal[i]=d>0?-1:1;}
  hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;
 }
 return normal&&lo<=limit?{dist:lo,normal,point:origin.map((o,i)=>o+direction[i]*lo)}:null;
}
export function freeRay(origin,direction,blocks,limit=layout.reach,includeDestroyed=false){
 let best=null;
 const consider=(hit,id=null)=>{if(hit&&hit.dist>=0&&(!best||hit.dist<best.dist))best={...hit,id};};
 for(const block of blocks){if(!includeDestroyed&&(block.hp??100)<=0)continue;consider(freeRayBox(origin,direction,block.cell.map(x=>x*G),block.dims.map(x=>x*G),limit),block.id);}
 // The six interior faces accept blocks (not an invisible room shell).
 for(let i=0;i<3;i++)for(const side of [-1,1]){
  if(i===1&&side>0)continue; // Open sky, not a placeable invisible ceiling.
  const plane=i===1?0:side*H,d=direction[i];
  if(Math.abs(d)<1e-9||side*d<=0)continue;
  const t=(plane-origin[i])/d;if(t<0||t>limit)continue;
  const p=origin.map((o,j)=>o+direction[j]*t);
  if(p[0]<-H-.001||p[0]>H+.001||p[2]<-H-.001||p[2]>H+.001||p[1]<-.001||p[1]>Y+.001)continue;
  const normal=[0,0,0];normal[i]=-side;consider({dist:t,normal,point:p});
 }
 return best;
}
export function freePlacement(hit,dims,blocks,players=[]){
 if(!hit)return null;
 const axis=hit.normal.findIndex(v=>v!==0);
 if(axis<0)return null;
 const cell=hit.point.map((v,i)=>i===axis?Math.round(v/G)-(hit.normal[i]<0?dims[i]:0):Math.floor(v/G-dims[i]/2+.5));
 if(!validFreeGrid(cell,dims)||blocks.some(b=>freeOverlap(cell,dims,b.cell,b.dims)))return null;
 const min=cell.map(x=>x*G),size=dims.map(x=>x*G);
 if(players.some(p=>freeOverlap(min,size,[p[0]-.28,p[1]+.015,p[2]-.28],[.56,1.6,.56])))return null;
 return {cell,dims:[...dims]};
}
export function freeExitAt(origin,direction){
 if(direction[2]<=1e-8)return false;
 const t=(H-origin[2])/direction[2];
 return t>=0&&t<=3.2&&Math.abs(origin[0]+direction[0]*t)<1.0&&origin[1]+direction[1]*t>=0&&origin[1]+direction[1]*t<=2.6;
}
export function freeBlocked(blocks,x,y,z,height=1.6){
 if(Math.abs(x)>H-.28||Math.abs(z)>H-.28||y+height>Y+.001)return true;
 return blocks.some(b=>(b.hp??100)>0&&freeOverlap([x-.25,y+.015,z-.25],[.5,height-.015,.5],b.cell.map(v=>v*G),b.dims.map(v=>v*G)));
}
export function freeGround(blocks,x,y,z){
 let ground=0;
 for(const b of blocks){if((b.hp??100)<=0)continue;const min=b.cell.map(v=>v*G),s=b.dims.map(v=>v*G),top=min[1]+s[1];
  if(top<=y+.025&&x>min[0]-.22&&x<min[0]+s[0]+.22&&z>min[2]-.22&&z<min[2]+s[2]+.22)ground=Math.max(ground,top);
 }
 return ground;
}
function textSprite(value,width=1.5,height=.4){
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
 ctx.fillStyle='#253644';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#89b9c1';ctx.lineWidth=4;ctx.strokeRect(3,3,506,122);ctx.fillStyle='#fff';ctx.font='600 50px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(value),256,64,470);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true}));sprite.scale.set(width,height,1);sprite.raycast=()=>{};return sprite;
}
// One virtual solar cycle, phase 0 = midnight, 0.5 = noon.
export function freeSkyState(phase){
 const angle=(phase-.25)*Math.PI*2,elevation=Math.sin(angle);
 const day=Math.max(0,Math.min(1,(elevation+.12)/.42));
 const twilight=Math.max(0,1-Math.abs(elevation)/.20);
 return {direction:[Math.cos(angle),elevation,.18],day,twilight,night:1-day};
}
export class FreeWorldView{
 constructor(){
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xf4f5f5);this.scene.fog=new THREE.Fog(0xf4f5f5,145,330);
  this.hemi=new THREE.HemisphereLight(0xffffff,0x828b93,1.0);this.sunlight=new THREE.DirectionalLight(0xffffff,2.1);this.moonlight=new THREE.DirectionalLight(0x9bb9ec,.18);
  this.scene.add(this.hemi,this.sunlight,this.moonlight);
  this.sky=new THREE.Group();this.scene.add(this.sky);
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,uniforms:{top:{value:new THREE.Color(0x448cca)},horizon:{value:new THREE.Color(0xd8e9f5)}},vertexShader:'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vDir;uniform vec3 top;uniform vec3 horizon;void main(){float t=pow(clamp(normalize(vDir).y,0.,1.),0.45);gl_FragColor=vec4(mix(horizon,top,t),1.);}' });
  this.sky.add(new THREE.Mesh(new THREE.SphereGeometry(420,32,20),skyMat));this.skyMat=skyMat;
  this.sun=new THREE.Mesh(new THREE.SphereGeometry(7,24,16),new THREE.MeshBasicMaterial({color:0xffdf99,toneMapped:false}));
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(4.5,24,16),new THREE.MeshBasicMaterial({color:0xe3eaff,toneMapped:false}));this.sky.add(this.sun,this.moon);
  this.phase=0.5;this.phaseTime=0;this.effects=new ShotEffects(this.scene);this.models=new RoomModels(this.scene);this.models.root.name='Shared Free World models';this.modelRefs=new Map();
  this.cube=new THREE.BoxGeometry(1,1,1);this.materials=new Map();this.textures=new Map();this.meshes=[];this.peers=new Map();this.local=null;this.revision=-1;this.generation=0;
  const room=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
  const box=(p,s,m=room)=>{const o=new THREE.Mesh(this.cube,m);o.position.set(...p);o.scale.set(...s);this.scene.add(o);return o;};
  const floor=new THREE.MeshStandardMaterial({color:0x6b7075,roughness:.98,metalness:0});
  box([0,-.15,0],[2*H,.3,2*H],floor);
  for(const side of [-1,1]){box([side*(H+.15),Y/2,0],[.3,Y,2*H]);box([0,Y/2,side*(H+.15)],[2*H,Y,.3]);}
  const grid=new THREE.GridHelper(2*H,2*H/G,0x8b9094,0x777c80);grid.position.y=.003;this.scene.add(grid);
  const dark=new THREE.MeshStandardMaterial({color:0x405a68,roughness:.8});box([0,1.25,H-.045],[2,2.5,.09],dark);
  const sign=textSprite('HOTEL',2.3,.55);sign.position.set(0,2.98,H-.18);this.scene.add(sign);
  this.preview=new THREE.Mesh(this.cube,new THREE.MeshBasicMaterial({color:0x37c4a1,transparent:true,opacity:.28,depthWrite:false}));
  this.preview.visible=false;this.scene.add(this.preview);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(this.cube),new THREE.LineBasicMaterial({color:0x138a78,transparent:true,opacity:.92}));this.preview.add(outline);
  this.hitFlash=0;
 }
 syncClock(phase,now){if(Number.isFinite(phase)){this.phase=phase;this.phaseTime=now;}}
 updateSky(now,player){
  const phase=(this.phase+Math.max(0,now-this.phaseTime)/1000/layout.daySeconds)%1,s=freeSkyState(phase),d=new THREE.Vector3(...s.direction).normalize();
  this.sky.position.set(player.x,player.y,player.z);this.sun.position.copy(d).multiplyScalar(395);this.moon.position.copy(d).multiplyScalar(-395);
  this.sun.visible=d.y>-.04;this.moon.visible=d.y<.04;
  const top=new THREE.Color(0x08142f).lerp(new THREE.Color(0x4e99d5),s.day),horizon=new THREE.Color(0x15233c).lerp(new THREE.Color(0xcadfec),s.day).lerp(new THREE.Color(0xf5a06b),s.twilight*.72);
  this.skyMat.uniforms.top.value.copy(top);this.skyMat.uniforms.horizon.value.copy(horizon);this.scene.background.copy(horizon);this.scene.fog.color.copy(horizon);
  this.sunlight.position.copy(d).multiplyScalar(150);this.sunlight.color.set(0xfff4dc).lerp(new THREE.Color(0xffa76b),s.twilight*.75);this.sunlight.intensity=2.1*Math.max(0,d.y)**.45;
  this.moonlight.position.copy(d).multiplyScalar(-150);this.moonlight.intensity=.22*s.night;
  this.hemi.color.set(0x99b3ec).lerp(new THREE.Color(0xffffff),s.day);this.hemi.intensity=.20+1.6*s.day;
  return phase;
 }
 material(id,load,hp=100){
  const key=(id||'default')+':'+hp;if(this.materials.has(key))return this.materials.get(key);
  const m=new THREE.MeshStandardMaterial({color:id?0xffffff:0xe4e9ed,roughness:.86});m.color.multiplyScalar(.45+.55*hp/100);this.materials.set(key,m);
  if(id&&load){
   const generation=this.generation;
   Promise.resolve().then(()=>load(id)).then(blob=>createImageBitmap(blob)).then(bitmap=>{
    if(generation!==this.generation||this.materials.get(key)!==m){bitmap.close?.();return;}
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close?.();
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;this.textures.set(key,tex);m.map=tex;m.needsUpdate=true;
   }).catch(e=>console.warn('Free World texture:',e.message));
  }
  return m;
 }
 setBlocks(blocks,revision,load,loadModel){
  if(this.revision===revision)return;this.revision=revision;
  for(const mesh of this.meshes){this.scene.remove(mesh);mesh.dispose?.();}this.meshes=[];
  const groups=new Map(),rows=[];this.modelRefs.clear();
  for(const b of blocks){
   const hp=b.hp??100;if(hp<=0)continue;
   if(b.model){
    const id='block-'+b.id,{p,s}=freeBounds(b);this.modelRefs.set(id,b);
    rows.push({id,name:b.modelName,bytes:b.modelBytes,x:p[0],y:p[1]-s[1]/2,z:p[2],extent:s[0],rotation:0,solid:true,placed:true,hp});
    continue;
   }
   const key=(b.texture||'default')+':'+hp;
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);
  }
  this.models.sync(rows,(id,signal)=>loadModel(this.modelRefs.get(id)?.model,signal));
  const used=new Set(groups.keys());
  for(const [key,m] of this.materials)if(!used.has(key)){m.dispose();this.materials.delete(key);this.textures.get(key)?.dispose();this.textures.delete(key);}
  const obj=new THREE.Object3D();
  for(const group of groups.values()){
   const mesh=new THREE.InstancedMesh(this.cube,this.material(group[0].texture,load,group[0].hp??100),group.length);
   group.forEach((b,i)=>{const {p,s}=freeBounds(b);obj.position.set(...p);obj.scale.set(...s);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.scene.add(mesh);this.meshes.push(mesh);
  }
 }
 showPreview(candidate){
  this.preview.visible=!!candidate;if(candidate){const {p,s}=freeBounds(candidate);this.preview.position.set(...p);this.preview.scale.set(...s);}
 }
 avatar(profile){
  const g=createCharacter(profile.avatar);const tag=textSprite(profile.nickname,.95,.24);tag.position.y=2.12;g.add(tag);g.userData.nameTag=tag;this.scene.add(g);return g;
 }
 sync(peers){
  const seen=new Set();
  for(const p of peers){
   if(!Number.isInteger(p.slot)||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite))continue;
   seen.add(p.slot);const signature=JSON.stringify([p.nickname,normalizeCharacter(p.avatar),p.life]);let a=this.peers.get(p.slot);
   if(a&&a.signature!==signature){clearRoomAvatarProps(a.g);disposeCharacter(a.g);a=null;}
   if(!a){const g=this.avatar(p);g.position.set(...p.position);g.rotation.y=p.yaw;a={g,signature};this.peers.set(p.slot,a);}
   a.target=p;
  }
  for(const [slot,a] of this.peers)if(!seen.has(slot)){clearRoomAvatarProps(a.g);disposeCharacter(a.g);this.peers.delete(slot);}
 }
 step(dt,player,profile,third,models=null,weapon=null){
  this.effects.update(dt);
  for(const {row,size} of this.models.physicsModels())this.models.drawBody(row.id,{p:[row.x,row.y+Math.max(.015,size[1]*row.extent)/2,row.z],q:[0,0,0,1]},row.hp);
  const t=1-Math.exp(-dt*12);
  for(const a of this.peers.values()){
   const g=a.g,p=a.target,d=new THREE.Vector3(...p.position),moving=g.position.distanceTo(d)>.035;
   g.position.lerp(d,t);g.rotation.y+=Math.atan2(Math.sin(p.yaw-g.rotation.y),Math.cos(p.yaw-g.rotation.y))*t;
   resetRoomAvatarPose(g);animateCharacter(g,dt,moving,p.stance);applyRoomAvatarPose(g,null,p.weapon);updateRoomAvatarProp(g,models,p.weapon);
  }
  if(third&&profile){
   if(!this.local)this.local=this.avatar(profile);
   this.local.visible=true;const moving=Math.hypot(this.local.position.x-player.x,this.local.position.z-player.z)>.005;
   this.local.position.set(player.x,player.y,player.z);this.local.rotation.y=player.yaw;
   resetRoomAvatarPose(this.local);animateCharacter(this.local,dt,moving,player.stance);applyRoomAvatarPose(this.local,null,weapon);updateRoomAvatarProp(this.local,models,weapon);
  }else if(this.local)this.local.visible=false;
 }
 clear(){
  this.generation++;this.revision=-1;this.showPreview(null);this.sync([]);this.models.clear();this.modelRefs.clear();
  while(this.effects.items.length)this.effects.remove(0);this.effects.light.intensity=0;
  if(this.local){clearRoomAvatarProps(this.local);disposeCharacter(this.local);this.local=null;}
  for(const mesh of this.meshes){this.scene.remove(mesh);mesh.dispose?.();}this.meshes=[];
  for(const m of this.materials.values())m.dispose();this.materials.clear();
  for(const t of this.textures.values())t.dispose();this.textures.clear();
 }
}
