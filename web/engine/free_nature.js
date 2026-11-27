// Natural landscape presentation. All source imagery is packaged locally at
// image build time; deterministic fallback materials work without any downloads.
import * as THREE from 'three';
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
function waterMaterial(){
 const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{clock:{value:0},daylight:{value:1},storm:{value:0},skyColor:{value:new THREE.Color(0xb0cfe0)},lightDir:{value:new THREE.Vector3(0,1,0)}}]);
 return new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:false,fog:true,vertexShader:`
 varying vec3 vWorld;
 #include <fog_pars_vertex>
 void main(){
  vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
 }
 `,fragmentShader:`
 varying vec3 vWorld;
 uniform float clock,daylight,storm;
 uniform vec3 skyColor,lightDir;
 #include <fog_pars_fragment>
 void main(){
  vec2 p=vWorld.xz;
  float a=sin(dot(p,vec2(1.36,.79))+clock*1.12);
  float b=sin(dot(p,vec2(-.71,2.19))-clock*.86);
  float c=sin(dot(p,vec2(4.13,-3.53))+clock*1.8);
  float waves=.8+storm*1.6;
  vec3 n=normalize(vec3((a*.075+c*.024)*waves,1.0,(b*.089-c*.023)*waves));
  vec3 v=normalize(cameraPosition-vWorld);
  float f=pow(1.0-clamp(dot(n,v),0.0,1.0),3.4);
  vec3 deep=mix(vec3(.016,.035,.045),vec3(.058,.19,.18),daylight);
  deep*=.93+.07*a+.055*b;
  vec3 reflected=skyColor*(.61+.39*daylight);
  vec3 color=mix(deep,reflected,.13+.78*f);
  float spec=pow(max(dot(reflect(-lightDir,n),v),0.0),52.0)*daylight*(1.0-storm*.75);
  color+=vec3(1.0,.85,.62)*spec*.72;
  gl_FragColor=vec4(color,.78+.21*f);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
 }
 `});
}
function noImpact(mesh){mesh.userData.noImpact=true;return mesh;}

export class NatureSurface{
 constructor(root,ground,forest){
  this.root=root;this.ground=ground;this.forest=forest;this.flat=ground.geometry;this.flatMaterial=ground.material;
  this.details=new THREE.Group();this.details.name='Trails and lakes';root.add(this.details);
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
  this.waterMaterial=waterMaterial();
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
  this.clear();this.doc=doc;
  const g=terrainGeometry(doc),p=g.attributes.position,blend=[];
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const slope=Math.hypot(terrainHeight(doc,x+1,z)-terrainHeight(doc,x-1,z),terrainHeight(doc,x,z+1)-terrainHeight(doc,x,z-1))/2;
   const patch=.5+.28*Math.sin(x*.039+Math.cos(z*.051))+.17*Math.cos(z*.083-x*.022);
   const forest=Math.max(0,Math.min(.84,patch*.9+(x<-25&&z<12&&z>-105?.17:0)));
   const rock=Math.max(0,Math.min(.96,(slope-.32)*1.6+Math.max(0,y-12)*.065));
   blend.push(forest,rock);
  }
  g.setAttribute('natureBlend',new THREE.Float32BufferAttribute(blend,2));
  this.ground.geometry=g;this.ground.material=this.groundMaterial;this.ground.receiveShadow=true;
  for(const path of doc.paths||[]){const mesh=new THREE.Mesh(trailGeometry(doc,path),this.pathMaterial);mesh.name='Hiking trail';mesh.receiveShadow=true;mesh.renderOrder=1;this.details.add(mesh);}
  for(const lake of doc.lakes||[]){
   const geo=lakeGeometry(doc,lake);if(!geo.attributes.position.count){geo.dispose();continue;}
   const mesh=noImpact(new THREE.Mesh(geo,this.waterMaterial));mesh.name='Freshwater lake';mesh.renderOrder=3;this.details.add(mesh);
  }
 }
 update(now,day,weather,horizon,lightDir){
  const u=this.waterMaterial.uniforms;u.clock.value=(now/1000)%3600;u.daylight.value=day;u.storm.value=weather.storm;u.skyColor.value.copy(horizon);u.lightDir.value.copy(lightDir);
 }
 clear(){
  if(this.ground.geometry!==this.flat)this.ground.geometry.dispose();
  this.ground.geometry=this.flat;this.ground.material=this.flatMaterial;
  for(const mesh of [...this.details.children]){mesh.geometry.dispose();mesh.removeFromParent();}
  this.doc=null;
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
