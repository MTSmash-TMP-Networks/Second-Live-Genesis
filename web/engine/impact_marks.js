import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// Persistent visual damage. Coordinates are relative to a stable scene root,
// not the camera or a temporary world-space rigid-body position.
const v=a=>new THREE.Vector3(...a);
const size=.075; // graphic decal size, not a physical projectile model
function meshes(root){
  const out=[];
  const walk=o=>{if(!o.visible||o.userData.impactDecal||o.userData.noImpact)return;if(o.isMesh)out.push(o);for(const c of o.children)walk(c);};
  walk(root);return out;
}
function normalAt(hit){return hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();}
function texture(kind){
  const n=64,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const a=(x+0.5-n/2)/(n/2),b=(y+0.5-n/2)/(n/2),r=Math.hypot(a,b),t=Math.atan2(b,a),j=(Math.sin(t*13)+Math.sin(t*7+1))*.035;
    let rgb=[37,32,28],alpha=0;
    if(kind==='glass'){
      const line=Math.abs(Math.sin(t*7+2*r));
      if(r<.21){rgb=[45,51,54];alpha=235;}
      else if(r<.94&&(line<.075||Math.abs(r-.36-j)<.025||Math.abs(r-.60-j)<.016)){rgb=[225,240,241];alpha=Math.round(210*(1-r*.62));}
    }else if(r<.26+j){rgb=[20,19,18];alpha=248;}
    else if(r<.48+j){rgb=kind==='wood'?[115,83,52]:kind==='fabric'?[62,55,52]:[150,142,130];alpha=224;}
    else if(r<.91+j){rgb=[61,55,49];alpha=Math.round(80*Math.pow(Math.max(0,1-r),.7));}
    const i=(y*n+x)*4;data.set([...rgb,alpha],i);
  }
  const tex=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;return tex;
}
export class ImpactMarks {
  constructor(){this.targets=new Map();this.live=new Map();this.failed=new Set();this.materials=new Map();this.ray=new THREE.Raycaster();}
  register(id,root,kind='wall'){this.targets.set(id,{root,kind});root.userData.impactTarget=id;}
  material(kind){if(!this.materials.has(kind))this.materials.set(kind,new THREE.MeshBasicMaterial({map:texture(kind),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,alphaTest:.035,side:THREE.DoubleSide}));return this.materials.get(kind);}
  cast(origin,direction,groups,held=null){
    const d=v(direction).normalize();if(d.lengthSq()<.5)return {dist:8.01,id:null};
    const all=groups.flatMap(meshes);this.ray.set(v(origin),d);this.ray.near=.005;this.ray.far=8;
    for(const h of this.ray.intersectObjects(all,false)){
      if(!h.face)continue;
      let node=h.object,id=null;while(node){if(node.userData.impactTarget){id=node.userData.impactTarget;break;}node=node.parent;}
      if(id===held&&id!==null)continue;
      if(!id)return {id:null,dist:h.distance}; // opaque decor blocks the ray
      const root=this.targets.get(id).root;let n=normalAt(h);if(n.dot(d)>0)n.negate();
      const inv=root.matrixWorld.clone().invert();
      return {id,dist:h.distance,mark:{point:h.point.clone().applyMatrix4(inv).toArray(),normal:n.applyMatrix3(new THREE.Matrix3().getNormalMatrix(inv)).normalize().toArray()}};
    }
    return {id:null,dist:8.01};
  }
  project(mark,target){
    const {root,kind}=target;root.updateWorldMatrix(true,true);
    const p=root.localToWorld(v(mark.point)),n=v(mark.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(root.matrixWorld)).normalize();
    const ray=new THREE.Raycaster(p.clone().addScaledVector(n,.04),n.clone().negate(),0,.08);
    const hit=ray.intersectObjects(meshes(root),false).find(h=>h.face&&Math.abs(normalAt(h).dot(n))>.55);
    if(!hit)return null;
    const orient=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),n));
    const geo=new DecalGeometry(hit.object,hit.point,orient,new THREE.Vector3(size,size,.018));
    if(!geo.attributes.position?.count){geo.dispose();return null;}
    geo.applyMatrix4(root.matrixWorld.clone().invert());
    const decal=new THREE.Mesh(geo,this.material(kind));decal.userData.impactDecal=true;decal.renderOrder=4;root.add(decal);return decal;
  }
  sync(marks=[]){
    const wanted=new Set(marks.map(m=>m.id));
    for(const [id,mesh] of this.live)if(!wanted.has(id)){mesh.removeFromParent();mesh.geometry.dispose();this.live.delete(id);}
    for(const id of this.failed)if(!wanted.has(id))this.failed.delete(id);
    for(const mark of marks){if(this.live.has(mark.id)||this.failed.has(mark.id))continue;const target=this.targets.get(mark.target);if(!target||!target.root.visible)continue;const mesh=this.project(mark,target);if(mesh)this.live.set(mark.id,mesh);else this.failed.add(mark.id);}
  }
}
