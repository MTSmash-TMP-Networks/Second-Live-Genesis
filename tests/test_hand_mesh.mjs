import assert from 'node:assert/strict';
import {skinMeshData} from '../web/engine/hand_mesh.js';
const shapes=[{kind:'ellipsoid',p:[0,0,0],s:[.04,.024,.05]},{kind:'capsule',a:[0,0,-.025],b:[.01,.01,-.09],r:.012},{kind:'capsule',a:[.02,0,.01],b:[.048,.015,-.01],r:.011}];
const d=skinMeshData(shapes,.0038);assert.ok(d.indices.length>100);assert.equal(d.positions.length,d.normals.length);assert.equal(d.positions.length,d.colors.length);assert.ok(d.positions.every(Number.isFinite));assert.ok(d.indices.every(i=>Number.isInteger(i)&&i>=0&&i<d.positions.length/3));
const parent=new Map();for(let i=0;i<d.indices.length;i+=3){for(let j=0;j<3;j++){const a=d.indices[i+j],b=d.indices[i+(j+1)%3];if(!parent.has(a))parent.set(a,new Set());parent.get(a).add(b);if(!parent.has(b))parent.set(b,new Set());parent.get(b).add(a);}}
const seen=new Set(),todo=[d.indices[0]];while(todo.length){const a=todo.pop();if(seen.has(a))continue;seen.add(a);todo.push(...parent.get(a));}assert.equal(seen.size,parent.size,'skin mesh connected');
console.log('Procedural hand: finite indexed geometry, normals, connected skin');
