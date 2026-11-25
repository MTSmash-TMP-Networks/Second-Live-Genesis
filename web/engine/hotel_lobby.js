import * as THREE from 'three';
import { LOBBY_LAYOUT as L, LOBBY_CAPACITY, lobbyDoor } from './lobby_layout.js';
import { createCharacter, animateCharacter, disposeCharacter, normalizeCharacter } from './character.js';

const mat=(color,roughness=.82,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const cube=new THREE.BoxGeometry(1,1,1);
function mesh(g,geo,p,s,m){
 const o=new THREE.Mesh(geo,m);o.position.set(...p);o.scale.set(...s);g.add(o);return o;
}
const box=(g,p,s,m)=>mesh(g,cube,p,s,m);
function labelTexture(value){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#23292d';ctx.fillRect(0,0,256,96);
 ctx.strokeStyle='#ae9665';ctx.lineWidth=3;ctx.strokeRect(3,3,250,90);
 ctx.font='500 '+(String(value).length>18?22:String(value).length>12?30:48)+'px sans-serif';ctx.fillStyle='#f7e8cb';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,128,51);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function plaque(g,text,p,yaw,w=.33,h=.124){
 const tex=labelTexture(text),m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});
 const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.set(...p);o.rotation.y=yaw;g.add(o);return o;
}
function avatar(slot,profile){
 const g=createCharacter(profile?.avatar),name=profile?.nickname||'Gast '+lobbyDoor(slot).number;
 const nameMap=labelTexture(name),tag=new THREE.Sprite(new THREE.SpriteMaterial({map:nameMap,depthTest:true,transparent:true}));tag.position.set(0,2.03*g.userData.height,0);tag.scale.set(.83,.31,1);g.add(tag);
 return g;
}
export class HotelLobbyView{
 constructor(renderer){
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x706c66);this.scene.fog=new THREE.Fog(0x706c66,27,55);
  this.scene.add(new THREE.HemisphereLight(0xfff0d9,0x72685a,1.65));
  const root=new THREE.Group();this.scene.add(root);this.root=root;this.peers=new Map();this.own=null;
  const carpet=renderer.textured.hotel_carpet.clone();carpet.color.set(0x8d9aa5);
  if(carpet.map){carpet.map=carpet.map.clone();carpet.map.repeat.set(2,16);carpet.map.needsUpdate=true;}
  const wall=renderer.textured.hotel_wall,wood=mat(0x40342d,.65),panel=mat(0x786d60,.89),trim=mat(0x282a2a,.67),brass=mat(0xbca36d,.32,.68),door=mat(0x514438,.62),ceiling=renderer.textured.hotel_ceiling,lightmat=new THREE.MeshStandardMaterial({color:0xffebce,emissive:0xffd49a,emissiveIntensity:1.9,roughness:.6});
  const len=L.halfLength*2;
  box(root,[0,-.09,0],[L.halfWidth*2,.18,len],carpet);
  box(root,[0,L.height+.06,0],[L.halfWidth*2,.12,len],ceiling);
  for(const side of [-1,1]){
   const x=side*(L.halfWidth+.085),face=side*(L.halfWidth-.025);
   box(root,[x,L.height/2,0],[.17,L.height,len],wall);
   box(root,[face,.07,0],[.04,.14,len],trim);
   box(root,[face,2.77,0],[.045,.09,len],wood);
   box(root,[face,2.67,0],[.028,.018,len],brass);
  }
  for(const z of [-L.halfLength,L.halfLength]){
   box(root,[0,L.height/2,z],[L.halfWidth*2,L.height,.16],wall);
   box(root,[0,1.35,z-Math.sign(z)*.10],[2.8,1.95,.08],wood);
   plaque(root,'HOTEL',[0,1.65,z-Math.sign(z)*.15],z<0?0:Math.PI,1.05,.39);
  }
  this.signs=[];this.nameplates=[];this.roomNames=new Map();
  for(let slot=0;slot<LOBBY_CAPACITY;slot++){
   const d=lobbyDoor(slot),s=d.side,x=d.x-s*.045,z=d.z;
   box(root,[x,1.1,z],[.095,2.20,1.27],trim);
   box(root,[x-s*.058,1.085,z],[.05,2.10,1.07],door);
   for(const zz of [z-.39,z+.39])box(root,[x-s*.09,1.08,zz],[.022,1.98,.015],wood);
   box(root,[x-s*.09,1.08,z+.36],[.035,.16,.055],brass);
   box(root,[x-s*.122,1.12,z+.29],[.048,.03,.16],brass);
   const marker=box(root,[x-s*.075,1.47,z+.79],[.04,.06,.06],mat(0x393b38,.6));
   this.signs.push(marker);
   plaque(root,String(d.number),[x-s*.075,1.66,z+.83],-s*Math.PI/2,.32,.12);
   this.nameplates.push(plaque(root,'Frei',[x-s*.10,1.86,z],-s*Math.PI/2,.88,.29));
   // Repeating warm wall sconces above the room-number panels.
   box(root,[x-s*.05,2.25,z+1.02],[.12,.36,.15],brass);
   box(root,[x-s*.115,2.25,z+1.02],[.09,.26,.13],lightmat);
  }
  for(let z=-18;z<=18;z+=3){
   box(root,[0,2.817,z],[.54,.025,.20],lightmat);
   box(root,[0,2.835,z],[.64,.035,.30],trim);
  }
  // Bounded number of lights; no shadow-map cost in the public area.
  for(let z=-18;z<=18;z+=6){const l=new THREE.PointLight(0xffdfb6,17,8,2);l.position.set(0,2.57,z);this.scene.add(l);}
  this.local=null;
 }
 setOwn(slot,profile=null){
  this.own=slot;this.profile=profile;
  for(let i=0;i<this.signs.length;i++){const m=this.signs[i].material;m.color.set(i===slot?0x71e0b4:0x393b38);m.emissive.set(i===slot?0x1c8663:0x000000);}
  if(this.local){this.disposeAvatar(this.local);this.local=null;}
 }
 disposeAvatar(g){disposeCharacter(g);}
 setRooms(rooms){
  const next=new Map((Array.isArray(rooms)?rooms:[]).filter(r=>lobbyDoor(r.slot)&&typeof r.nickname==='string').map(r=>[r.slot,r.nickname.slice(0,24)]));
  for(let slot=0;slot<this.nameplates.length;slot++){
   const old=this.roomNames.get(slot)||'Frei',name=next.get(slot)||'Frei';if(old===name)continue;
   const m=this.nameplates[slot].material;m.map.dispose();m.map=labelTexture(name);m.needsUpdate=true;
  }
  this.roomNames=next;
 }
 sync(peers){
  const seen=new Set();
  for(const p of peers){
   if(!lobbyDoor(p.slot)||p.slot===this.own||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)||!Number.isFinite(p.yaw))continue;
   seen.add(p.slot);let a=this.peers.get(p.slot);const signature=JSON.stringify([p.nickname,normalizeCharacter(p.avatar)]);
   if(a&&a.signature!==signature){this.disposeAvatar(a.g);a=null;}
   if(!a){const g=avatar(p.slot,p);g.position.set(...p.position);g.rotation.y=p.yaw;this.scene.add(g);a={g,signature};this.peers.set(p.slot,a);}
   a.position=p.position;a.yaw=p.yaw;
  }
  for(const [slot,a] of this.peers)if(!seen.has(slot)){this.disposeAvatar(a.g);this.peers.delete(slot);}
 }
 step(dt,player,third=false){
  for(const a of this.peers.values()){
   const g=a.g,d=Math.hypot(a.position[0]-g.position.x,a.position[2]-g.position.z),t=1-Math.exp(-dt*12);
   g.position.lerp(new THREE.Vector3(...a.position),t);const diff=Math.atan2(Math.sin(a.yaw-g.rotation.y),Math.cos(a.yaw-g.rotation.y));g.rotation.y+=diff*t;
   animateCharacter(g,dt,d>.035);
  }
  if(third&&this.own!==null){if(!this.local){this.local=avatar(this.own,this.profile);this.scene.add(this.local);}this.local.visible=true;this.local.position.set(player.x,player.y,player.z);this.local.rotation.y=player.yaw;}
  else if(this.local)this.local.visible=false;
 }
 clear(){this.sync([]);this.setOwn(null);this.setRooms([]);}
}
