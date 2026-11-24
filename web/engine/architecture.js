import * as THREE from 'three';

// A continuous cloth surface with metric UVs; no stacked rectangular slats.
export function curtainGeometry({x,z0,z1,top,bottom,folds,amplitude,segments=96,rows=24}) {
  const p=[],uv=[],index=[];
  for(let j=0;j<=rows;j++){
    const v=j/rows;
    for(let i=0;i<=segments;i++){
      const u=i/segments, phase=u*Math.PI*2*folds;
      const a=amplitude*(.62+.38*Math.sin(v*Math.PI/2));
      const wave=Math.sin(phase+.17*Math.sin(v*4+u*7));
      const z=z0+(z1-z0)*u + .012*Math.sin(v*Math.PI)*Math.sin(phase*.5);
      const y=top-(top-bottom)*v+.014*v*v*Math.cos(phase);
      p.push(x+a*wave+.009*Math.sin(v*6+phase*2),y,z);
      uv.push(u*Math.abs(z1-z0)/.32,(1-v)*(top-bottom)/.32);
      if(i<segments&&j<rows){const n=j*(segments+1)+i;index.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

export function buildArchitecture(r,spec) {
  const group=new THREE.Group();group.name='Window and textiles';r.staticGroup.add(group);
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
  const thick=new THREE.MeshPhysicalMaterial({color:0x9b9a8b,normalMap:linen?.normalMap,normalScale:new THREE.Vector2(.18,.18),roughness:.95,sheen:1,sheenColor:new THREE.Color(0xb4ae9c),sheenRoughness:.8,side:THREE.DoubleSide,envMapIntensity:.22});
  const sheer=new THREE.MeshStandardMaterial({color:0xf8f6ed,normalMap:linen?.normalMap,normalScale:new THREE.Vector2(.09,.09),transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide,roughness:1,envMapIntensity:.1});
  const low=r.quality==='1k';
  const add=(a,mat,shadow)=>{const m=new THREE.Mesh(curtainGeometry({...a,segments:low?56:112,rows:low?14:28}),mat);m.castShadow=shadow;m.receiveShadow=true;m.renderOrder=shadow?0:2;group.add(m);};
  for(const [a,b] of [[-2.41,-1.62],[-.38,.41]])add({x:-4.67,z0:a,z1:b,top:2.66,bottom:.99,folds:5,amplitude:.037},sheer,false);
  for(const [a,b] of [[-2.58,-1.99],[-.01,.58]])add({x:-4.49,z0:a,z1:b,top:2.70,bottom:.13,folds:5,amplitude:.064},thick,true);
  r.makeCylinder(.019,.019,3.27,16,[-4.48,2.73,-1],satin,group,[Math.PI/2,0,0]);
  for(const z of [-2.52,.52]){bx([.35,.045,.045],[-4.70,2.73,z],satin);const cap=new THREE.Mesh(new THREE.SphereGeometry(.033,12,8),satin);cap.position.set(-4.48,2.73,z+(z<0?-.14:.14));group.add(cap);}
  for(const [a,b] of [[-2.58,-1.99],[-.01,.58]])for(let i=0;i<7;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.027,.004,6,14),satin);ring.position.set(-4.48,2.73,a+(b-a)*i/6);group.add(ring);
  }
}
