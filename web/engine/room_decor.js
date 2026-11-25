import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Shared visual and collision layout. Positions are metres in the virtual room.
export const DECOR={bed:{p:[3.40,0,3.71],s:[1.56,1.20,2.26]},nightstand:{p:[2.24,0,4.53],s:[.55,.64,.52]}};
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
function bed(r,g){
  const wood=r.textured.oak_veneer_01,frame=surface(r,0x81766c,[3,3]),sheet=surface(r,0xf1ede3,[4,5]),quilt=surface(r,0xaaa89a);
  for(const x of [-.65,.65])for(const z of [-.93,.93])cylinder(g,.035,.044,.18,[x,.09,z],wood);
  rounded(g,[1.48,.22,2.20],[0,.29,0],frame,.08);
  rounded(g,[1.43,.22,2.12],[0,.49,0],sheet,.09);
  rounded(g,[1.52,1.05,.12],[0,.62,1.07],frame,.10);
  for(const x of [-.34,.34])pillow(g,r,[x,.68,.77],x*.21,0xe8e4dc);
  const q=new THREE.Mesh(quiltGeometry(1.56,1.62,.65,r.quality==='1k'),quilt);q.position.z=-.22;q.castShadow=true;q.receiveShadow=true;g.add(q);
}
function nightstand(r,g){const wood=r.textured.oak_veneer_01,paint=new THREE.MeshStandardMaterial({color:0x656f68,roughness:.79});
  rounded(g,[.55,.055,.52],[0,.612,0],wood,.012);rounded(g,[.50,.34,.46],[0,.40,0],paint,.018);
  for(const x of [-.21,.21])for(const z of [-.19,.19])cylinder(g,.027,.019,.25,[x,.125,z],wood);
  rounded(g,[.46,.17,.035],[0,.49,-.244],paint,.01);rounded(g,[.12,.018,.035],[0,.49,-.275],new THREE.MeshStandardMaterial({color:0xb6a38a,metalness:.7,roughness:.45}),.008);
}
function lamp(r,g,baseY){
  const brass=new THREE.MeshStandardMaterial({color:0x9d8b73,metalness:.62,roughness:.38});
  const ceramic=new THREE.MeshStandardMaterial({color:0xd6c6b5,roughness:.48});
  const shade=surface(r,0xf4e7d1,[3,2]);shade.emissive=new THREE.Color(0xffcc88);shade.emissiveIntensity=.17;r.bedsideShade=shade;
  const body=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0,0),new THREE.Vector2(.09,0),new THREE.Vector2(.12,.035),new THREE.Vector2(.115,.09),new THREE.Vector2(.075,.16),new THREE.Vector2(.045,.22),new THREE.Vector2(.038,.25),new THREE.Vector2(0,.25)],32),ceramic);body.position.y=baseY;body.castShadow=true;body.receiveShadow=true;g.add(body);
  cylinder(g,.021,.021,.14,[0,baseY+.30,0],brass);
  const s=new THREE.Mesh(new THREE.CylinderGeometry(.12,.20,.25,40,1,true),shade);s.position.y=baseY+.42;s.castShadow=true;s.receiveShadow=true;g.add(s);
  for(const [radius,y] of [[.12,.545],[.20,.295]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.003,6,40),brass);ring.rotation.x=Math.PI/2;ring.position.y=baseY+y;g.add(ring);}
  const light=new THREE.PointLight(0xffe0b0,6,3.2,2);light.position.set(0,baseY+.36,0);g.add(light);r.bedsideLight=light;
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.044,12,8),new THREE.MeshStandardMaterial({color:0xe7ddca,emissive:0xffe5b2,emissiveIntensity:1.3,roughness:.6}));bulb.position.copy(light.position);g.add(bulb);r.bedsideBulb=bulb.material;
}
function rug(r,g){const m=surface(r,0xa5a095,[7,6]);const o=rounded(g,[3.2,.018,2.22],[-.65,.012,1.4],m,.008);o.castShadow=false;r.impacts?.register('surface_rug',o,'fabric');
  const border=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-2.19,.023,.36],[.89,.023,.36],[.89,.023,2.44],[-2.19,.023,2.44]].map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:0x77756b}));g.add(border);
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
export async function buildRoomDecor(r,manifest,path,loader){
  const g=new THREE.Group();g.name='Furnished bedroom';r.staticGroup.add(g);rug(r,g);
  for(const [id,slot] of Object.entries(DECOR)){
    const group=new THREE.Group();group.name=id;group.position.set(...slot.p);g.add(group);let imported=false,height=slot.s[1];
    const url=manifest.decor_models?.[id];if(url){try{const gltf=await loader.loadAsync(path(url));const f=fitDecor(gltf.scene,slot);group.add(f.root);height=f.height;imported=true;}catch(e){console.warn('Optionales Möbelmodell nicht verfügbar',id,e);}}
    r.realismStatus[id]=imported?'ready':'local';
    if(!imported){if(id==='bed')bed(r,group);else nightstand(r,group);}
    r.impacts?.register('surface_'+id,group,id==='bed'?'fabric':'wood');
    if(id==='nightstand'){const lightGroup=new THREE.Group();group.add(lightGroup);lamp(r,lightGroup,imported?height:.64);r.impacts?.register('surface_lamp',lightGroup,'wall');}
    shadow(r,group,[0,0,0],slot.s[0]*1.35,slot.s[2]*1.30);
  }
  // Soft ceiling fixture with an actual curved diffuser.
  const diffuser=new THREE.Mesh(new THREE.SphereGeometry(.37,24,12),new THREE.MeshStandardMaterial({color:0xf6f2e8,roughness:.48,emissive:0xffeac9,emissiveIntensity:.16}));diffuser.scale.y=.28;diffuser.position.set(0,2.86,0);g.add(diffuser);r.ceilingDiffuser=diffuser;r.impacts?.register('surface_ceilinglamp',diffuser,'glass');
}
