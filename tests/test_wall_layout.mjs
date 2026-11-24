import assert from 'node:assert/strict';
import {WALLS,REMOVED,cellBox,solidRuns,wallSignature} from '../web/engine/wall_layout.js';
for(const w of Object.values(WALLS)){
  assert.equal(solidRuns(w,[]).length,1);
  const c=1,r=0,cell=cellBox(w,c,r),cells=[[c,r,REMOVED]];
  const intact=solidRuns(w,cells);
  assert.ok(!intact.some(b=>cell.p.every((x,i)=>Math.abs(x-b.p[i])<b.s[i]/2-1e-8)));
  const volume=s=>s.reduce((a,b)=>a*b,1);assert.ok(Math.abs(intact.reduce((a,b)=>a+volume(b.s),0)+volume(cell.s)-volume(w.s))<1e-7);
  assert.equal(wallSignature([[0,0,1]]),'');
  const all=[];for(let y=0;y<w.rows;y++)for(let x=0;x<w.cols;x++)all.push([x,y,REMOVED]);assert.equal(solidRuns(w,all).length,0);
}
console.log('Shared layout: openings, retained volume, complete removal and repair OK');
