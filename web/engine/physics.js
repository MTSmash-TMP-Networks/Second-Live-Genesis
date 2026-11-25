import RAPIER from '@dimforge/rapier3d-compat';
import { WALLS, collisionMesh, wallSignature } from './wall_layout.js';
const vector = p => ({x:p[0],y:p[1],z:p[2]});
const array = v => [v.x,v.y,v.z];
const rotation = q => [q.x,q.y,q.z,q.w];
export class RoomPhysics {
  static async create(room,spec){await RAPIER.init();return new RoomPhysics(room,spec);}
  constructor(room,spec){
    this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.spec=spec;this.entries=new Map();this.fragments=new Map();this.acc=0;
    this.world.timestep=1/60;
    this.wallColliders=new Map();this.decorColliders=new Map();this.importColliders=new Map();
    for(const o of room){const collider=this.fixed(o.p,o.s);if(o.surfaceId&&WALLS[o.surfaceId])this.wallColliders.set(o.surfaceId,{signature:'',colliders:[collider]});else if(o.surfaceId)this.decorColliders.set(o.surfaceId,collider);}
    this.door=this.fixed([0,1.1,-4.95],[1.85,2.2,.18]);
    this.extension=[this.fixed([0,-.12,-10],[10,.24,10]),this.fixed([-4.8,1.4,-10],[.2,2.8,10]),this.fixed([4.8,1.4,-10],[.2,2.8,10]),this.fixed([0,1.4,-15],[10,2.8,.2])];
    this.unlocked=false;for(const c of this.extension)c.setEnabled(false);
  }
  fixed(p,s){return this.world.createCollider(RAPIER.ColliderDesc.cuboid(...s.map(x=>x/2)).setTranslation(...p).setFriction(.8));}
  add(p,s,fixed=false){
    const desc=(fixed?RAPIER.RigidBodyDesc.fixed():RAPIER.RigidBodyDesc.dynamic()).setTranslation(...p);
    if(!fixed)desc.setLinearDamping(.24).setAngularDamping(.48).setCcdEnabled(true);
    const body=this.world.createRigidBody(desc), col=this.world.createCollider(RAPIER.ColliderDesc.cuboid(...s.map(x=>x/2)).setDensity(1).setFriction(.78).setRestitution(.18),body);
    return {body,col,held:false};
  }
  remove(entry){this.world.removeRigidBody(entry.body);}
  impulse(id,d,strength=1){const e=this.entries.get(id),scale=Number.isFinite(strength)?Math.max(0,Math.min(2,strength)):1;if(e&&id!=='window'&&!this.spec[id].decor&&!e.held)e.body.applyImpulse(vector(d.map(x=>x*2.5*scale)),true);}
  read(e,b){b.p=array(e.body.translation());b.v=array(e.body.linvel());b.q=rotation(e.body.rotation());b.angular=array(e.body.angvel());}
  syncWalls(walls={}){
    for(const [id,e] of this.wallColliders){const cells=walls[id]||[],signature=wallSignature(cells);if(signature===e.signature)continue;
      const w=WALLS[id];let next;
      if(!signature)next=[this.fixed(w.p,w.s)];
      else {const {vertices,indices}=collisionMesh(w,cells);next=indices.length?[this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices).setTranslation(...w.p).setFriction(.8))]:[];}
      for(const c of e.colliders)this.world.removeCollider(c,true);e.colliders=next;e.signature=signature;
    }
  }
  syncDecor(decor={}){for(const [id,c] of this.decorColliders)c.setEnabled((decor[id]||0)<4);}
  syncImported(boxes=[]){
    const wanted=new Map(boxes.map(b=>[b.id,b]));
    for(const [id,e] of this.importColliders){if(!wanted.has(id)){this.world.removeCollider(e.collider,true);this.importColliders.delete(id);}}
    for(const b of boxes){const signature=JSON.stringify([b.p,b.s]),old=this.importColliders.get(b.id);if(old?.signature===signature)continue;
      if(old)this.world.removeCollider(old.collider,true);
      this.importColliders.set(b.id,{signature,collider:this.fixed(b.p,b.s)});
    }
  }
  step(dt,bodies,state,held,holdPoint,debris,holdRotation=[0,0,0,1]){
    this.syncWalls(state.walls||{});this.syncDecor(state.decor||{});
    if(this.unlocked!==state.unlocked){this.unlocked=state.unlocked;this.door.setEnabled(!this.unlocked);for(const c of this.extension)c.setEnabled(this.unlocked);}
    for(const [id,e] of this.entries)if(!bodies[id]){this.remove(e);this.entries.delete(id);}
    for(const [id,b] of Object.entries(bodies)){
      let e=this.entries.get(id);const spec=this.spec[id];
      if(!state.objects[id]){if(e){this.remove(e);this.entries.delete(id);}continue;}
      if(!e||e.ref!==b){if(e)this.remove(e);e=this.add(b.p,spec.s,id==='window'||spec.decor);if(id==='surface_rug')e.col.setSensor(true);if(b.q)e.body.setRotation({x:b.q[0],y:b.q[1],z:b.q[2],w:b.q[3]},true);e.ref=b;this.entries.set(id,e);}
      if(id==='window')continue;
      if(id===held){if(!e.held){e.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);e.col.setSensor(true);e.held=true;}e.body.setNextKinematicTranslation(vector(holdPoint));e.body.setNextKinematicRotation({x:holdRotation[0],y:holdRotation[1],z:holdRotation[2],w:holdRotation[3]});}
      else if(e.held){e.body.setBodyType(spec.decor?RAPIER.RigidBodyType.Fixed:RAPIER.RigidBodyType.Dynamic,true);e.col.setSensor(id==='surface_rug');e.body.setLinvel(vector(b.v),true);e.body.setAngvel({x:0,y:0,z:0},true);e.held=false;}
    }
    const current=new Set(debris);
    for(const [b,e] of this.fragments)if(!current.has(b)){this.remove(e);this.fragments.delete(b);}
    for(const b of debris)if(!this.fragments.has(b)){const e=this.add(b.p,b.s);e.body.setLinvel(vector(b.v),true);e.body.setAngvel({x:2,y:1,z:3},true);this.fragments.set(b,e);}
    this.acc=Math.min(.1,this.acc+Math.max(0,dt));while(this.acc>=1/60){this.world.step();this.acc-=1/60;}
    for(const [id,e] of this.entries)this.read(e,bodies[id]);for(const [b,e] of this.fragments)this.read(e,b);
  }
}
