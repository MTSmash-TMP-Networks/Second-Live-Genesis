// Local, metric 3D hotel furniture. No photographic billboard or remote dependency.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import layout from './hotel_layout.json';
export const HOTEL_LAYOUT=layout;

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
   return new THREE.MeshPhysicalMaterial({color:c,map,normalMap:normal||null,normalScale:new THREE.Vector2(.17,.17),roughness:.92,sheen:.62,sheenColor:new THREE.Color(c),sheenRoughness:.82,side:THREE.DoubleSide});
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
 const stripe=standard(0xffffff,.88);stripe.map=wallpaper;stripe.bumpMap=wallpaper;stripe.bumpScale=.006;
 const carpetMat=cloth(0xffffff,8,carpet);carpetMat.roughness=1;carpetMat.sheen=.25;
 const m={stripe,carpet:carpetMat,white:cloth(0xfdfbf6,4,satin),cotton:cloth(0xf8f5ee,4),gold:cloth(0xc99519,4),darkCloth:cloth(0x484a4b,4),
   leather:cloth(0x25262a,5),sofa:cloth(0x626464,4),shirt:cloth(0xc5d0df,3),navy:cloth(0x202b3c,3),
   black:standard(0x222426,.46),edge:standard(0x13171b,.66),brass:standard(0xb99549,.30,.75),
   chrome:standard(0xc5c3bd,.24,.85),glass:new THREE.MeshPhysicalMaterial({color:0x11171f,roughness:.12,metalness:.35,clearcoat:1,clearcoatRoughness:.12}),
   whitePlastic:standard(0xe8e4dc,.38),paper:standard(0xece5d5,.92),plant:standard(0x547746,.87),stem:standard(0x426035,.86),
   yellow:standard(0xf1c032,.68),rubber:standard(0x17191b,.92),suitcase:standard(0x313943,.38,.12)};
 m.leather.roughness=.42;m.leather.clearcoat=.18;m.leather.sheen=.12;
 return r.hotelMaterials=m;
}
export function softBox(g,s,p,m,rad=.025,rot=null){
 const o=new THREE.Mesh(new RoundedBoxGeometry(...s,2,Math.min(rad,...s.map(x=>x*.45))),m);o.position.set(...p);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
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
   softBox(group,[.10,.83,.32],[0,0,0],cloth,.038);
   for(const side of [-1,1])softBox(group,[.13,.62,.095],[side*.015,-.07,side*.18],cloth,.04,[side*.09,0,side*.08]);
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
 // Low-profile hotel desk lamp, folded down so the collider stays conservative.
 box(g,[.22,.022,.12],[.57,.786,-.27],m.brass);
}
function chair(g,m){
 for(const x of [-.30,.30])for(const z of [-.29,.29]){
   rod(g,[x*1.15,.025,z*1.15],[x,.46,z],.027,m.black);
   rod(g,[x*1.13,.035,z*1.13],[x*1.10,.10,z*1.10],.029,m.brass);
 }
 softBox(g,[.74,.13,.71],[0,.49,0],m.gold,.065);
 softBox(g,[.75,.48,.13],[0,.76,.32],m.gold,.065,[-.10,0,0]);
 for(const x of [-.365,.365])softBox(g,[.09,.22,.51],[x,.62,.08],m.gold,.04);
}
function sofa(g,m){
 softBox(g,[2.44,.30,1.34],[0,.32,0],m.darkCloth,.085);
 for(const x of [-.99,.99])for(const z of [-.52,.52])cylinder(g,.035,.027,.18,[x,.09,z],m.brass);
 for(const x of [-1.10,1.10])softBox(g,[.24,.55,1.28],[x,.54,0],m.sofa,.085);
 for(const x of [-.70,0,.70]){
   softBox(g,[.66,.19,.88],[x,.55,.10],m.sofa,.08);
   softBox(g,[.66,.56,.29],[x,.81,-.48],m.sofa,.075,[.12,0,0]);
 }
 softBox(g,[.39,.37,.15],[-.73,.77,-.24],m.gold,.065,[.18,0,-.17]);
 softBox(g,[.39,.37,.15],[.70,.77,-.23],m.darkCloth,.065,[.18,0,.17]);
}
function coffee(g,m){
 softBox(g,[1.38,.055,.74],[0,.468,0],m.black,.07);
 for(const x of [-.53,.53])for(const z of [-.25,.25])rod(g,[x,.03,z],[x,.44,z],.022,m.brass);
 box(g,[1.12,.025,.46],[0,.19,0],m.black);
 softBox(g,[.31,.027,.21],[.29,.506,.12],m.paper,.008);
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
   softBox(g,[.958,.505,.065],[x,y,4.78],m.black,.014);
 }
 const glow=new THREE.MeshStandardMaterial({color:0xffc06a,emissive:0xffa64c,emissiveIntensity:1.8,roughness:.6});
 box(g,[2.93,.018,.025],[cx,1.552,4.804],glow);
 const led=new THREE.PointLight(0xffbd75,8,3.5,2);led.position.set(cx,1.64,4.59);g.add(led);addHotelLight(r,led,8,glow,1.8,'surface_picture');
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
 const cove=new THREE.RectAreaLight(0xffc58a,3.8,8.8,.22);cove.position.set(0,2.79,4.61);cove.lookAt(0,2.99,4.83);ceiling.add(cove);addHotelLight(r,cove,3.8,warm,2.2);
 for(const [px,pz] of [[-2.5,2.3],[2.4,2.3],[-2.5,-2.1],[2.4,-2.1]]){
   cylinder(ceiling,.085,.085,.025,[px,2.982,pz],m.whitePlastic);
   cylinder(ceiling,.054,.054,.028,[px,2.974,pz],warm);
 }
 for(const [px,pz] of [[-2,2.1],[2,-1.8]]){
   const fill=new THREE.PointLight(0xffe0bc,12,5.5,2);fill.position.set(px,2.83,pz);ceiling.add(fill);addHotelLight(r,fill,12);
 }
 r.impacts?.register('surface_ceilinglamp',ceiling,'glass');
}
