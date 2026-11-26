import * as THREE from 'three';
import {polygons,site,boundary} from './wall_layout.js';

// The hotel Voronoi algorithm, with stable IDs from the previous village grid.
export const VILLAGE_XZ=[0,.085,.25,.375,.5,.625,.75,.915,1];
export const VILLAGE_Y=[0,.025,.20,.375,.55,.725,.86,1];
const NX=8,NY=7,WIDTH=64;
export const villagePartIndex=(x,y,z)=>x+NX*z+WIDTH*y;
const FACE_SPECS=[[1,0,0,2,0,8,0,8],[1,6,0,2,0,8,0,8],[0,0,2,1,0,8,1,6],[0,7,2,1,0,8,1,6],[2,0,0,1,1,7,1,6],[2,7,0,1,1,7,1,6]];
const EDGES=[VILLAGE_XZ,VILLAGE_Y,VILLAGE_XZ],faceCache=new Map();
export function villageFaces(row){
 const key=JSON.stringify(row.bounds);if(faceCache.has(key))return faceCache.get(key);
 const [origin,size]=row.bounds;
 const result=FACE_SPECS.map(([axis,layer,u,v,cs,ce,rs,re],face)=>{
  const a=[0,0,0],b=[0,0,0];
  for(const [j,start,end] of [[axis,layer,layer+1],[u,cs,ce],[v,rs,re]]){a[j]=origin[j]+size[j]*EDGES[j][start];b[j]=origin[j]+size[j]*EDGES[j][end];}
  const w={axis:u,verticalAxis:v,p:a.map((x,j)=>(x+b[j])/2),s:a.map((x,j)=>b[j]-x),cols:ce-cs,rows:re-rs,kind:axis===1?'floor':'wall'};
  const parts=polygons(w).map(({c,r,point,poly})=>{
   const cell=[0,0,0];cell[axis]=layer;cell[u]=cs+c;cell[v]=rs+r;
   const points=poly.map(([x,y])=>[x+w.p[u],y+w.p[v]]),lo=[...a],hi=[...b];
   for(const [dim,i] of [[u,0],[v,1]]){lo[dim]=Math.min(...points.map(p=>p[i]));hi[dim]=Math.max(...points.map(p=>p[i]));}
   return {index:villagePartIndex(...cell),bounds:[lo,hi.map((n,j)=>n-lo[j])],axes:[u,v,axis],poly:points,site:[point[0]+w.p[u],point[1]+w.p[v]],c,r,face};
  });
  return {w,bounds:[a,b.map((n,j)=>n-a[j])],parts};
 });
 if(faceCache.size>=48)faceCache.delete(faceCache.keys().next().value);
 faceCache.set(key,result);return result;
}
export function villageParts(row){
 return villageFaces(row).flatMap(f=>f.parts.map(p=>{const stage=row.damage?.[p.index]||0;return {...p,id:row.id+':'+p.index,building:row.id,kind:'building-part',stage,hp:100-25*stage};}));
}
export function villageColliders(row){
 return villageFaces(row).flatMap((f,i)=>f.parts.some(p=>(row.damage?.[p.index]||0)>=4)?
  f.parts.filter(p=>(row.damage?.[p.index]||0)<4).map(p=>({...p,id:row.id+':'+p.index,kind:'building-solid',hp:100})):
  [{id:row.id+':solid:'+i,kind:'building-solid',hp:100,bounds:f.bounds}]);
}
export function villagePrismOverlap(a,s,part){
 const [b,t]=part.bounds;
 if(!a.every((x,j)=>x<b[j]+t[j]-1e-8&&x+s[j]>b[j]+1e-8))return false;
 if(!part.poly)return true;
 const [u,v]=part.axes,poly=part.poly;
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],nx=q[1]-p[1],ny=p[0]-q[0];
  if(Math.abs(nx)+Math.abs(ny)<1e-10)continue;
  const nearest=nx*(nx>=0?a[u]:a[u]+s[u])+ny*(ny>=0?a[v]:a[v]+s[v]);
  if(nearest>=nx*p[0]+ny*p[1]-1e-8)return false;
 }
 return true;
}
export function villagePrismRay(origin,direction,part,limit){
 const [u,v,axis]=part.axes,[b,s]=part.bounds;let lo=0,hi=limit,normal=null;
 function plane(value,slope,n){
  if(Math.abs(slope)<1e-10)return value>=-1e-8;
  const t=-value/slope;if(slope>0){if(t>=lo){lo=t;normal=n;}}else hi=Math.min(hi,t);return lo<=hi+1e-9;
 }
 const neg=[0,0,0],pos=[0,0,0];neg[axis]=-1;pos[axis]=1;
 if(!plane(origin[axis]-b[axis],direction[axis],neg)||!plane(b[axis]+s[axis]-origin[axis],-direction[axis],pos))return null;
 const poly=part.poly;
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);
  if(len<1e-10)continue;
  const n=[0,0,0];n[u]=dy/len;n[v]=-dx/len;
  if(!plane(dx*(origin[v]-p[1])-dy*(origin[u]-p[0]),dx*direction[v]-dy*direction[u],n))return null;
 }
 return normal&&lo<=limit?{dist:lo,normal,point:origin.map((x,j)=>x+direction[j]*lo)}:null;
}
export function villagePrismTop(part,x,y,z){
 const [b,s]=part.bounds,top=b[1]+s[1],a=[x-.22,b[1]-.001,z-.22],size=[.44,s[1]+.002,.44];
 if(!villagePrismOverlap(a,size,part))return 0;
 if(part.axes[2]===1)return top<=y+.025?top:0;
 // Clip the upright polygon to the character's horizontal support strip.
 const [u,v]=part.axes,vertical=u===1?0:1,horizontal=1-vertical,coord=(u===1?v:u)===0?x:z;
 let points=part.poly;
 for(const [sign,edge] of [[1,coord-.22],[-1,coord+.22]]){
  const clipped=[];
  for(let i=0;i<points.length;i++){
   const p=points[i],q=points[(i+1)%points.length],da=sign*(p[horizontal]-edge),db=sign*(q[horizontal]-edge);
   if(da>=-1e-9)clipped.push(p);
   if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push(p.map((n,j)=>n+(q[j]-n)*t));}
  }
  points=clipped;
 }
 const height=points.length?Math.max(...points.map(p=>p[vertical])):0;
 return height<=y+.025?height:0;
}

// Sample a delayed server timeline instead of chasing each arriving position.
// A small rate adjustment absorbs network jitter without stopping the walk cycle.
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export class VillageNpcMotion {
 constructor(){this.samples=[];this.time=null;this.speed=0;this.walking=false;this.still=0;this.delay=.50;this.offset=null;this.received=null;}
 push(packet,received){
  const stamp=Number.isFinite(packet.motionTime)?packet.motionTime:received/1000,eps=1e-7;
  const previous=this.samples.at(-1);
  if(previous&&stamp<=previous.stamp+eps)return;
  // The snapshot's clock is independent of the last movement step. A first
  // snapshot from an idle world may contain a much older simulation timestamp.
  const serverTime=Number.isFinite(packet.serverTime)?Math.max(stamp,packet.serverTime):stamp;
  const measuredOffset=serverTime-received/1000;
  const history=(Array.isArray(packet.motionTrail)?packet.motionTrail:[])
   .filter(q=>Array.isArray(q)&&q.length===6&&q.every(Number.isFinite)&&q[0]<=stamp+eps);
  const receiptGap=this.received===null?0:Math.max(0,(received-this.received)/1000);
  const jumped=previous&&stamp-previous.stamp>receiptGap+.75;
  const missingHistory=previous&&stamp-previous.stamp>1.6&&(!history.length||history[0][0]>previous.stamp+.10);
  // Recover a cold/expired timeline immediately. Do not spend minutes running
  // a clock that starts before all the confirmed positions in the new buffer.
  if(jumped||missingHistory){
   this.samples=[];this.time=null;this.offset=measuredOffset;
   this.speed=0;this.walking=false;this.still=0;this.lastFrame=undefined;
  }
  if(this.offset===null)this.offset=measuredOffset;
  else this.offset+=clamp(measuredOffset-this.offset,-.008,.025);
  for(const q of history){
   if(this.samples.length&&q[0]<=this.samples.at(-1).stamp+eps)continue;
   this.samples.push({stamp:q[0],position:q.slice(1,4),yaw:q[4],pace:Math.max(0,q[5])});
  }
  const v=packet.velocity||[0,0,0],pace=packet.moving?Math.hypot(v[0],v[2]):0;
  if(!this.samples.length||stamp>this.samples.at(-1).stamp+eps)this.samples.push({stamp,position:[...packet.position],yaw:packet.yaw,pace});
  this.received=received;
  if(this.time===null)this.time=Math.max(this.samples[0].stamp,stamp-this.delay);
  while(this.samples.length>96)this.samples.shift();
  // A throttled render loop can also lose the start of its buffered timeline.
  if(this.time<this.samples[0].stamp-eps)this.time=Math.max(this.samples[0].stamp,stamp-this.delay);
 }
 frame(now,dt){
  const samples=this.samples,last=samples.at(-1);if(!last)return null;
  const step=clamp(this.lastFrame===undefined?dt:(now-this.lastFrame)/1000,0,.25);this.lastFrame=now;
  const desired=now/1000+this.offset-this.delay;
  const rate=clamp(1+(desired-this.time)*.85,.88,1.12);
  const before=this.time;
  this.time=Math.min(last.stamp,Math.max(before,before+step*rate));
  while(samples.length>2&&samples[1].stamp<=this.time)samples.shift();
  let a=samples[0],b=a;
  if(this.time>=last.stamp){a=last;b=last;}
  else if(this.time>a.stamp){for(let i=1;i<samples.length;i++){b=samples[i];if(b.stamp>=this.time)break;a=b;}}
  const span=b.stamp-a.stamp,t=span>1e-7?clamp((this.time-a.stamp)/span,0,1):0;
  const position=a.position.map((p,j)=>p+(b.position[j]-p)*t);
  const heading=a.yaw+Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))*t;
  const segmentSpeed=span>1e-7?Math.hypot(b.position[0]-a.position[0],b.position[2]-a.position[2])/span:0;
  const pace=span>1e-7?(a.pace+(b.pace-a.pace)*t):0;
  const speed=this.time>before+1e-7&&segmentSpeed>.025?Math.min(2.6,Math.max(segmentSpeed,pace*.8))*rate:0;
  this.speed+=(speed-this.speed)*(1-Math.exp(-step*6));
  if(speed>.12){this.walking=true;this.still=0;}else if((this.still+=step)>.30)this.walking=false;
  return {position,yaw:heading,moving:this.walking,speed:this.speed,playback:clamp(this.speed/1.35,.8,1.5),delta:step};
 }
}
export function villageFallPose(age,side=1){
 const t=clamp(age/.78,0,1),e=t*t*(3-2*t),bounce=t===1?0:Math.sin(Math.PI*t)*.035;
 return {tilt:side*Math.PI/2*e,lift:.19*e+bounce,fallen:t===1};
}
// Site coordinates and the four damage stages are in a small floating-point
// texture. Only damaged faces evaluate nearest sites; original GLB UVs stay intact.
const fragmentHeader=`
varying vec3 vVillageWorld;
uniform vec3 villageOrigin;
uniform vec3 villageSize;
uniform sampler2D villageSites;
uniform float villageChanged;
float villageStageAt(vec3 p){
 if(villageChanged<0.5)return 0.0;
 vec3 q=clamp((p-villageOrigin)/villageSize,0.0,0.999999);
 float face=-1.0;
 if(q.y<0.025)face=0.0;
 else if(q.y>=0.86)face=1.0;
 else if(q.x<0.085)face=2.0;
 else if(q.x>=0.915)face=3.0;
 else if(q.z<0.085)face=4.0;
 else if(q.z>=0.915)face=5.0;
 else {
  vec3 d=min(q,1.0-q)*villageSize;
  if(d.x<=d.y&&d.x<=d.z)face=q.x<0.5?2.0:3.0;
  else if(d.y<=d.z)face=q.y<0.5?0.0:1.0;
  else face=q.z<0.5?4.0:5.0;
 }
 float fy=(face+0.5)/6.0;
 vec4 meta=texture2D(villageSites,vec2(0.5/65.0,fy));
 if(meta.y<0.5)return 0.0;
 vec3 local=p-villageOrigin;
 vec2 uv=face<1.5?local.xz:face<3.5?local.zy:local.xy;
 float nearest=1e20,stage=0.0;
 for(int i=0;i<64;i++){
  if(float(i)>=meta.x)break;
  vec4 sampleSite=texture2D(villageSites,vec2((float(i)+1.5)/65.0,fy));
  vec2 delta=uv-sampleSite.xy;float dist=dot(delta,delta);
  if(dist<nearest){nearest=dist;stage=sampleSite.w;}
 }
 return stage;
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
// Exposed stone/mortar sides generated from precisely the hotel's fracture boundary.
export function villageCutGeometry(row){
 const pos=[],norm=[],uv=[];
 for(const {w,parts} of villageFaces(row)){
  const cells=parts.filter(p=>(row.damage?.[p.index]||0)>=4).map(p=>[p.c,p.r,4]);
  if(!cells.length)continue;
  for(const f of boundary(w,cells).cuts){
   const points=f.points,n=f.n;
   for(let i=1;i<points.length-1;i++){
    let a=points[0],b=points[i],c=points[i+1];
    const ab=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),ac=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    if(ab.cross(ac).dot(new THREE.Vector3(...n))<0)[b,c]=[c,b];
    for(const p of [a,b,c]){const q=p.map((x,j)=>x+w.p[j]);pos.push(...q);norm.push(...n);uv.push((Math.abs(n[0])>.5?q[2]:q[0])/.7,(Math.abs(n[1])>.5?q[2]:q[1])/.7);}
   }
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(pos.length)g.computeBoundingSphere();return g;
}
function cutTexture(){
 const n=64,data=new Uint8Array(n*n*4);let seed=90871;
 for(let i=0;i<n*n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=i%n,y=Math.floor(i/n),v=128+Math.round(seed/4294967296*70+14*Math.sin(x*1.7+y*.9));data.set([v,Math.round(v*.91),Math.round(v*.81),255],i*4);}
 const map=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.needsUpdate=true;return map;
}
export class VillageDamageMask{
 constructor(row){
  this.data=new Float32Array(65*6*4);this.texture=new THREE.DataTexture(this.data,65,6,THREE.RGBAFormat,THREE.FloatType);
  this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;this.texture.flipY=false;
  this.uniforms={villageOrigin:{value:new THREE.Vector3(...row.bounds[0])},villageSize:{value:new THREE.Vector3(...row.bounds[1])},villageSites:{value:this.texture},villageChanged:{value:0}};
  this.cuts=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0xc3b2a0,map:cutTexture(),roughness:.98,side:THREE.DoubleSide}));
  this.cuts.castShadow=true;this.cuts.receiveShadow=true;this.key=null;this.update(row);
 }
 update(row){
  const key=JSON.stringify(row.damage||{});if(key===this.key)return;
  this.key=key;this.data.fill(0);let changed=false;
  for(const [face,f] of villageFaces(row).entries()){
   const offset=face*65*4;
   this.data[offset]=f.parts.length;
   for(let j=0;j<f.parts.length;j++){
    const p=f.parts[j],stage=Math.max(0,Math.min(4,row.damage?.[p.index]||0)),k=offset+(j+1)*4;
    this.data.set([p.site[0]-row.bounds[0][p.axes[0]],p.site[1]-row.bounds[0][p.axes[1]],p.index,stage],k);
    if(stage){changed=true;this.data[offset+1]=1;}
   }
  }
  this.uniforms.villageChanged.value=changed?1:0;this.texture.needsUpdate=true;
  this.cuts.geometry.dispose();this.cuts.geometry=villageCutGeometry(row);this.cuts.visible=this.cuts.geometry.attributes.position.count>0;
 }
 attach(root){
  const copies=new Map(),owned=new Set(),uniforms=this.uniforms;
  function patch(m,visible){
   m.side=THREE.DoubleSide;m.shadowSide=THREE.DoubleSide;
   const before=m.onBeforeCompile,cache=m.customProgramCacheKey();
   m.onBeforeCompile=function(shader,renderer){before.call(this,shader,renderer);patchVillageShader(shader,uniforms,visible);};
   m.customProgramCacheKey=()=>cache+'|village-voronoi-v2|'+visible;m.needsUpdate=true;owned.add(m);return m;
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
 dispose(){this.texture.dispose();this.cuts.removeFromParent();this.cuts.geometry.dispose();this.cuts.material.map.dispose();this.cuts.material.dispose();}
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
