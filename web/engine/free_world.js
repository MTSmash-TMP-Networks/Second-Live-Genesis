import * as THREE from 'three';
import layout from './free_world_layout.json';
import {RoomModels} from './room_customization.js';
import {VillageView} from './village.js';
import {VillageNpcMotion,villageFallPose,villagePrismOverlap,villagePrismRay,villagePrismTop} from './village_damage.js';
import {ShotEffects} from './shotfx.js';
import {createCharacter,animateCharacter,disposeCharacter,normalizeCharacter} from './character.js';
import {resetRoomAvatarPose,applyRoomAvatarPose,updateRoomAvatarProp,clearRoomAvatarProps} from './avatar_room_pose.js';
export const FREE_LAYOUT=layout;
const H=layout.half,Y=layout.height,G=layout.grid;
const ICE_GATE={x:48,width:2,height:2.65};
export function freeBounds(block){if(block.bounds){const [b,s]=block.bounds;return {p:b.map((v,i)=>v+s[i]/2),s};}if(block.pose){const {p,extent:e}=block.pose;return {p:[p[0],p[1]+e/2,p[2]],s:[e,e,e]};}return {p:block.cell.map((v,i)=>(v+block.dims[i]/2)*G),s:block.dims.map(v=>v*G)};}
export function freeBox(block){if(block.bounds)return block.bounds;const {p,s}=freeBounds(block);return [p.map((v,i)=>v-s[i]/2),s];}
export function freeOverlap(a,s,b,t){return a.every((v,i)=>v<b[i]+t[i]&&v+s[i]>b[i]);}
export function validFreeGrid(cell,dims){
 return cell.length===3&&dims.length===3&&cell.every(Number.isInteger)&&dims.every(v=>Number.isInteger(v)&&v>=1&&v<=Math.max(...layout.sizes))&&cell.every((v,i)=>v>=[-H/G,0,-H/G][i]&&v+dims[i]<=[H/G,Y/G,H/G][i])&&!freeOverlap(cell,dims,[-6,0,H/G-12],[12,Y/G,12]);
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
 for(const block of blocks){if(!includeDestroyed&&(block.hp??100)<=0)continue;consider(block.poly?villagePrismRay(origin,direction,block,limit):freeRayBox(origin,direction,...freeBox(block),limit),block.id);}
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
 const axis=hit.normal.reduce((best,v,i)=>Math.abs(v)>Math.abs(hit.normal[best])?i:best,0);
 if(axis<0)return null;
 const cell=hit.point.map((v,i)=>i===axis?Math.round(v/G)-(hit.normal[i]<0?dims[i]:0):Math.floor(v/G-dims[i]/2+.5));
 if(!validFreeGrid(cell,dims))return null;
 const min=cell.map(x=>x*G),size=dims.map(x=>x*G);
 if(blocks.some(b=>b.poly?villagePrismOverlap(min,size,b):freeOverlap(min,size,...freeBox(b))))return null;
 if(players.some(p=>freeOverlap(min,size,[p[0]-.28,p[1]+.015,p[2]-.28],[.56,1.6,.56])))return null;
 return {cell,dims:[...dims]};
}
// Models have independent metric sizes and poses; only construction blocks snap.
export function freeModelPlacement(p,extent,rotation,blocks,players=[]){
 if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||!Number.isFinite(extent)||extent<.1||extent>4||![0,90,180,270].includes(rotation))return null;
 const pose={p:p.map(v=>Math.round(v*10000)/10000),extent:Math.round(extent*100)/100,rotation};
 const [min,size]=freeBox({pose});
 if(min.some((v,i)=>v<[-H,0,-H][i]-.000001||v+size[i]>[H,Y,H][i]+.000001)||freeOverlap(min,size,[-3,0,H-6],[6,Y,6]))return null;
 if(blocks.some(b=>b.poly?villagePrismOverlap(min,size,b):freeOverlap(min,size,...freeBox(b))))return null;
 if(players.some(p=>freeOverlap(min,size,[p[0]-.28,p[1]+.015,p[2]-.28],[.56,1.6,.56])))return null;
 return {pose};
}
export function freeExitAt(origin,direction){
 if(direction[2]<=1e-8)return false;
 const t=(H-origin[2])/direction[2];
 return t>=0&&t<=3.2&&Math.abs(origin[0]+direction[0]*t)<1.0&&origin[1]+direction[1]*t>=0&&origin[1]+direction[1]*t<=2.6;
}
export function freeSecretDoorAt(origin,direction,blocks=[]){
 if(direction[2]>=-1e-8)return false;
 const t=(-H-origin[2])/direction[2],x=origin[0]+direction[0]*t,y=origin[1]+direction[1]*t;
 if(t<0||t>2.8||Math.abs(x-ICE_GATE.x)>ICE_GATE.width/2||y<0||y>ICE_GATE.height)return false;
 const hit=freeRay(origin,direction,blocks,2.8);
 return !!hit&&hit.id===null&&hit.normal[2]===1;
}
export function freeBlocked(blocks,x,y,z,height=1.6){
 if(Math.abs(x)>H-.28||Math.abs(z)>H-.28||y+height>Y+.001)return true;
 const min=[x-.25,y+.015,z-.25],size=[.5,height-.015,.5];return blocks.some(b=>(b.hp??100)>0&&(b.poly?villagePrismOverlap(min,size,b):freeOverlap(min,size,...freeBox(b))));
}
export function freeGround(blocks,x,y,z){
 let ground=0;
 for(const b of blocks){if((b.hp??100)<=0)continue;if(b.poly){ground=Math.max(ground,villagePrismTop(b,x,y,z));continue;}const [min,s]=freeBox(b),top=min[1]+s[1];
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
function terrainRandom(seed){
 let s=seed>>>0;return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
}
function terrainNoise(nx,ny,random){
 const f=Float32Array.from({length:nx*ny},()=>random());
 return (u,v)=>{const x=u*nx,y=v*ny,i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j,aa=a*a*(3-2*a),bb=b*b*(3-2*b);
 const at=(p,q)=>f[((q%ny+ny)%ny)*nx+(p%nx+nx)%nx];
 return (at(i,j)*(1-aa)+at(i+1,j)*aa)*(1-bb)+(at(i,j+1)*(1-aa)+at(i+1,j+1)*aa)*bb;};
}
function terrainTexture(grass){
 const random=terrainRandom(grass?31557:48213),n=512,c=document.createElement('canvas');c.width=c.height=n;
 const ctx=c.getContext('2d'),a=terrainNoise(7,grass?7:3,random),b=terrainNoise(46,grass?46:7,random),f=terrainNoise(96,96,random),img=ctx.createImageData(n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const u=x/n,v=y/n,A=a(u,v),B=b(u,v),F=f(u,v),grain=(random()-.5)*18,i=(y*n+x)*4;
 const shade=grass?24*(A-.5)+30*(B-.5)+28*(F-.5)+grain:31*(A-.5)+20*(F-.5)+grain*.36-Math.pow(Math.max(0,1-Math.abs(B-.48)*9),3)*38;
 img.data[i]=(grass?76:203)+shade;img.data[i+1]=(grass?112:224)+shade*(grass?1:.88);img.data[i+2]=(grass?43:237)+shade*.65;img.data[i+3]=255;
 }
 ctx.putImageData(img,0,0);
 if(grass){for(const color of ['rgba(33,57,20,.36)','rgba(129,157,65,.38)','rgba(89,124,43,.48)']){ctx.strokeStyle=color;ctx.lineWidth=.75;ctx.beginPath();for(let i=0;i<4200;i++){const x=random()*n,y=random()*n;ctx.moveTo(x,y);ctx.lineTo(x+(random()-.5)*3,y-1-random()*4);}ctx.stroke();}}
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;return tex;
}
function grassSurface(){
 const geometry=new THREE.PlaneGeometry(2*H,2*H,36,36);geometry.rotateX(-Math.PI/2);
 const p=geometry.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),v=.87+.08*Math.sin(x*.052+Math.cos(z*.041))+.05*Math.cos(z*.073-x*.036);colors.push(v,Math.min(1,v+.035),v*.92);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const map=terrainTexture(true);map.repeat.set(2*H/5,2*H/5);
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map,vertexColors:true,roughness:1}));ground.receiveShadow=true;return ground;
}
export function freeIceCliffData(side){
 const segments=104,stride=segments+1,span=H+6,positions=[],uvs=[],colors=[],indices=[];
 for(let row=0;row<6;row++)for(let i=0;i<=segments;i++){
 const x=-span+2*span*i/segments,t=x*.19+side*2.71,peak=Y+7+3.2*Math.sin(t*.47)+2.4*Math.sin(t*1.43)+1.3*Math.cos(t*2.78),y=[0,3,8,15,Y,peak][row];
 const relief=row<2?0:row<5?.06*(1+Math.sin(t*1.9+row*.85)):1.5+1.3*(1+Math.sin(t*.73));
 positions.push(x,y,-relief);uvs.push(x/9,y/9);
 const tint=.91+.06*Math.sin(t*.98+row*.61)+.035*Math.cos(t*2.3-row*.84);colors.push(tint*.96,Math.min(1,tint+.015),Math.min(1,tint+.055));
 }
 for(let row=0;row<5;row++)for(let i=0;i<segments;i++){const a=row*stride+i,b=a+1,c=a+stride,d=c+1;indices.push(a,b,c,b,d,c);}
 return {positions,uvs,colors,indices};
}
function iceCliff(side,material){
 const d=freeIceCliffData(side),geometry=new THREE.BufferGeometry();
 for(const [k,v,n] of [['position',d.positions,3],['uv',d.uvs,2],['color',d.colors,3]])geometry.setAttribute(k,new THREE.Float32BufferAttribute(v,n));
 geometry.setIndex(d.indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,material),[x,z,angle]=[[0,-H,0],[H,0,-Math.PI/2],[0,H,Math.PI],[-H,0,Math.PI/2]][side];
 mesh.position.set(x,0,z);mesh.rotation.y=angle;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function iceGate(scene,box,map){
 const {x,width,height}=ICE_GATE,z=-H+.028,geometry=new THREE.PlaneGeometry(width,height),uv=geometry.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,(x+(uv.getX(i)-.5)*width)/9,uv.getY(i)*height/9);
 const panel=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map,color:0xe1eaf0,roughness:.93}));panel.position.set(x,height/2,z);scene.add(panel);
 const seam=new THREE.MeshStandardMaterial({color:0x849da9,roughness:1});
 for(const side of [-1,1])box([x+side*width/2,height/2,z+.01],[.028,height,.022],seam);
 box([x,height,z+.01],[width+.028,.028,.022],seam);box([x+width*.34,1.18,z+.015],[.032,.16,.024],seam);
}
export class FreeWorldView{
 constructor(){
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xf4f5f5);this.scene.fog=new THREE.Fog(0xf4f5f5,145,330);
  this.hemi=new THREE.HemisphereLight(0xffffff,0x77876a,1.0);this.sunlight=new THREE.DirectionalLight(0xffffff,2.1);this.moonlight=new THREE.DirectionalLight(0x9bb9ec,.18);
  this.scene.add(this.hemi,this.sunlight,this.moonlight,this.sunlight.target);
  // A bounded, local sun shadow map instead of shadowing all 300 x 300 m.
  this.sunlight.shadow.mapSize.set(1024,1024);
  Object.assign(this.sunlight.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:5,far:180});
  this.sunlight.shadow.camera.updateProjectionMatrix();this.sunlight.shadow.normalBias=.06;this.sunlight.shadow.bias=-.0002;
  this.sky=new THREE.Group();this.scene.add(this.sky);
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,uniforms:{top:{value:new THREE.Color(0x448cca)},horizon:{value:new THREE.Color(0xd8e9f5)}},vertexShader:'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vDir;uniform vec3 top;uniform vec3 horizon;void main(){float t=pow(clamp(normalize(vDir).y,0.,1.),0.45);gl_FragColor=vec4(mix(horizon,top,t),1.);}' });
  this.sky.add(new THREE.Mesh(new THREE.SphereGeometry(420,32,20),skyMat));this.skyMat=skyMat;
  this.sun=new THREE.Mesh(new THREE.SphereGeometry(7,24,16),new THREE.MeshBasicMaterial({color:0xffdf99,toneMapped:false}));
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(4.5,24,16),new THREE.MeshBasicMaterial({color:0xe3eaff,toneMapped:false}));this.sky.add(this.sun,this.moon);
  this.phase=0.5;this.phaseTime=0;this.effects=new ShotEffects(this.scene);this.models=new RoomModels(this.scene);this.models.root.name='Shared Free World models';this.modelRefs=new Map();
  this.heldModels=new RoomModels(this.scene);this.heldModels.root.name='Local object placement preview';this.heldModels.root.visible=false;this.heldAsset=null;
  this.cube=new THREE.BoxGeometry(1,1,1);this.materials=new Map();this.textures=new Map();this.meshes=[];this.peers=new Map();this.local=null;this.revision=-1;this.generation=0;
  const box=(p,s,m)=>{const o=new THREE.Mesh(this.cube,m);o.position.set(...p);o.scale.set(...s);this.scene.add(o);return o;};
  this.scene.add(grassSurface());this.village=new VillageView(this.scene);
  const iceMap=terrainTexture(false),iceMaterial=new THREE.MeshStandardMaterial({map:iceMap,vertexColors:true,roughness:.84});
  for(let side=0;side<4;side++)this.scene.add(iceCliff(side,iceMaterial));
  iceGate(this.scene,box,iceMap);
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
  this.sunlight.castShadow=d.y>.16;
  this.sunlight.target.position.set(Math.round(player.x/2)*2,0,Math.round(player.z/2)*2);
  this.sunlight.position.copy(this.sunlight.target.position).addScaledVector(d,95);this.sunlight.color.set(0xfff4dc).lerp(new THREE.Color(0xffa76b),s.twilight*.75);this.sunlight.intensity=2.1*Math.max(0,d.y)**.45;
  this.moonlight.position.copy(d).multiplyScalar(-150);this.moonlight.intensity=.22*s.night;
  this.hemi.color.set(0x99b3ec).lerp(new THREE.Color(0xffffff),s.day);this.hemi.intensity=.20+1.6*s.day;
  this.village.roads.setNight(s.night);
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
    rows.push({id,name:b.modelName,bytes:b.modelBytes,x:p[0],y:p[1]-s[1]/2,z:p[2],extent:s[0],rotation:b.pose?.rotation??0,solid:true,placed:true,hp});
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
   const mesh=new THREE.InstancedMesh(this.cube,this.material(group[0].texture,load,group[0].hp??100),group.length);mesh.castShadow=true;mesh.receiveShadow=true;
   group.forEach((b,i)=>{const {p,s}=freeBounds(b);obj.position.set(...p);obj.scale.set(...s);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.scene.add(mesh);this.meshes.push(mesh);
  }
 }
 showPreview(candidate,held=null,load=null){
  this.preview.visible=!!candidate;
  if(candidate){const {p,s}=freeBounds(candidate);this.preview.position.set(...p);this.preview.scale.set(...s);}
  const asset=held?.kind==='model'&&held.asset&&held.bytes?held.asset:null;
  if(asset!==this.heldAsset){this.heldModels.clear();this.heldAsset=asset;}
  this.heldModels.root.visible=!!(asset&&candidate);
  if(!asset||!candidate||!load)return;
  const pose=candidate.pose;
  this.heldModels.sync([{id:asset,bytes:held.bytes,name:held.name,placed:true,hp:held.hp??100,x:pose.p[0],y:pose.p[1],z:pose.p[2],extent:pose.extent,rotation:pose.rotation}],(_,signal)=>load(held,signal));
  for(const {row,size} of this.heldModels.physicsModels()){
   const a=row.rotation*Math.PI/360;
   this.heldModels.drawBody(row.id,{p:[row.x,row.y+Math.max(.015,size[1]*row.extent)/2,row.z],q:[0,Math.sin(a),0,Math.cos(a)]},row.hp);
  }
 }
 avatar(profile){
  const g=createCharacter(profile.avatar,{villageNpc:profile.slot<0});const tag=textSprite(profile.nickname,.95,.24);tag.position.y=2.12;g.add(tag);g.userData.nameTag=tag;this.scene.add(g);return g;
 }
 sync(peers){
  const seen=new Set();
  for(const p of peers){
   if(!Number.isInteger(p.slot)||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite))continue;
   seen.add(p.slot);const signature=JSON.stringify([p.nickname,normalizeCharacter(p.avatar),p.life]);let a=this.peers.get(p.slot);
   if(a&&a.signature!==signature){clearRoomAvatarProps(a.g);disposeCharacter(a.g);a=null;}
   if(!a){const g=this.avatar(p);g.position.set(...p.position);g.rotation.y=p.yaw;a={g,signature};this.peers.set(p.slot,a);}
   const now=performance.now();
   if(p.slot<0){
    if(p.dead){
     if(a.deadSince===undefined){a.deadSince=now-Math.max(0,p.deadAge||0)*1000;clearRoomAvatarProps(a.g);resetRoomAvatarPose(a.g);}
     else a.deadSince=Math.min(a.deadSince,now-Math.max(0,p.deadAge||0)*1000);
    }else{a.motion??=new VillageNpcMotion();a.motion.push(p,now);}
   }
   a.target=p;
  }
  for(const [slot,a] of this.peers)if(!seen.has(slot)){clearRoomAvatarProps(a.g);disposeCharacter(a.g);this.peers.delete(slot);}
 }
 step(dt,player,profile,third,models=null,weapon=null){
  this.effects.update(dt);this.village.rubble.step(dt);
  for(const {row,size} of this.models.physicsModels()){const a=row.rotation*Math.PI/360;this.models.drawBody(row.id,{p:[row.x,row.y+Math.max(.015,size[1]*row.extent)/2,row.z],q:[0,Math.sin(a),0,Math.cos(a)]},row.hp);}
  const t=1-Math.exp(-dt*12);
  for(const a of this.peers.values()){
   const g=a.g,p=a.target;let moving,animationDt=dt;
   if(p.dead){
    const age=Math.max(0,(performance.now()-a.deadSince)/1000),pose=villageFallPose(age,p.slot%2===0?1:-1);
    g.position.x+=(p.position[0]-g.position.x)*t;g.position.z+=(p.position[2]-g.position.z)*t;
    g.position.y=p.position[1]+pose.lift;g.visible=age<10;
    g.rotation.set(pose.tilt,p.yaw,0,'YXZ');
    if(g.userData.nameTag)g.userData.nameTag.visible=false;
    // Relax the walking pose during the fall, then hold it completely still.
    if(!pose.fallen||!a.rested){resetRoomAvatarPose(g);animateCharacter(g,dt,false,'walk');a.rested=pose.fallen;}
    continue;
   }
   if(p.slot<0){
    const pose=a.motion?.frame(performance.now(),dt);
    if(!pose)continue;
    g.position.set(...pose.position);animationDt=pose.delta;
    g.rotation.y+=Math.atan2(Math.sin(pose.yaw-g.rotation.y),Math.cos(pose.yaw-g.rotation.y))*(1-Math.exp(-animationDt*12));
    moving=pose.moving;
    g.userData.villagePlayback=pose.playback;
   }else{
    const d=new THREE.Vector3(...p.position);moving=g.position.distanceTo(d)>.035;
    g.position.lerp(d,t);g.rotation.y+=Math.atan2(Math.sin(p.yaw-g.rotation.y),Math.cos(p.yaw-g.rotation.y))*t;
   }
   resetRoomAvatarPose(g);animateCharacter(g,animationDt,moving,p.stance);applyRoomAvatarPose(g,null,p.weapon);updateRoomAvatarProp(g,models,p.weapon);
  }
  if(third&&profile){
   if(!this.local)this.local=this.avatar(profile);
   this.local.visible=true;const moving=Math.hypot(this.local.position.x-player.x,this.local.position.z-player.z)>.005;
   this.local.position.set(player.x,player.y,player.z);this.local.rotation.y=player.yaw;
   resetRoomAvatarPose(this.local);animateCharacter(this.local,dt,moving,player.stance);applyRoomAvatarPose(this.local,null,weapon);updateRoomAvatarProp(this.local,models,weapon);
  }else if(this.local)this.local.visible=false;
 }
 clear(){
  this.generation++;this.revision=-1;this.village.rubble.clear();this.showPreview(null);this.sync([]);this.models.clear();this.modelRefs.clear();
  while(this.effects.items.length)this.effects.remove(0);this.effects.light.intensity=0;
  if(this.local){clearRoomAvatarProps(this.local);disposeCharacter(this.local);this.local=null;}
  for(const mesh of this.meshes){this.scene.remove(mesh);mesh.dispose?.();}this.meshes=[];
  for(const m of this.materials.values())m.dispose();this.materials.clear();
  for(const t of this.textures.values())t.dispose();this.textures.clear();
 }
}
