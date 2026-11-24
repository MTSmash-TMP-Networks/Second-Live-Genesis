// Smooth procedural avatar skin: union of rounded organic forms, tessellated
// once at loading time. This is a visual game mesh, not an anatomical scan.
const mix=(a,b,t)=>a+(b-a)*t;
function smoothMin(a,b,k){const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;}
function sdf(shape,p){
  if(shape.kind==='ellipsoid'){
    const q=p.map((x,i)=>x-shape.p[i]),s=shape.s;
    const a=Math.hypot(...q.map((x,i)=>x/s[i])),b=Math.hypot(...q.map((x,i)=>x/(s[i]*s[i])));
    return b>1e-9?a*(a-1)/b:-Math.min(...s);
  }
  const q=p.map((x,i)=>x-shape.a[i]),d=shape.b.map((x,i)=>x-shape.a[i]);
  const h=Math.max(0,Math.min(1,q.reduce((sum,x,i)=>sum+x*d[i],0)/Math.max(1e-10,d.reduce((sum,x)=>sum+x*x,0))));
  return Math.hypot(...q.map((x,i)=>x-h*d[i]))-shape.r;
}
export function skinMeshData(shapes,step=.003){
  if(!shapes.length)throw Error('Leere Avatarhand');
  const blend=.0045,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const s of shapes)for(let i=0;i<3;i++){
    const a=s.kind==='ellipsoid'?s.p[i]-s.s[i]:Math.min(s.a[i],s.b[i])-s.r;
    const b=s.kind==='ellipsoid'?s.p[i]+s.s[i]:Math.max(s.a[i],s.b[i])+s.r;
    lo[i]=Math.min(lo[i],a-blend*2);hi[i]=Math.max(hi[i],b+blend*2);
  }
  step=Math.max(step,...hi.map((x,i)=>(x-lo[i])/86));
  const dims=hi.map((x,i)=>Math.ceil((x-lo[i])/step)+1),[nx,ny,nz]=dims;
  const field=p=>{let d=sdf(shapes[0],p);for(let i=1;i<shapes.length;i++)d=smoothMin(d,sdf(shapes[i],p),blend);return d;};
  const grid=new Float32Array(nx*ny*nz),at=(x,y,z)=>x+nx*(y+ny*z),point=id=>[lo[0]+(id%nx)*step,lo[1]+(Math.floor(id/nx)%ny)*step,lo[2]+Math.floor(id/(nx*ny))*step];
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const id=at(x,y,z);grid[id]=field(point(id));}
  const positions=[],normals=[],colors=[],indices=[],cache=new Map();
  const vertex=(a,b)=>{
    const key=a<b?`${a}:${b}`:`${b}:${a}`;if(cache.has(key))return cache.get(key);
    const pa=point(a),pb=point(b),f=grid[a]/(grid[a]-grid[b]),p=pa.map((x,i)=>mix(x,pb[i],f));
    const e=step*.35,n=p.map((x,i)=>{const p0=[...p],p1=[...p];p0[i]=x-e;p1[i]=x+e;return field(p1)-field(p0);});const length=Math.hypot(...n)||1;
    const id=positions.length/3;positions.push(...p);normals.push(...n.map(x=>x/length));
    const shade=.93+.06*Math.sin(p[0]*113+p[1]*61)*Math.sin(p[2]*137-p[1]*49);colors.push(1,shade,shade*.97);cache.set(key,id);return id;
  };
  function triangle(a,b,c){
    if(a===b||b===c||a===c)return;const p=positions.slice(a*3,a*3+3),u=positions.slice(b*3,b*3+3).map((x,i)=>x-p[i]),v=positions.slice(c*3,c*3+3).map((x,i)=>x-p[i]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(Math.hypot(...cross)<1e-12)return;
    const dot=cross.reduce((sum,x,i)=>sum+x*(normals[a*3+i]+normals[b*3+i]+normals[c*3+i]),0);indices.push(...(dot>=0?[a,b,c]:[a,c,b]));
  }
  const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
    const cube=[at(x,y,z),at(x+1,y,z),at(x+1,y+1,z),at(x,y+1,z),at(x,y,z+1),at(x+1,y,z+1),at(x+1,y+1,z+1),at(x,y+1,z+1)];
    if(cube.every(i=>grid[i]>=0)||cube.every(i=>grid[i]<0))continue;
    for(const tet of tets){const inside=[],outside=[];for(const t of tet){const id=cube[t];(grid[id]<0?inside:outside).push(id);}
      if(inside.length===1)triangle(...outside.map(b=>vertex(inside[0],b)));
      else if(outside.length===1)triangle(...inside.map(a=>vertex(a,outside[0])));
      else if(inside.length===2){const a=vertex(inside[0],outside[0]),b=vertex(inside[0],outside[1]),c=vertex(inside[1],outside[1]),d=vertex(inside[1],outside[0]);triangle(a,b,c);triangle(a,c,d);}
    }
  }
  return {positions,normals,colors,indices};
}
