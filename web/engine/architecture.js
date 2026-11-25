import * as THREE from 'three';

// A continuous cloth surface with metric UVs; no stacked rectangular slats.
export function curtainGeometry({x,z0,z1,top,bottom,folds,amplitude,segments=96,rows=24}) {
  const p=[],uv=[],index=[];
  for(let j=0;j<=rows;j++){
    const v=j/rows;
    for(let i=0;i<=segments;i++){
      const u=i/segments, phase=u*Math.PI*2*folds;
      const a=amplitude*(.68+.32*Math.sin(v*Math.PI/2))*(1+.16*Math.sin(u*11));
      const wave=Math.sin(phase+.28*Math.sin(v*4+u*7))+.21*Math.sin(phase*2+.6*v);
      const z=z0+(z1-z0)*u+.021*Math.sin(v*Math.PI)*Math.sin(phase*.5)+.023*v*v*Math.sin(u*10);
      const y=top-(top-bottom)*v+.018*v*v*Math.cos(phase)+.009*Math.sin(u*18)*v*v;
      p.push(x+a*wave+.009*Math.sin(v*6+phase*2),y,z);
      uv.push(u*Math.abs(z1-z0)/.32,(1-v)*(top-bottom)/.32);
      if(i<segments&&j<rows){const n=j*(segments+1)+i;index.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

// Both curtain leaves slide along the existing rail. Keep their original
// root coordinate system so existing fabric damage/decal coordinates follow.
const CURTAIN_ENDS={left:[-2.58,-1.99],right:[-.01,.58]};
export function curtainPose(side,progress){
  const [a,b]=CURTAIN_ENDS[side],anchor=side==='left'?a:b;
  const t=Math.max(0,Math.min(1,progress)),eased=t*t*(3-2*t);
  // Each curtain reaches slightly beyond the window centre at z=-1.
  const scale=1+eased*(1.61/(b-a)-1);
  return {scale,offset:anchor*(1-scale)};
}
export function curtainBounds(id,progress){
  const side=id==='surface_curtain_l'?'left':'right';
  const [a,b]=CURTAIN_ENDS[side],{scale,offset}=curtainPose(side,progress);
  return {p:[-4.53,1.48,(a+b)*.5*scale+offset],s:[.36,2.89,(b-a)*scale+.12]};
}
// All daylight contributions follow curtain coverage, not only the window spotlight.
export function applyRoomDaylight(r,progress,decor={}){
 const t=Math.max(0,Math.min(1,progress)),surviving=(decor.surface_curtainrod||0)>=4?0:
  Number((decor.surface_curtain_l||0)<4)+Number((decor.surface_curtain_r||0)<4);
 const daylight=1-t*t*(3-2*t)*surviving/2;
 const bounce=r.roomIndoorLight?(1-daylight)*.10:0;
 if(r.windowDaylight){r.windowDaylight.fill.intensity=4*daylight;r.windowDaylight.spill.intensity=42*daylight;}
 if(r.roomSun)r.roomSun.intensity=2.5*daylight;
 if(r.roomHemi)r.roomHemi.intensity=.36*daylight+bounce;
 if(r.scene)r.scene.environmentIntensity=.36*daylight+bounce;
 return daylight;
}
export function buildArchitecture(r,spec) {
  const group=new THREE.Group();group.name='Window frame';r.staticGroup.add(group);r.impacts?.register('surface_windowframe',group,'wood');
  const white=new THREE.MeshStandardMaterial({color:0xf3f1e9,roughness:.64,metalness:0});
  const seal=new THREE.MeshStandardMaterial({color:0x4a4b48,roughness:.92});
  const satin=new THREE.MeshStandardMaterial({color:0xc4c8c6,roughness:.38,metalness:.72});
  const stone=new THREE.MeshStandardMaterial({color:0xc8c5bc,roughness:.75});
  const bx=(s,p,m=white)=>r.makeBox(s,p,m,group);
  // Wall opening: z [-2.3,.3], y [.92,2.56]. Frame is recessed into wall.
  const x=-4.96, z=-1, mid=1.74;
  for(const end of [-2.25,.25]){
    bx([.16,1.64,.10],[x,mid,end]);bx([.12,1.49,.035],[x+.035,mid,end+(end<z?.072:-.072)],seal);
  }
  for(const y of [.97,2.51]){
    bx([.16,.10,2.60],[x,y,z]);bx([.12,.035,2.38],[x+.035,y+(y<mid?.072:-.072),z],seal);
  }
  bx([.16,1.54,.10],[x,mid,z]);
  for(const dz of [-.62,.62]){
    for(const y of [1.06,2.42])bx([.08,.045,1.16],[x+.09,y,z+dz]);
    for(const edge of [-.56,.56])bx([.08,1.40,.045],[x+.09,mid,z+dz+edge]);
  }
  bx([.40,.068,2.80],[-4.78,.915,z],stone);
  // Inner reveal surfaces, no permanent glass geometry.
  for(const edge of [-2.31,.31])bx([.24,1.64,.025],[-5,mid,edge],white);
  bx([.24,.025,2.60],[-5,2.55,z],white);
  for(const dz of [-.13,.13]){
    bx([.035,.15,.055],[x+.13,1.67,z+dz],satin);
    r.makeCylinder(.021,.021,.105,16,[x+.165,1.66,z+dz],satin,group);
  }
  // A real shallow French balcony railing gives the outdoor view parallax.
  const railing=new THREE.Group();railing.name='French balcony';r.staticGroup.add(railing);
  const iron=new THREE.MeshStandardMaterial({color:0x282a28,roughness:.54,metalness:.55});
  r.makeBox([.055,.045,2.53],[-5.31,1.22,z],iron,railing);
  r.makeBox([.05,.035,2.53],[-5.31,.94,z],iron,railing);
  for(let i=0;i<=12;i++){
    const zz=-2.22+i*.203;
    r.makeCylinder(.012,.012,.30,10,[-5.31,1.07,zz],iron,railing);
    if(i<12&&i%2===0){const arc=new THREE.Mesh(new THREE.TorusGeometry(.095,.009,7,24,Math.PI),iron);arc.rotation.y=Math.PI/2;arc.position.set(-5.31,1.04,zz+.10);railing.add(arc);}
  }
  railing.traverse(o=>{o.userData.noImpact=true;});
  // Glass is rendered only when the persistent window is alive.
  const glassRoot=new THREE.Group();glassRoot.visible=false;r.dynamicGroup.add(glassRoot);
  const glass=new THREE.MeshPhysicalMaterial({color:0xe0eff0,transparent:true,opacity:.13,roughness:.075,metalness:0,depthWrite:false,side:THREE.DoubleSide,clearcoat:.65,clearcoatRoughness:.07,envMapIntensity:.85});
  for(const dz of [-.62,.62]){
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(1.12,1.36),glass);
    pane.rotation.y=Math.PI/2;pane.position.set(0,0,dz);pane.renderOrder=1;glassRoot.add(pane);
  }
  r.models.window={root:glassRoot,glass,materials:[],damage:null,centered:true};
  // Double-layer textiles; gathered curtains leave the view largely open.
  const linen=r.textured.rough_linen;
  const thick=new THREE.MeshPhysicalMaterial({color:0x8a8178,normalMap:linen?.normalMap,normalScale:new THREE.Vector2(.24,.24),roughness:.98,specularIntensity:.18,sheen:.40,sheenColor:new THREE.Color(0xaaa093),sheenRoughness:.9,side:THREE.DoubleSide,envMapIntensity:.22});
  const sheer=new THREE.MeshStandardMaterial({color:0xf8f6ed,normalMap:linen?.normalMap,normalScale:new THREE.Vector2(.09,.09),transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide,roughness:1,envMapIntensity:.1});
  const low=r.quality==='1k';
  const curtains={left:new THREE.Group(),right:new THREE.Group()},rod=new THREE.Group();r.staticGroup.add(curtains.left,curtains.right,rod);r.impacts?.register('surface_curtain_l',curtains.left,'fabric');r.impacts?.register('surface_curtain_r',curtains.right,'fabric');r.impacts?.register('surface_curtainrod',rod,'wood');
  const add=(a,mat,shadow)=>{const m=new THREE.Mesh(curtainGeometry({...a,segments:low?56:112,rows:low?14:28}),mat);m.castShadow=shadow;m.receiveShadow=true;m.renderOrder=shadow?0:2;curtains[a.z0<-1?'left':'right'].add(m);};
  for(const [a,b] of Object.values(CURTAIN_ENDS))add({x:-4.67,z0:a,z1:b,top:2.87,bottom:.08,folds:5,amplitude:.037},sheer,false);
  for(const [a,b] of Object.values(CURTAIN_ENDS))add({x:-4.49,z0:a,z1:b,top:2.90,bottom:.035,folds:4.5,amplitude:.084},thick,true);
  r.makeCylinder(.019,.019,3.27,16,[-4.48,2.925,-1],satin,rod,[Math.PI/2,0,0]);
  for(const z of [-2.52,.52]){r.makeBox([.35,.045,.045],[-4.70,2.925,z],satin,rod);const cap=new THREE.Mesh(new THREE.SphereGeometry(.033,12,8),satin);cap.position.set(-4.48,2.925,z+(z<0?-.14:.14));rod.add(cap);}
  const rings={left:[],right:[]};
  for(const [side,[a,b]] of Object.entries(CURTAIN_ENDS))for(let i=0;i<7;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.027,.004,6,14),satin);
    ring.position.set(-4.48,2.925,a+(b-a)*i/6);curtains[side].add(ring);rings[side].push(ring);
  }
  // No per-frame allocation or reconstruction of the fabric meshes.
  let progress=0,target=0,applied=-1;
  function apply(decor={}){
    if(applied!==progress){
      for(const [side,root] of Object.entries(curtains)){
        const {scale,offset}=curtainPose(side,progress);
        root.scale.z=scale;root.position.z=offset;
        for(const ring of rings[side])ring.scale.z=1/scale;
        root.updateMatrixWorld(true);
      }
      applied=progress;
    }
    applyRoomDaylight(r,progress,decor);
  }
  r.curtainControl={
    get progress(){return progress;},
    setClosed(closed,immediate=false,decor={}){
      target=closed?1:0;if(immediate)progress=target;apply(decor);
    },
    step(dt,decor={}){
      const delta=Math.max(0,Math.min(.1,dt))/.85;
      if(progress<target)progress=Math.min(target,progress+delta);
      else if(progress>target)progress=Math.max(target,progress-delta);
      apply(decor);
    }
  };
  apply();
}

