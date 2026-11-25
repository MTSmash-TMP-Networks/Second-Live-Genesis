// DeviceOrientation Z-X-Y convention, portrait rear camera. World axes east/up/north.
export const angleDiff=(a,b)=>((a-b+540)%360)-180;
export function angles(alpha,beta,gamma){
 if(![alpha,beta,gamma].every(Number.isFinite))return null;
 const rad=Math.PI/180,a=alpha*rad,b=beta*rad,g=gamma*rad;
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
 const x=-ca*sg-sa*sb*cg,z=-sa*sg+ca*sb*cg,y=-cb*cg;
 const yaw=Math.atan2(x,z),pitch=Math.asin(Math.max(-1,Math.min(1,y)));
 const up=[-sa*cb,sb,ca*cb],right=[Math.cos(yaw),0,-Math.sin(yaw)],vertical=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
 const dot=(v,w)=>v.reduce((s,n,i)=>s+n*w[i],0);
 return {yaw:(yaw/rad+360)%360,pitch:pitch/rad,roll:Math.atan2(dot(up,right),dot(up,vertical))/rad};
}
export function aligned(p,target){return Math.abs(angleDiff(target[0],p.yaw))<=8&&Math.abs(target[1]-p.pitch)<=10&&Math.abs(p.roll)<=12;}
