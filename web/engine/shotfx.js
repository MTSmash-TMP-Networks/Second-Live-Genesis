import * as THREE from 'three';

// Presentation-only effects. No simulation of real ammunition or ballistics.
const MAX_EFFECTS=32;
const vec=a=>new THREE.Vector3(...a);
export class ShotEffects {
  constructor(scene,maxDistance=8){
    this.maxDistance=maxDistance;this.scene=scene;this.items=[];this.light=new THREE.PointLight(0xffb95d,0,2.2,2);scene.add(this.light);
    this.trailGeo=new THREE.CylinderGeometry(.008,.014,1,6);this.trailMat=new THREE.MeshBasicMaterial({color:0xffd68a,toneMapped:false});
    this.caseGeo=new THREE.CylinderGeometry(.013,.013,.065,10);this.caseMat=new THREE.MeshStandardMaterial({color:0xc29d50,metalness:.72,roughness:.38});
    this.glowGeo=new THREE.SphereGeometry(1,12,8);this.glowMat=new THREE.MeshBasicMaterial({color:0xffd8a0,transparent:true,opacity:.9,toneMapped:false,depthWrite:false});
    this.sparkGeo=new THREE.SphereGeometry(.012,6,4);this.sparkMat=new THREE.MeshBasicMaterial({color:0xffca7c,toneMapped:false});
  }
  add(mesh,item){this.scene.add(mesh);this.items.push({...item,mesh,age:0});while(this.items.length>MAX_EFFECTS)this.remove(0);}
  remove(i){const e=this.items[i];e.mesh.removeFromParent();if(e.ownMaterial)e.mesh.material.dispose();this.items.splice(i,1);}
  fire({origin,direction,distance,impact,source=null,caseSource=null}){
    if(!Array.isArray(origin)||!Array.isArray(direction)||![...origin,...direction,distance].every(Number.isFinite))return;
    const from=source?vec(source):vec(origin),d=vec(direction).normalize();if(d.lengthSq()<.5)return;
    const to=vec(origin).addScaledVector(d,Math.min(this.maxDistance,Math.max(0,distance)));
    const path=to.clone().sub(from),length=path.length();if(length<.03)return;
    const duration=.12+Math.min(.13,length*.012)+Math.min(.19,Math.max(0,length-8)*.0015); // deliberately stylized game VFX
    const trail=new THREE.Mesh(this.trailGeo,this.trailMat);trail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),path.clone().normalize());
    trail.position.copy(from);trail.scale.y=.02;
    this.add(trail,{kind:'trail',from,to,length,duration,impact});
    const flash=new THREE.Mesh(this.glowGeo,this.glowMat.clone());flash.position.copy(from);flash.scale.set(.07,.07,.07);
    this.add(flash,{kind:'flash',duration:.075,ownMaterial:true});this.light.position.copy(from);this.light.intensity=1.4;
    const shell=new THREE.Mesh(this.caseGeo,this.caseMat);shell.position.copy(caseSource?vec(caseSource):vec(origin));shell.rotation.z=.7;
    const side=new THREE.Vector3().crossVectors(d,new THREE.Vector3(0,1,0));if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();
    this.add(shell,{kind:'case',duration:5,velocity:side.multiplyScalar(.85).add(new THREE.Vector3(0,.7,0)),spin:5});
  }
  burst(position){for(let i=0;i<5;i++){const m=new THREE.Mesh(this.sparkGeo,this.sparkMat);m.position.copy(position);this.add(m,{kind:'spark',duration:.20+Math.random()*.09,velocity:new THREE.Vector3((Math.random()-.5)*1.5,Math.random()*.9,(Math.random()-.5)*1.5)});}}
  update(delta){
    const dt=Math.max(0,Math.min(.05,delta||0));this.light.intensity*=Math.exp(-dt*55);
    const impacts=[];
    for(let i=this.items.length-1;i>=0;i--){const e=this.items[i];e.age+=dt;const t=Math.min(1,e.age/e.duration);
      if(e.kind==='trail'){
        const head=e.length*t,tail=Math.max(0,head-Math.max(.24,Math.min(3.5,e.length*.04))),mid=(head+tail)*.5/e.length;
        e.mesh.position.lerpVectors(e.from,e.to,mid);e.mesh.scale.y=Math.max(.001,head-tail);
        if(t===1&&e.impact)impacts.push(e.to);
      }else if(e.kind==='flash'){e.mesh.scale.setScalar(.07*(1+t));e.mesh.material.opacity=.9*(1-t);}
      else if(e.kind==='case'){
        // A world-space visual prop with a simple floor bounce, not a Rapier body.
        e.velocity.y-=4*dt;e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.rotation.z+=e.spin*dt;
        if(e.mesh.position.y<.022){e.mesh.position.y=.022;e.velocity.y=Math.max(0,-e.velocity.y*.28);e.velocity.x*=.65;e.velocity.z*=.65;e.spin*=.65;}
      }else if(e.kind==='spark'){e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.scale.setScalar(Math.max(.01,1-t));}
      if(t===1)this.remove(i);
    }
    for(const p of impacts)this.burst(p);
  }
}
