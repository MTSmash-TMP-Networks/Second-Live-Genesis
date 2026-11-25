import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HOTEL_LAYOUT, hotelMaterials, softBox, box, rod, buildHotelFeatureWall, addHotelLight } from './hotel_room.js';

// Shared visual and collision layout. Positions are metres in the virtual room.
const floorSlot=o=>({p:[o.p[0],o.p[1]-o.s[1]/2,o.p[2]],s:o.s});
export const DECOR={bed:floorSlot(HOTEL_LAYOUT.surface_bed),nightstand:floorSlot(HOTEL_LAYOUT.nightstand)};
const surface=(r,tint,repeat=[1,1])=>{
  const linen=r.textured.rough_linen;
  const normal=linen?.normalMap?.clone();if(normal){normal.repeat.set(...repeat);normal.needsUpdate=true;}
  return new THREE.MeshPhysicalMaterial({color:tint,normalMap:normal||null,normalScale:new THREE.Vector2(.18,.18),roughness:.97,sheen:.7,sheenColor:new THREE.Color(tint),sheenRoughness:.9,side:THREE.DoubleSide});
};
function rounded(g,s,p,m,rad=.04){const o=new THREE.Mesh(new RoundedBoxGeometry(...s,3,Math.min(rad,...s.map(x=>x*.45))),m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;}
function cylinder(g,rt,rb,h,p,m){const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,24),m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;}

// Soft pillow volume: smooth superellipse with an uneven compressed seam and loft.
export function pillowGeometry(w,d,h){
  const rings=24,segments=48,vertices=[],uv=[],idx=[];
  const signed=(x,e)=>Math.sign(x)*Math.pow(Math.abs(x),e);
  for(let j=0;j<=rings;j++){
    const latitude=-Math.PI/2+Math.PI*j/rings,c=Math.cos(latitude),s=Math.sin(latitude);
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2;
      const x=w*.5*signed(c,.65)*signed(Math.cos(a),.60),z=d*.5*signed(c,.65)*signed(Math.sin(a),.60);
      const y=h*.5*signed(s,.72)*(1+.07*Math.cos(a*4)*c*c)+.009*Math.sin(a*6)*c*c;
      vertices.push(x,y,z);uv.push(i/segments,j/rings);
      if(i<segments&&j<rings){const k=j*(segments+1)+i;idx.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
    }
  }
  const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));mesh.setIndex(idx);mesh.computeVertexNormals();return mesh;
}
// Continuous draped sheet over a mattress, not an intersecting stack of boxes.
export function quiltGeometry(w,d,top,low=false){
  const nx=low?36:64,nz=low?48:88,vertices=[],uv=[],idx=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const u=i/nx,v=j/nz,x=(u-.5)*w,z=(v-.5)*d;
    const side=Math.pow(Math.max(0,(Math.abs(u-.5)-.39)/.11),1.25),end=Math.pow(Math.max(0,(v-.88)/.12),1.4);
    const wrinkles=.012*Math.sin(u*39+v*7)+.009*Math.sin(v*43+u*8)+.021*Math.sin(u*12+v*9);
    const seams=-.009*(Math.pow(Math.cos(u*6*Math.PI),24)+Math.pow(Math.cos(v*8*Math.PI),24));
    vertices.push(x,top-.20*Math.max(side,end)+wrinkles+seams,z);uv.push(u*w/.42,v*d/.42);
    if(i<nx&&j<nz){const k=j*(nx+1)+i;idx.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function pillow(g,r,p,angle,tint,w=.62,d=.47){const m=new THREE.Mesh(pillowGeometry(w,d,.17),surface(r,tint,[2,2]));m.position.set(...p);m.rotation.y=angle;m.castShadow=true;m.receiveShadow=true;g.add(m);}
// The duvet and runner share the same draped surface; their meshes follow the
// mattress edges instead of floating above a rectangular block.
export function hotelDrape(w,d,top,from=0,to=1,offset=0,low=false){
 const nx=low?36:64,nz=low?24:48,p=[],uv=[],idx=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const u=i/nx,v=from+(to-from)*j/nz;
  const side=Math.pow(Math.max(0,(Math.abs(u-.5)-.36)/.14),1.7);
  const foot=Math.pow(Math.max(0,(.13-v)/.13),1.4);
  const head=Math.pow(Math.max(0,(v-.96)/.04),1.7);
  const wrinkle=.006*Math.sin(u*41+v*18)+.007*Math.sin(v*27+u*12)+.004*Math.sin(u*94+v*20);
  const y=top-.24*Math.max(side,foot,head*.45)+wrinkle+offset;
  p.push((u-.5)*w,y,(v-.5)*d);uv.push(u,v);
  if(i<nx&&j<nz){const k=j*(nx+1)+i;idx.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2);}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return geo;
}
function drape(g,r,m,from,to,offset=0){
 const o=new THREE.Mesh(hotelDrape(1.56,2.14,.70,from,to,offset,r.quality==='1k'),m);o.position.z=-.035;o.castShadow=true;o.receiveShadow=true;g.add(o);
}
function hotelPillow(g,m,w,d,h,p,tilt=-1.04,angle=0){
 const o=new THREE.Mesh(pillowGeometry(w,d,h),m);o.position.set(...p);o.rotation.set(tilt,0,angle);o.castShadow=true;o.receiveShadow=true;g.add(o);
}
function bed(r,g){
 const m=hotelMaterials(r);
 // Twin upholstered divan bases, seam piping and full mattress volume.
 for(const x of [-.383,.383]){
   softBox(g,[.759,.34,2.13],[x,.17,-.015],m.leather,.055);
   softBox(g,[.750,.025,2.09],[x,.315,-.015],m.darkCloth,.009);
 }
 softBox(g,[1.49,.32,2.08],[0,.49,-.02],m.cotton,.11);
 softBox(g,[1.52,1.12,.11],[0,.64,1.06],m.leather,.055);
 for(const x of [-.49,0,.49])softBox(g,[.478,.46,.025],[x,.89,.991],m.black,.018);
 drape(g,r,m.white,0,1);
 drape(g,r,m.gold,.15,.45,.012);
 drape(g,r,m.darkCloth,.105,.15,.014);
 drape(g,r,m.darkCloth,.45,.477,.014);
 for(const x of [-.365,.365]){
   hotelPillow(g,m.white,.68,.46,.16,[x,.84,.72],-.94,x*.17);
   hotelPillow(g,m.cotton,.63,.45,.155,[x,.91,.84],-1.08,-x*.10);
   hotelPillow(g,m.gold,.385,.40,.13,[x,.83,.51],-.96,x*.16);
   // Rolled towels have independent rounded folds, not printed onto the duvet.
   const towel=new THREE.Group();towel.position.set(x,.723,-.38);g.add(towel);
   softBox(towel,[.39,.044,.25],[0,.022,0],m.cotton,.018);
   for(const z of [-.071,.022,.10])softBox(towel,[.34,.068,.083],[0,.069,z],m.cotton,.031);
   for(const dx of [-.143,.143])for(const z of [-.071,.022,.10])softBox(towel,[.018,.040,.045],[dx,.073,z],m.white,.01);
 }
}
function nightstand(r,g){
 const m=hotelMaterials(r);
 // Recessed gold niche, drawer, full-height charcoal cabinet.
 for(const x of [-.248,.248])softBox(g,[.052,.62,.5],[x,.31,0],m.black,.012);
 softBox(g,[.55,.045,.52],[0,.615,0],m.black,.014);
 box(g,[.45,.61,.045],[0,.31,.232],m.black);
 box(g,[.445,.035,.46],[0,.22,0],m.black);
 box(g,[.445,.035,.46],[0,.42,0],m.brass);
 softBox(g,[.44,.195,.033],[0,.12,-.234],m.edge,.009);
 box(g,[.10,.012,.023],[0,.19,-.258],m.brass);
 // Hotel telephone with tilted keypad and rounded handset.
 softBox(g,[.25,.055,.18],[-.043,.664,-.01],m.edge,.025,[-.12,0,0]);
 softBox(g,[.076,.047,.19],[-.13,.712,-.005],m.black,.022,[-.12,0,0]);
 for(let row=0;row<4;row++)for(let col=0;col<3;col++)softBox(g,[.022,.009,.023],[.006+col*.032,.70-row*.002,-.055+row*.027],m.whitePlastic,.004);
}
function lamp(r,g,baseY){
 const m=hotelMaterials(r),glow=new THREE.MeshStandardMaterial({color:0xffedcf,emissive:0xffc583,emissiveIntensity:1.4,roughness:.5});
 const b=[.165,baseY+.065,.145],top=[.165,baseY+.34,.145],end=[.10,baseY+.41,-.06];
 softBox(g,[.145,.02,.125],[b[0],baseY+.012,b[2]],m.brass,.009);
 rod(g,b,top,.012,m.brass);rod(g,top,end,.012,m.brass);
 softBox(g,[.18,.045,.115],end,m.black,.018);
 softBox(g,[.14,.008,.08],[end[0],end[1]-.025,end[2]],glow,.003);
 const light=new THREE.PointLight(0xffd6a0,4,2.5,2);light.position.set(end[0],end[1]-.07,end[2]);g.add(light);
 addHotelLight(r,light,4,glow,1.4,'surface_lamp');
}
function rug(r,g){
 const m=hotelMaterials(r).carpet.clone();m.color.set(0x9fa8ac);
 const {p,s}=HOTEL_LAYOUT.rug;const o=rounded(g,[s[0],.018,s[2]],p,m,.008);
 o.castShadow=false;r.impacts?.register('surface_rug',o,'fabric');
}
function shadow(r,g,p,w,d){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:r.shadowTexture,transparent:true,opacity:.66,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));m.rotation.x=-Math.PI/2;m.position.set(p[0],.004,p[2]);m.userData.noImpact=true;m.userData.floorShadow=true;g.add(m);}

// Optional original furniture replaces, rather than overlays, the local fallback.
export function fitDecor(model,slot){
  model.updateMatrixWorld(true);let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  if(![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.001))throw Error('Ungültige Möbelabmessungen');
  if((size.x>size.z)!==(slot.s[0]>slot.s[2])&&Math.abs(slot.s[0]-slot.s[2])>.15){model.rotation.y+=Math.PI/2;model.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(model);size=bounds.getSize(new THREE.Vector3());}
  const scale=Math.min(slot.s[0]/size.x,slot.s[1]/size.y,slot.s[2]/size.z),center=bounds.getCenter(new THREE.Vector3());
  const root=new THREE.Group();root.add(model);root.scale.setScalar(scale);root.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return {root,height:size.y*scale};
}
export async function buildRoomDecor(r,_manifest,_path,_loader){
 const g=new THREE.Group();g.name='Hotel bedroom';r.staticGroup.add(g);rug(r,g);
 for(const [id,slot] of Object.entries(DECOR)){
  const group=new THREE.Group();group.name=id;group.position.set(...slot.p);g.add(group);
  if(id==='bed')bed(r,group);else nightstand(r,group);
  r.realismStatus[id]='hotel';
  r.impacts?.register('surface_'+id,group,id==='bed'?'fabric':'wood');
  if(id==='nightstand'){
   const lightGroup=new THREE.Group();group.add(lightGroup);lamp(r,lightGroup,.64);
   r.impacts?.register('surface_lamp',lightGroup,'wall');
  }
  shadow(r,group,[0,0,0],slot.s[0]*1.35,slot.s[2]*1.30);
 }
 buildHotelFeatureWall(r);
}
