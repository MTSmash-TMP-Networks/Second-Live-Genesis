import * as THREE from 'three';

function seeded(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function surfaceTexture(kind){
 const n=256,data=new Uint8Array(n*n*4),r=seeded(hash(kind)),base={street:[83,85,84],walk:[157,150,137],path:[112,92,58],bark:[91,68,48]}[kind];
 const grain=new Float32Array(n*n);for(let i=0;i<grain.length;i++)grain[i]=r();
 const wrap=(x,y)=>grain[((y+n)%n)*n+(x+n)%n];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let g=(wrap(x,y)-.5)*(kind==='street'?37:29),v=0;
  if(kind==='street')v=5*Math.sin(x*.13+y*.16)+5*Math.cos(x*.07-y*.11)-(wrap(x,y)<.055?23:0);
  if(kind==='walk'){
   const row=Math.floor(y/64),u=(x+(row%2)*64)%128,w=y%64,seam=Math.min(u,128-u,w,64-w);
   v=seam<2?-38:seam<4?10:8*Math.sin(row*2.4+Math.floor((x+(row%2)*64)/128)*4.3);
  }
  if(kind==='path')v=10*Math.sin(x*.074+y*.048)+5*Math.cos(y*.23)-(wrap(x,y)<.05?21:0);
  if(kind==='bark'){
   const a=x/n*2*Math.PI;
   v=18*Math.sin(a*11+Math.sin(y/n*2*Math.PI)*.4)+10*Math.cos(a*23+Math.cos(y/n*4*Math.PI)*.5)-12*Math.pow(Math.max(0,Math.cos(a*17)),9);
   g*=.65;
  }
  const i=(y*n+x)*4;for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,base[c]+g+v));data[i+3]=255;
 }
 const tex=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=4;tex.needsUpdate=true;return tex;
}
export function villageRoadMaterials(){
 return Object.fromEntries(['street','walk','path'].map(k=>[k,new THREE.MeshStandardMaterial({map:surfaceTexture(k),roughness:k==='street'?.96:1})]));
}
export class VillageRoads{
 constructor(root,box){
  this.root=root;this.box=box;this.materials=villageRoadMaterials();
  this.curb=new THREE.MeshStandardMaterial({color:0xaaa498,roughness:.91});
  this.edge=new THREE.MeshStandardMaterial({color:0x655a42,roughness:1});
  this.paint=new THREE.MeshStandardMaterial({color:0xd6d4c3,roughness:.94});
  this.metal=new THREE.MeshStandardMaterial({color:0x414747,roughness:.82,metalness:.24});
  this.wood=new THREE.MeshStandardMaterial({color:0x80624a,roughness:.91});
  this.lamp=new THREE.MeshStandardMaterial({color:0xf7e4ae,emissive:0xeed19d,emissiveIntensity:.32,roughness:.4});
  this.cap=new THREE.CylinderGeometry(.5,.5,1,20);this.dynamic=[];this.key='';
 }
 clear(){for(const g of this.dynamic)g.dispose();this.dynamic=[];this.root.clear();}
 surface(r,y){
  const g=new THREE.PlaneGeometry(r.w,r.d);g.rotateX(-Math.PI/2);
  const uv=g.attributes.uv;const meters=r.kind==='street'?3:r.kind==='walk'?2:3.5;
  for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)*r.w+r.x)/meters,(uv.getY(i)*r.d-r.z)/meters);
  this.dynamic.push(g);
  const m=new THREE.Mesh(g,this.materials[r.kind]);m.position.set(r.x,y,r.z);m.receiveShadow=true;this.root.add(m);return m;
 }
 cylinder(x,y,z,r,h,mat){
  const o=new THREE.Mesh(this.cap,mat);o.scale.set(2*r,h,2*r);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;this.root.add(o);return o;
 }
 set(roads){
  const key=JSON.stringify(roads);if(key===this.key)return;this.key=key;this.clear();
  const box=(p,s,m,shadow=false)=>{const o=this.box(this.root,p,s,m);o.castShadow=shadow;return o;};
  for(const r of roads){
   if(r.kind==='crosswalk')continue;
   // Higher sidewalk surface never overwrites the road; all intersections are planned server-side.
   const level=r.kind==='walk'?.075:r.kind==='street'?.014:.009;
   if(r.kind==='walk')box([r.x,.035,r.z],[r.w,.07,r.d],this.curb);
   if(r.kind==='path'){
    box([r.x,.004,r.z],[r.w+.32,.008,r.d+.30],this.edge);
    const border=.18;
    for(const side of [-1,1])box([r.x+side*(r.w/2+border*.5),.012,r.z],[border,.018,r.d],this.edge);
   }
   this.surface(r,level);
   if(r.kind==='street'){
    const start=r.z-r.d/2,end=r.z+r.d/2;
    for(const side of [-1,1]){
     const edgeX=r.x+side*(r.w/2+.07);
     box([edgeX,.053,r.z],[.14,.106,r.d],this.curb);
     // Fine joints in individual curb stones.
     for(let z=start+.5;z<end;z+=1.0)box([edgeX,.108,z],[.142,.003,.025],this.edge);
     box([r.x+side*(r.w/2-.22),.017,r.z],[.075,.004,r.d-.5],this.paint);
    }
    for(let z=start+3;z<end-2;z+=6){
     if(roads.some(c=>c.kind==='crosswalk'&&Math.abs(c.z-z)<c.d/2+1.3))continue;
     box([r.x,.020,z],[.10,.004,2.35],this.paint);
    }
    for(const z of [start+8,end-7]){
     this.cylinder(r.x+1.9,.023,z,.35,.018,this.metal);
     for(let j=-2;j<=2;j++)box([r.x+1.9,.035,z+j*.09],[.38,.003,.022],this.edge);
    }
    // Small village street furniture, outside the road and travel corridor.
    for(const [x,z] of [[r.x-5.6,start+8],[r.x+5.6,start+20],[r.x-5.6,end-12],[r.x+5.6,end-3]]){
     this.cylinder(x,.12,z,.19,.24,this.metal);
     this.cylinder(x,1.75,z,.065,3.45,this.metal);
     box([x,3.40,z],[.49,.10,.37],this.metal,true);
     box([x,3.32,z],[.34,.15,.26],this.lamp);
    }
   }
  }
  for(const r of roads.filter(r=>r.kind==='crosswalk')){
   for(let x=r.x-r.w/2+.38;x<r.x+r.w/2-.12;x+=.58)
    box([x,.024,r.z],[.32,.005,r.d-.25],this.paint);
  }
 }
}
function variedGeometry(g,amount){
 const p=g.attributes.position,colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=Math.sin(x*12.7+y*6.4+z*15.1)*Math.cos(x*7.8-z*9.1);
  const scale=1+n*amount;
  p.setXYZ(i,x*scale,y*scale,z*scale);
  const v=Math.max(.55,Math.min(1.1,.83+.15*y+.11*n));
  colors.set([v*.94,v,v*.88],i*3);
 }
 p.needsUpdate=true;g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function pineSkirt(){
 // Irregular branch tips at multiple radii, not a stack of perfect cones.
 const segments=24,rings=[[0.03,.5],[.46,.28],[.82,-.01],[1,-.34],[.62,-.43],[.07,-.46]],p=[],idx=[],colors=[];
 for(let j=0;j<rings.length;j++)for(let i=0;i<segments;i++){
  const a=i*2*Math.PI/segments,[rad,y]=rings[j],irregular=1+.13*Math.sin(i*2.7)+.075*Math.cos(i*1.8+j*.7);
  p.push(Math.cos(a)*rad*irregular,y+rad*(.075*Math.sin(i*2.1)+.038*Math.cos(i*4.3)),Math.sin(a)*rad*irregular);
  const v=.70+.11*j/(rings.length-1)+.13*Math.sin(i*1.7+j*.6);colors.push(v*.88,v,v*.91);
 }
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=j*segments+i,b=j*segments+(i+1)%segments,c=a+segments,d=b+segments;idx.push(a,c,b,b,c,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
export function villageTreeParts(row){
 const [b,s]=row.bounds,x=b[0]+s[0]/2,z=b[2]+s[2]/2,h=row.height,rad=s[0]/2,r=seeded(hash(row.id)),parts=[];
 const add=(type,p,size,angle=0,tint=1,axis=null)=>parts.push({type,p,s:size,a:angle,tint,axis});
 if(row.hp<=0){add('stump',[x,.21,z],[rad,.42,rad]);return parts;}
 const tint=.77+.22*r(),leafTint=tint*(.76+.24*row.hp/100),lean=(r()-.5)*.38;
 add('trunk',[x,h*.355,z],[rad,h*.71,rad],r()*6.28,.86+.14*r());
 for(let j=0;j<4;j++){
  const a=j*Math.PI/2+r()*.45,len=rad*(1.2+r()*.55),dx=Math.cos(a)*len,dz=Math.sin(a)*len;
  add('branch',[x+dx*.46,.15,z+dz*.46],[rad*.27,Math.hypot(dx,dz,.3),rad*.27],0,.85,[dx,-.3,dz]);
 }
 if(row.variant===1){
  for(let i=0;i<7;i++){
   const f=i/7,y=h*(.38+f*.57),radius=h*(.245*(1-f)+.032);
   add('pine',[x+lean*f,y,z],[radius,h*(.20-f*.065),radius],r()*6.28,leafTint*(.85+r()*.19));
  }
 }else{
  const spread=h*(row.variant===0?.235:.26),base=h*.48;
  for(let j=0;j<7;j++){
   const a=j*2.399963+r()*.36,dx=Math.cos(a)*spread*(.58+r()*.36),dz=Math.sin(a)*spread*(.58+r()*.36),dy=h*(.16+r()*.11);
   const cy=base+(j%3)*h*.035;
   add('branch',[x+dx*.47,cy+dy*.46,z+dz*.47],[rad*(.20+r()*.12),Math.hypot(dx,dy,dz),rad*.24],0,tint,[dx,dy,dz]);
   const radius=spread*(.54+r()*.25);
   add(row.variant===0?'leafA':'leafB',[x+dx,cy+dy,z+dz],[radius,radius*(.70+r()*.35),radius*(.78+r()*.29)],a,leafTint*(.86+r()*.22));
   add(row.variant===0?'leafA':'leafB',[x+dx*.63,cy+dy+h*.09,z+dz*.66],[radius*.88,radius*.92,radius*.92],a+.7,leafTint*(.94+r()*.13));
  }
  add(row.variant===0?'leafA':'leafB',[x+lean,h*.88,z],[spread*.87,h*.13,spread*.84],r()*6.28,leafTint*1.08);
 }
 return parts;
}
export class VillageForest{
 constructor(root){
  this.root=root;this.key='';
  const trunk=new THREE.CylinderGeometry(.44,1,1,10,3),branch=new THREE.CylinderGeometry(.16,1,1,7,1);
  this.geometry={trunk,branch,leafA:variedGeometry(new THREE.IcosahedronGeometry(1,2),.17),leafB:variedGeometry(new THREE.IcosahedronGeometry(1,2),.22),pine:pineSkirt(),stump:new THREE.CylinderGeometry(.83,1,1,10)};
  const bark=new THREE.MeshStandardMaterial({map:surfaceTexture('bark'),roughness:1});
  this.material={trunk:bark,branch:bark,leafA:new THREE.MeshStandardMaterial({color:0x436b34,vertexColors:true,roughness:1}),leafB:new THREE.MeshStandardMaterial({color:0x55733c,vertexColors:true,roughness:1}),pine:new THREE.MeshStandardMaterial({color:0x365c3b,vertexColors:true,roughness:1,side:THREE.DoubleSide}),stump:[bark,new THREE.MeshStandardMaterial({color:0xbda178,roughness:1}),bark]};
 }
 set(rows){
  const key=rows.map(r=>r.id+':'+r.hp).join('|');if(key===this.key)return;this.key=key;
  for(const m of [...this.root.children]){m.removeFromParent();m.dispose?.();}
  const groups={};for(const row of rows)for(const part of villageTreeParts(row))(groups[part.type]??=[]).push(part);
  const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),axis=new THREE.Vector3();
  for(const [type,parts] of Object.entries(groups)){
   const m=new THREE.InstancedMesh(this.geometry[type],this.material[type],parts.length);
   for(let i=0;i<parts.length;i++){
    const p=parts[i];dummy.position.set(...p.p);dummy.scale.set(...p.s);dummy.rotation.set(0,p.a,0);
    if(p.axis)dummy.quaternion.setFromUnitVectors(up,axis.set(...p.axis).normalize());
    dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,new THREE.Color().setScalar(p.tint));
   }
   m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();this.root.add(m);
  }
 }
}
