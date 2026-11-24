import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// Persistent visual damage. Coordinates are relative to a stable scene root,
// not the camera or a temporary world-space rigid-body position.
const v=a=>new THREE.Vector3(...a);
function meshes(root){
  const out=[];
  const walk=o=>{if(!o.visible||o.userData.impactDecal||o.userData.noImpact)return;if(o.isMesh)out.push(o);for(const c of o.children)walk(c);};
  walk(root);return out;
}
function normalAt(hit){return hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();}
function clampStage(value){return Math.max(1,Math.min(6,Math.round(value||1)));}
function sizeFor(kind,stage){
  const level=clampStage(stage),base=kind==='glass'?.07:kind==='fabric'?.082:kind==='wood'?.078:.086;
  const growth=kind==='wall'?0.36:kind==='glass'?0.20:0.26;
  return base*(1+(level-1)*growth);
}
function texture(kind,stage=1){
  const level=clampStage(stage),n=96,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const a=(x+0.5-n/2)/(n/2),b=(y+0.5-n/2)/(n/2),r=Math.hypot(a,b),t=Math.atan2(b,a);
    const noise=(Math.sin(t*11+level*0.9)+Math.sin(t*17-r*6+1.4)+Math.cos((a+b)*21))*0.018;
    let rgb=[37,32,28],alpha=0;
    if(kind==='glass'){
      const line=Math.abs(Math.sin(t*(7+level*1.2)+r*3));
      const spokes=Math.abs(Math.sin(t*(11+level*2.1)));
      if(r<.18+.015*level){rgb=[38,43,47];alpha=245;}
      else if(r<.95&&(line<.055+.01*level||spokes<.03+.008*level||Math.abs(r-(.26+.085*level)-noise)<.018+.004*level||Math.abs(r-(.55+.03*level)+noise)<.014+.003*level)){
        rgb=[224,239,242];alpha=Math.round(220*(1-r*.55));
      }
    }else if(kind==='fabric'){
      if(r<.18+.04*level+noise){rgb=[16,15,15];alpha=246;}
      else if(r<.44+.055*level+noise){rgb=[70,60,54];alpha=220;}
      else if(r<.90){const fuzz=Math.abs(Math.sin(t*22+r*9));rgb=[88,79,71];alpha=fuzz<.36?Math.round(86*(1-r)):0;}
    }else if(kind==='wood'){
      const splinter=Math.abs(Math.sin(t*9+r*(8+level*2)));
      if(r<.17+.03*level+noise){rgb=[24,20,17];alpha=248;}
      else if(r<.45+.05*level+noise){rgb=[116,84,53];alpha=228;}
      else if(r<.96&&(splinter<.10+.01*level||Math.abs(r-(.63+.02*level)+noise)<.020+.004*level)){
        rgb=[62,45,31];alpha=Math.round(108*(1-r));
      }
    }else{
      const crack=Math.abs(Math.sin(t*(8+level*1.7)+r*(6+level)));
      if(r<.16+.035*level+noise){rgb=[24,22,20];alpha=248;}
      else if(r<.40+.08*level+noise){rgb=[132,125,116];alpha=228;}
      else if(r<.98&&(crack<.085+.012*level||Math.abs(r-(.50+.07*level)+noise)<.022+.005*level||Math.abs(r-(.76+.02*level)-noise)<.014+.003*level)){
        rgb=[78,72,66];alpha=Math.round(118*(1-r));
      }
    }
    const i=(y*n+x)*4;data.set([...rgb,alpha],i);
  }
  const tex=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;
  return tex;
}
export class ImpactMarks {
  constructor(){this.targets=new Map();this.live=new Map();this.failed=new Set();this.signatures=new Map();this.materials=new Map();this.ray=new THREE.Raycaster();}
  register(id,root,kind='wall'){this.targets.set(id,{root,kind});root.userData.impactTarget=id;}
  material(kind,stage){
    const key=`${kind}:${clampStage(stage)}`;
    if(!this.materials.has(key))this.materials.set(key,new THREE.MeshBasicMaterial({map:texture(kind,stage),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,alphaTest:.035,side:THREE.DoubleSide}));
    return this.materials.get(key);
  }
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
    const stage=clampStage(mark.severity);
    const p=root.localToWorld(v(mark.point)),n=v(mark.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(root.matrixWorld)).normalize();
    const ray=new THREE.Raycaster(p.clone().addScaledVector(n,.06),n.clone().negate(),0,.12);
    const hit=ray.intersectObjects(meshes(root),false).find(h=>h.face&&Math.abs(normalAt(h).dot(n))>.55);
    if(!hit)return null;
    const orient=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),n));
    const size=sizeFor(kind,stage);
    const geo=new DecalGeometry(hit.object,hit.point,orient,new THREE.Vector3(size,size,.018+.003*stage));
    if(!geo.attributes.position?.count){geo.dispose();return null;}
    geo.applyMatrix4(root.matrixWorld.clone().invert());
    const decal=new THREE.Mesh(geo,this.material(kind,stage));
    decal.userData.impactDecal=true;decal.renderOrder=4+stage;root.add(decal);return decal;
  }
  forget(id){const mesh=this.live.get(id);if(mesh){mesh.removeFromParent();mesh.geometry.dispose();this.live.delete(id);}this.failed.delete(id);this.signatures.delete(id);}
  invalidateTarget(target){for(const [id,entry] of this.signatures)if(entry.target===target)this.forget(id);}
  sync(marks=[]){
    const wanted=new Set(marks.map(m=>m.id));
    for(const id of this.signatures.keys())if(!wanted.has(id))this.forget(id);
    for(const mark of marks){
      const signature=JSON.stringify([mark.target,mark.point,mark.normal,mark.severity||1]);
      const prior=this.signatures.get(mark.id);if(prior&&prior.signature!==signature)this.forget(mark.id);
      if(this.live.has(mark.id)||this.failed.has(mark.id))continue;
      const target=this.targets.get(mark.target);if(!target||!target.root.visible)continue;
      this.signatures.set(mark.id,{target:mark.target,signature});
      const mesh=this.project(mark,target);if(mesh)this.live.set(mark.id,mesh);else this.failed.add(mark.id);
    }
  }
}
