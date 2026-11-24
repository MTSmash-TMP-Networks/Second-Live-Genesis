import * as THREE from 'three';
import { WALLS,removedCells,cellBox,wallSignature } from './wall_layout.js';

// Each surviving cell is solid. Omit faces shared by adjacent cells and render
// the exposed cut edges with an interior material. The original wall mesh is
// retained for repair and the intact state (no extra draw calls).
export function wallGeometry(w,cells){
  const gone=removedCells(cells),a=w.axis,b=a===0?2:0;
  const pos=[],norm=[],uv=[];
  function face(points,n,material){
    const ab=new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0]));
    const ac=new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0]));
    if(ab.cross(ac).dot(new THREE.Vector3(...n))<0)points=[points[0],points[3],points[2],points[1]];
    for(const i of [0,1,2,0,2,3]){
      const p=points[i];pos.push(...p);norm.push(...n);
      const x=p[0]+w.p[0],y=p[1]+w.p[1],z=p[2]+w.p[2];
      uv.push((Math.abs(n[0])>.5?z:x)/2.5,(Math.abs(n[1])>.5?-z:y)/2.5);
    }
  }
  const surface=[],edge=[];
  function emit(out,min,max,axis,side){
    const [u,v]=[0,1,2].filter(i=>i!==axis),n=[0,0,0];n[axis]=side;
    const points=[[0,0],[1,0],[1,1],[0,1]].map(([i,j])=>{const p=[0,0,0];p[axis]=side>0?max[axis]:min[axis];p[u]=i?max[u]:min[u];p[v]=j?max[v]:min[v];return p;});
    out.push([points,n]);
  }
  for(let r=0;r<w.rows;r++)for(let c=0;c<w.cols;c++){
    if(gone.has(`${c},${r}`))continue;
    const box=cellBox(w,c,r),p=box.p.map((x,i)=>x-w.p[i]);
    const min=p.map((x,i)=>x-box.s[i]/2),max=p.map((x,i)=>x+box.s[i]/2);
    for(const side of [-1,1]){
      emit(surface,min,max,b,side);
      const nc=c+side,nr=r+side;
      if(nc<0||nc>=w.cols||gone.has(`${nc},${r}`))emit(nc<0||nc>=w.cols?surface:edge,min,max,a,side);
      if(nr<0||nr>=w.rows||gone.has(`${c},${nr}`))emit(nr<0||nr>=w.rows?surface:edge,min,max,1,side);
    }
  }
  for(const [points,n] of surface)face(points,n,0);
  const cutStart=pos.length/3;
  for(const [points,n] of edge)face(points,n,1);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('uv1',geo.attributes.uv.clone());
  if(cutStart)geo.addGroup(0,cutStart,0);if(pos.length/3>cutStart)geo.addGroup(cutStart,pos.length/3-cutStart,1);
  if(pos.length)geo.computeBoundingSphere();return geo;
}
function edgeTexture(){
  const n=64,data=new Uint8Array(n*n*4);let seed=90871;
  for(let i=0;i<n*n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=i%n,y=Math.floor(i/n),v=155+Math.round((seed/4294967296)*55+14*Math.sin(x*1.7+y*.9));data.set([v,Math.round(v*.91),Math.round(v*.81),255],i*4);}
  const map=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(22,22);map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearFilter;map.needsUpdate=true;return map;
}
export class WallMeshes {
  constructor(impacts){this.entries=new Map();this.impacts=impacts;this.edge=new THREE.MeshStandardMaterial({color:0xe1d0be,map:edgeTexture(),roughness:.98});}
  register(id,mesh){if(WALLS[id])this.entries.set(id,{mesh,original:mesh.geometry,material:mesh.material,signature:''});}
  sync(state={}){
    for(const [id,e] of this.entries){
      const cells=state[id]||[],sig=wallSignature(cells);if(sig===e.signature)continue;
      this.impacts.invalidateTarget(id);
      if(e.mesh.geometry!==e.original)e.mesh.geometry.dispose();
      e.mesh.geometry=sig?wallGeometry(WALLS[id],cells):e.original;
      e.mesh.material=sig?[e.material,this.edge]:e.material;
      e.mesh.visible=e.mesh.geometry.attributes.position.count>0;
      e.signature=sig;
    }
  }
}
