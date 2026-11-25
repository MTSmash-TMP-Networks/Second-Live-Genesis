// Local, metric 3D hotel furniture. No photographic billboard or remote dependency.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import layout from './hotel_layout.json';
import reference from './hotel_reference.json';
export const HOTEL_LAYOUT=layout;
export const REFERENCE_TEXTURES=reference;

function texture(n,m,fn){
 const a=new Uint8Array(n*m*4);let seed=17491;
 for(let y=0;y<m;y++)for(let x=0;x<n;x++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   a.set([...fn(x,y,seed/4294967296),255],(y*n+x)*4);
 }
 const t=new THREE.DataTexture(a,n,m,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
export function hotelMaterials(r){
 if(r.hotelMaterials)return r.hotelMaterials;
 const linen=r.textured?.rough_linen;
 const cloth=(c,repeat=3,map=null)=>{
   const normal=linen?.normalMap?.clone();if(normal){normal.repeat.set(repeat,repeat);normal.needsUpdate=true;}
   const roughness=linen?.roughnessMap?.clone();if(roughness){roughness.repeat.set(repeat,repeat);roughness.needsUpdate=true;}
   return new THREE.MeshPhysicalMaterial({color:c,map,normalMap:normal||null,normalScale:new THREE.Vector2(.28,.28),roughnessMap:roughness||null,roughness:1,sheen:.44,sheenColor:new THREE.Color(c),sheenRoughness:.88,specularIntensity:.22,side:THREE.DoubleSide,envMapIntensity:.48});
 };
 const standard=(color,roughness=.65,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 // Fine alternating threads, mottled blue-grey carpet and a satin hotel duvet.
 const wallpaper=texture(512,128,(x,y,n)=>{
   const line=Math.sin(x*Math.PI*2/19),thin=Math.pow(Math.max(0,Math.cos(x*Math.PI*2/7)),18),v=61+13*line+20*thin+5*(n-.5)+4*Math.sin(x*.73);
   return [clamp(v+4),clamp(v+3),clamp(v+1)];
 });
 const carpet=texture(256,256,(x,y,n)=>{
   const v=77+23*(n-.5)+9*Math.sin(x*.43+y*.31)+7*Math.cos(x*.21-y*.36)+4*((x+y)%3);
   return [clamp(v-12),clamp(v-3),clamp(v+11)];
 });
 carpet.repeat.set(3,3);
 const satin=texture(256,64,(x,y,n)=>{const v=236+8*Math.cos(x*Math.PI*2/32)+3*(n-.5);return [clamp(v+4),clamp(v+3),clamp(v)];});
 satin.repeat.set(5,1);
 const stripe=standard(0xffffff,.93);stripe.map=wallpaper;stripe.bumpMap=null;stripe.bumpScale=0;stripe.envMapIntensity=.10;
 const carpetMat=cloth(0xffffff,2,carpet);carpetMat.roughness=1;carpetMat.sheen=.18;carpetMat.normalScale.set(.15,.15);carpetMat.specularIntensity=.12;
 const m={stripe,carpet:carpetMat,
   wall:new THREE.MeshStandardMaterial({color:0xd6cfc3,roughness:.96,envMapIntensity:.08}),
   ceiling:new THREE.MeshStandardMaterial({color:0xf1eae0,roughness:1,envMapIntensity:.06}),
   white:cloth(0xfdfbf6,4,satin),cotton:cloth(0xf8f5ee,4),gold:cloth(0xc99519,4),darkCloth:cloth(0x484a4b,4),
   leather:cloth(0x25262a,5),sofa:cloth(0x626464,4),shirt:cloth(0xc5d0df,3),navy:cloth(0x202b3c,3),
   black:standard(0x222426,.46),edge:standard(0x13171b,.66),brass:standard(0xb99549,.30,.75),
   chrome:standard(0xc5c3bd,.24,.85),glass:new THREE.MeshPhysicalMaterial({color:0x11171f,roughness:.12,metalness:.35,clearcoat:1,clearcoatRoughness:.12}),
   whitePlastic:standard(0xe8e4dc,.38),paper:standard(0xece5d5,.92),plant:standard(0x547746,.87),stem:standard(0x426035,.86),
   yellow:standard(0xf1c032,.68),rubber:standard(0x17191b,.92),suitcase:standard(0x313943,.38,.12)};
 m.leather.roughness=.57;m.leather.clearcoat=.22;m.leather.clearcoatRoughness=.53;m.leather.sheen=.10;m.leather.specularIntensity=.72;m.leather.normalScale.set(.065,.065);m.leather.envMapIntensity=.72;m.black.envMapIntensity=.42;m.black.roughness=.59;
 return r.hotelMaterials=m;
}

// Small local color samples from the supplied photograph. No full photo or baked
// scene is used. Keep photographic linen normal/roughness maps for fine detail.
export async function applyPhotoMaterials(r,loader,anisotropy=4){
 const m=hotelMaterials(r);
 const keys=[['wall',m.stripe,5,1],['carpet',m.carpet,5,5],['gold',m.gold,2,2]];
 await Promise.all(keys.map(async ([id,mat,u,v])=>{
   let expired=false,timer;
   try{
    const task=loader.loadAsync('data:image/jpeg;base64,'+REFERENCE_TEXTURES[id]).then(t=>{if(expired){t.dispose();return null;}return t;});
    const tex=await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Foto-Textur Zeitlimit'));},4000);})]);
    if(!tex)return;
    tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(u,v);tex.anisotropy=anisotropy;tex.needsUpdate=true;
    const old=mat.map;mat.map=tex;mat.color.set(0xffffff);mat.needsUpdate=true;if(old?.isDataTexture)old.dispose();
    if(id==='wall'){mat.bumpMap=null;mat.normalMap=null;mat.roughness=.95;}
    if(id==='carpet'&&mat.normalMap){mat.normalMap.repeat.set(5,5);mat.normalScale.set(.18,.18);}
   }catch(e){console.warn('Lokale Fototextur:',id,e);}finally{clearTimeout(timer);}
 }));
}

export function softBox(g,s,p,m,rad=.025,rot=null){
 const o=new THREE.Mesh(new RoundedBoxGeometry(...s,2,Math.min(rad,...s.map(x=>x*.45))),m);o.position.set(...p);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
// An upholstered shape with continuously rounded seams and gravity creases.
// Dense enough to cast its own curved shadows at normal gameplay distance.
export function upholsteredGeometry(w,h,d,variant=0){
 const geo=new THREE.SphereGeometry(1,56,32),p=geo.attributes.position;
 const signed=(x,e)=>Math.sign(x)*Math.pow(Math.abs(x),e);
 for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const ex=signed(x,.36),ey=signed(y,.48),ez=signed(z,.36);
   const edge=Math.pow(Math.max(Math.abs(x),Math.abs(z)),3);
   const wrinkle=(.011*Math.sin(16*x+11*z+variant)+.006*Math.sin(35*z-12*y+variant))*edge;
   p.setXYZ(i,(ex+wrinkle*x)*w*.5,(ey+wrinkle*y)*h*.5,(ez+wrinkle*z)*d*.5);
 }
 p.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
export function upholstered(g,s,p,m,variant=0,rot=null){
 const o=new THREE.Mesh(upholsteredGeometry(...s,variant),m);
 o.position.set(...p);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
export function seamLoop(g,w,d,y,p,m,radius=.003,rotation=null){
 const points=[];const k=.38;
 for(let i=0;i<80;i++){const a=2*Math.PI*i/80,s=Math.sin(a),c=Math.cos(a);points.push(new THREE.Vector3(w*.5*Math.sign(c)*Math.pow(Math.abs(c),k),y,d*.5*Math.sign(s)*Math.pow(Math.abs(s),k)));}
 const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');
 const o=new THREE.Mesh(new THREE.TubeGeometry(curve,80,radius,5,true),m);o.position.set(...p);if(rotation)o.rotation.set(...rotation);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
export function box(g,s,p,m,rot=null){
 const o=new THREE.Mesh(new THREE.BoxGeometry(...s),m);o.position.set(...p);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
export function rod(g,a,b,r,m,segments=12){
 const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);
 const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),segments),m);o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
function sphere(g,p,s,m){
 const o=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),m);o.position.set(...p);o.scale.set(...s);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
function cylinder(g,rt,rb,h,p,m){
 const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,24),m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
function hangers(g,m){
 // Recessed open wardrobe: individual hangers and draped jackets/shirts.
 rod(g,[-.61,1.91,-.10],[.61,1.91,-.10],.019,m.brass);
 for(const [i,x] of [-.47,-.24,.01,.27,.46].entries()){
   const y=1.82,z=-.13;
   rod(g,[x,y+.08,z],[x,y-.02,z],.009,m.brass);
   rod(g,[x,y-.02,z],[x-.035,y-.13,z-.19],.01,m.black);
   rod(g,[x,y-.02,z],[x+.035,y-.13,z+.19],.01,m.black);
   if(i===4)continue;
   const cloth=i===0?m.navy:i===1?m.shirt:i===2?m.white:m.darkCloth;
   const group=new THREE.Group();group.position.set(x,1.30,-.10);group.rotation.y=(i%2?.09:-.08);g.add(group);
   upholstered(group,[.10,.83,.32],[0,0,0],cloth,i*3);
   for(const side of [-1,1])upholstered(group,[.13,.62,.095],[side*.015,-.07,side*.18],cloth,i+side,[side*.09,0,side*.08]);
   for(let k=0;k<4;k++)sphere(group,[-.057,.23-k*.14,.02],[.008,.008,.008],m.brass);
   box(group,[.015,.80,.015],[-.055,0,0],cloth);
 }
}
function wardrobe(g,m){
 for(const x of [-.69,.69])box(g,[.06,2.78,.71],[x,1.4,0],m.black);
 box(g,[1.38,2.78,.055],[0,1.4,.335],m.black);
 for(const y of [.065,.38,2.10,2.76])box(g,[1.38,.055,.67],[0,y,-.018],m.black);
 for(const y of [.16,.48])box(g,[1.30,.11,.04],[0,y,-.34],m.edge);
 hangers(g,m);
 // Wall-mounted television integrated in upper cabinet.
 softBox(g,[1.31,.61,.075],[0,2.425,-.332],m.edge,.025);
 softBox(g,[1.24,.54,.016],[0,2.425,-.377],m.glass,.009);
 box(g,[.045,.008,.007],[0,2.15,-.39],m.chrome);
 sphere(g,[.55,2.15,-.388],[.006,.006,.004],m.brass);
}
function desk(g,m){
 softBox(g,[1.59,.055,.84],[0,.748,0],m.black,.014);
 for(const x of [-.70,.70])for(const z of [-.34,.34])rod(g,[x,.025,z],[x,.72,z],.026,m.edge);
 for(const x of [-.70,.70])rod(g,[x,.62,-.34],[x,.62,.34],.022,m.brass);
 box(g,[1.42,.09,.045],[0,.665,-.34],m.black);
 // Drawer, book and small desktop writing set within the furniture footprint.
 box(g,[.38,.11,.46],[.51,.64,.03],m.black);
 box(g,[.16,.014,.026],[.51,.66,.278],m.brass);
 softBox(g,[.24,.018,.33],[-.22,.786,.05],m.paper,.005);
 box(g,[.014,.012,.20],[-.06,.798,.06],m.black,[0,.38,0]);
 // Brass task lamp with a slender stem and a horizontal metal shade.
 softBox(g,[.22,.022,.12],[.57,.786,-.27],m.brass,.008);
 rod(g,[.57,.797,-.27],[.57,1.13,-.27],.013,m.brass);
 rod(g,[.57,1.13,-.27],[.39,1.13,-.17],.013,m.brass);
 softBox(g,[.25,.045,.13],[.31,1.13,-.13],m.black,.02);
 softBox(g,[.20,.009,.095],[.31,1.105,-.13],m.whitePlastic,.004);
}
function chair(g,m){
 for(const x of [-.30,.30])for(const z of [-.29,.29]){
   rod(g,[x*1.15,.025,z*1.15],[x,.46,z],.027,m.black);
   rod(g,[x*1.13,.035,z*1.13],[x*1.10,.10,z*1.10],.029,m.brass);
 }
 upholstered(g,[.74,.13,.71],[0,.49,0],m.gold,4);
 seamLoop(g,.70,.66,.020,[0,.49,0],m.darkCloth,.0025);
 upholstered(g,[.75,.48,.16],[0,.76,.32],m.gold,8,[-.10,0,0]);
 for(const x of [-.365,.365])softBox(g,[.09,.22,.51],[x,.62,.08],m.gold,.04);
}
function sofa(g,m){
 softBox(g,[2.38,.24,1.25],[0,.29,0],m.darkCloth,.07);
 for(const x of [-.99,.99])for(const z of [-.52,.52])cylinder(g,.029,.024,.18,[x,.09,z],m.brass);
 for(const x of [-1.08,1.08]){
  upholstered(g,[.31,.58,1.24],[x,.54,.025],m.sofa,x*2,[0,0,x*.035]);
 }
 for(const [i,x] of [-.70,0,.70].entries()){
  upholstered(g,[.68,.20,.93],[x,.51,.095],m.sofa,i*4);
  seamLoop(g,.652,.889,.035,[x,.51,.095],m.darkCloth,.0027);
  upholstered(g,[.69,.56,.29],[x,.80,-.445],m.sofa,9+i,[.15,0,0]);
  seamLoop(g,.62,.25,0,[x,.80,-.445],m.darkCloth,.0028,[.15,0,0]);
 }
 upholstered(g,[.39,.37,.16],[-.72,.79,-.21],m.gold,12,[.18,0,-.20]);
 upholstered(g,[.40,.39,.18],[.69,.79,-.22],m.darkCloth,15,[.18,0,.18]);
}
function coffee(g,m){
 softBox(g,[1.38,.055,.74],[0,.468,0],m.black,.07);
 for(const x of [-.53,.53])for(const z of [-.25,.25])rod(g,[x,.03,z],[x,.44,z],.022,m.brass);
 box(g,[1.12,.025,.46],[0,.19,0],m.black);
 softBox(g,[.31,.027,.21],[.29,.506,.12],m.paper,.008);
 box(g,[.32,.008,.22],[.29,.492,.12],m.darkCloth);
 box(g,[.32,.008,.22],[.29,.524,.12],m.black);
 for(const z of [-.25,.25])rod(g,[-.53,.19,z],[.53,.19,z],.012,m.brass);
}
function suitcase(g,m){
 // Hard-shell suitcase: separate halves, ribbing, zip seam, handles and wheels.
 softBox(g,[.79,.70,.49],[0,.43,0],m.suitcase,.10);
 softBox(g,[.805,.65,.034],[0,.43,.245],m.edge,.016);
 softBox(g,[.76,.59,.03],[0,.43,.270],m.suitcase,.021);
 for(let x=-.28;x<=.29;x+=.112)softBox(g,[.032,.53,.024],[x,.43,.289],m.suitcase,.011);
 for(const x of [-.33,.33])for(const z of [-.16,.16])cylinder(g,.054,.054,.07,[x,.06,z],m.rubber);
 rod(g,[-.12,.79,0],[-.12,.85,0],.016,m.chrome);
 rod(g,[.12,.79,0],[.12,.85,0],.016,m.chrome);
 rod(g,[-.12,.85,0],[.12,.85,0],.022,m.rubber);
}
export function createHotelModel(r,id){
 const m=hotelMaterials(r),g=new THREE.Group();g.name='Hotel '+id;
 const fn={surface_wardrobe:wardrobe,table:desk,chair,sofa,coffee_table:coffee,crate:suitcase}[id];
 if(!fn)throw Error('Unbekanntes Hotelmöbel: '+id);
 fn(g,m);return g;
}

export function addHotelLight(r,light,intensity,material=null,emissive=1,surface='surface_ceilinglamp'){
 (r.hotelLights??=[]).push({light,intensity,material,emissive,surface});
}
// Architectural trim is built as geometry, rather than painted into an image.
export function buildHotelFeatureWall(r){
 const m=hotelMaterials(r),g=new THREE.Group();g.name='Hotel feature wall';r.staticGroup.add(g);
 // Headboard panel assembly, aligned to south wall and actual mattress.
 const cx=layout.surface_bed.p[0];
 for(const x of [cx-.97,cx,cx+.97])for(const y of [.76,1.28]){
   upholstered(g,[.958,.505,.075],[x,y,4.78],m.leather,x+y);
 }
 const glow=new THREE.MeshStandardMaterial({color:0xffc06a,emissive:0xffa64c,emissiveIntensity:1.8,roughness:.6});
 box(g,[2.93,.018,.025],[cx,1.552,4.804],glow);
 const led=new THREE.RectAreaLight(0xffbc78,4.2,2.94,.15);led.position.set(cx,1.64,4.54);led.lookAt(cx,2.09,4.88);g.add(led);addHotelLight(r,led,4.2,glow,1.8,'surface_picture');
 for(const x of [cx-.97,cx+.97]){
   const mount=sphere(g,[x,1.41,4.72],[.064,.064,.025],m.brass);
   rod(g,[x,1.41,4.70],[x,1.67,4.46],.014,m.black);
   rod(g,[x,1.67,4.46],[x-.09,1.69,4.36],.014,m.black);
   const shade=softBox(g,[.11,.045,.095],[x-.09,1.69,4.36],m.black,.018);
   const bulb=softBox(g,[.088,.008,.07],[x-.09,1.665,4.36],glow,.003);
 }
 // Recessed black minibar shelves and hanging cabinet beside the bed.
 const x=-3.72;
 softBox(g,[.82,.66,.42],[x,2.34,4.56],m.black,.025);
 for(const dx of [-.20,.20])box(g,[.385,.61,.035],[x+dx,2.34,4.332],m.edge);
 for(const dx of [-.05,.05])rod(g,[x+dx,2.15,4.30],[x+dx,2.37,4.30],.009,m.brass);
 for(const dx of [-.36,.36])rod(g,[x+dx,.87,4.39],[x+dx,2.05,4.39],.012,m.brass);
 for(const y of [.89,1.24,1.60,1.95])box(g,[.78,.034,.31],[x,y,4.48],m.black);
 cylinder(g,.065,.065,.20,[x-.19,1.73,4.45],m.black);
 for(const dx of [.02,.17]){cylinder(g,.047,.04,.095,[x+dx,1.307,4.45],m.whitePlastic);const ring=new THREE.Mesh(new THREE.TorusGeometry(.027,.007,6,16),m.whitePlastic);ring.position.set(x+dx+.045,1.32,4.45);g.add(ring);}
 // Brass vase and individually modelled flower heads.
 cylinder(g,.075,.10,.24,[x,.99,4.43],m.brass);
 for(let i=0;i<8;i++){const a=i*2.399,ex=x+Math.cos(a)*.13,ez=4.43+Math.sin(a)*.09,ey=1.29+.09*Math.sin(i*1.7);rod(g,[x,1.10,4.43],[ex,ey,ez],.006,m.stem,8);sphere(g,[ex,ey,ez],[.035,.027,.035],m.yellow);}
 r.impacts?.register('surface_picture',g,'wood');
 // Cove lighting along the ceiling and recessed spotlights, controlled by wall switch.
 const ceiling=new THREE.Group();ceiling.name='Hotel lighting';r.staticGroup.add(ceiling);
 const warm=new THREE.MeshStandardMaterial({color:0xffead2,emissive:0xffc890,emissiveIntensity:2.2,roughness:.6});
 box(ceiling,[9.55,.020,.045],[0,2.943,4.775],warm);
 const cove=new THREE.RectAreaLight(0xffc58a,4.8,8.8,.18);cove.position.set(0,2.80,4.58);cove.lookAt(0,2.99,4.86);ceiling.add(cove);addHotelLight(r,cove,4.8,warm,2.2);
 const wash=new THREE.RectAreaLight(0xffcf9c,2.5,8.8,.16);wash.position.set(0,2.82,4.57);wash.lookAt(0,2.26,4.86);ceiling.add(wash);addHotelLight(r,wash,2.5);
 for(const [px,pz] of [[-2.5,2.3],[2.4,2.3],[-2.5,-2.1],[2.4,-2.1]]){
   cylinder(ceiling,.085,.085,.025,[px,2.982,pz],m.whitePlastic);
   cylinder(ceiling,.054,.054,.028,[px,2.974,pz],warm);
 }
 for(const [px,pz] of [[-2,2.1],[2,-1.8]]){
   const fill=new THREE.PointLight(0xffe0bc,12,5.5,2);fill.position.set(px,2.83,pz);ceiling.add(fill);addHotelLight(r,fill,12);
 }
 r.impacts?.register('surface_ceilinglamp',ceiling,'glass');
}
