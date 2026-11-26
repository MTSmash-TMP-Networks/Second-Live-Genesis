import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Shared static furniture: dimensions and persistent IDs come from the server.
// Build details once, then batch each prop by material; no external downloads.
function grain(kind){
 const n=128,data=new Uint8Array(n*n*4);let seed=7821;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=(seed/4294967296-.5)*13;
  const v=kind==='wood'?203+15*Math.sin(y*.38+2*Math.sin(x*.035))+8*Math.sin(y*1.7+x*.024)+noise:222+noise+4*Math.cos(x*Math.PI)*Math.cos(y*Math.PI);
  const i=(y*n+x)*4;data.set([v,v,v,255].map(k=>Math.max(0,Math.min(255,k))),i);
 }
 const t=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
export function interiorMaterials(){
 const wood=grain('wood'),fabric=grain('fabric');
 const m=(color,roughness=.88,map=null,extra={})=>new THREE.MeshStandardMaterial({color,roughness,map,...extra});
 return {wood:m(0x886247,.83,wood),lightWood:m(0xc1a17b,.78,wood),darkWood:m(0x49372d,.85,wood),
  cream:m(0xe8e1d2,.86),metal:m(0x434a4b,.48,null,{metalness:.45}),chrome:m(0xb1b8bd,.29,null,{metalness:.62}),
  teal:m(0x527779,.96,fabric),rust:m(0x956651,.95,fabric),blue:m(0x536d90,.95,fabric),linen:m(0xe6ddca,.96,fabric),
  green:m(0x4d7851,.93),leaf:m(0x638c50,.92),soil:m(0x46362d),pot:m(0x9d7356),black:m(0x202426,.55),
  screen:m(0x17232c,.34),paper:m(0xf4e9d5,.95),red:m(0xb74d42),yellow:m(0xe1b452),orange:m(0xd48a3e),white:m(0xf3f0e7,.56),
  brown:m(0x69523c),glass:m(0x50757b,.32),shade:m(0xf1dfb9,.77,null,{emissive:0xffdb9a,emissiveIntensity:.38})};
}
function maker(root,mats){
 const groups=new Map(),dummy=new THREE.Object3D();
 function add(geo,p,s,mat,ry=0,rz=0){
  dummy.position.set(...p);dummy.scale.set(...s);dummy.rotation.set(0,ry,rz);dummy.updateMatrix();
  const g=geo.index?geo.toNonIndexed():geo;g.applyMatrix4(dummy.matrix);
  if(g!==geo)geo.dispose();
  const m=mats[mat]||mats.wood;if(!groups.has(m))groups.set(m,[]);groups.get(m).push(g);
 }
 const box=(p,s,m,soft=false,ry=0)=>add(soft?new RoundedBoxGeometry(1,1,1,2,.08):new THREE.BoxGeometry(1,1,1),p,s,m,ry);
 const cyl=(p,s,m,top=1,bottom=1)=>add(new THREE.CylinderGeometry(top/2,bottom/2,1,16),p,s,m);
 const ball=(p,s,m,rz=0)=>add(new THREE.SphereGeometry(.5,12,8),p,s,m,0,rz);
 function finish(){
  for(const [m,geos] of groups){
   const merged=mergeGeometries(geos,false);
   for(const geo of geos)geo.dispose();
   if(!merged)throw new Error('Village furniture geometry merge failed');
   const mesh=new THREE.Mesh(merged,m);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
 }
 return {box,cyl,ball,finish};
}
export function makeInteriorProp(item,mats){
 const root=new THREE.Group(),[p,s]=item.bounds,[d,h,w]=s;
 root.name=item.type+' '+item.index;root.position.set(p[0]+d/2,p[1],p[2]+w/2);
 root.rotation.y=(item.side===1?Math.PI:0)+(item.flip?Math.PI:0);
 const {box,cyl,ball,finish}=maker(root,mats),accent=item.theme==='cafe'?'rust':item.index%2?'blue':'teal';
 const legs=(top,dx=d,dz=w,mat='darkWood')=>{for(const x of [-1,1])for(const z of [-1,1])box([x*(dx/2-.07),top/2,z*(dz/2-.07)],[.055,top,.055],mat);};
 const cup=(x,y,z)=>{cyl([x,y+.048,z],[.085,.096,.085],'white',1,.76);cyl([x,y+.099,z],[.065,.009,.065],'brown');};
 const books=(x,y,z,width,count=7)=>{for(let j=0;j<count;j++){const thick=width/count*.8,bh=.15+(j%3)*.045;box([x,y+bh/2,z-width/2+(j+.5)*width/count],[.19,bh,thick],['blue','red','cream','green','brown','yellow'][j%6]);}};
 const cabinet=(height,mat='wood')=>{box([0,height/2,0],[d*.98,height,w*.98],mat);box([0,height-.025,0],[d,.05,w],'lightWood');};
 switch(item.type){
 case 'sofa':
  legs(.13);box([0,.23,0],[d,.23,w],'darkWood',true);box([d*.35,.58,0],[d*.24,.64,w*.95],accent,true);
  for(const z of [-1,1])box([0,.48,z*w*.435],[d*.98,.42,w*.13],accent,true);
  for(let j=0;j<3;j++){const z=(j-1)*w*.265;box([-d*.10,.43,z],[d*.62,.18,w*.25],accent,true);box([d*.18,.69,z],[d*.20,.38,w*.25],accent,true);}
  box([d*.01,.60,-w*.29],[.22,.28,.28],'linen',true,.18);box([d*.01,.60,w*.30],[.23,.27,.27],'rust',true,-.12);break;
 case 'coffee':
  legs(h-.07);box([0,h-.035,0],[d,.07,w],'lightWood',true);box([.06,h+.02,.16],[.20,.04,.28],'blue');box([.06,h+.045,.16],[.18,.01,.25],'paper');cup(-.12,h,-.23);break;
 case 'media':
  cabinet(.46,'darkWood');box([-d*.48,.23,0],[.025,.31,w*.84],'wood');box([d*.07,.51,0],[.29,.07,.55],'black');box([d*.12,.87,0],[.08,.66,w*.82],'black',true);box([d*.067,.87,0],[.014,.59,w*.76],'screen');break;
 case 'bed':
  legs(.16);box([0,.26,0],[d,.21,w],'wood',true);box([d*.45,.48,0],[d*.10,.80,w],'lightWood',true);box([-d*.04,.43,0],[d*.89,.22,w*.94],'linen',true);
  box([-d*.23,.56,0],[d*.54,.13,w*.99],accent,true);
  for(const z of [-1,1])box([d*.28,.60,z*w*.23],[d*.25,.13,w*.42],'white',true);break;
 case 'dresser':
  cabinet(h);for(let j=0;j<3;j++){const y=(j+.5)*h/3;box([-d*.49,y,0],[.045,h*.29,w*.89],'lightWood');box([-d*.53,y,0],[.05,.035,.21],'metal',true);}break;
 case 'kitchen':
  cabinet(.86,'cream');box([0,.89,0],[d,.09,w],'darkWood');for(let j=0;j<3;j++){const z=(j-1)*w/3;box([-d*.49,.44,z],[.035,.72,w*.30],'wood');box([-d*.53,.68,z],[.055,.028,.16],'chrome');}
  box([.03,.943,-w*.29],[d*.72,.015,w*.30],'chrome');box([.03,.954,-w*.29],[d*.52,.012,w*.22],'metal');cyl([d*.25,1.01,-w*.29],[.033,.14,.033],'chrome');
  box([.02,.946,w*.23],[d*.68,.016,w*.32],'black');for(const z of [-.10,.10])for(const x of [-.12,.12])cyl([x,.96,w*.23+z],[.15,.012,.15],'metal');break;
 case 'dining':
  legs(h-.075);box([0,h-.0375,0],[d,.075,w],'lightWood',true);
  for(const z of [-1,1]){cyl([0,h+.008,z*w*.28],[.22,.016,.22],'white');cup(d*.24,h,z*w*.28);}ball([0,h+.065,0],[.22,.13,.22],'green');break;
 case 'chair':
  legs(.43);box([0,.455,0],[d,.075,w],'lightWood',true);
  for(const z of [-1,1])box([d*.42,.67,z*w*.42],[.05,.48,.05],'darkWood');
  box([d*.43,.79,0],[.065,.30,w*.92],accent,true);box([-.02,.52,0],[d*.87,.065,w*.88],accent,true);break;
 case 'bookcase':
 case 'shelf':{
  const retail=item.type==='shelf',mat=retail?'metal':'wood';
  for(const z of [-1,1])box([0,h/2,z*(w/2-.03)],[d,.98*h,.06],mat);
  box([d*.46,h/2,0],[.065,h,w],mat);
  for(let j=0;j<4;j++){
   const y=.07+j*(h-.16)/4;box([0,y,0],[d,.055,w],retail?'cream':'lightWood');
   if(!retail)books(-d*.13,y+.03,0,w*.80);
   else for(let k=0;k<Math.max(6,Math.floor(w/.19));k++){
    const count=Math.max(6,Math.floor(w/.19)),z=-w*.43+k*w*.86/(count-1),color=['red','blue','yellow','green','cream','orange'][(j*3+k)%6];
    if((k+j)%3===0){cyl([-d*.18,y+.15,z],[.12,.24,.12],color,.75,1);cyl([-d*.18,y+.28,z],[.07,.035,.07],'white');}
    else{box([-d*.18,y+.115,z],[.16,.18,.13],color);box([-d*.265,y+.115,z],[.01,.065,.11],'paper');}
   }
  }
  box([0,h-.03,0],[d,.06,w],mat);break;}
 case 'checkout':
 case 'cafe-counter':{
  const cafe=item.type==='cafe-counter',counter=cafe?1.00:.90;cabinet(counter,cafe?'darkWood':'cream');box([0,counter,0],[d,.085,w],'lightWood');
  box([-.11,counter+.11,-w*.28],[.37,.20,.42],'black',true);box([-.16,counter+.24,-w*.28],[.07,.23,.38],'screen',true);box([-.37,counter+.05,-w*.28],[.26,.035,.30],'metal');
  if(cafe){box([.12,counter+.18,w*.28],[.42,.36,.62],'chrome',true);box([-.13,counter+.16,w*.28],[.08,.20,.51],'black');for(let j=0;j<3;j++)cup(-.30,counter,w*.07+j*.18);}
  else{box([.02,counter+.045,w*.22],[.54,.03,.64],'black');box([.06,counter+.065,w*.22],[.16,.035,.25],'red');}break;}
 case 'produce':
  box([0,.24,0],[d*.86,.48,w*.89],'darkWood');box([0,.69,0],[d,.14,w],'wood');
  for(const x of [-1,1])box([x*d*.47,.83,0],[.05,.23,w],'lightWood');
  for(const z of [-1,1])box([0,.83,z*w*.47],[d,.23,.05],'lightWood');
  for(let i=0;i<5;i++)for(let j=0;j<6;j++)ball([(i-2)*d*.15,.84+(i+j)%2*.04,(j-2.5)*w*.14],[.17,.16,.17],['red','orange','green'][(i+2*j)%3]);break;
 case 'crate':
  box([0,.25,0],[d*.98,.5,w*.98],'wood');for(const x of [-1,1])for(let j=0;j<3;j++)box([x*d*.495,.1+j*.16,0],[.025,.12,w],'lightWood');for(let j=0;j<5;j++)ball([0,.52,(j-2)*w*.16],[.13,.13,.13],'green');break;
 case 'cafe-table':
  cyl([0,.045,0],[d*.60,.09,w*.60],'metal');cyl([0,.39,0],[.09,.68,.09],'metal');cyl([0,h-.04,0],[d,.08,w],'lightWood');cup(-.13,h,-.16);cup(.13,h,.16);box([0,h+.013,0],[.18,.026,.12],'paper');break;
 case 'lamp':
  cyl([0,.04,0],[d,.08,w],'metal');cyl([0,.83,0],[.043,1.60,.043],'metal');cyl([0,h-.19,0],[d,.36,w],'shade',.62,1);break;
 case 'plant':
  cyl([0,.18,0],[d,.36,w],'pot',1,.70);cyl([0,.365,0],[d*.86,.015,w*.86],'soil');
  for(let j=0;j<7;j++){const a=j*2.39996,x=Math.cos(a)*d*.22,z=Math.sin(a)*w*.22;ball([x,.56+(j%3)*.11,z],[d*.48,.42,w*.43],j%2?'green':'leaf',Math.sin(a)*.65);}break;
 default:box([0,h/2,0],[d,h,w],'wood');
 }
 finish();
 if(item.type==='lamp'){
  const light=new THREE.PointLight(0xffe6c2,0,8.5,2);light.position.set(0,h-.26,0);light.visible=false;light.castShadow=false;root.add(light);root.userData.interiorLight=light;
 }
 return root;
}
export class VillageInterior{
 constructor(root){this.root=root;this.materials=interiorMaterials();this.entries=new Map();}
 set(rows){
  const wanted=new Set();
  for(const row of rows)for(const item of row.interior||[]){
   const id=row.id+':'+item.index;wanted.add(id);
   let e=this.entries.get(id);
   if(!e){const root=makeInteriorProp(item,this.materials);this.root.add(root);e={root,item};this.entries.set(id,e);}
   e.root.visible=(row.damage?.[item.index]||0)<4;
   if(!e.root.visible&&e.root.userData.interiorLight)e.root.userData.interiorLight.visible=false;
  }
  for(const [id,e] of this.entries)if(!wanted.has(id)){e.root.traverse(o=>{if(o.isMesh)o.geometry.dispose();if(o.isPointLight)o.dispose?.();});e.root.removeFromParent();this.entries.delete(id);}
 }
 get(id){return this.entries.get(id);}
 setNight(night,player){
  const lights=[];for(const e of this.entries.values()){
   const light=e.root.userData.interiorLight;if(!light)continue;
   if(!e.root.visible){light.visible=false;continue;}
   const distance=Math.hypot(e.root.position.x-player.x,e.root.position.z-player.z);
   lights.push({light,distance});
  }
  lights.sort((a,b)=>a.distance-b.distance);
  const level=Math.max(0,Math.min(1,Number.isFinite(night)?night:0));
  for(let i=0;i<lights.length;i++){
   const {light,distance}=lights[i];light.visible=i<4&&distance<22;
   light.intensity=28+37*level;
  }
  this.materials.shade.emissiveIntensity=.38+.55*level;
 }
}
