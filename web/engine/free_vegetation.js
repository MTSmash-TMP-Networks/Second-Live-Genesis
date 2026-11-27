// Deterministic cosmetic vegetation: placement never modifies the saved terrain.
// Imported plants are used in a bounded near-field budget; lightweight local
// meshes cover the rest. The browser only loads assets from the game server.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {terrainHeight,terrainWater} from './free_terrain.js';

const KINDS=['grass','tall','meadow','reeds','cattails','bush','juniper','hedge','daisies','poppies','lily','fern','stone'];
const NEAR_BUDGET={grass:110000,tall:75000,meadow:45000,reeds:45000,cattails:35000,bush:85000,juniper:45000,hedge:30000,daisies:42000,poppies:42000,lily:50000};
const MAX_DISTANCE={grass:64,tall:85,meadow:72,reeds:115,cattails:115,bush:115,juniper:115,hedge:95,daisies:65,poppies:65,lily:95,fern:82,stone:90};
function rand(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function segmentDistance2(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?clamp(((x-a[0])*dx+(z-a[1])*dz)/l,0,1):0;
 return (x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
}
export function vegetationClearance(doc,boxes=[],roads=[]){
 const grid=new Map(),size=8;
 const add=(x0,z0,x1,z1,test)=>{
  for(let x=Math.floor(x0/size);x<=Math.floor(x1/size);x++)for(let z=Math.floor(z0/size);z<=Math.floor(z1/size);z++){
   const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(test);
  }
 };
 const rect=(x,z,w,d,m)=>{const x0=x-m,z0=z-m,x1=x+w+m,z1=z+d+m;add(x0,z0,x1,z1,(px,pz)=>px>=x0&&px<=x1&&pz>=z0&&pz<=z1);};
 for(const [b,s] of boxes)if(b?.length===3&&s?.length===3&&b.concat(s).every(Number.isFinite))rect(b[0],b[2],s[0],s[2],.7);
 for(const r of roads)if([r.x,r.z,r.w,r.d].every(Number.isFinite))rect(r.x-r.w/2,r.z-r.d/2,r.w,r.d,.65);
 const segment=(a,b,r)=>add(Math.min(a[0],b[0])-r,Math.min(a[1],b[1])-r,Math.max(a[0],b[0])+r,Math.max(a[1],b[1])+r,(x,z)=>segmentDistance2(x,z,a,b)<r*r);
 for(const road of doc.roads||[])for(let i=1;i<road.points.length;i++)segment(road.points[i-1],road.points[i],road.width/2+1.6);
 for(const path of doc.paths||[]){
  if(path.length<2)continue;
  const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(p[0],0,p[1])),false,'centripetal');
  const points=curve.getPoints(Math.max(2,Math.ceil(curve.getLength())));
  for(let i=1;i<points.length;i++)segment([points[i-1].x,points[i-1].z],[points[i].x,points[i].z],1.8);
 }
 // Hotel arrival apron and taxi bay.
 rect(-9,125,19,25,1);
 return (x,z)=>(grid.get(Math.floor(x/size)+':'+Math.floor(z/size))||[]).some(test=>test(x,z));
}
export function plantSites(doc,boxes=[],roads=[]){
 if(!doc)return [];
 const blocked=vegetationClearance(doc,boxes,roads),out=[];
 let r=rand(1938801);const cell=(x,z,salt)=>rand((Math.imul(Math.round(x*100),73856093)^Math.imul(Math.round(z*100),19349663)^salt)>>>0);
 const add=(kind,x,z,y,scale)=>out.push({kind,x,y,z,scale,yaw:r()*Math.PI*2});
 const dry=(x,z)=>!blocked(x,z)&&!terrainWater(doc,x,z);
 for(let x=-145;x<=145;x+=2.2)for(let z=-145;z<=145;z+=2.2){
  r=cell(x,z,1938801);
  const px=x+(r()-.5)*1.85,pz=z+(r()-.5)*1.85,y=terrainHeight(doc,px,pz),density=.42+.25*Math.sin(px*.073+Math.cos(pz*.062))+.19*Math.cos(pz*.095-px*.032);
  if(r()>density||!dry(px,pz))continue;
  const slope=Math.hypot(terrainHeight(doc,px+1,pz)-terrainHeight(doc,px-1,pz),terrainHeight(doc,px,pz+1)-terrainHeight(doc,px,pz-1))/2;
  if(slope>.69)continue;
  const f=r();const kind=f<.62?'grass':f<.78?'tall':f<.88?'meadow':f<.93?'fern':f<.975?'daisies':'poppies';
  add(kind,px,pz,y,.72+r()*.76);
 }
 for(let x=-139;x<=139;x+=8.4)for(let z=-139;z<=139;z+=8.4){
  r=cell(x,z,3860129);
  const px=x+(r()-.5)*6,pz=z+(r()-.5)*6,y=terrainHeight(doc,px,pz);
  if(r()>.31||!dry(px,pz)||blocked(px+1.7,pz)||blocked(px-1.7,pz)||blocked(px,pz+1.7)||blocked(px,pz-1.7))continue;
  add(px>-93&&px<-36&&pz>-61&&pz<4&&r()<.42?'hedge':r()<.68?'bush':'juniper',px,pz,y,.75+r()*.65);
 }
 for(const l of doc.lakes||[]){
  const n=Math.ceil(Math.PI*(l.rx+l.rz)/.95);
  for(let i=0;i<n;i++){
   r=cell(l.x+i,l.z,613307);
   const a=i*2*Math.PI/n+(r()-.5)*.04;let best=null;
   // Find the actual bank in the same heightfield that renders the water.
   for(let d=.38;d<1.12;d+=.025){
    const x=l.x+Math.cos(a)*l.rx*d,z=l.z+Math.sin(a)*l.rz*d,y=terrainHeight(doc,x,z),diff=Math.abs(y-l.level-.045);
    if(!best||diff<best.diff)best={x,z,y,d,diff};
   }
   if(!best||best.diff>.25||blocked(best.x,best.z))continue;
   const {x,z,y,d}=best,patch=Math.sin(a*3.2+l.x)+Math.cos(a*6.1-l.z);
   if(patch>-.32&&r()<.79)add(r()<.62?'reeds':'cattails',x,z,y-.015,.62+r()*.48);
   if(i%2===0&&r()<.74){
    const t=d+.06+r()*.07,px=l.x+Math.cos(a)*l.rx*t,pz=l.z+Math.sin(a)*l.rz*t;
    if(dry(px,pz))add(r()<.55?'tall':'bush',px,pz,terrainHeight(doc,px,pz),.55+r()*.48);
   }
   if(i%3===0&&r()<.7){
    const t=d-.08-r()*.075,px=l.x+Math.cos(a)*l.rx*t,pz=l.z+Math.sin(a)*l.rz*t;
    const level=terrainWater(doc,px,pz);
    if(level&&!blocked(px,pz)){add('lily',px,pz,level+.012,.65+r()*.65);if(r()<.55&&!blocked(px+.32,pz))add('stone',px+.32,pz,terrainHeight(doc,px+.32,pz),.65+r()*.6);}
   }
  }
 }
 return out;
}

// Low-cost, irregular 3D leaves/grass rather than flat solid-green triangles
// or closed spheres. They remain usable when the optional network is offline.
function localPlant(kind){
 const positions=[],colors=[],r=rand(31277+KINDS.indexOf(kind)*739);
 const tri=(a,b,c,color)=>{positions.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(...color);};
 const col=(hex,t=1)=>{const c=new THREE.Color(hex).multiplyScalar(t);return [c.r,c.g,c.b];};
 function blade(x,z,h,w,angle,bend,hex){
  const dx=Math.cos(angle),dz=Math.sin(angle),sideX=-dz,sideZ=dx;let prev=null;
  for(let i=0;i<=5;i++){
   const t=i/5,s=w*(1-t*.91),px=x+dx*bend*t*t,pz=z+dz*bend*t*t,y=h*t;
   const a=[px+sideX*s,y,pz+sideZ*s],b=[px-sideX*s,y,pz-sideZ*s];
   if(prev){const c=col(hex,.58+.50*t);tri(prev[0],prev[1],a,c);tri(a,prev[1],b,c);}prev=[a,b];
  }
 }
 function leaf(x,y,z,len,width,angle,hex){
  const a=[x,y,z],b=[x+Math.cos(angle)*len*.5-Math.sin(angle)*width,y+.06,z+Math.sin(angle)*len*.5+Math.cos(angle)*width],
   c=[x+Math.cos(angle)*len,y+.10,z+Math.sin(angle)*len],d=[x+Math.cos(angle)*len*.5+Math.sin(angle)*width,y+.04,z+Math.sin(angle)*len*.5-Math.cos(angle)*width],
   m=[x+Math.cos(angle)*len*.5,y+.09,z+Math.sin(angle)*len*.5];
  for(const [p,q] of [[a,b],[b,c],[c,d],[d,a]])tri(p,q,m,col(hex,.76+r()*.35));
 }
 function flower(x,y,z,color,scale){
  const a=r()*Math.PI*2;
  for(let j=0;j<7;j++){
   const t=a+j*Math.PI*2/7,c=[x,y,z],p=[x+Math.cos(t)*scale,y+.012,z+Math.sin(t)*scale],q=[x+Math.cos(t+.68)*scale*.82,y+.022,z+Math.sin(t+.68)*scale*.82];
   tri(c,p,q,col(color,.9+r()*.18));
  }
  for(let j=0;j<7;j++){let t=j*Math.PI*2/7,u=(j+1)*Math.PI*2/7;tri([x,y+.024,z],[x+Math.cos(t)*scale*.25,y+.025,z+Math.sin(t)*scale*.25],[x+Math.cos(u)*scale*.25,y+.025,z+Math.sin(u)*scale*.25],col(0xe3ad2a));}
 }
 if(kind==='bush'||kind==='juniper'||kind==='hedge'){
  const h=kind==='juniper'?.62:kind==='hedge'?.9:1.06;
  for(let i=0;i<165;i++){
   const a=r()*Math.PI*2,rr=Math.sqrt(r())*.53,t=.12+r()*.88,y=h*t;
   const spread=rr*Math.sqrt(Math.max(.1,1-((t-.42)*1.5)**2));
   leaf(Math.cos(a)*spread,y,Math.sin(a)*spread,.13+r()*.19,.055+r()*.05,a+(r()-.5)*2,kind==='juniper'?0x456649:0x427b39);
  }
 }else if(kind==='lily'){
  for(let i=0;i<5;i++){
   const a=r()*Math.PI*2,x=Math.cos(a)*.19,z=Math.sin(a)*.19,rr=.12+r()*.065;
   for(let j=1;j<18;j++){const t=a+j*Math.PI*2/19,u=a+(j+1)*Math.PI*2/19;tri([x,.015,z],[x+Math.cos(t)*rr,.025,z+Math.sin(t)*rr],[x+Math.cos(u)*rr,.02,z+Math.sin(u)*rr],col(0x477739,.7+r()*.35));}
  }
  flower(0,.045,0,0xf3d0db,.093);
 }else if(kind==='stone'){
  const g=new THREE.IcosahedronGeometry(.18,1);g.scale(1,.55,.82);g.translate(0,.025,0);
  return {geometry:g,material:new THREE.MeshStandardMaterial({color:0x827e71,roughness:.94})};
 }else if(kind==='fern'){
  for(let i=0;i<11;i++){
   const a=i*2.39996,h=.37+r()*.23;
   for(let j=0;j<10;j++){const t=j/10,x=Math.cos(a)*t*.55,z=Math.sin(a)*t*.55,y=h*Math.sin(t*Math.PI*.86)+.05;
    for(const side of [-1,1])leaf(x,y,z,(1-t)*.16+.04,.035,a+side*1.15,0x508b3a);}
  }
 }else{
  const tall=kind==='tall'||kind==='reeds'||kind==='cattails',wet=kind==='reeds'||kind==='cattails',h=wet?1.45:tall?.86:.39;
  const n=kind==='grass'?18:kind==='meadow'?25:wet?17:19;
  for(let i=0;i<n;i++){
   const a=r()*Math.PI*2,rad=Math.sqrt(r())*(wet?.33:.25),x=Math.cos(a)*rad,z=Math.sin(a)*rad;
   blade(x,z,h*(.45+r()*.62),wet?.028:.014+r()*.012,a,.12+r()*.26,wet?0x6d8743:0x56893c);
  }
  if(wet)for(let i=0;i<6;i++){
   const a=r()*6.28,x=Math.cos(a)*.22,z=Math.sin(a)*.22,y=h*(.76+r()*.27);
   blade(x,z,y,.011,a,.035,0x64733e);
   if(kind==='cattails')for(let j=0;j<8;j++){const t=j*6.283/8,u=(j+1)*6.283/8,rr=.028;tri([x+Math.cos(t)*rr,y-.15,z+Math.sin(t)*rr],[x+Math.cos(u)*rr,y-.15,z+Math.sin(u)*rr],[x+Math.cos(t)*rr,y+.06,z+Math.sin(t)*rr],col(0x65482d));tri([x+Math.cos(t)*rr,y+.06,z+Math.sin(t)*rr],[x+Math.cos(u)*rr,y-.15,z+Math.sin(u)*rr],[x+Math.cos(u)*rr,y+.06,z+Math.sin(u)*rr],col(0x785134));}
  }
  if(['meadow','daisies','poppies'].includes(kind))for(let i=0;i<(kind==='meadow'?8:5);i++){
   const x=(r()-.5)*.45,z=(r()-.5)*.45,y=.19+r()*.28;
   blade(x,z,y,.008,0,0,0x638746);flower(x,y,z,kind==='poppies'?0xd52a25:i%3===0&&kind==='meadow'?0xe6bd36:0xf3eee1,.043+r()*.025);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
 return {geometry,material:new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1})};
}
function windMaterial(material,uniforms,kind){
 if(kind==='lily'||kind==='stone')return material;
 material.onBeforeCompile=s=>{
  Object.assign(s.uniforms,uniforms);
  s.vertexShader='uniform float plantTime; uniform float plantWind;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat pphase=plantTime*1.65+instanceMatrix[3].x*.24+instanceMatrix[3].z*.17; float bend=min(2.5,max(0.0,position.y)); transformed.x+=sin(pphase)*bend*bend*plantWind*.035; transformed.z+=cos(pphase*.86)*bend*bend*plantWind*.023;\n#endif');
 };
 material.customProgramCacheKey=()=> 'sl-vegetation-wind-v1';return material;
}
function atlasCard(map,alpha,kind){
 const geos=[],h=kind==='bush'?1.05:kind==='fern'?.65:.65,w=kind==='bush'?1.35:.8;
 for(let i=0;i<3;i++){const g=new THREE.PlaneGeometry(w,h,1,3);g.translate(0,h/2,0);g.rotateY(i*Math.PI/3);geos.push(g);}
 const geometry=mergeGeometries(geos);geos.forEach(g=>g.dispose());
 return {geometry,material:new THREE.MeshStandardMaterial({map,alphaMap:alpha,alphaTest:.42,side:THREE.DoubleSide,roughness:1})};
}
function importedPlant(raw){
 raw.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(raw),s=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(![s.x,s.y,s.z].every(v=>Number.isFinite(v)&&v>.01&&v<8))throw Error('Bad plant dimensions');
 const translate=new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z),groups=new Map();
 raw.traverse(o=>{
  if(!o.isMesh||o.isSkinnedMesh||Array.isArray(o.material)||!o.geometry?.attributes.position)return;
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.applyMatrix4(translate);
  if(!g.attributes.normal)g.computeVertexNormals();
  const key=o.material.uuid+'|'+Object.keys(g.attributes).sort().join(',');
  if(!groups.has(key))groups.set(key,{material:o.material,geos:[]});groups.get(key).geos.push(g);
 });
 const parts=[];let triangles=0;
 for(const {material,geos} of groups.values()){
  const geometry=geos.length===1?geos[0]:mergeGeometries(geos,false);
  if(geos.length>1)geos.forEach(g=>g.dispose());
  if(!geometry)continue;geometry.computeBoundingSphere();triangles+=geometry.attributes.position.count/3;
  parts.push({geometry,material:material.clone()});
 }
 if(!parts.length||parts.length>48||triangles>70000){for(const p of parts){p.geometry.dispose();p.material.dispose();}throw Error('Plant mesh budget exceeded');}
 return {parts,triangles};
}
function localAsset(path){
 return typeof path==='string'&&/^\/assets\/polyhaven\/vegetation\/[a-z0-9-]+\.(glb|png|jpg|jpeg)$/.test(path);
}
export class VegetationView{
 constructor(root){
  this.root=new THREE.Group();this.root.name='Natural ground vegetation';root.add(this.root);
  this.uniforms={plantTime:{value:0},plantWind:{value:.6}};
  this.doc=null;this.boxes=[];this.roads=[];this.sites=[];this.batches=[];this.fallback=new Map();this.models=new Map();this.cards=new Map();this.last=null;this.key='';
  if(typeof document!=='undefined')this.load().catch(e=>console.warn('Optional vegetation:',e.message||e));
 }
 async load(){
  const response=await fetch('/assets/polyhaven/vegetation/manifest.json',{cache:'no-store'});if(!response.ok)return;
  const m=await response.json(),loader=new GLTFLoader(),textures=new THREE.TextureLoader();
  const read=async(path,space)=>{if(!localAsset(path))throw Error('Invalid plant asset path');const t=await textures.loadAsync(path);t.colorSpace=space;t.anisotropy=4;return t;};
  await Promise.all(Object.entries(m.cards||{}).map(async([kind,entry])=>{
   if(!KINDS.includes(kind))return;
   try{const [map,alpha]=await Promise.all([read(entry.color,THREE.SRGBColorSpace),read(entry.alpha,THREE.NoColorSpace)]);this.cards.set(kind,atlasCard(map,alpha,kind));this.invalidate();}catch(e){console.warn('Vegetation card',kind,e.message||e);}
  }));
  await Promise.all(Object.entries(m.models||{}).map(async([kind,path])=>{
   if(!KINDS.includes(kind)||!localAsset(path)||!path.endsWith('.glb'))return;
   try{const gltf=await loader.loadAsync(path);this.models.set(kind,importedPlant(gltf.scene));this.invalidate();}
   catch(e){console.warn('Vegetation model',kind,e.message||e);}
  }));
  console.info('Vegetation assets ready:',this.models.size,'models;',this.cards.size,'texture sets');
 }
 invalidate(){this.last=null;}
 set(doc){this.doc=doc;this.rebuildSites();}
 setObstacles(boxes,roads){
  const key=JSON.stringify([boxes,roads]);if(key===this.key)return;
  this.key=key;this.boxes=boxes;this.roads=roads;this.rebuildSites();
 }
 rebuildSites(){this.sites=plantSites(this.doc,this.boxes,this.roads);this.invalidate();this.clearBatches();}
 clearBatches(){for(const m of this.batches){m.removeFromParent();m.dispose?.();}this.batches=[];}
 getFallback(kind){
  if(!this.fallback.has(kind))this.fallback.set(kind,localPlant(kind));
  return this.cards.get(kind)||this.fallback.get(kind);
 }
 batch(kind,parts,sites){
  if(!sites.length)return;
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
  for(const {geometry,material} of parts){
   windMaterial(material,this.uniforms,kind);
   const m=new THREE.InstancedMesh(geometry,material,sites.length);m.name='Vegetation / '+kind;m.userData.noImpact=true;
   m.castShadow=false;m.receiveShadow=true;
   for(let i=0;i<sites.length;i++){const s=sites[i];p.set(s.x,s.y,s.z);q.setFromAxisAngle(Y,s.yaw);scale.setScalar(s.scale);matrix.compose(p,q,scale);m.setMatrixAt(i,matrix);}
   m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();this.root.add(m);this.batches.push(m);
  }
 }
 update(now,player,weather){
  this.uniforms.plantTime.value=(now/1000)%3600;this.uniforms.plantWind.value=.45+(weather.rain||0)*.6+(weather.storm||0)*1.7;
  if(!this.doc||!player)return;
  const x=player.x,z=player.z;
  if(this.last&&Math.hypot(x-this.last[0],z-this.last[1])<7)return;
  this.last=[x,z];this.clearBatches();
  const groups=new Map();
  for(const s of this.sites){
   const d=(s.x-x)**2+(s.z-z)**2;if(d>MAX_DISTANCE[s.kind]**2)continue;
   if(!groups.has(s.kind))groups.set(s.kind,[]);groups.get(s.kind).push({s,d});
  }
  for(const [kind,items] of groups){
   const model=this.models.get(kind),limit=model?Math.max(1,Math.floor((NEAR_BUDGET[kind]||30000)/model.triangles)):0;
   const near=[],far=[];
   items.sort((a,b)=>a.d-b.d);
   for(const {s,d} of items){if(model&&d<24**2&&near.length<limit)near.push(s);else far.push(s);}
   if(near.length)this.batch(kind,model.parts,near);
   if(far.length)this.batch(kind,[this.getFallback(kind)],far);
  }
 }
 clear(){this.clearBatches();this.doc=null;this.sites=[];this.boxes=[];this.roads=[];this.key='';this.last=null;}
}
