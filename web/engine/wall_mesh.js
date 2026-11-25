import * as THREE from 'three';
import { WALLS,boundary,wallSignature } from './wall_layout.js';

// Voronoi-prism boundary; one geometry per damaged surface. Interior edges
// are emitted only when their adjacent piece is gone. UVs stay in room space.
export function wallGeometry(w,cells){
  const {faces,cuts}=boundary(w,cells),pos=[],norm=[],uv=[];const tile=w.kind==='floor'?2.1:2.5;
  function emit(f){const p=f.points,n=f.n;for(let i=1;i<p.length-1;i++){let a=p[0],b=p[i],c=p[i+1];const ab=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),ac=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));if(ab.cross(ac).dot(new THREE.Vector3(...n))<0)[b,c]=[c,b];for(const q of [a,b,c]){pos.push(...q);norm.push(...n);const x=q[0]+w.p[0],y=q[1]+w.p[1],z=q[2]+w.p[2];uv.push((Math.abs(n[0])>.5?z:x)/tile,(Math.abs(n[1])>.5?-z:y)/tile);}}}
  for(const f of faces)emit(f);const start=pos.length/3;for(const f of cuts)emit(f);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('uv1',geo.attributes.uv.clone());if(start)geo.addGroup(0,start,0);if(pos.length/3>start)geo.addGroup(start,pos.length/3-start,1);if(pos.length)geo.computeBoundingSphere();return geo;
}
function edgeTexture(){
  const n=64,data=new Uint8Array(n*n*4);let seed=90871;
  for(let i=0;i<n*n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=i%n,y=Math.floor(i/n),v=155+Math.round((seed/4294967296)*55+14*Math.sin(x*1.7+y*.9));data.set([v,Math.round(v*.91),Math.round(v*.81),255],i*4);}
  const map=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(22,22);map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearFilter;map.needsUpdate=true;return map;
}
export class WallMeshes {
  constructor(impacts){this.entries=new Map();this.impacts=impacts;this.edge=new THREE.MeshStandardMaterial({color:0xc3b2a0,map:edgeTexture(),roughness:.98});this.floorEdge=this.edge.clone();this.floorEdge.color.set(0x80674a);}
  register(id,mesh){if(WALLS[id])this.entries.set(id,{mesh,original:mesh.geometry,material:mesh.material,signature:''});}
  sync(state={}){
    for(const [id,e] of this.entries){
      const cells=state[id]||[],sig=wallSignature(cells);if(sig===e.signature)continue;
      this.impacts.invalidateTarget(id);
      if(e.mesh.geometry!==e.original)e.mesh.geometry.dispose();
      e.mesh.geometry=sig?wallGeometry(WALLS[id],cells):e.original;
      e.mesh.material=sig?[e.material,WALLS[id].kind==='floor'?this.floorEdge:this.edge]:e.material;
      e.mesh.visible=e.mesh.geometry.attributes.position.count>0;
      e.signature=sig;
    }
  }
}
