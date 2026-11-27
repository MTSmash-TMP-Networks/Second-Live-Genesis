import * as THREE from 'three';
import {terrainHeight,terrainWater} from './free_terrain.js';

export const WEATHER_SECONDS=480;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const mod=(x,n)=>((x%n)+n)%n;
function hash(n){let x=Math.imul((n|0)^0x716b9,0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;}
// Cloud cover, rain intensity and thunder intensity. Continuous transitions
// through eight real-time minutes, synchronized to the server's wall clock.
const weatherKeys=[[0,.19,0,0],[78,.24,0,0],[128,.79,0,0],[164,.92,.65,0],
 [238,.95,.82,0],[264,1,1,1],[342,1,1,1],[372,.89,.56,0],
 [411,.66,0,0],[458,.22,0,0],[480,.19,0,0]];
const strikeTimes=[270,284,301,316,334];
export function freeWeatherState(seconds){
 const time=Number.isFinite(seconds)?seconds:0,cycle=Math.floor(time/WEATHER_SECONDS),phase=mod(time,WEATHER_SECONDS);
 let a=weatherKeys[0],b=weatherKeys[1];
 for(let i=1;i<weatherKeys.length;i++){b=weatherKeys[i];a=weatherKeys[i-1];if(phase<=b[0])break;}
 const t=smooth(clamp((phase-a[0])/(b[0]-a[0]))),cloud=mix(a[1],b[1],t),rain=mix(a[2],b[2],t),storm=mix(a[3],b[3],t);
 let strike=null,flash=0;
 for(let i=0;i<strikeTimes.length;i++){
  const seed=(cycle*31+i)|0,when=strikeTimes[i]+(hash(seed)-.5)*4,age=phase-when;
  if(age<0||age>4)continue;
  strike={id:cycle+':'+i,age,seed,x:mix(-134,134,hash(seed+77)),z:mix(-134,134,hash(seed+151))};
  // One short, softly decaying light pulse; never a repeating strobe.
  flash=age<.42?Math.sin(Math.PI*clamp(age/.42))*.78:0;
 }
 return {cloud,rain,storm,flash,strike,label:storm>.28?'Gewitter':rain>.035?'Regen':cloud>.50?'Bewölkt':'Heiter'};
}
export class WeatherClock{
 constructor(){this.reset();}
 reset(){this.epoch=null;this.received=0;this.last=-Infinity;}
 sync(seconds,now){
  if(!Number.isFinite(seconds)||!Number.isFinite(now))return;
  const predicted=this.epoch===null?seconds:this.epoch+Math.max(0,now-this.received)/1000;
  const error=seconds-predicted;
  this.epoch=Math.abs(error)>2?seconds:predicted+clamp(error*.2,-.06,.06);
  this.received=now;
 }
 time(now){if(this.epoch===null)return 0;const seconds=this.epoch+Math.max(0,now-this.received)/1000;this.last=Math.max(this.last,seconds);return this.last;}
}
// Spatially indexed vertical shelter tests use the same solid prisms as the
// rest of the world, including repaired/destroyed roofs and custom blocks.
export class RainShelter{
 constructor(bounds,ray,half=150){this.bounds=bounds;this.ray=ray;this.half=half;this.bins=new Map();this.cache=new Map();}
 set(rows){
  this.bins.clear();this.cache.clear();
  for(const row of rows||[]){
   if((row.hp??100)<=0)continue;
   const [p,s]=this.bounds(row);if(p[1]+s[1]<.20)continue;
   for(let ix=Math.floor(p[0]/6);ix<=Math.floor((p[0]+s[0])/6);ix++)for(let iz=Math.floor(p[2]/6);iz<=Math.floor((p[2]+s[2])/6);iz++){
    const k=ix+':'+iz;if(!this.bins.has(k))this.bins.set(k,[]);this.bins.get(k).push(row);
   }
  }
 }
 height(x,z,exact=false){
  if(!exact){x=Math.floor(x*2)/2+.25;z=Math.floor(z*2)/2+.25;}
  if(Math.abs(x)>this.half||Math.abs(z)>this.half)return 0;
  const key=x+':'+z;if(!exact&&this.cache.has(key))return this.cache.get(key);
  const rows=this.bins.get(Math.floor(x/6)+':'+Math.floor(z/6))||[];
  const hit=rows.length?this.ray([x,36,z],[0,-1,0],rows,36):null;
  const h=hit?Math.max(0,36-hit.dist):0;
  if(!exact){if(this.cache.size>=8192)this.cache.clear();this.cache.set(key,h);}
  return h;
 }
}
const cloudVertex='varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const cloudFragment=`
varying vec3 vDir;
uniform float clock;
uniform float cover;
uniform float storm;
uniform float daylight;
uniform float twilight;
uniform float flash;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=0.52,v=0.0;mat2 turn=mat2(0.8,-0.6,0.6,0.8);for(int i=0;i<5;i++){v+=a*noise2(p);p=turn*p*2.05+vec2(3.1,1.7);a*=0.49;}return v;}
void main(){
 vec3 d=normalize(vDir);
 if(d.y<0.015)discard;
 vec2 p=d.xz/(d.y+0.22)*2.4+vec2(clock*0.006,-clock*0.0025);
 float n=fbm(p),detail=fbm(p*2.2+vec2(4.,8.));
 float threshold=mix(0.69,0.25,cover);
 float alpha=smoothstep(threshold-0.075,threshold+0.085,n+0.07*detail);
 alpha*=smoothstep(0.015,0.14,d.y);
 float shade=clamp(0.54+0.65*(n-detail*0.45),0.0,1.0);
 vec3 night=mix(vec3(0.045,0.061,0.09),vec3(0.17,0.22,0.30),shade);
 vec3 day=mix(vec3(0.59,0.67,0.75),vec3(0.98,0.97,0.94),shade);
 day=mix(day,mix(vec3(0.20,0.25,0.32),vec3(0.49,0.54,0.59),shade),storm);
 vec3 color=mix(night,day,daylight);
 color=mix(color,vec3(0.92,0.57,0.38),twilight*daylight*0.26*(1.0-storm));
 color+=vec3(0.24,0.30,0.38)*flash;
 gl_FragColor=vec4(color,alpha*mix(0.88,0.99,cover));
}`;
export class FreeWeather{
 constructor(scene,sky,bounds,ray){
  this.clock=new WeatherClock();this.shelter=new RainShelter(bounds,ray);this.state=freeWeatherState(0);
  const uniforms={clock:{value:0},cover:{value:.19},storm:{value:0},daylight:{value:1},twilight:{value:0},flash:{value:0}};
  this.clouds=new THREE.Mesh(new THREE.SphereGeometry(380,32,24),new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,toneMapped:false,uniforms,vertexShader:cloudVertex,fragmentShader:cloudFragment}));
  this.clouds.name='Procedural cloud layer';this.clouds.renderOrder=-8;sky.add(this.clouds);
  this.count=1400;this.drops=Array.from({length:this.count},(_,i)=>[hash(i*7+1),hash(i*7+2),hash(i*7+3),hash(i*7+4)]);
  this.positions=new Float32Array(this.count*6);
  this.rainGeometry=new THREE.BufferGeometry();this.rainGeometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  this.rainGeometry.setDrawRange(0,0);
  this.rain=new THREE.LineSegments(this.rainGeometry,new THREE.LineBasicMaterial({color:0xbdd8eb,transparent:true,opacity:.32,depthWrite:false}));
  this.rain.name='Local rain streaks';this.rain.frustumCulled=false;this.rain.visible=false;this.rain.renderOrder=5;scene.add(this.rain);
  this.boltPositions=new Float32Array(22*6);this.boltGeometry=new THREE.BufferGeometry();
  this.boltGeometry.setAttribute('position',new THREE.BufferAttribute(this.boltPositions,3).setUsage(THREE.DynamicDrawUsage));
  this.boltGeometry.setDrawRange(0,0);this.bolt=new THREE.LineSegments(this.boltGeometry,new THREE.LineBasicMaterial({color:0xd7e9ff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
  this.bolt.name='Distant cloud lightning';this.bolt.frustumCulled=false;this.bolt.visible=false;this.bolt.renderOrder=2;scene.add(this.bolt);
  this.boltId=null;this.thunderId=null;
 }
 setObstacles(rows){this.shelter.set(rows);}
 sync(seconds,now){this.clock.sync(seconds,now);}
 clear(){this.clock.reset();this.shelter.set([]);this.state=freeWeatherState(0);this.rain.visible=false;this.bolt.visible=false;this.boltId=null;this.thunderId=null;this.rainGeometry.setDrawRange(0,0);this.boltGeometry.setDrawRange(0,0);}
 makeBolt(strike){
  const points=[],seed=strike.seed,start=[strike.x,137,strike.z];let last=start;
  for(let i=1;i<=14;i++){
   const next=[strike.x+(hash(seed+201+i*3)-.5)*17,137-i*6.2,strike.z+(hash(seed+202+i*3)-.5)*12];
   points.push(...last,...next);
   if(i===4||i===8){let p=next;for(let j=1;j<=4;j++){const q=[next[0]+j*(i===4?3.4:-3.1)+(hash(seed+i*9+j)-.5)*3,next[1]-j*4.2,next[2]+j*1.8];points.push(...p,...q);p=q;}}
   last=next;
  }
  this.boltPositions.set(points);this.boltGeometry.attributes.position.needsUpdate=true;this.boltGeometry.setDrawRange(0,points.length/3);this.boltId=strike.id;
 }
 update(now,player,sky){
  const time=this.clock.time(now),w=freeWeatherState(time),u=this.clouds.material.uniforms;
  u.clock.value=mod(time,86400);u.cover.value=w.cloud;u.storm.value=w.storm;u.daylight.value=sky.day;u.twilight.value=sky.twilight;u.flash.value=w.flash;
  const count=Math.round(this.count*w.rain),range=36,high=23,base=Math.max(0,player.y-3);
  const omega=2*Math.PI/WEATHER_SECONDS,angle=mod(time,WEATHER_SECONDS)*omega;
  // Integrate the wind over time instead of multiplying a changing speed by
  // the Unix epoch, which would make drops teleport during weather transitions.
  const wind=2.35-1.25*Math.cos(angle),travel=2.35*time-1.25*Math.sin(angle)/omega;
  let n=0;
  this.rain.visible=count>0;
  if(count){
   for(let i=0;i<count;i++){
    const [a,b,c,d]=this.drops[i],speed=11+6*d;
    const x=player.x+mod(a*range+travel-player.x,range)-range/2,z=player.z+mod(b*range-time*.55-player.z,range)-range/2;
    if(Math.abs(x)>150||Math.abs(z)>150)continue;
    const y=base+mod(c*high-time*speed,high),roof=Math.max(this.shelter.height(x,z),terrainHeight(this.terrain,x,z),terrainWater(this.terrain,x,z));
    if(y<roof+.035)continue;
    const length=.23+.32*d;
    this.positions.set([x,y,z,x-wind/speed*length,y+length,z+.55/speed*length],n*6);n++;
   }
   this.rainGeometry.attributes.position.needsUpdate=true;
  }
  this.rainGeometry.setDrawRange(0,n*2);
  this.rain.material.opacity=(.20+.29*w.rain)*(0.62+.38*sky.day);
  this.bolt.visible=!!w.strike&&w.strike.age<.42;
  if(this.bolt.visible){if(this.boltId!==w.strike.id)this.makeBolt(w.strike);this.bolt.material.opacity=clamp(w.flash*1.25);}
  const sheltered=this.shelter.height(player.x,player.z,true)>player.y+1.65+.08;
  let thunder=false;
  if(w.strike){const delay=.7+Math.min(1.25,Math.hypot(player.x-w.strike.x,player.z-w.strike.z)/150);
   if(w.strike.id!==this.thunderId&&w.strike.age>=delay&&w.strike.age<delay+.55){this.thunderId=w.strike.id;thunder=true;}
  }
  this.state={...w,sheltered,thunder};return this.state;
 }
}
