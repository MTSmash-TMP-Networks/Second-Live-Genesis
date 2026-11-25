import assert from 'node:assert/strict';
import {WALLS,REMOVED,polygons,site,planeAxes,solidRuns,solidContains,solidRay,wallSignature,triangles,boundary,floorSupported} from '../web/engine/wall_layout.js';
const area=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
for(const [id,w] of Object.entries(WALLS)){
  const [u,v,b]=planeAxes(w),all=polygons(w);assert.equal(all.length,w.cols*w.rows);
  assert.ok(all.every(c=>c.poly.length>=3&&area(c.poly)>0));
  assert.ok(Math.abs(all.reduce((n,c)=>n+area(c.poly),0)-w.s[u]*w.s[v])<1e-7,`${id}: exact partition`);
  assert.ok(all.some(c=>c.poly.length!==4),`${id}: not rectangles`);
  const c=Math.floor(w.cols/2),r=Math.floor(w.rows/2),q=site(w,c,r),point=[...w.p];point[u]+=q[0];point[v]+=q[1];
  const direction=[0,0,0];direction[b]=1;const origin=[...point];origin[b]-=1;
  const cells=[[c,r,REMOVED]],intact=solidRuns(w,cells);
  assert.ok(!intact.some(x=>solidContains(x,point)));
  assert.ok(!intact.some(x=>Number.isFinite(solidRay(x,origin,direction))));
  assert.ok(boundary(w,cells).cuts.length>=3);assert.ok(triangles(w,cells).every(Number.isFinite));
  assert.equal(wallSignature([[0,0,1]]),'');assert.equal(solidRuns(w,all.map(p=>[p.c,p.r,REMOVED])).length,0);
  if(id==='surface_0'){assert.equal(floorSupported(w,cells,point[0],point[2]),false);assert.equal(floorSupported(w,[],point[0],point[2]),true);}
}
console.log('11 irregular surface partitions: area conservation, ray opening, exposed edges, slab support and repair OK');
