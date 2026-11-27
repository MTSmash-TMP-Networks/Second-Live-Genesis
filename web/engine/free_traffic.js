// Server-owned traffic presentation. Cars remain playable without optional GLBs.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createCharacter,animateCharacter,disposeCharacter} from './character.js';
import {applyRoomAvatarPose,resetRoomAvatarPose} from './avatar_room_pose.js';

const WIDTH=1.95,LENGTH=4.8,HALF_W=WIDTH/2,HALF_L=LENGTH/2;
const KINDS=new Set(['sedan','hatchback','suv','taxi']);
const wheelNames=['wheel_FL','wheel_FR','wheel_RL','wheel_RR'];
// Bounds and seat coordinates are measured from the five uploaded LOD0
// originals, in metres. Both LODs share the same transform, so the vehicle
// does not jump when changing distance. +Z is the front in the source files.
const PREMIUM=Object.freeze({
 'boxy-off-roader':{size:[2.294525,2.205375,4.859007],centerZ:.033146,minY:-.000375,hip:[.42,.96,-.33],scale:.86,paint:'Paint_Sand'},
 'grand-tourer':{size:[2.075167,1.326799,4.782776],centerZ:.035763,minY:0,hip:[.36,.49,-.42],scale:.78,paint:'Paint_Maroon'},
 'luxury-suv':{size:[2.354037,1.848110,4.964593],centerZ:.046174,minY:0,hip:[.41,.84,-.35],scale:.86,paint:'Paint_Pearl'},
 'mid-engine-supercar':{size:[2.145167,1.160000,4.455526],centerZ:.006737,minY:0,hip:[.35,.37,-.22],scale:.74,paint:'Paint_Yellow'},
 'muscle-coupe':{size:[2.109875,1.368325,4.869930],centerZ:.024535,minY:0,hip:[.37,.52,-.45],scale:.80,paint:'Paint_Orange'}
});
const isPremium=model=>Object.hasOwn(PREMIUM,model);
let premiumManifestPromise;
function premiumFiles(){
 premiumManifestPromise??=fetch('/assets/polyhaven/premium-vehicles/manifest.json',{cache:'no-store'}).then(r=>{
  if(!r.ok)return new Set();return r.json().then(m=>{
   if(m.format!=='second-live-premium-vehicles-v1')return new Set();
   const files=new Set((m.files||[]).filter(f=>isPremium(f.model)&&[0,1].includes(f.lod)&&f.file===f.model+'-lod'+f.lod+'.glb').map(f=>f.file));
   console.info('Premium vehicles:',files.size,'/ 10 local assets');return files;
  });
 }).catch(e=>{console.warn('Premium vehicle manifest:',e.message||e);return new Set();});
 return premiumManifestPromise;
}
export function premiumModelSpec(model){return isPremium(model)?PREMIUM[model]:null;}
const templates=new Map();
let manifestPromise;
function availableModels(){
 manifestPromise??=fetch('/assets/polyhaven/vehicles/manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('vehicle manifest unavailable');return r.json();}).then(m=>{
  const files=new Set((m.files||[]).filter(f=>/^(sedan|hatchback|suv|taxi)-lod[012]-png\.glb$/.test(f.file||'')).map(f=>f.file));
  console.info('Traffic source models ready:',files.size,'/ 12');return files;
 }).catch(e=>{console.warn('Traffic manifest:',e.message||e);return null;});
 return manifestPromise;
}
const box=new RoundedBoxGeometry(1,1,1,3,.08);
// Rounded tire shoulders, recessed alloy rims and actual spokes.
const tire=new THREE.LatheGeometry([[.22,-.116],[.28,-.116],[.32,-.106],[.34,-.075],[.345,-.045],[.345,.045],[.34,.075],[.32,.106],[.28,.116],[.22,.116],[.22,-.116]].map(v=>new THREE.Vector2(...v)),40);tire.rotateZ(Math.PI/2);
const hub=new THREE.CylinderGeometry(.20,.20,.215,32);hub.rotateZ(Math.PI/2);
const rim=new THREE.TorusGeometry(.224,.020,8,40);rim.rotateY(Math.PI/2);
const spokes=(()=>{
 const geos=[];for(let i=0;i<5;i++)for(const off of [-.045,.045]){
  const g=new THREE.BoxGeometry(.025,.142,.036);g.translate(0,.136,off);g.rotateX(i*Math.PI*2/5+off*.85);geos.push(g);
 }const g=mergeGeometries(geos);geos.forEach(v=>v.dispose());return g;
})();
function reflectionMap(){
 const w=128,h=64,rgba=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const t=1-y/(h-1),above=Math.max(0,(t-.5)*2),band=Math.exp(-Math.pow((t-.58)*5.5,2)),cloud=Math.max(0,Math.sin(x*.11+y*.12)+Math.cos(x*.067-y*.24)-.65);
  const k=(y*w+x)*4;
  rgba[k]=Math.round(22+63*above+103*band+cloud*12);
  rgba[k+1]=Math.round(25+81*above+107*band+cloud*12);
  rgba[k+2]=Math.round(25+116*above+109*band+cloud*12);rgba[k+3]=255;
 }
 const t=new THREE.DataTexture(rgba,w,h);t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
}
const carEnvironment=reflectionMap();
const colors={
 black:new THREE.MeshStandardMaterial({color:0x212426,roughness:.92}),
 chrome:new THREE.MeshStandardMaterial({color:0xaab4ba,metalness:.72,roughness:.29,envMap:carEnvironment,envMapIntensity:.65}),
 interior:new THREE.MeshStandardMaterial({color:0x404342,roughness:.89}),
 glass:new THREE.MeshStandardMaterial({color:0x68818e,roughness:.13,metalness:.12,transparent:true,opacity:.44,depthWrite:false,side:THREE.DoubleSide,envMap:carEnvironment,envMapIntensity:.62}),
 plate:new THREE.MeshStandardMaterial({color:0xdde0d6,roughness:.7}),
 taxi:new THREE.MeshStandardMaterial({color:0xf3cb50,emissive:0xffce38,emissiveIntensity:.25,roughness:.6})
};
function solid(root,material,p,s,geometry=box,rotation=null){
 const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.scale.set(...s);
 if(rotation)m.rotation.set(...rotation);m.castShadow=!material.transparent;m.receiveShadow=true;root.add(m);return m;
}
function panel(root,material,points){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
 const mesh=solid(root,material,[0,0,0],[1,1,1],g);mesh.userData.vehicleOwnedGeometry=true;return mesh;
}
// Local fallback is a sculpted, continuous body shell rather than stacked
// boxes. The geometry is shared in shape but owned per vehicle for disposal.
function sampleProfile(points,z){
 let i=1;while(i<points.length-1&&z>points[i][0])i++;
 const a=points[i-1],b=points[i],t=THREE.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1);
 const u=t*t*(3-2*t);return a.slice(1).map((v,j)=>v+(b[j+1]-v)*u);
}
function surface(root,name,material,z0,z1,rows,cols,point,flip=false){
 const pos=[],uv=[],indices=[];
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
  pos.push(...point(z0+(z1-z0)*i/rows,j/cols));uv.push(j/cols,i/rows);
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const a=i*(cols+1)+j,b=a+cols+1;
  if(flip)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
 const m=solid(root,material,[0,0,0],[1,1,1],g);m.name=name;m.userData.vehicleOwnedGeometry=true;return m;
}
function seam(root,material,points,r=.008){
 const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(8,points.length*3),r,5,false);
 const m=solid(root,material,[0,0,0],[1,1,1],g);m.userData.vehicleOwnedGeometry=true;return m;
}
// Static details are merged by material; rotating wheels and steering
// retain independent pivots. This keeps the higher-detail fallback cheap.
function batchVehicleMeshes(root,keep=()=>false){
 const groups=new Map();
 for(const m of root.children){
  if(!m.isMesh||Array.isArray(m.material)||m.material.transparent||keep(m))continue;
  if(!groups.has(m.material))groups.set(m.material,[]);groups.get(m.material).push(m);
 }
 for(const [material,meshes] of groups){
  if(meshes.length<2)continue;
  const geos=meshes.map(m=>{
   m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();return g.applyMatrix4(m.matrix);
  });
  const g=mergeGeometries(geos,false);geos.forEach(v=>v.dispose());if(!g)continue;
  for(const m of meshes){m.removeFromParent();if(m.userData.vehicleOwnedGeometry)m.geometry.dispose();}
  const merged=solid(root,material,[0,0,0],[1,1,1],g);merged.name='Batched vehicle details';merged.userData.vehicleOwnedGeometry=true;
 }
}
function fallback(row){
 const root=new THREE.Group();root.name='Sculpted local '+row.kind;
 const paint=new THREE.MeshPhysicalMaterial({color:row.color,metalness:.28,roughness:.32,clearcoat:.78,clearcoatRoughness:.24,side:THREE.DoubleSide,envMap:carEnvironment,envMapIntensity:.72});
 const tall=row.kind==='suv',short=row.kind==='hatchback',taxi=row.kind==='taxi';
 const roof=tall?1.68:short?1.49:1.46;
 const profile=[[-2.40,.66,.64],[-2.31,.84,.75],[-2.10,.90,.82],[-1.56,.943,.88],[-.83,.91,tall?1.00:.92],[.1,.905,tall?1.01:.92],[.89,.928,.91],[1.47,.95,.89],[2.02,.91,short?.89:.84],[2.31,.83,.76],[2.4,.68,.65]];
 const body=z=>sampleProfile(profile,z);
 const lower=z=>{
  let y=.22;
  for(const axle of [-1.47,1.47]){const d=Math.abs(z-axle);if(d<.435)y=Math.max(y,.345+Math.sqrt(.435*.435-d*d));}
  return y;
 };
 // The crown of the bonnet, shoulder lines and wheel arches follow the
 // same continuous profile. No opaque polygon fills the wheel openings.
 surface(root,'Curved bonnet and body crown',paint,-2.4,2.4,120,18,(z,u)=>{
  const [w,h]=body(z),a=u*2-1;return [a*w,h-.10*Math.pow(Math.abs(a),2.7),z];
 });
 for(const side of [-1,1]){
  surface(root,'Sculpted flank and wheel openings',paint,-2.4,2.4,160,12,(z,u)=>{
   const [w,h]=body(z),lo=lower(z),top=Math.max(lo+.023,h-.10),y=lo+(top-lo)*u;
   return [side*w*(.94+.06*Math.sin(u*Math.PI/2)+.012*Math.sin(u*Math.PI)),y,z];
  },side>0);
  for(const axle of [-1.47,1.47]){
   const points=[];for(let i=0;i<=26;i++){
    const a=i*Math.PI/26,z=axle+.435*Math.cos(a),y=.345+.435*Math.sin(a),w=body(z)[0];points.push([side*(w*.945+.009),y,z]);
   }
   seam(root,tall?colors.black:paint,points,tall?.032:.014);
  }
  // Thin inset panel gaps; door handles and mirrors are much smaller than
  // the old blocky trim. The SUV gets dark rocker cladding.
  for(const z of [-.80,.20,1.00]){
   const [w,h]=body(z),p=[];for(let i=0;i<=6;i++){let u=.15+.85*i/6;p.push([side*(w*(.94+.06*Math.sin(u*Math.PI/2)+.012*Math.sin(u*Math.PI))+.004),lower(z)+(Math.max(lower(z)+.023,h-.10)-lower(z))*u,z]);}
   seam(root,colors.black,p,.0045);
  }
  for(const z of [-.10,.79]){const [w,h]=body(z);solid(root,colors.chrome,[side*(w+.004),h-.145,z],[.030,.032,.17]);}
  const mirror=solid(root,paint,[side*.96,1.015,-.73],[.21,.118,.25]);mirror.rotation.y=side*.15;
  solid(root,colors.glass,[side*.98,1.015,-.61],[.16,.082,.012]);
  if(tall)solid(root,colors.black,[side*.854,.24,0],[.12,.10,2.18]);
 }
 solid(root,colors.black,[0,.23,0],[1.34,.16,4.35]);
 // Curved end caps with recessed, rounded grille and bumpers.
 for(const side of [-1,1]){
  const z=side*2.4,[w,h]=body(z);
  surface(root,side<0?'Front bumper':'Rear bumper',paint,0,1,16,18,(v,u)=>{
   const a=u*2-1,y=.23+(h-.23)*v;
   return [a*w,y-.055*Math.abs(a)**2, z-side*.075*Math.abs(a)**2-side*.035*(1-v)];
  },side>0);
 }
 solid(root,colors.black,[0,.49,-2.395],[1.08,.22,.042]);
 for(let i=0;i<4;i++)solid(root,colors.chrome,[0,.425+i*.042,-2.420],[.96,.012,.018]);
 solid(root,colors.black,[0,.31,-2.34],[.88,.09,.055]);
 solid(root,colors.plate,[0,.44,2.405],[.47,.108,.020]);
 solid(root,colors.plate,[0,.32,-2.405],[.43,.085,.020]);
 // Distinct roofline for sedan, crossover and hatchback. A bent glass
 // surface surrounds the interior; the opaque roof ends at the pillars.
 const back=tall?1.53:short?1.39:1.02;
 const cabinProfile=[[-1.04,.925,.82],[-.81,1.06,.79],[-.37,roof-.035,.704],[-.12,roof,.68],[.44,roof,.68],[tall?1.09:short?.93:.63,roof-.055,.70],[back,.94,.84]];
 const roofStart=-.37,roofEnd=tall?1.09:short?.93:.63;
 const cab=z=>sampleProfile(cabinProfile,z);
 const roofSurface=(material,a,b,label)=>surface(root,label,material,a,b,26,18,(z,u)=>{
  const [y,w]=cab(z),v=u*2-1;return [w*v,y-.046*v*v,z];
 });
 roofSurface(colors.glass,-1.04,roofStart,'Curved windshield');
 roofSurface(paint,roofStart,roofEnd,'Sculpted roof');
 roofSurface(colors.glass,roofEnd,back,'Rear windshield');
 for(const side of [-1,1]){
  surface(root,'Side windows',colors.glass,-1.04,back,48,10,(z,u)=>{
   const [y,w]=cab(z),base=body(z)[1]-.065,wide=body(z)[0]-.052;
   return [side*(wide+(w-wide)*u),base+(Math.max(base+.01,y-.046)-base)*u,z];
  },side>0);
  for(const z of [-.97,-.73,.16,roofEnd,back-.035]){
   const [y,w]=cab(z),base=body(z)[1]-.065,wide=body(z)[0]-.050;
   seam(root,paint,[[side*wide,base,z],[side*(wide+w)/2,(y+base)/2,z],[side*w,y-.046,z]],.037);
  }
  seam(root,paint,Array.from({length:21},(_,i)=>{const z=roofStart+(roofEnd-roofStart)*i/20,[y,w]=cab(z);return [side*w,y-.046,z];}),.025);
  if(tall)seam(root,colors.chrome,[[side*.50,roof-.03,-.25],[side*.50,roof+.045,-.08],[side*.50,roof+.045,.89],[side*.50,roof-.02,1.03]],.024);
 }
 for(const x of [-.43,.43]){
  solid(root,colors.interior,[x,.56,.13],[.48,.16,.57]);
  solid(root,colors.interior,[x,.87,.34],[.48,.51,.17],box,[-.14,0,0]);
  solid(root,colors.interior,[x,1.18,.40],[.25,.18,.13]);
  solid(root,colors.interior,[x,.57,.88],[.48,.16,.50]);
  solid(root,colors.interior,[x,.84,1.13],[.48,.46,.13]);
 }
 solid(root,colors.interior,[0,.91,-.70],[1.59,.18,.35]);
 const steering=new THREE.Mesh(new THREE.TorusGeometry(.167,.019,10,32),colors.black);
 steering.position.set(-.43,1.00,-.49);steering.rotation.x=-.30;root.add(steering);steering.userData.vehicleOwnedGeometry=true;
 const wheels=[];
 for(const x of [-.84,.84])for(const z of [-1.47,1.47]){
  const pivot=new THREE.Group();pivot.position.set(x,.345,z);root.add(pivot);
  const spin=new THREE.Group();pivot.add(spin);const side=Math.sign(x);
  solid(spin,colors.black,[0,0,0],[1,1,1],tire);
  solid(spin,colors.black,[0,0,0],[1,1,1],hub);
  solid(spin,colors.chrome,[side*.113,0,0],[1,1,1],rim);
  solid(spin,colors.chrome,[side*.114,0,0],[1,1,1],spokes);
  solid(spin,colors.chrome,[side*.124,0,0],[.16,.25,.25],hub);
  batchVehicleMeshes(spin);wheels.push({pivot,spin,front:z<0});
 }
 if(taxi){
  solid(root,colors.taxi,[0,roof+.072,.06],[.51,.135,.23]);
  solid(root,colors.black,[0,roof+.013,.06],[.53,.034,.25]);
  // Thin checker band on both doors (painted decal, not a new body block).
  for(const side of [-1,1])for(let i=0;i<12;i++){
   const z=-.66+i*.135,[w,h]=body(z);
   solid(root,colors.black,[side*(w+.003),h-.17+(i%2?.029:0),z],[.008,.029,.127]);
  }
 }
 batchVehicleMeshes(root,m=>m===steering||m.name==='Curved bonnet and body crown');
 root.userData.ownedPaint=paint;
 return {root,wheels,steering};
}
function findWheel(root,name){let result=null;root.traverse(o=>{if(o.name.toLowerCase()===name.toLowerCase())result=o;});return result;}
export function normalizeVehicleTemplate(raw,model=null){
 raw.updateMatrixWorld(true);
 const wheels=wheelNames.map(n=>findWheel(raw,n));if(wheels.some(w=>!w))throw Error('missing wheel pivots');
 const front=wheels[0].getWorldPosition(new THREE.Vector3()).add(wheels[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
 const rear=wheels[2].getWorldPosition(new THREE.Vector3()).add(wheels[3].getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
 const delta=front.sub(rear);if(Math.hypot(delta.x,delta.z)<.5)throw Error('invalid wheel anchors');
 const aligned=new THREE.Group();raw.rotation.y+=Math.PI-Math.atan2(delta.x,delta.z);aligned.add(raw);aligned.updateMatrixWorld(true);
 const b=new THREE.Box3().setFromObject(aligned),s=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
 if(![s.x,s.y,s.z].every(v=>Number.isFinite(v)&&v>.25)||s.z<s.x*1.25)throw Error('invalid vehicle bounds');
 const root=new THREE.Group();root.add(aligned);const spec=premiumModelSpec(model);
 if(spec){
  // Use the original metric dimensions, not the slightly reduced LOD bounds.
  // One uniform scale preserves the proportions and fits the arcade collision envelope.
  const scale=Math.min(WIDTH/spec.size[0],LENGTH/spec.size[2],1.74/spec.size[1]);
  aligned.position.set(0,-spec.minY,-spec.centerZ);root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const hip=raw.localToWorld(new THREE.Vector3(...spec.hip)),avatarScale=spec.scale*scale;
  root.userData.premium=model;
  root.userData.driver={position:[hip.x,hip.y-.49*avatarScale,hip.z],scale:avatarScale,
   eye:[hip.x,hip.y+.66*avatarScale,hip.z-.045],roof:spec.size[1]*scale};
 }else{
  aligned.position.set(-center.x,-b.min.y,-center.z);
  root.scale.set(WIDTH/s.x,Math.min(1.84,s.y*LENGTH/s.z)/s.y,LENGTH/s.z);
 }
 root.updateMatrixWorld(true);
 root.userData.wheelRadius=Math.max(.23,Math.min(.48,new THREE.Box3().setFromObject(wheels[0]).getSize(new THREE.Vector3()).y/2));
 return root;
}
async function template(kind,lod,premium=false){
 const key=(premium?'premium:':'legacy:')+kind+':'+lod;
 if(!templates.has(key)){
  templates.set(key,(async()=>{
   const name=premium?kind+'-lod'+lod+'.glb':kind+'-lod'+lod+'-png.glb';
   const available=await (premium?premiumFiles():availableModels());
   if(available&&!available.has(name))return null;
   const r=await fetch('/assets/polyhaven/'+(premium?'premium-vehicles/':'vehicles/')+name);
   if(!r.ok)throw Error('vehicle unavailable');
   const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await r.arrayBuffer(),'');
   const result=normalizeVehicleTemplate(gltf.scene,premium?kind:null);
   console.info('Traffic model loaded:',name);return result;
  })().catch(error=>{console.warn('Traffic model',key,error.message||error);return null;}));
 }return templates.get(key);
}
// Readable taxi lightbox, without a canvas or an external texture.
let taxiLabel;
function taxiLabelMaterial(){
 if(taxiLabel)return taxiLabel;
 const chars=['11111/00100/00100/00100/00100/00100/00100','01110/10001/10001/11111/10001/10001/10001','10001/10001/01010/00100/01010/10001/10001','11111/00100/00100/00100/00100/00100/11111'].map(c=>c.split('/'));
 const w=64,h=24,pixels=new Uint8Array(w*h*4);
 for(let i=0;i<w*h;i++)pixels.set([255,211,59,255],i*4);
 for(let c=0;c<4;c++)for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(chars[c][y][x]==='1')for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
  const xx=9+c*12+x*2+dx,yy=h-1-(5+y*2+dy);pixels.set([31,29,24,255],(yy*w+xx)*4);
 }
 const tex=new THREE.DataTexture(pixels,w,h);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;tex.needsUpdate=true;
 taxiLabel=new THREE.MeshStandardMaterial({map:tex,color:0xffffff,emissive:0xffdf72,emissiveIntensity:.14,roughness:.62});
 return taxiLabel;
}
function premiumTaxiSign(root,y){
 const sign=new THREE.Group();sign.name='Premium taxi roof sign';root.add(sign);sign.position.set(0,y+.04,.06);
 solid(sign,colors.black,[0,-.025,0],[.49,.025,.19]);
 solid(sign,colors.taxi,[0,.044,0],[.46,.123,.18]);
 solid(sign,taxiLabelMaterial(),[0,.043,-.091],[.409,.101,.004]);
 solid(sign,taxiLabelMaterial(),[0,.043,.091],[.409,.101,.004]);
}
export function createImportedVehicle(templateRoot,row){
 const model=templateRoot.clone(true),root=new THREE.Group(),wheels=[],owned=new Set(),nativeLights={head:new Set(),rear:new Set(),blink:new Set()};
 root.add(model);root.updateMatrixWorld(true);
 const spec=premiumModelSpec(model.userData.premium),driver=model.userData.driver||null;
 root.name=spec?'Premium '+model.userData.premium:'Imported '+row.kind;
 const materials=new Map();
 root.traverse(o=>{
  if(!o.isMesh)return;
  const repaint=m=>{
   const label=(m.name||'')+' '+o.name;
   // A shared atlas material may cover both a lamp mesh and bodywork.
   // Separate clones by role so only the named lens can become emissive.
   const matName=m.name||'';
   const role=/^LED$/i.test(matName)||/head.?light|head.?lamp|front.?light/i.test(label)?'head':
    /^LED_Red$/i.test(matName)||/tail.?light|rear.?light|brake.?light|stop.?lamp/i.test(label)?'rear':
    /^Lamp_Amber$/i.test(matName)||/indicator|turn.?signal|blinker/i.test(label)?'blink':'body';
   if(!materials.has(m))materials.set(m,new Map());
   const roles=materials.get(m);
   if(!roles.has(role)){
    const n=m.clone();
    if(role==='body'&&n.color){
     if(spec&&matName===spec.paint)n.color.set(row.kind==='taxi'?'#efbd28':row.color);
     else if(!spec&&row.kind!=='taxi'&&/(paint|body.?color|bodywork|car.?body|exterior.?body)/i.test(matName))n.color.set(row.color);
    }
    if(n.isMeshStandardMaterial){n.envMap=carEnvironment;n.envMapIntensity=.65;}
    roles.set(role,n);owned.add(n);
   }
   const n=roles.get(role);if(role!=='body'&&n.emissive)nativeLights[role].add(n);return n;
  };
  o.material=Array.isArray(o.material)?o.material.map(repaint):repaint(o.material);
  const transparent=Array.isArray(o.material)?o.material.some(m=>m.transparent):o.material?.transparent;
  o.castShadow=!transparent;o.receiveShadow=true;
 });
 for(const name of wheelNames){
  const node=findWheel(root,name);if(!node)continue;
  const q=node.quaternion.clone(),world=node.getWorldQuaternion(new THREE.Quaternion()).invert();
  wheels.push({node,base:q,axis:new THREE.Vector3(1,0,0).applyQuaternion(world).normalize(),front:name.includes('_F'),parentUp:new THREE.Vector3(0,1,0).applyQuaternion(node.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize()});
 }
 const steering=findWheel(root,'steering_wheel');
 if(spec&&row.kind==='taxi')premiumTaxiSign(root,driver.roof);
 root.userData.ownedMaterials=owned;
 return {root,wheels,steering,steeringBase:steering?.quaternion.clone(),nativeLights,driver,wheelRadius:model.userData.wheelRadius,premium:!!spec};
}
function releaseModel(model){
 if(!model)return;model.root.removeFromParent();
 model.root.userData.ownedPaint?.dispose();for(const m of model.root.userData.ownedMaterials||[])m.dispose();
 model.root.traverse(o=>{if(o.userData.vehicleOwnedGeometry)o.geometry?.dispose();});
}
function lamps(parent){
 const root=new THREE.Group();root.name='Local light lenses';parent.add(root);
 const head=new THREE.MeshStandardMaterial({color:0xfff0ce,emissive:0xffedbd,emissiveIntensity:.05,roughness:.34});
 const rear=new THREE.MeshStandardMaterial({color:0xa72721,emissive:0xff2414,emissiveIntensity:.10,roughness:.5});
 const blink=[-1,1].map(()=>new THREE.MeshStandardMaterial({color:0xc27c21,emissive:0xff9911,emissiveIntensity:.05,roughness:.45}));
 for(const [i,x] of [-.68,.68].entries()){
  const a=solid(root,head,[x,.675,-2.365],[.31,.085,.060]),b=solid(root,rear,[x,.67,2.365],[.29,.083,.060]);
  a.rotation.y=-Math.sign(x)*.32;b.rotation.y=Math.sign(x)*.32;
  for(const z of [-2.27,2.27])solid(root,blink[i],[x*1.21,.64,z],[.085,.043,.045]);
 }
 return {head,rear,blink,root};
}
export function vehicleBlocked(rows,x,y,z,height=1.6){
 for(const c of rows||[]){
  if(!c.position||y+height<c.position[1]+.12||y>c.position[1]+1.77)continue;
  const dx=x-c.position[0],dz=z-c.position[2],a=Math.cos(c.yaw),b=Math.sin(c.yaw);
  if(Math.abs(dx*a-dz*b)<HALF_W+.30&&Math.abs(dx*b+dz*a)<HALF_L+.30)return true;
 }
 return false;
}
export function nearestVehicle(rows,p){
 return (rows||[]).filter(c=>c.driverSlot==null&&Array.isArray(c.position)&&Math.hypot(c.position[0]-p.x,c.position[1]-p.y,c.position[2]-p.z)<=3.6)
  .sort((a,b)=>Math.hypot(a.position[0]-p.x,a.position[2]-p.z)-Math.hypot(b.position[0]-p.x,b.position[2]-p.z))[0]||null;
}
export class TrafficView{
 constructor(scene){this.scene=scene;this.cars=new Map();this.departed=new Map();this.time=0;this.parking=null;this.headlights=null;}
 showParking(){
  if(this.parking)return;
  const root=new THREE.Group();root.name='Hotel taxi bay';this.scene.add(root);this.parking=root;
  const ground=new THREE.MeshStandardMaterial({color:0x56595a,roughness:.96});
  solid(root,ground,[5.8,.045,133],[5.1,.074,7.1]);
  for(const x of [3.65,7.95])solid(root,colors.taxi,[x,.089,133],[.09,.012,6.0]);
  solid(root,colors.taxi,[5.8,.089,136.0],[4.3,.012,.09]);
  solid(root,colors.chrome,[8.15,.75,136],[.085,1.5,.085]);
  solid(root,colors.taxi,[8.15,1.52,136],[.40,.30,.07]);
  root.userData.parkingMaterial=ground;
  const lightRoot=new THREE.Group();lightRoot.name='Nearest traffic headlights';this.scene.add(lightRoot);
  this.headlights={root:lightRoot,lights:[-1,1].map(()=>{
   const l=new THREE.SpotLight(0xffeed0,0,35,.27,.55,2);l.castShadow=false;l.visible=false;lightRoot.add(l,l.target);return l;
  })};
 }
 sync(rows,departed=[]){
  if(rows?.length)this.showParking();
  const seen=new Set();
  for(const r of rows||[]){
   if(!KINDS.has(r.kind)||!r.position?.every(Number.isFinite)||!Number.isFinite(r.yaw))continue;
   seen.add(r.id);let a=this.cars.get(r.id);
   if(!a){
    const root=new THREE.Group();root.name='Traffic '+r.id;root.position.set(...r.position);root.rotation.y=r.yaw;this.scene.add(root);
    const model=fallback(r);root.add(model.root);
    a={root,model,row:r,phase:0,lights:lamps(root),lod:-1,assetKey:null,wanted:null,pending:false,driver:null,signature:''};this.cars.set(r.id,a);
   }
   a.row=r;
  }
  for(const [id,a] of this.cars)if(!seen.has(id)){this.remove(a);this.cars.delete(id);}
  const gone=new Set();
  for(const d of departed||[]){
   gone.add(d.id);let e=this.departed.get(d.id);
   if(!e){const root=createCharacter(d.avatar);root.position.set(...d.position);this.scene.add(root);e={root};this.departed.set(d.id,e);}
   e.row=d;
  }
  for(const [id,e] of this.departed)if(!gone.has(id)){disposeCharacter(e.root);this.departed.delete(id);}
 }
 remove(a){if(a.driver)disposeCharacter(a.driver);releaseModel(a.model);a.root.removeFromParent();a.lights.head.dispose();a.lights.rear.dispose();for(const m of a.lights.blink)m.dispose();}
 load(a,lod){
  const model=a.row.assetModel,wanted=(model||a.row.kind)+':'+lod;
  if(a.pending||a.wanted===wanted||typeof document==='undefined')return;
  a.wanted=wanted;a.pending=true;
  (async()=>{
   const order=lod===0?[0,1,2]:lod===1?[1,0,2]:[2,1,0];
   const premiumOrder=lod===0?[0,1]:[1,0];
   const candidates=[...(isPremium(model)?premiumOrder.map(level=>[model,level,true]):[]),...order.map(level=>[a.row.kind,level,false])];
   for(const [kind,level,premium] of candidates){
    const key=(premium?'premium:':'legacy:')+kind+':'+level;
    if(a.assetKey===key)return;
    const t=await template(kind,level,premium);
    if(this.cars.get(a.row.id)!==a)return;
    if(!t)continue;
    const m=createImportedVehicle(t,a.row);releaseModel(a.model);a.model=m;a.root.add(m.root);a.lod=level;a.assetKey=key;a.shadow=null;
    a.lights.root.visible=false;return;
   }
  })().catch(error=>console.warn('Vehicle import',a.row.kind,error.message||error)).finally(()=>{a.pending=false;});
 }
 step(dt,player,own,first,night){
  this.time+=dt;const t=1-Math.exp(-dt*10);let ownPose=null;
  for(const a of this.cars.values()){
   const r=a.row,dist=Math.hypot(a.root.position.x-player.x,a.root.position.z-player.z);
   const target=new THREE.Vector3(...r.position);
   if(a.root.position.distanceTo(target)>12)a.root.position.copy(target);else a.root.position.lerp(target,t);
   a.root.rotation.y+=Math.atan2(Math.sin(r.yaw-a.root.rotation.y),Math.cos(r.yaw-a.root.rotation.y))*t;
   a.root.visible=dist<190||r.id===own;
   if(a.root.visible)this.load(a,dist<38||r.id===own?0:dist<90?1:2);
   a.phase=(a.phase+(Number(r.speed)||0)*dt/(a.model.wheelRadius||.34))%(2*Math.PI);
   const steer=-(r.steer||0)*.40;
   for(const w of a.model.wheels){
    if(w.pivot){w.pivot.rotation.y=w.front?steer:0;w.spin.rotation.x=-a.phase;}
    else{
     const spin=new THREE.Quaternion().setFromAxisAngle(w.axis,-a.phase);
     const q=w.base.clone().multiply(spin);
     if(w.front)q.premultiply(new THREE.Quaternion().setFromAxisAngle(w.parentUp,steer));
     w.node.quaternion.copy(q);
    }
   }
   if(a.model.steering&&a.model.steeringBase)a.model.steering.quaternion.copy(a.model.steeringBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-steer*2.2));
   const shadow=dist<42||r.id===own;if(a.shadow!==shadow){a.shadow=shadow;a.model.root.traverse(o=>{if(o.isMesh)o.castShadow=shadow&&!(Array.isArray(o.material)?o.material.some(m=>m.transparent):o.material?.transparent);});}
   a.lights.head.emissiveIntensity=.08+night*2.5;a.lights.rear.emissiveIntensity=r.brake?2.6:.12+night*.6;
   for(let i=0;i<2;i++)a.lights.blink[i].emissiveIntensity=r.indicator===(i===0?-1:1)&&Math.sin(this.time*8)>0?2.3:.04;
   if(a.model.nativeLights){
    const set=(materials,color,intensity)=>{for(const m of materials){if(!m.emissiveMap)m.emissive.setHex(color);else m.emissive.setHex(0xffffff);m.emissiveIntensity=intensity;}};
    set(a.model.nativeLights.head,0xffeed0,.04+night*2.5);
    set(a.model.nativeLights.rear,0xff2414,r.brake?2.6:.12+night*.6);
    set(a.model.nativeLights.blink,0xff9911,r.indicator&&Math.sin(this.time*8)>0?1.8:.03);
    for(const m of a.model.root.userData.ownedMaterials||[])if(m.envMap)m.envMapIntensity=.24+.42*(1-night);
   }else if(a.model.root.userData.ownedPaint)a.model.root.userData.ownedPaint.envMapIntensity=.22+.50*(1-night);
   const signature=r.avatar&&dist<70?JSON.stringify(r.avatar):'';
   if(signature!==a.signature){
    if(a.driver)disposeCharacter(a.driver);a.driver=null;a.signature=signature;
    if(signature){a.driver=createCharacter(r.avatar);a.root.add(a.driver);}
   }
   if(a.driver){
    const seat=a.model.driver;
    a.driver.scale.setScalar(seat?.scale||.82);a.driver.position.set(...(seat?.position||[-.43,.24,.10]));
    a.driver.visible=!(r.id===own&&first);
    if(a.driver.visible){resetRoomAvatarPose(a.driver);animateCharacter(a.driver,dt,false,'walk');applyRoomAvatarPose(a.driver,{kind:'sit',hip:.49},null);}
   }
   if(r.id===own)ownPose={x:a.root.position.x,y:a.root.position.y,z:a.root.position.z,yaw:a.root.rotation.y,speed:r.speed,eye:a.model.driver?.eye||[-.43,1.23,0]};
  }
  for(const e of this.departed.values()){
   e.root.position.lerp(new THREE.Vector3(...e.row.position),t);e.root.rotation.y=e.row.yaw;
   animateCharacter(e.root,dt,!!e.row.moving,'walk');
  }
  if(this.headlights){
   const nearest=this.cars.get(own)||[...this.cars.values()].sort((a,b)=>Math.hypot(a.root.position.x-player.x,a.root.position.z-player.z)-Math.hypot(b.root.position.x-player.x,b.root.position.z-player.z))[0];
   const on=!!nearest&&night>.10&&Math.hypot(nearest.root.position.x-player.x,nearest.root.position.z-player.z)<45;
   for(const [i,l] of this.headlights.lights.entries()){
    l.visible=on;l.intensity=on?140*night:0;
    if(on){const a=nearest.root;a.updateWorldMatrix(true,false);l.position.copy(a.localToWorld(new THREE.Vector3(i===0?-.68:.68,.73,-2.38)));l.target.position.copy(a.localToWorld(new THREE.Vector3(i===0?-.80:.80,.20,-25)));}
   }
  }
  return ownPose;
 }
 clear(){if(this.headlights){for(const l of this.headlights.lights)l.dispose?.();this.headlights.root.removeFromParent();this.headlights=null;}if(this.parking){this.parking.userData.parkingMaterial.dispose();this.parking.removeFromParent();this.parking=null;}for(const a of this.cars.values())this.remove(a);this.cars.clear();for(const e of this.departed.values())disposeCharacter(e.root);this.departed.clear();}
}
