// The server sends the exact centimetre heightfield used for collision.
// Triangulation is identical for surface queries, rendering and placement.
import * as THREE from 'three';
export function validTerrain(doc){
 return !!doc&&doc.version===1&&doc.half===150&&doc.step===2&&Array.isArray(doc.heights)&&doc.heights.length===151*151;
}
export function terrainHeight(doc,x,z){
 if(!doc)return 0;
 const {half:h,step:s,heights:a}=doc,n=Math.round(h*2/s)+1;
 const u=Math.max(0,Math.min(n-1,(x+h)/s)),v=Math.max(0,Math.min(n-1,(z+h)/s)),i=Math.min(n-2,Math.floor(u)),j=Math.min(n-2,Math.floor(v)),f=u-i,g=v-j,k=j*n+i;
 const A=a[k],B=a[k+1],C=a[k+n],D=a[k+n+1];
 return (f+g<=1?A+(B-A)*f+(C-A)*g:D+(C-D)*(1-f)+(B-D)*(1-g))/100;
}
export function terrainWater(doc,x,z){
 if(!doc)return 0;
 for(const l of doc.lakes||[])if(Math.hypot((x-l.x)/l.rx,(z-l.z)/l.rz)<1&&terrainHeight(doc,x,z)<l.level-.025)return l.level;
 return 0;
}
export function terrainMaxHeight(doc,b,s){
 if(!doc)return 0;
 const {half:h,step:d}=doc,n=Math.round(2*h/d)+1,xs=[b[0],b[0]+s[0]],zs=[b[2],b[2]+s[2]];
 for(let i=Math.max(0,Math.ceil((b[0]+h)/d));i<=Math.min(n-1,Math.floor((b[0]+s[0]+h)/d));i++)xs.push(i*d-h);
 for(let j=Math.max(0,Math.ceil((b[2]+h)/d));j<=Math.min(n-1,Math.floor((b[2]+s[2]+h)/d));j++)zs.push(j*d-h);
 let result=0;const sample=(x,z)=>{result=Math.max(result,terrainHeight(doc,x,z));};
 for(const x of xs)for(const z of zs)sample(x,z);
 for(const x of [b[0],b[0]+s[0]]){
  const q=(x+h)/d,f=q-Math.floor(q);
  for(let j=Math.max(0,Math.floor((b[2]+h)/d));j<=Math.min(n-2,Math.floor((b[2]+s[2]+h)/d));j++){const z=-h+(j+1-f)*d;if(z>=b[2]&&z<=b[2]+s[2])sample(x,z);}
 }
 for(const z of [b[2],b[2]+s[2]]){
  const q=(z+h)/d,f=q-Math.floor(q);
  for(let i=Math.max(0,Math.floor((b[0]+h)/d));i<=Math.min(n-2,Math.floor((b[0]+s[0]+h)/d));i++){const x=-h+(i+1-f)*d;if(x>=b[0]&&x<=b[0]+s[0])sample(x,z);}
 }
 return result;
}
export function terrainRay(doc,origin,direction,limit){
 if(!doc)return null;
 const point=t=>origin.map((v,i)=>v+direction[i]*t),gap=t=>{const [x,y,z]=point(t);return y-terrainHeight(doc,x,z);};
 if(gap(0)<=0)return null;
 let prev=0;const n=Math.max(1,Math.ceil(limit/.5));
 for(let i=1;i<=n;i++){
  const t=limit*i/n;if(gap(t)<=0){
   let lo=prev,hi=t;for(let j=0;j<12;j++){const mid=(lo+hi)*.5;if(gap(mid)>0)lo=mid;else hi=mid;}
   const p=point(hi);if(Math.abs(p[0])>doc.half+.001||Math.abs(p[2])>doc.half+.001)return null;
   p[1]=terrainHeight(doc,p[0],p[2]);
   return {dist:hi,point:p,normal:[0,1,0],terrain:true};
  }prev=t;
 }
 return null;
}
export function terrainGeometry(doc){
 const {half:h,step:s}=doc,n=Math.round(h*2/s)+1,pos=[],uv=[],colors=[],indices=[];
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=-h+i*s,z=-h+j*s,y=doc.heights[j*n+i]/100;
  pos.push(x,y,z);uv.push((x+h)/5,(z+h)/5);
  const slope=Math.hypot(terrainHeight(doc,x+1,z)-terrainHeight(doc,x-1,z),terrainHeight(doc,x,z+1)-terrainHeight(doc,x,z-1))/2;
  const stone=Math.max(0,Math.min(1,(slope-.27)*2.2+(y-11)*.045)),shade=.87+.075*Math.sin(x*.13+z*.08)+.035*Math.cos(z*.43-x*.27);
  colors.push(shade*(1-.09*stone),shade*(1-.25*stone),shade*(1-.12*stone));
  if(i<n-1&&j<n-1){const a=j*n+i;indices.push(a,a+n,a+1,a+1,a+n,a+n+1);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export function trailGeometry(doc,path){
 // Follow the heightfield with a narrow, softly curving ribbon.
 const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(p[0],0,p[1])),false,'centripetal'),n=Math.ceil(curve.getLength()*3);
 const pos=[],uv=[],indices=[];
 for(let i=0;i<=n;i++){
  const p=curve.getPointAt(i/n),t=curve.getTangentAt(i/n),w=.85+.17*Math.sin(i*.21);
  for(const side of [-1,0,1]){
   const x=p.x+t.z*w*side,z=p.z-t.x*w*side;pos.push(x,terrainHeight(doc,x,z)+.065,z);uv.push((side+1)*.5,i*.24);
  }
  if(i<n)for(let j=0;j<2;j++){const a=i*3+j;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
// Clip the water surface to the submerged terrain triangles. No rectangular
// blue plane sticking out through a bank.
export function lakeGeometry(doc,lake){
 const {half:h,step:s}=doc,n=Math.round(h*2/s)+1,pos=[],uv=[];
 const level=lake.level,loX=Math.max(0,Math.floor((lake.x-lake.rx+h)/s)),hiX=Math.min(n-2,Math.ceil((lake.x+lake.rx+h)/s)),loZ=Math.max(0,Math.floor((lake.z-lake.rz+h)/s)),hiZ=Math.min(n-2,Math.ceil((lake.z+lake.rz+h)/s));
 const clip=tri=>{
  const out=[];
  for(let i=0;i<3;i++){
   const a=tri[i],b=tri[(i+1)%3],ia=a[1]<level,ib=b[1]<level;
   if(ia)out.push(a);
   if(ia!==ib){const f=(level-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*f,level,a[2]+(b[2]-a[2])*f]);}
  }
  for(let i=1;i+1<out.length;i++)for(const p of [out[0],out[i],out[i+1]]){pos.push(p[0],level+.006,p[2]);uv.push(p[0]*.12,p[2]*.12);}
 };
 const vertex=(i,j)=>[-h+i*s,doc.heights[j*n+i]/100,-h+j*s];
 for(let j=loZ;j<=hiZ;j++)for(let i=loX;i<=hiX;i++){
  const x=-h+(i+.5)*s,z=-h+(j+.5)*s;
  if(Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)>.95)continue;
  const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1),d=vertex(i+1,j+1);clip([a,c,b]);clip([b,c,d]);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
