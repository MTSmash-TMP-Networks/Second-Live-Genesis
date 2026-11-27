// Natural landscape presentation. All source imagery is packaged locally at
// image build time; deterministic fallback materials work without any downloads.
import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {VegetationView} from './free_vegetation.js';
import {terrainHeight,terrainGeometry,trailGeometry,lakeGeometry} from './free_terrain.js';

function random(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function materialTexture(seed,base){
 const r=random(seed),n=128,data=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=(y*n+x)*4,noise=(r()-.5)*43+9*Math.sin(x*.11+y*.18)+7*Math.cos(x*.27-y*.13);
  for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,base[c]+noise));data[i+3]=255;
 }
 const t=new THREE.DataTexture(data,n,n);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
function edgeTexture(){
 const n=64,data=new Uint8Array(n*4);
 for(let x=0;x<n;x++){const a=Math.round(255*Math.min(1,x/9,(n-1-x)/9));data.set([a,a,a,255],x*4);}
 const t=new THREE.DataTexture(data,n,1);t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
}
// Reflect the actual landscape in a small render target. The reflection
// is distorted by fine, multi-directional wave normals and rain impacts,
// not by wide alternating color bands.
export function lakeShader(){
 const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
  color:{value:new THREE.Color(0xffffff)},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},
  clock:{value:0},daylight:{value:1},storm:{value:0},rain:{value:0},reflectReady:{value:0},
  skyColor:{value:new THREE.Color(0xb0cfe0)},lightDir:{value:new THREE.Vector3(0,1,0)}
 }]);
 return {uniforms,vertexShader:`
 attribute float lakeDepth;
 varying vec3 vWorld;
 varying vec4 vReflection;
 varying float vDepth;
 uniform mat4 textureMatrix;
 #include <fog_pars_vertex>
 void main(){
  vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  vReflection=textureMatrix*vec4(position,1.0);
  vDepth=lakeDepth;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
 }
 `,fragmentShader:`
 varying vec3 vWorld;
 varying vec4 vReflection;
 varying float vDepth;
 uniform sampler2D tDiffuse;
 uniform float clock,daylight,storm,rain,reflectReady;
 uniform vec3 skyColor,lightDir;
 #include <fog_pars_fragment>
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 vec2 drop(vec2 p,float spacing,float offset){
  vec2 g=p*spacing+vec2(offset,offset*.73),cell=floor(g);
  vec2 center=vec2(hash(cell+vec2(6.2,1.9)),hash(cell+vec2(4.7,8.1)))*.64+.18;
  vec2 d=fract(g)-center;
  float dist=length(d),age=fract(clock*.83+hash(cell+offset)),r=age*.66;
  float envelope=exp(-pow((dist-r)*20.0,2.0))*(1.0-age)*smoothstep(.02,.08,dist);
  return d/max(.001,dist)*sin((dist-r)*83.0)*envelope;
 }
 void main(){
  vec2 p=vWorld.xz;
  float a=sin(dot(p,vec2(6.7,3.4))+clock*1.72);
  float b=sin(dot(p,vec2(-4.3,9.1))-clock*2.02);
  float c=sin(dot(p,vec2(17.1,-9.3))+clock*2.9);
  float d=sin(dot(p,vec2(2.7,-15.9))-clock*2.4);
  vec2 ripple=(drop(p,2.7,0.0)+drop(p,3.8,7.2))*.048*rain;
  vec2 slope=vec2(a*.014+b*.010+c*.005,b*.014-a*.008+d*.005)*(1.0+storm*1.8)+ripple;
  vec3 n=normalize(vec3(slope.x,1.0,slope.y));
  vec3 v=normalize(cameraPosition-vWorld);
  float facing=clamp(dot(n,v),0.0,1.0);
  float fresnel=.025+.975*pow(1.0-facing,4.0);
  vec2 proj=vReflection.xy/max(.0001,vReflection.w)+slope*.22;
  vec3 reflected=skyColor*.82;
  if(reflectReady>.5&&vReflection.w>0.0){
   vec3 image=texture2D(tDiffuse,clamp(proj,vec2(.003),vec2(.997))).rgb;
   reflected=mix(reflected,image,.92);
  }
  float depth=max(vDepth,0.0),absorb=1.0-exp(-depth*4.8);
  vec3 shallow=mix(vec3(.033,.047,.041),vec3(.115,.166,.098),daylight);
  vec3 deep=mix(vec3(.008,.022,.029),vec3(.020,.092,.079),daylight);
  vec3 water=mix(shallow,deep,absorb);
  vec3 color=mix(water,reflected,clamp(fresnel*.85+.06,.0,.92));
  float spec=pow(max(dot(reflect(-lightDir,n),v),0.0),112.0)*daylight*(1.0-storm*.86);
  color+=vec3(.95,.83,.62)*spec*.39;
  float edge=smoothstep(0.0,.13,depth);
  float alpha=edge*clamp(.12+.78*absorb+.50*fresnel,.10,.98);
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
 }
 `};
}
function lakeReflector(geo,lake,all){
 // Reflector's plane is local XY with a +Z normal. Align the clipped
 // heightfield geometry to this plane, preserving every world coordinate.
 geo.translate(0,-lake.level-.006,0);geo.rotateX(Math.PI/2);
 const mesh=new Reflector(geo,{textureWidth:512,textureHeight:512,multisample:0,clipBias:.002,shader:lakeShader()});
 mesh.rotation.x=-Math.PI/2;mesh.position.y=lake.level+.006;
 mesh.material.transparent=true;mesh.material.depthWrite=false;mesh.material.side=THREE.DoubleSide;mesh.material.fog=true;
 mesh.name='Freshwater lake';mesh.renderOrder=3;mesh.userData.noImpact=true;
 const renderReflection=mesh.onBeforeRender,worldCamera=new THREE.Vector3();
 let last=-Infinity;
 mesh.onBeforeRender=function(renderer,scene,camera,...args){
  const u=mesh.material.uniforms;camera.getWorldPosition(worldCamera);
  const distance=Math.hypot(worldCamera.x-lake.x,worldCamera.z-lake.z);
  if(!camera.isPerspectiveCamera||renderer.xr?.isPresenting||worldCamera.y<lake.level+.025||distance>Math.max(lake.rx,lake.rz)+50){
   u.reflectReady.value=0;return;
  }
  const now=performance.now();if(now-last<66&&u.reflectReady.value>.5)return;
  // Avoid recursive reflection renders between the two lakes.
  const others=all.filter(o=>o!==mesh).map(o=>[o,o.visible]);
  for(const [o] of others)o.visible=false;
  const target=renderer.getRenderTarget(),xr=renderer.xr.enabled,shadows=renderer.shadowMap.autoUpdate;
  try{renderReflection.call(mesh,renderer,scene,camera,...args);u.reflectReady.value=1;last=now;}
  catch(e){u.reflectReady.value=0;mesh.visible=true;renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadows;renderer.setRenderTarget(target);console.warn('Lake reflection disabled:',e.message||e);mesh.onBeforeRender=()=>{};}
  finally{for(const [o,visible] of others)o.visible=visible;}
 };
 return mesh;
}
function noImpact(mesh){mesh.userData.noImpact=true;return mesh;}

// The host already rounded the road centerlines. Subdivide those exact
// polylines and use bounded miter joins so trees, map and pavement agree.
export function roadStations(points){
 const p=[];
 for(const v of points)if(!p.length||Math.hypot(v[0]-p.at(-1)[0],v[1]-p.at(-1)[1])>1e-6)p.push(v);
 if(p.length<2)return [];
 const normals=[],lengths=[];
 for(let i=1;i<p.length;i++){
  const dx=p[i][0]-p[i-1][0],dz=p[i][1]-p[i-1][1],len=Math.hypot(dx,dz);
  lengths.push(len);normals.push([-dz/len,dx/len]);
 }
 const offsets=p.map((_,i)=>{
  if(i===0)return normals[0];if(i===p.length-1)return normals.at(-1);
  const a=normals[i-1],b=normals[i],x=a[0]+b[0],z=a[1]+b[1],len=Math.hypot(x,z);
  if(len<1e-6)return b;
  const nx=x/len,nz=z/len,m=Math.min(1.25,1/Math.max(.25,nx*b[0]+nz*b[1]));
  return [nx*m,nz*m];
 });
 const stations=[];let d=0;
 for(let i=0;i<lengths.length;i++){
  const n=Math.max(1,Math.ceil(lengths[i]/.45)),a=p[i],b=p[i+1],u=offsets[i],v=offsets[i+1];
  for(let j=0;j<n;j++){
   const t=j/n;stations.push({x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,
    ox:u[0]+(v[0]-u[0])*t,oz:u[1]+(v[1]-u[1])*t,d:d+lengths[i]*t});
  }
  d+=lengths[i];
 }
 const last=p.at(-1),off=offsets.at(-1);stations.push({x:last[0],z:last[1],ox:off[0],oz:off[1],d});return stations;
}
const ROAD_LIFT={shoulder:.074,asphalt:.085,paint:.097};
function roadBuilder(doc){
 const position=[],uv=[],index=[];
 const vertex=(x,z,lift)=>{
  const i=position.length/3;
  position.push(x,terrainHeight(doc,x,z)+lift,z);uv.push(x/2.4,z/2.4);return i;
 };
 const strip=(stations,left,right,lift)=>{
  if(stations.length<2)return;
  const cols=Math.max(1,Math.ceil((right-left)/.45)),first=position.length/3;
  for(const s of stations)for(let j=0;j<=cols;j++){
   const o=left+(right-left)*j/cols;vertex(s.x+s.ox*o,s.z+s.oz*o,lift(s));
  }
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<cols;j++){
   const a=first+i*(cols+1)+j,b=a+cols+1;index.push(a,a+1,b,a+1,b+1,b);
  }
 };
 const disk=(x,z,radius,lift)=>{
  const steps=48,rings=Math.ceil(radius/.45),center=vertex(x,z,lift),first=position.length/3;
  for(let k=1;k<=rings;k++)for(let j=0;j<steps;j++){
   const angle=j*2*Math.PI/steps,r=radius*k/rings;vertex(x+Math.cos(angle)*r,z+Math.sin(angle)*r,lift);
  }
  for(let j=0;j<steps;j++)index.push(center,first+(j+1)%steps,first+j);
  for(let k=0;k<rings-1;k++)for(let j=0;j<steps;j++){
   const a=first+k*steps+j,b=first+k*steps+(j+1)%steps,c=a+steps,d=b+steps;
   index.push(a,b,c,b,d,c);
  }
 };
 return {strip,disk,finish(){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);
  g.computeVertexNormals();if(position.length)g.computeBoundingSphere();return g;
 }};
}
export function roadGeometry(doc){
 const shoulder=roadBuilder(doc),asphalt=roadBuilder(doc),paint=roadBuilder(doc);
 const junctions=doc.roadJunctions||[],roads=doc.roads||[];
 for(const road of roads){
  const stations=roadStations(road.points);if(stations.length<2)continue;
  const length=stations.at(-1).d,w=road.width/2;
  // Taper into the old village pavement without moving the road or sidewalks.
  const lift=(kind,s)=>{
   const distance=road.id==='village-south'?s.d:road.id==='village-north'?length-s.d:2;
   return ROAD_LIFT[kind]-.060*Math.max(0,1-distance/2);
  };
  shoulder.strip(stations,-w-.65,w+.65,s=>lift('shoulder',s));
  asphalt.strip(stations,-w,w,s=>lift('asphalt',s));
  for(let i=1;i<stations.length;i++){
   const a=stations[i-1],b=stations[i],x=(a.x+b.x)/2,z=(a.z+b.z)/2,d=(a.d+b.d)/2;
   // No confusing lane markings through junctions or directly at the hotel door.
   if(junctions.some(p=>Math.hypot(x-p[0],z-p[1])<5.6)||(road.id==='hotel-south'&&d<3))continue;
   const l=s=>lift('paint',s);
   for(const side of [-1,1]){
    const off=side*(w-.24);paint.strip([a,b],off-.05,off+.05,l);
   }
   if(d%7.5<3)paint.strip([a,b],-.06,.06,l);
  }
 }
 // Cover the common endpoints with tessellated pavement, not stacked boxes.
 for(const [x,z] of junctions){
  const connected=roads.filter(r=>[r.points[0],r.points.at(-1)].some(p=>p&&Math.hypot(p[0]-x,p[1]-z)<.01));
  if(connected.length<2)continue;
  const r=Math.max(...connected.map(q=>q.width/2));
  shoulder.disk(x,z,r+.65,ROAD_LIFT.shoulder+.002);
  asphalt.disk(x,z,r,ROAD_LIFT.asphalt+.003);
 }
 return {shoulder:shoulder.finish(),asphalt:asphalt.finish(),paint:paint.finish()};
}

export class NatureSurface{
 constructor(root,ground,forest){
  this.root=root;this.ground=ground;this.forest=forest;this.flat=ground.geometry;this.flatMaterial=ground.material;
  this.details=new THREE.Group();this.details.name='Trails, lakes and country roads';root.add(this.details);
  const grass=ground.material.map.clone();grass.repeat.set(1,1);grass.needsUpdate=true;
  this.uniforms={natureForest:{value:materialTexture(371,[102,86,64])},natureRock:{value:materialTexture(567,[119,116,105])}};
  this.groundMaterial=new THREE.MeshStandardMaterial({map:grass,roughness:1,vertexColors:true});
  this.groundMaterial.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader='attribute vec2 natureBlend; varying vec2 vNatureBlend; varying vec2 vNatureUV;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvNatureBlend=natureBlend; vNatureUV=uv;');
   shader.fragmentShader='uniform sampler2D natureForest; uniform sampler2D natureRock; varying vec2 vNatureBlend; varying vec2 vNatureUV;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,texture2D(natureForest,vNatureUV*2.1).rgb,vNatureBlend.x); diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(natureRock,vNatureUV*1.65).rgb,vNatureBlend.y);');
  };
  this.groundMaterial.customProgramCacheKey=()=> 'free-nature-terrain-v1';
  this.pathMaterial=new THREE.MeshStandardMaterial({map:materialTexture(923,[127,108,78]),alphaMap:edgeTexture(),transparent:true,alphaTest:.06,depthWrite:false,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
  this.lakes=[];this.vegetation=new VegetationView(root);
  this.roadMaterials={
   shoulder:new THREE.MeshStandardMaterial({map:materialTexture(1471,[127,119,105]),roughness:1}),
   asphalt:new THREE.MeshStandardMaterial({map:materialTexture(5632,[76,78,79]),roughness:.96}),
   paint:new THREE.MeshStandardMaterial({map:materialTexture(1992,[214,212,199]),roughness:.88})
  };
  this.doc=null;
  if(typeof document!=='undefined')this.loadAssets().catch(e=>console.warn('Optional nature textures:',e.message));
 }
 async loadAssets(){
  const response=await fetch('/assets/polyhaven/nature/manifest.json');if(!response.ok)return;
  const manifest=await response.json(),loader=new THREE.TextureLoader();
  const load=async(path,srgb=true)=>{
   if(typeof path!=='string'||!path.startsWith('/assets/polyhaven/nature/')||path.includes('..'))return null;
   try{const t=await loader.loadAsync(path);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}catch{return null;}
  };
  const read=key=>load(manifest.textures?.[key]?.color);
  const [grass,forest,rock,path,bark,barkNormal,leaf,pine]=await Promise.all([read('grass'),read('forest'),read('rock'),read('path'),read('bark'),load(manifest.textures?.bark?.normal,false),load(manifest.foliage?.leaf),load(manifest.foliage?.pine)]);
  if(grass){grass.repeat.set(2.5,2.5);this.groundMaterial.map.dispose();this.groundMaterial.map=grass;this.groundMaterial.needsUpdate=true;}
  if(forest){this.uniforms.natureForest.value.dispose();this.uniforms.natureForest.value=forest;}
  if(rock){this.uniforms.natureRock.value.dispose();this.uniforms.natureRock.value=rock;}
  if(path){this.pathMaterial.map.dispose();this.pathMaterial.map=path;this.pathMaterial.needsUpdate=true;}
  this.forest.setNatureTextures?.({bark,barkNormal,leaf,pine});
 }
 set(doc){
  // Preserve the current obstruction set when a full snapshot refreshes terrain.
  const boxes=this.vegetation.boxes,roads=this.vegetation.roads;this.clear();this.doc=doc;
  this.vegetation.setObstacles(boxes,roads);this.vegetation.set(doc);
  const g=terrainGeometry(doc),p=g.attributes.position,blend=[];
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const slope=Math.hypot(terrainHeight(doc,x+1,z)-terrainHeight(doc,x-1,z),terrainHeight(doc,x,z+1)-terrainHeight(doc,x,z-1))/2;
   const patch=.5+.28*Math.sin(x*.039+Math.cos(z*.051))+.17*Math.cos(z*.083-x*.022);
   const bank=(doc.lakes||[]).some(l=>Math.hypot((x-l.x)/l.rx,(z-l.z)/l.rz)<1.05&&y<l.level+.20);
   const forest=bank?.95:Math.max(0,Math.min(.84,patch*.9+(x<-25&&z<12&&z>-105?.17:0)));
   const rock=Math.max(bank?.16:0,Math.min(.96,(slope-.32)*1.6+Math.max(0,y-12)*.065));
   blend.push(forest,rock);
  }
  g.setAttribute('natureBlend',new THREE.Float32BufferAttribute(blend,2));
  this.ground.geometry=g;this.ground.material=this.groundMaterial;this.ground.receiveShadow=true;
  for(const path of doc.paths||[]){const mesh=new THREE.Mesh(trailGeometry(doc,path),this.pathMaterial);mesh.name='Hiking trail';mesh.receiveShadow=true;mesh.renderOrder=1;this.details.add(mesh);}
  if(doc.roads?.length){
   const geometries=roadGeometry(doc);
   for(const [kind,geo] of Object.entries(geometries)){
    if(!geo.attributes.position.count){geo.dispose();continue;}
    const mesh=new THREE.Mesh(geo,this.roadMaterials[kind]);mesh.name='Country roads / '+kind;
    mesh.receiveShadow=true;if(kind==='paint')noImpact(mesh);this.details.add(mesh);
   }
  }
  for(const lake of doc.lakes||[]){
   const geo=lakeGeometry(doc,lake);if(!geo.attributes.position.count){geo.dispose();continue;}
   const mesh=lakeReflector(geo,lake,this.lakes);this.lakes.push(mesh);this.details.add(mesh);
  }
 }
 setObstacles(boxes,roads){this.vegetation.setObstacles(boxes,roads);}
 update(now,day,weather,horizon,lightDir,player){
  for(const lake of this.lakes){const u=lake.material.uniforms;u.clock.value=(now/1000)%3600;u.daylight.value=day;u.storm.value=weather.storm||0;u.rain.value=weather.rain||0;u.skyColor.value.copy(horizon);u.lightDir.value.copy(lightDir);}
  this.vegetation.update(now,player,weather);
  const wet=Math.max(0,Math.min(1,weather.rain||0));
  this.roadMaterials.asphalt.color.setScalar(1-.32*wet);this.roadMaterials.asphalt.roughness=.96-.40*wet;
  this.roadMaterials.shoulder.color.setScalar(1-.20*wet);
 }
 clear(){
  if(this.ground.geometry!==this.flat)this.ground.geometry.dispose();
  this.ground.geometry=this.flat;this.ground.material=this.flatMaterial;
  for(const mesh of [...this.details.children]){mesh.geometry.dispose();mesh.removeFromParent();mesh.dispose?.();}
  this.lakes.length=0;this.vegetation.clear();this.doc=null;
 }
}

// Instanced three-dimensional foliage clusters. Unlike a solid green ball,
// individual crossed/angled leaf-bearing twigs create real gaps and silhouettes.
export function foliageCardTexture(pine=false){
 const n=192,data=new Uint8Array(n*n*4),r=random(pine?21731:87331);
 function line(x,y,ex,ey,width,c){
  const dx=ex-x,dy=ey-y,ll=dx*dx+dy*dy;
  for(let iy=Math.max(0,Math.floor(Math.min(y,ey)-width));iy<=Math.min(n-1,Math.ceil(Math.max(y,ey)+width));iy++)for(let ix=Math.max(0,Math.floor(Math.min(x,ex)-width));ix<=Math.min(n-1,Math.ceil(Math.max(x,ex)+width));ix++){
   const t=Math.max(0,Math.min(1,((ix-x)*dx+(iy-y)*dy)/Math.max(.001,ll)));
   if((ix-x-dx*t)**2+(iy-y-dy*t)**2<=width*width)data.set([...c,255],(iy*n+ix)*4);
  }
 }
 function leaf(x,y,length,width,angle,c){
  const a=Math.cos(angle),b=Math.sin(angle),rad=length+width;
  for(let iy=Math.max(0,Math.floor(y-rad));iy<=Math.min(n-1,Math.ceil(y+rad));iy++)for(let ix=Math.max(0,Math.floor(x-rad));ix<=Math.min(n-1,Math.ceil(x+rad));ix++){
   const u=((ix-x)*a+(iy-y)*b)/length,v=(-(ix-x)*b+(iy-y)*a)/width;
   if(u*u+Math.pow(Math.abs(v),1.65)<=1){
    const shade=.76+.24*(1-Math.abs(v))+.06*Math.sin(u*13+v*4);
    data.set(c.map(k=>Math.min(255,Math.round(k*shade))).concat(255),(iy*n+ix)*4);
   }
  }
 }
 line(96,7,98,180,1.4,[102,81,55]);
 if(pine){
  for(let k=0;k<30;k++){
   const y=18+k*5.2,x=96+Math.sin(k*.35)*3,spread=(1-k/37)*63;
   for(const side of [-1,1]){
    const ex=x+side*spread*(.64+r()*.34),ey=y+9+r()*14;
    line(x,y,ex,ey,1,[83,67,46]);
    for(let j=0;j<15;j++){
     const t=(j+1)/16,px=x+(ex-x)*t,py=y+(ey-y)*t;
     for(const s of [-1,1]){
      const len=7+r()*12;line(px,py,px+side*len*.55,py+s*len, .8,[51+Math.floor(r()*27),83+Math.floor(r()*32),43+Math.floor(r()*26)]);
     }
    }
   }
  }
 }else{
  for(let k=0;k<13;k++){
   const y=21+k*11.5;
   for(const side of [-1,1]){
    const x=96+side*(18+r()*30)*(1-k*.018),ey=y+10+r()*8;
    line(96,y,x,ey,1,[105,84,49]);
    for(let j=0;j<3;j++){
     const angle=side===1?.58+r()*.45:Math.PI-.58-r()*.45;
     const cx=x+side*(j*8+r()*4),cy=ey+j*4;
     const c=[54+Math.floor(r()*36),94+Math.floor(r()*45),37+Math.floor(r()*27)];
     leaf(cx,cy,12+r()*7,5+r()*5,angle,c);
    }
   }
  }
  leaf(97,175,14,8,Math.PI/2,[89,132,47]);
 }
 const tex=new THREE.DataTexture(data,n,n);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=4;tex.needsUpdate=true;return tex;
}
export function foliageCluster(pine=false,variant=0){
 const r=random(73019+variant*763+Number(pine)*491),pos=[],uv=[],colors=[],indices=[];
 const p=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3(),q=new THREE.Quaternion(),e=new THREE.Euler(),tmp=new THREE.Vector3();
 function card(x,y,z,w,h,rx,ry,rz,tint){
  p.set(x,y,z);q.setFromEuler(e.set(rx,ry,rz));u.set(w*.5,0,0).applyQuaternion(q);v.set(0,h*.5,0).applyQuaternion(q);const a=pos.length/3;
  for(const [i,j] of [[-1,-1],[1,-1],[1,1],[-1,1]]){tmp.copy(p).addScaledVector(u,i).addScaledVector(v,j);pos.push(tmp.x,tmp.y,tmp.z);uv.push((i+1)*.5,(j+1)*.5);colors.push(tint,tint,tint*.97);}
  indices.push(a,a+1,a+2,a,a+2,a+3);
 }
 if(pine){
  for(let branch=0;branch<8;branch++){
   const a=branch*Math.PI/4+r()*.29,dx=Math.cos(a),dz=Math.sin(a);
   for(let j=0;j<7;j++){
    const t=.17+j*.115,x=dx*t,z=dz*t,y=.25-.58*t+(r()-.5)*.14;
    card(x,y,z,.50-.15*t,.71-.23*t,-1.12+r()*.42,a+Math.PI/2,(r()-.5)*.5,.78+r()*.22);
    if(j%2===0)card(x,y+.07,z,.35,.63,-.52,a+(r()-.5)*1.1,.2,.78+r()*.22);
   }
  }
 }else{
  for(let j=0;j<38;j++){
   const a=j*2.399963+r()*.5,y=(r()-.5)*1.5,rad=Math.sqrt(Math.max(0,1-y*y))*Math.sqrt(r())*.8,x=Math.cos(a)*rad,z=Math.sin(a)*rad;
   card(x,y,z,.69+r()*.24,.75+r()*.27,(r()-.5)*1.8,a,(r()-.5)*1.55,.77+r()*.23);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
