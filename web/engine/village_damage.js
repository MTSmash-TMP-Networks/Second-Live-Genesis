import * as THREE from 'three';

// Identical normalized cell boundaries to village_structure.py. The original
// textured model stays in place; only the damaged local cells are clipped.
export const VILLAGE_XZ=[0,.085,.25,.375,.5,.625,.75,.915,1];
export const VILLAGE_Y=[0,.025,.20,.375,.55,.725,.86,1];
const NX=VILLAGE_XZ.length-1,NY=VILLAGE_Y.length-1,WIDTH=NX*NX;
export const villagePartIndex=(x,y,z)=>x+NX*z+WIDTH*y;
const shell=(x,y,z)=>x===0||x===NX-1||z===0||z===NX-1||y===0||y===NY-1;
const rounded=x=>Math.round(x*1e6)/1e6;
function bounds(row,x,y,z,end=[x+1,y+1,z+1]){
 const [origin,size]=row.bounds,a=[VILLAGE_XZ[x],VILLAGE_Y[y],VILLAGE_XZ[z]],b=[VILLAGE_XZ[end[0]],VILLAGE_Y[end[1]],VILLAGE_XZ[end[2]]];
 return [a.map((v,i)=>rounded(origin[i]+size[i]*v)),a.map((v,i)=>rounded(size[i]*(b[i]-v)))];
}
export function villageParts(row){
 const out=[];
 for(let y=0;y<NY;y++)for(let z=0;z<NX;z++)for(let x=0;x<NX;x++){
  if(!shell(x,y,z))continue;
  const i=villagePartIndex(x,y,z),stage=row.damage?.[i]||0;
  out.push({id:row.id+':'+i,building:row.id,kind:'building-part',index:i,stage,hp:100-25*stage,bounds:bounds(row,x,y,z)});
 }
 return out;
}
export function villageColliders(row){
 const out=[],taken=new Set(),live=(x,y,z)=>{const i=villagePartIndex(x,y,z);return shell(x,y,z)&&!taken.has(i)&&(row.damage?.[i]||0)<4;};
 for(let y=0;y<NY;y++)for(let z=0;z<NX;z++)for(let x=0;x<NX;x++){
  if(!live(x,y,z))continue;
  let ex=x+1,ey=y+1,ez=z+1;
  while(ex<NX&&live(ex,y,z))ex++;
  const layer=(yy,z0,z1)=>{for(let zz=z0;zz<z1;zz++)for(let xx=x;xx<ex;xx++)if(!live(xx,yy,zz))return false;return true;};
  while(ez<NX&&layer(y,ez,ez+1))ez++;
  while(ey<NY&&layer(ey,z,ez))ey++;
  for(let yy=y;yy<ey;yy++)for(let zz=z;zz<ez;zz++)for(let xx=x;xx<ex;xx++)taken.add(villagePartIndex(xx,yy,zz));
  out.push({id:row.id+':solid:'+villagePartIndex(x,y,z),kind:'building-solid',hp:100,bounds:bounds(row,x,y,z,[ex,ey,ez])});
 }
 return out;
}

// Bounded velocity prediction plus frame-rate independent smoothing. Walking
// state is supplied by the server; distance to the last packet is not a gait.
export function villageNpcFrame(position,yaw,packet,age,dt,grace=0){
 const moving=packet.moving===true&&age<.65;
 const v=Array.isArray(packet.velocity)&&packet.velocity.length===3&&packet.velocity.every(Number.isFinite)?packet.velocity:[0,0,0];
 const speed=Math.hypot(v[0],v[2]),lead=moving?Math.min(.30,Math.max(0,age)+.10):0;
 const desired=packet.position.map((n,i)=>n+v[i]*lead),t=1-Math.exp(-10*Math.max(0,dt));
 const next=position.map((n,i)=>n+(desired[i]-n)*t);
 const heading=yaw+Math.atan2(Math.sin(packet.yaw-yaw),Math.cos(packet.yaw-yaw))*(1-Math.exp(-8*Math.max(0,dt)));
 return {position:next,yaw:heading,moving:moving||grace>0&&age<.65,speed,playback:Math.max(.68,Math.min(1.65,speed/1.45))};
}
const glslNumber=n=>Number.isInteger(n)?n.toFixed(1):String(n);
const indexFn=(name,edges)=>'float '+name+'(float v){'+edges.slice(1,-1).map((n,i)=>'if(v<'+glslNumber(n)+')return '+glslNumber(i)+';').join('')+'return '+glslNumber(edges.length-2)+';}';
const fragmentHeader=`
varying vec3 vVillageWorld;
uniform vec3 villageOrigin;
uniform vec3 villageSize;
uniform sampler2D villageDamage;
${indexFn('villageXZ',VILLAGE_XZ)}
${indexFn('villageY',VILLAGE_Y)}
float villageStageAt(vec3 p){
 vec3 q=clamp((p-villageOrigin)/villageSize,0.0,0.999999);
 float x=villageXZ(q.x),y=villageY(q.y),z=villageXZ(q.z);
 // Inset cornices and trim follow the nearest outer shell cell as well.
 if(x>0.5&&x<6.5&&z>0.5&&z<6.5&&y>0.5&&y<5.5){
  vec3 side=min(q,1.0-q)*villageSize;
  if(side.x<=side.y&&side.x<=side.z)x=q.x<0.5?0.0:7.0;
  else if(side.y<=side.z)y=q.y<0.5?0.0:6.0;
  else z=q.z<0.5?0.0:7.0;
 }
 return floor(texture2D(villageDamage,vec2((x+${glslNumber(NX)}*z+0.5)/${glslNumber(WIDTH)},(y+0.5)/${glslNumber(NY)})).r*4.0+0.5);
}
`;
export function patchVillageShader(shader,uniforms,visible){
 Object.assign(shader.uniforms,uniforms);
 shader.vertexShader='varying vec3 vVillageWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvVillageWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
 shader.fragmentShader=fragmentHeader+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat villageStage=villageStageAt(vVillageWorld);if(villageStage>3.5)discard;');
 if(visible)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 if(villageStage>0.5){
  vec3 q=vVillageWorld-villageOrigin;
  float line=min(abs(sin(q.x*13.0+q.y*8.0+q.z*11.0+sin(q.y*29.0)*0.8)),abs(sin(q.z*17.0-q.y*12.0+q.x*7.0)));
  float crack=1.0-smoothstep(0.025,0.045+villageStage*0.045,line);
  diffuseColor.rgb*=mix(1.0-villageStage*0.09,0.22,crack*0.85);
 }`);
}
export class VillageDamageMask{
 constructor(row){
  this.data=new Uint8Array(WIDTH*NY*4);this.texture=new THREE.DataTexture(this.data,WIDTH,NY,THREE.RGBAFormat);
  this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;this.texture.flipY=false;
  this.uniforms={villageOrigin:{value:new THREE.Vector3(...row.bounds[0])},villageSize:{value:new THREE.Vector3(...row.bounds[1])},villageDamage:{value:this.texture}};
  this.key=null;this.update(row);
 }
 update(row){
  const key=JSON.stringify(row.damage||{});if(key===this.key)return;
  this.key=key;this.data.fill(0);
  for(let i=0;i<WIDTH*NY;i++)this.data[i*4+3]=255;
  for(const [i,stage] of Object.entries(row.damage||{}))if(Number.isInteger(+i)&&+i>=0&&+i<WIDTH*NY)this.data[+i*4]=Math.round(255*Math.max(0,Math.min(4,stage))/4);
  this.texture.needsUpdate=true;
 }
 attach(root){
  const copies=new Map(),owned=new Set(),uniforms=this.uniforms;
  function patch(m,visible){
   m.side=THREE.DoubleSide;m.shadowSide=THREE.DoubleSide;
   const before=m.onBeforeCompile,cache=m.customProgramCacheKey();
   m.onBeforeCompile=function(shader,renderer){before.call(this,shader,renderer);patchVillageShader(shader,uniforms,visible);};
   m.customProgramCacheKey=()=>cache+'|village-shell-v1|'+visible;m.needsUpdate=true;owned.add(m);return m;
  }
  function clone(m){if(!copies.has(m))copies.set(m,patch(m.clone(),true));return copies.get(m);}
  root.traverse(o=>{
   if(!o.isMesh)return;
   const original=Array.isArray(o.material)?o.material[0]:o.material;
   o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
   const alpha={map:original.map||null,alphaMap:original.alphaMap||null,alphaTest:original.alphaTest||0};
   o.customDepthMaterial=patch(new THREE.MeshDepthMaterial({...alpha,depthPacking:THREE.RGBADepthPacking}),false);
   o.customDistanceMaterial=patch(new THREE.MeshDistanceMaterial(alpha),false);
   o.castShadow=true;o.receiveShadow=true;
  });
  return ()=>{for(const m of owned)m.dispose();};
 }
 dispose(){this.texture.dispose();}
}
export class VillageRubble{
 constructor(scene){this.scene=scene;this.items=[];this.geometry=new THREE.DodecahedronGeometry(1,0);this.material=new THREE.MeshStandardMaterial({color:0x9d8873,roughness:.96});}
 spawn(part){
  const [b,s]=part.bounds;
  for(let i=0;i<5;i++){
   const mesh=new THREE.Mesh(this.geometry,this.material),r=.08+Math.random()*.13;
   mesh.position.set(...b.map((n,j)=>n+s[j]*(.15+Math.random()*.7)));mesh.scale.set(r,r*.75,r*.8);mesh.rotation.set(Math.random()*3,Math.random()*3,0);
   this.scene.add(mesh);this.items.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*1.8,Math.random()*1.2,(Math.random()-.5)*1.8),age:0,r});
   if(this.items.length>80)this.items.shift().mesh.removeFromParent();
  }
 }
 step(dt){
  for(let i=this.items.length-1;i>=0;i--){
   const e=this.items[i];e.age+=dt;e.velocity.y-=9.81*dt;e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.rotation.x+=dt*2;
   if(e.mesh.position.y<e.r*.65){e.mesh.position.y=e.r*.65;e.velocity.y=Math.max(0,-e.velocity.y*.23);e.velocity.x*=.6;e.velocity.z*=.6;}
   if(e.age>7){e.mesh.removeFromParent();this.items.splice(i,1);}
  }
 }
 clear(){for(const e of this.items)e.mesh.removeFromParent();this.items=[];}
}
