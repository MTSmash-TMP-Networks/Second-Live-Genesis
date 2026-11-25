import { RoomPhysics } from './physics.js';
import assert from 'node:assert/strict';
const spec={box:{p:[0,2,0],s:[.5,.5,.5]}};
const physics=await RoomPhysics.create([{p:[0,-.1,0],s:[10,.2,10]}],spec);
let bodies={box:{p:[0,2,0],v:[0,0,0]}},state={objects:{box:100},unlocked:false};
for(let i=0;i<180;i++)physics.step(1/60,bodies,state,null,null,[]);
assert.ok(Math.abs(bodies.box.p[1]-.25)<.06,'gravity and ground contact');
physics.impulse('box',[1,0,0]);for(let i=0;i<15;i++)physics.step(1/60,bodies,state,null,null,[]);
assert.ok(bodies.box.p[0]>.05,'impulse changes position');
state.objects.box=0;physics.step(1/60,bodies,state,null,null,[]);assert.equal(physics.entries.size,0);
state.objects.box=100;bodies.box={p:[0,2,0],v:[0,0,0]};physics.step(1/60,bodies,state,null,null,[]);assert.equal(physics.entries.size,1);
physics.step(1/60,bodies,state,'box',[1,1,0],[]);assert.equal(physics.entries.get('box').held,true);
physics.step(1/60,bodies,state,null,null,[]);assert.equal(physics.entries.get('box').held,false);
console.log('Rapier WASM: gravity, contact, impulse, destroy, repair, grab/release passed');

import RAPIER from '@dimforge/rapier3d-compat';
import { WALLS, REMOVED, cellBox, site, planeAxes } from './wall_layout.js';
const w=WALLS.surface_6,wp=await RoomPhysics.create([{p:w.p,s:w.s,surfaceId:'surface_6'}],{}),cell=cellBox(w,4,3);
const ray=new RAPIER.Ray({x:cell.p[0]-1,y:cell.p[1],z:cell.p[2]},{x:1,y:0,z:0});
// Step after structural changes to update the physics query pipeline.
wp.world.step();assert.ok(wp.world.castRay(ray,2,true));
wp.syncWalls({surface_6:[[4,3,REMOVED]]});wp.world.step();assert.equal(wp.world.castRay(ray,2,true),null);
const adj=cellBox(w,5,3);assert.ok(wp.world.castRay(new RAPIER.Ray({x:adj.p[0]-1,y:adj.p[1],z:adj.p[2]},{x:1,y:0,z:0}),2,true));
wp.syncWalls({});wp.world.step();assert.ok(wp.world.castRay(ray,2,true));
console.log('Rapier WASM: wall collider opening, adjacent contact and repair');

for(const id of ['surface_0','surface_1']){
  const w=WALLS[id],p=await RoomPhysics.create([{p:w.p,s:w.s,surfaceId:id}],{}),[u,v,b]=planeAxes(w),q=site(w,10,10),origin=[...w.p],d=[0,0,0];origin[u]+=q[0];origin[v]+=q[1];origin[b]-=1;d[b]=1;
  const ray=new RAPIER.Ray({x:origin[0],y:origin[1],z:origin[2]},{x:d[0],y:d[1],z:d[2]});
  p.world.step();assert.ok(p.world.castRay(ray,2,true));p.syncWalls({[id]:[[10,10,REMOVED]]});p.world.step();assert.equal(p.world.castRay(ray,2,true),null);p.syncWalls({});p.world.step();assert.ok(p.world.castRay(ray,2,true));
}
const furniture=await RoomPhysics.create([{p:[0,1,0],s:[.5,.5,.5],surfaceId:'surface_nightstand'}],{});
const furnitureRay=new RAPIER.Ray({x:0,y:1,z:1},{x:0,y:0,z:-1});furniture.world.step();assert.ok(furniture.world.castRay(furnitureRay,2,true));furniture.syncDecor({surface_nightstand:4});furniture.world.step();assert.equal(furniture.world.castRay(furnitureRay,2,true),null);furniture.syncDecor({});furniture.world.step();assert.ok(furniture.world.castRay(furnitureRay,2,true));
console.log('Rapier: irregular floor/ceiling collision and destructible decor repair');

const bedSpec={bed:{p:[0,.6,0],s:[1.56,1.2,2.26],decor:true}};
const bp=await RoomPhysics.create([{p:[0,-.1,0],s:[10,.2,10]}],bedSpec);
const bb={bed:{p:[0,.6,0],v:[0,0,0]}},bs={objects:{bed:4},unlocked:false};
const quarter=[0,Math.SQRT1_2,0,Math.SQRT1_2];
for(let i=0;i<3;i++)bp.step(1/60,bb,bs,'bed',[1,.6,1],[],quarter);
assert.ok(Math.abs(bb.bed.q[1]-Math.SQRT1_2)<.001,'held rotation');
bb.bed={p:[1,.6,1],v:[0,0,0],q:quarter};
for(let i=0;i<10;i++)bp.step(1/60,bb,bs,null,null,[]);
assert.ok(Math.abs(bb.bed.q[1]-Math.SQRT1_2)<.001,'saved orientation restored');
assert.ok(Math.abs(bb.bed.p[0]-1)<.001,'placed furniture remains stationary');
console.log('Rapier: movable decor rotation and stable placement');

// Thin rug is non-blocking, including after grab/release.
const rugSpec={surface_rug:{p:[0,.009,0],s:[3.2,.018,2.22],decor:true}};
const rp=await RoomPhysics.create([{p:[0,-.1,0],s:[10,.2,10]}],rugSpec);
const rb={surface_rug:{p:[0,.009,0],v:[0,0,0],q:[0,0,0,1]}},rs={objects:{surface_rug:4},unlocked:false};
rp.step(1/60,rb,rs,null,null,[]);assert.equal(rp.entries.get('surface_rug').col.isSensor(),true);
for(let i=0;i<3;i++)rp.step(1/60,rb,rs,'surface_rug',[1,.009,1],[],quarter);
rp.step(1/60,rb,rs,null,null,[]);assert.equal(rp.entries.get('surface_rug').col.isSensor(),true);
assert.ok(Math.abs(rb.surface_rug.p[1]-.009)<.001);
console.log('Rapier: movable non-blocking rug');
