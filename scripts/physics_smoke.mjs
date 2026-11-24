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
import { WALLS, REMOVED, cellBox } from './wall_layout.js';
const w=WALLS.surface_6,wp=await RoomPhysics.create([{p:w.p,s:w.s,surfaceId:'surface_6'}],{}),cell=cellBox(w,4,3);
const ray=new RAPIER.Ray({x:cell.p[0]-1,y:cell.p[1],z:cell.p[2]},{x:1,y:0,z:0});
// Step after structural changes to update the physics query pipeline.
wp.world.step();assert.ok(wp.world.castRay(ray,2,true));
wp.syncWalls({surface_6:[[4,3,REMOVED]]});wp.world.step();assert.equal(wp.world.castRay(ray,2,true),null);
const adj=cellBox(w,5,3);assert.ok(wp.world.castRay(new RAPIER.Ray({x:adj.p[0]-1,y:adj.p[1],z:adj.p[2]},{x:1,y:0,z:0}),2,true));
wp.syncWalls({});wp.world.step();assert.ok(wp.world.castRay(ray,2,true));
console.log('Rapier WASM: wall collider opening, adjacent contact and repair');
