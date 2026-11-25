import WALLS from './wall_layout.json' with { type: 'json' };
export { WALLS };
export const REMOVED=4;
// Wall and slab layout uses U,V (plane), B (thickness). Stable site IDs
// deliberately keep v0.6.7 col,row keys. The partition is cosmetic game art.
export function planeAxes(w){const u=w.axis,v=w.verticalAxis??1;return [u,v,3-u-v];}
function random(c,r,k){let h=Math.imul(c+1,73856093)^Math.imul(r+1,19349663)^Math.imul(k+1,83492791);h=Math.imul(h^(h>>>16),0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);return ((h^(h>>>16))>>>0)/4294967296;}
export function site(w,c,r){const [u,v]=planeAxes(w),dx=w.s[u]/w.cols,dy=w.s[v]/w.rows;return [-w.s[u]/2+(c+.5+(random(c,r,0)-.5)*.64)*dx,-w.s[v]/2+(r+.5+(random(c,r,1)-.5)*.64)*dy];}
const cache=new WeakMap(),siteCache=new WeakMap();
function sitesFor(w){if(!siteCache.has(w)){const sites=[];for(let r=0;r<w.rows;r++)for(let c=0;c<w.cols;c++)sites.push({c,r,point:site(w,c,r)});siteCache.set(w,sites);}return siteCache.get(w);}
function clip(poly,n,k){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*n[0]+a[1]*n[1]-k,db=b[0]*n[0]+b[1]*n[1]-k;const ia=da<=1e-10,ib=db<=1e-10;if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
export function polygons(w){if(cache.has(w))return cache.get(w);const [u,v]=planeAxes(w),a=w.s[u]/2,b=w.s[v]/2,sites=sitesFor(w);const result=sites.map(s=>{const p=s.point;let poly=[[-a,-b],[a,-b],[a,b],[-a,b]];for(const t of sites){if(t===s)continue;const q=t.point,n=[q[0]-p[0],q[1]-p[1]],k=(q[0]**2+q[1]**2-p[0]**2-p[1]**2)/2;poly=clip(poly,n,k);if(!poly.length)break;}return {...s,poly};});cache.set(w,result);return result;}
export function nearestCell(w,u,v){let best=null,d=Infinity;for(const {c,r,point:p} of sitesFor(w)){const n=(p[0]-u)**2+(p[1]-v)**2;if(n<d){d=n;best=[c,r];}}return best;}
export function removedCells(cells=[]){return new Set(cells.filter(c=>c[2]>=REMOVED).map(c=>`${c[0]},${c[1]}`));}
export function wallSignature(cells=[]){return [...removedCells(cells)].sort().join(';');}
export function cellBox(w,c,r){const [u,v,b]=planeAxes(w),cell=polygons(w)[r*w.cols+c],p=[...w.p],s=[...w.s];for(const [axis,i] of [[u,0],[v,1]]){const lo=Math.min(...cell.poly.map(t=>t[i])),hi=Math.max(...cell.poly.map(t=>t[i]));p[axis]+=(lo+hi)/2;s[axis]=hi-lo;}return {p,s,wall:w,poly:cell.poly};}
// Retain an inexpensive full box for intact surfaces, polygon prisms after damage.
export function solidRuns(w,cells=[]){const gone=removedCells(cells);if(!gone.size)return [{p:[...w.p],s:[...w.s]}];return polygons(w).filter(c=>!gone.has(`${c.c},${c.r}`)).map(c=>cellBox(w,c.c,c.r));}
export function insidePoly(poly,x,y,margin=0){return poly.every((p,i)=>{const q=poly[(i+1)%poly.length],dx=q[0]-p[0],dy=q[1]-p[1];return dx*(y-p[1])-dy*(x-p[0])>=-margin*Math.hypot(dx,dy)-1e-9;});}
export function solidContains(o,p,margin=0){if(!o.poly)return p.every((x,i)=>Math.abs(x-o.p[i])<=o.s[i]/2+margin);const w=o.wall,[u,v,b]=planeAxes(w);return Math.abs(p[b]-w.p[b])<=w.s[b]/2+margin&&insidePoly(o.poly,p[u]-w.p[u],p[v]-w.p[v],margin);}
// Convex-prism ray test for game interaction (same footprint as the mesh).
export function solidRay(o,origin,direction){if(!o.poly)return null;const w=o.wall,[u,v,b]=planeAxes(w),p=origin.map((x,i)=>x-w.p[i]);let lo=0,hi=8;
  const clip=(value,slope)=>{if(Math.abs(slope)<1e-10)return value>=-1e-9;const t=-value/slope;if(slope>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);return lo<=hi;};
  if(!clip(w.s[b]/2-p[b],-direction[b])||!clip(w.s[b]/2+p[b],direction[b]))return Infinity;
  for(let i=0;i<o.poly.length;i++){const a=o.poly[i],q=o.poly[(i+1)%o.poly.length],dx=q[0]-a[0],dy=q[1]-a[1];if(!clip(dx*(p[v]-a[1])-dy*(p[u]-a[0]),dx*direction[v]-dy*direction[u]))return Infinity;}return lo;
}
export function floorSupported(w,cells,x,z){if(!w)return false;if(Math.abs(x-w.p[0])>w.s[0]/2||Math.abs(z-w.p[2])>w.s[2]/2)return false;const gone=removedCells(cells);if(!gone.size)return true;return !gone.has(nearestCell(w,x-w.p[0],z-w.p[2]).join(','));}
// Triangle boundary is used both by the renderer and Rapier. No invisible
// rectangular collision remains inside an irregular opening.
export function boundary(w,cells=[]){const [u,v,b]=planeAxes(w),gone=removedCells(cells),half=w.s[b]/2,faces=[],cuts=[];const point=(p,t)=>{const o=[0,0,0];o[u]=p[0];o[v]=p[1];o[b]=t;return o;};const eps=Math.min(w.s[u]/w.cols,w.s[v]/w.rows)*1e-4;
  for(const c of polygons(w)){if(gone.has(`${c.c},${c.r}`))continue;const poly=c.poly;for(const side of [-1,1]){const n=[0,0,0];n[b]=side;faces.push({points:poly.map(p=>point(p,side*half)),n});}
    for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],du=q[0]-p[0],dv=q[1]-p[1],len=Math.hypot(du,dv);if(len<1e-9)continue;const nu=dv/len,nv=-du/len,x=(p[0]+q[0])/2+nu*eps,y=(p[1]+q[1])/2+nv*eps;const outside=Math.abs(x)>w.s[u]/2+1e-9||Math.abs(y)>w.s[v]/2+1e-9;const other=outside?null:nearestCell(w,x,y);if(!outside&&!gone.has(other.join(',')))continue;const n=[0,0,0];n[u]=nu;n[v]=nv;(outside?faces:cuts).push({points:[point(p,-half),point(q,-half),point(q,half),point(p,half)],n});}
  }return {faces,cuts};}
export function triangles(w,cells){const {faces,cuts}=boundary(w,cells),out=[];for(const f of [...faces,...cuts]){const p=f.points,a=p[0];for(let i=1;i<p.length-1;i++){let b=p[i],c=p[i+1];const x=b.map((v,j)=>v-a[j]),y=c.map((v,j)=>v-a[j]),n=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];if(n.reduce((s,v,j)=>s+v*f.n[j],0)<0)[b,c]=[c,b];out.push(...a,...b,...c);}}return out;}

export function collisionMesh(w,cells){const flat=triangles(w,cells),vertices=[],indices=[],keys=new Map();for(let i=0;i<flat.length;i+=9){const tri=[];for(let j=0;j<9;j+=3){const p=flat.slice(i+j,i+j+3),key=p.map(x=>Math.round(x*1e6)).join(',');if(!keys.has(key)){keys.set(key,vertices.length/3);vertices.push(...p);}tri.push(keys.get(key));}if(new Set(tri).size===3)indices.push(...tri);}return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};}
