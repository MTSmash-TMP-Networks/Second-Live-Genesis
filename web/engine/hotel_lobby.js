import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOBBY_LAYOUT as L, LOBBY_CAPACITY, lobbyDoor, roomHallTransform, patrolPose, advancePatrolClock } from './lobby_layout.js';
import { createCharacter, createHotelNpc, animateCharacter, disposeCharacter, normalizeCharacter } from './character.js';

const mat=(color,roughness=.82,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const cube=new THREE.BoxGeometry(1,1,1);
function mesh(g,geo,p,s,m){
 const o=new THREE.Mesh(geo,m);o.position.set(...p);o.scale.set(...s);g.add(o);return o;
}
const box=(g,p,s,m)=>mesh(g,cube,p,s,m);
// Build each architectural fixture once and share its merged geometry across
// the corridor. Bevelled silhouettes and real hardware are three-dimensional,
// but each material needs only one draw call per repeated assembly.
function fixture(name,materials,build){
 const groups=new Map(),root=new THREE.Group(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),v=new THREE.Vector3(),unit=new THREE.Vector3(1,1,1);
 root.name=name;
 const part=(key,geo,p,rotation=[0,0,0])=>{
  q.setFromEuler(new THREE.Euler(...rotation));matrix.compose(v.set(...p),q,unit);
  const g=geo.index?geo.toNonIndexed():geo;
  if(g!==geo)geo.dispose();
  g.applyMatrix4(matrix);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);
 };
 const block=(key,p,size,r=.004)=>part(key,new RoundedBoxGeometry(...size,2,Math.min(r,...size.map(x=>x*.23))),p);
 const cylinder=(key,p,r,h,rotation=[0,0,0],bottom=r)=>part(key,new THREE.CylinderGeometry(r,bottom,h,24),p,rotation);
 const tube=(key,points,r=.012)=>{
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  part(key,new THREE.TubeGeometry(curve,16,r,10,false),[0,0,0]);
 };
 build({part,block,cylinder,tube});
 for(const [key,geos] of groups){
  const geo=mergeGeometries(geos,false);for(const g of geos)g.dispose();
  if(!geo)throw Error('Hotel fixture geometry merge: '+key);
  geo.computeBoundingBox();geo.computeBoundingSphere();
  const o=new THREE.Mesh(geo,materials[key]);o.name=name+' / '+key;o.receiveShadow=true;root.add(o);
 }
 return root;
}
function hallFinishes(renderer){
 const oak=renderer.textured.oak_veneer_01;
 // Never alter the texture repeat or the material of furniture in guest rooms.
 const wood=(tint,fallback)=>{
  const m=oak?.map?oak.clone():mat(fallback,.68);
  if(oak?.map){
   m.color.set(tint);
   for(const key of ['map','normalMap','roughnessMap','aoMap']){
    if(m[key]){m[key]=m[key].clone();m[key].repeat.set(1,1.55);m[key].needsUpdate=true;}
   }
   m.normalScale.set(.22,.22);m.aoMapIntensity=.35;
  }
  m.roughness=.66;m.envMapIntensity=.48;return m;
 };
 return {
  veneer:wood(0xb49a80,0x79573e),jamb:wood(0x80674e,0x513c2d),
  edge:mat(0x49382c,.70),gasket:mat(0x242321,.91),
  satin:mat(0xbeb8ab,.36,.72),bronze:mat(0xb39566,.37,.65),
  reader:mat(0x303235,.46,.16),lens:mat(0x111b20,.20,.12),
  entry:mat(0x465252,.59,.26),frost:mat(0x7c999e,.45,.08),
  opal:new THREE.MeshStandardMaterial({color:0xffefd9,roughness:.49,emissive:0xffd7a3,emissiveIntensity:1.55}),
  spot:new THREE.MeshStandardMaterial({color:0xfff5e7,roughness:.43,emissive:0xffe5c2,emissiveIntensity:2.15}),
  white:mat(0xded9ce,.57),cavity:mat(0x44413b,.83)
 };
}
function roomDoorFixture(m){
 return fixture('Hotel room door assembly',m,({block,cylinder,tube})=>{
  // Local +Z faces the hall. The original 1.12 x 2.20 m interaction
  // aperture remains in lobby_layout.js; the casing sits outside its edges.
  block('gasket',[0,1.105,.012],[1.19,2.21,.025],.003);
  for(const x of [-.597,.597]){
   block('jamb',[x,1.115,.038],[.079,2.23,.095],.009);
   block('jamb',[x*1.061,1.13,.050],[.055,2.26,.046],.006);
   block('edge',[x*.938,1.097,.041],[.015,2.19,.057],.002);
  }
  block('jamb',[0,2.225,.039],[1.273,.070,.096],.009);
  block('jamb',[0,2.269,.051],[1.32,.036,.045],.005);
  // Actual narrow shadow gap around the solid flush, veneered fire-door leaf.
  block('veneer',[0,1.09,.046],[1.088,2.152,.060],.008);
  block('edge',[-.438,1.09,.077],[.005,2.105,.004],.001);
  block('edge',[.438,1.09,.077],[.005,2.105,.004],.001);
  block('satin',[0,.009,.042],[1.126,.018,.134],.003);
  // Electronic hotel lock, black card reader, metal escutcheon and
  // an actual rounded return-to-door lever, not a floating rectangular bar.
  block('satin',[.412,1.065,.091],[.084,.257,.034],.010);
  block('reader',[.412,1.151,.111],[.066,.068,.016],.007);
  block('lens',[.412,1.151,.120],[.046,.039,.006],.003);
  cylinder('satin',[.412,1.014,.126],.027,.027,[Math.PI/2,0,0]);
  tube('satin',[[.412,1.014,.139],[.406,1.014,.172],[.376,1.014,.178],[.292,1.014,.178],[.257,1.014,.169],[.253,1.014,.146]],.013);
  cylinder('bronze',[0,1.55,.087],.021,.018,[Math.PI/2,0,0]);
  cylinder('lens',[0,1.55,.098],.010,.008,[Math.PI/2,0,0]);
  block('bronze',[0,1.854,.090],[.50,.133,.019],.006);
 });
}
function wallSconceFixture(m){
 return fixture('Hotel wall sconce',m,({part,block,cylinder})=>{
  block('bronze',[0,0,.025],[.119,.385,.048],.012);
  block('bronze',[0,-.112,.085],[.052,.041,.132],.007);
  const profile=[[.001,-.149],[.065,-.149],[.075,-.126],[.078,-.097],[.078,.097],[.075,.126],[.065,.149],[.001,.149]].map(p=>new THREE.Vector2(...p));
  part('opal',new THREE.LatheGeometry(profile,24),[0,0,.155]);
  cylinder('bronze',[0,-.155,.155],.070,.021);
  cylinder('bronze',[0,.155,.155],.070,.021);
 });
}
function ceilingFixture(m){
 return fixture('Hotel recessed downlight',m,({part,cylinder})=>{
  cylinder('white',[0,-.012,0],.108,.028);
  cylinder('cavity',[0,-.027,0],.084,.010);
  part('satin',new THREE.TorusGeometry(.088,.006,8,32),[0,-.033,0],[Math.PI/2,0,0]);
  cylinder('spot',[0,-.031,0],.069,.008);
 });
}
function exitDoorFixture(m){
 return fixture('Free World double door assembly',m,({block,tube})=>{
  block('gasket',[0,1.20,.014],[1.94,2.40,.028],.006);
  for(const x of [-.956,.956])block('entry',[x,1.21,.055],[.089,2.42,.112],.007);
  block('entry',[0,2.39,.055],[2.0,.09,.112],.007);
  for(const x of [-.453,.453]){
   block('entry',[x,1.17,.063],[.882,2.31,.075],.008);
   block('gasket',[x,1.51,.106],[.664,1.225,.018],.008);
   block('frost',[x,1.51,.119],[.613,1.174,.012],.006);
   block('satin',[x,.145,.109],[.809,.233,.016],.003);
   for(const dx of [-.29,.29])block('reader',[x+dx,1.005,.125],[.067,.12,.035],.007);
   tube('satin',[[x-.29,1.005,.145],[x-.25,1.005,.180],[x+.25,1.005,.180],[x+.29,1.005,.145]],.021);
  }
  block('satin',[0,.010,.064],[1.86,.020,.15],.003);
 });
}
function assignNearestLights(pool,anchors,z){
 const nearest=anchors.slice().sort((a,b)=>Math.abs(a[2]-z)-Math.abs(b[2]-z)||a[2]-b[2]||a[0]-b[0]);
 for(let i=0;i<pool.length;i++){
  const a=nearest[i],l=pool[i];l.visible=!!a;
  if(a)l.position.set(...a);
 }
}
function labelTexture(value){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#23292d';ctx.fillRect(0,0,256,96);
 ctx.strokeStyle='#ae9665';ctx.lineWidth=3;ctx.strokeRect(3,3,250,90);
 ctx.font='500 '+(String(value).length>18?22:String(value).length>12?30:48)+'px sans-serif';ctx.fillStyle='#f7e8cb';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,128,51,232);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function plaque(g,text,p,yaw,w=.33,h=.124){
 const tex=labelTexture(text),m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});
 const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.set(...p);o.rotation.y=yaw;g.add(o);return o;
}
// A floating label is presentation only, not a selectable world surface.
// Sprite.raycast requires a camera even if the sprite or its parent is hidden.
// Explicitly exclude labels from all world-space geometry/interaction rays.
function nameTag(name,y,width,height){
 const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(name),depthTest:true,transparent:true}));
 tag.raycast=()=>{};
 tag.position.set(0,y,0);tag.scale.set(width,height,1);return tag;
}
function avatar(slot,profile){
 const g=createCharacter(profile?.avatar),name=profile?.nickname||'Gast '+lobbyDoor(slot).number;
 const tag=nameTag(name,2.03*g.userData.height,.83,.31);g.add(tag);g.userData.nameTag=tag;
 return g;
}
export class HotelLobbyView{
 constructor(renderer){
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x706c66);this.scene.fog=new THREE.Fog(0x706c66,27,55);
  this.scene.environment=renderer.scene?.environment||null;this.scene.environmentIntensity=.27;
  this.scene.add(new THREE.HemisphereLight(0xfff0d9,0x72685a,.83));
  const root=new THREE.Group();this.scene.add(root);this.root=root;this.guestRoot=new THREE.Group();this.scene.add(this.guestRoot);this.peers=new Map();this.own=null;this.wallSections=[];this.doorSections=[];this.projectedSlot=null;this.plaques=[];
  const carpet=renderer.textured.hotel_carpet.clone();carpet.color.set(0x8d9aa5);
  if(carpet.map){carpet.map=carpet.map.clone();carpet.map.repeat.set(2,Math.round(L.halfLength*2/2.6));carpet.map.needsUpdate=true;}
  const wall=renderer.textured.hotel_wall,wood=mat(0x40342d,.65),trim=mat(0x282a2a,.67),brass=mat(0xbca36d,.32,.68),ceiling=renderer.textured.hotel_ceiling;
  const finishes=hallFinishes(renderer),doorTemplate=roomDoorFixture(finishes),sconceTemplate=wallSconceFixture(finishes),downlightTemplate=ceilingFixture(finishes);
  this.wallLightAnchors=[];this.ceilingLightAnchors=[];
  const len=L.halfLength*2;
  box(root,[0,-.09,0],[L.halfWidth*2,.18,len],carpet);
  box(root,[0,L.height+.06,0],[L.halfWidth*2,.12,len],ceiling);
  for(const side of [-1,1]){
   const x=side*(L.halfWidth+.085),face=side*(L.halfWidth-.025);
   // The wall behind each room is its shared physical partition. Hide only
   // that section in the room projection, never the opposite wall.
   const segment=(a,b,slot=null)=>{
    if(b-a<.0001)return;
    const g=new THREE.Group();root.add(g);const z=(a+b)/2,n=b-a;
    g.wallSolid=box(g,[x,L.height/2,z],[.17,L.height,n],wall);
    box(g,[face,.07,z],[.04,.14,n],trim);
    box(g,[face,2.92,z],[.045,.09,n],wood);
    box(g,[face,2.82,z],[.028,.018,n],brass);
    if(slot!==null)this.wallSections[slot]=g;
   };
   let end=-L.halfLength;
   for(let i=0;i<L.roomsPerSide;i++){
    const slot=i+(side===1?L.roomsPerSide:0),d=lobbyDoor(slot),a=d.z-L.doorSpacing/2,b=d.z+L.doorSpacing/2;
    segment(end,a);segment(a,b,slot);end=b;
   }
   segment(end,L.halfLength);
  }
  for(const z of [-L.halfLength,L.halfLength]){
   box(root,[0,L.height/2,z],[L.halfWidth*2,L.height,.16],wall);
   if(z<0){
    const entry=exitDoorFixture(finishes);entry.position.z=z+.081;root.add(entry);
    box(root,[0,2.65,z+.115],[1.60,.25,.055],trim);
    this.plaques.push(plaque(root,'FREE WORLD',[0,2.65,z+.146],0,1.53,.218));
   }else{
    box(root,[0,1.35,z-Math.sign(z)*.10],[2.8,1.95,.08],wood);
    this.plaques.push(plaque(root,'HOTEL',[0,1.65,z-Math.sign(z)*.15],Math.PI,1.05,.39));
   }
  }
  this.signs=[];this.nameplates=[];this.roomNames=new Map();
  for(let slot=0;slot<LOBBY_CAPACITY;slot++){
   const d=lobbyDoor(slot),s=d.side,g=new THREE.Group();root.add(g);this.doorSections[slot]=g;
   g.name='Hotel entrance '+d.number;g.position.set(d.x,0,d.z);g.rotation.y=-s*Math.PI/2;
   g.add(doorTemplate.clone(true));
   // Small mounted number plate and existing per-guest occupancy indicator.
   box(g,[.885,1.66,.027],[.31,.128,.041],finishes.bronze);
   const marker=box(g,[.885,1.49,.034],[.082,.024,.026],mat(0x393b38,.6));
   this.signs.push(marker);
   this.plaques.push(plaque(g,String(d.number),[.885,1.66,.050],0,.29,.108));
   this.nameplates.push(plaque(g,'Frei',[0,1.854,.101],0,.478,.112));
   const lamp=sconceTemplate.clone(true);lamp.position.set(.885,2.26,0);g.add(lamp);
   this.wallLightAnchors.push([d.x-s*.225,2.26,d.z+s*.885]);
  }
  for(let z=-L.halfLength+3;z<L.halfLength;z+=3){
   const lamp=downlightTemplate.clone(true);lamp.position.set(0,L.height-.01,z);root.add(lamp);
   this.ceilingLightAnchors.push([0,L.height-.105,z]);
  }
  // Only a fixed number of actual lights are active. Their positions always
  // coincide with real nearby fixtures, including at both corridor ends.
  const pool=(count,color,intensity,distance)=>Array.from({length:count},()=>{
   const l=new THREE.PointLight(color,intensity,distance,2);l.castShadow=false;this.scene.add(l);return l;
  });
  this.ceilingLights=pool(7,0xffe4c7,26,8);
  this.wallLights=pool(4,0xffd5a1,14,5.5);
  this.lights=[...this.ceilingLights,...this.wallLights];
  this.lightCenter=null;this.updateLighting(0);
  this.local=null;
  this.npc=createHotelNpc();this.npc.name='KI-Hotelservice';this.npc.visible=false;this.npcTarget=null;this.npcClock=null;this.npcSampleAt=0;this.npcGreeting=0;
  const tag=nameTag('KI-Hotelservice',2.13,1.02,.35);this.npc.add(tag);this.npc.userData.nameTag=tag;
  this.guestRoot.add(this.npc);
 }
 syncNpc(p){
  if(!p||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)||!Number.isFinite(p.yaw)){
   this.npc.visible=false;this.npcTarget=null;this.npcClock=null;this.npcGreeting=0;this.npc.userData.hotelGreeting=0;return;
  }
  const timed=Number.isFinite(p.phase)&&p.phase>=0;
  if(timed&&this.npcTarget&&Number.isFinite(this.npcTarget.phase)&&p.phase<this.npcTarget.phase){
   // A delayed response cannot reverse the NPC. A restarted server resets its clock.
   if(this.npcTarget.phase-p.phase<5)return;
   this.npcClock=null;
  }
  if(timed){
   if(this.npcClock===null){this.npcClock=p.phase;const q=patrolPose(p.phase);this.npc.position.set(...q.position);this.npc.rotation.y=q.yaw;}
   this.npcSampleAt=performance.now();
  }else{
   this.npcClock=null;
   if(!this.npcTarget||this.npc.position.distanceTo(new THREE.Vector3(...p.position))>4){this.npc.position.set(...p.position);this.npc.rotation.y=p.yaw;}
  }
  this.npcTarget=p;this.npc.visible=true;
 }
 greetNpc(){this.npcGreeting=1.7;}
 stepNpc(dt,player){
  if(!this.npcTarget)return;
  const p=this.npcTarget,g=this.npc,t=1-Math.exp(-dt*12);
  let moving=p.walking!==false;
  if(this.npcClock!==null){
   const before=this.npcClock;
   this.npcClock=advancePatrolClock(before,p.phase,(performance.now()-this.npcSampleAt)/1000,Math.min(dt,.1));
   const pose=patrolPose(this.npcClock);
   g.position.set(...pose.position);g.rotation.y=pose.yaw;
   moving=pose.walking&&this.npcClock>before;
   g.userData.patrolPlayback=Math.max(.85,Math.min(1.15,(this.npcClock-before)/Math.max(.001,dt)));
  }else{
   g.position.lerp(new THREE.Vector3(...p.position),t);
   g.rotation.y+=Math.atan2(Math.sin(p.yaw-g.rotation.y),Math.cos(p.yaw-g.rotation.y))*t;
  }
  this.npcGreeting=Math.max(0,this.npcGreeting-dt);
  const u=g.userData;u.hotelGreeting=this.npcGreeting;
  animateCharacter(g,dt,moving,'walk');
  if(u.realistic)return; // Rocketbox plays its own native upper-body greeting.
  if(this.npcGreeting>0){
   const weight=Math.min(1,this.npcGreeting*4);
   // The procedural emergency fallback retains its old greeting.
   u.arms[1].rotation.z=.1+weight*.65;u.arms[1].rotation.x+=(-.4-u.arms[1].rotation.x)*weight*.35;u.elbows[1].rotation.x+=(-.9-u.elbows[1].rotation.x)*weight*.35;
   if(player){
    const yaw=Math.atan2(g.position.x-player.x,g.position.z-player.z);
    const angle=Math.atan2(Math.sin(yaw-g.rotation.y),Math.cos(yaw-g.rotation.y));
    u.head.rotation.y=weight*Math.max(-.7,Math.min(.7,angle));
   }
  }else g.userData.arms[1].rotation.z=.1;
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
   if(!a){const g=avatar(p.slot,p);g.position.set(...p.position);g.rotation.y=p.yaw;this.guestRoot.add(g);a={g,signature};this.peers.set(p.slot,a);}
   a.position=p.position;a.yaw=p.yaw;a.stance=['walk','sprint','crouch'].includes(p.stance)?p.stance:'walk';
  }
  for(const [slot,a] of this.peers)if(!seen.has(slot)){this.disposeAvatar(a.g);this.peers.delete(slot);}
 }
 updateLighting(z){
  if(!Number.isFinite(z)||this.lightCenter!==null&&Math.abs(z-this.lightCenter)<.25)return;
  this.lightCenter=z;
  assignNearestLights(this.ceilingLights,this.ceilingLightAnchors,z);
  assignNearestLights(this.wallLights,this.wallLightAnchors,z);
 }
 step(dt,player,third=false){
  if(player&&this.projectedSlot===null)this.updateLighting(player.z);
  for(const a of this.peers.values()){
   const g=a.g,d=Math.hypot(a.position[0]-g.position.x,a.position[2]-g.position.z),t=1-Math.exp(-dt*12);
   g.position.lerp(new THREE.Vector3(...a.position),t);const diff=Math.atan2(Math.sin(a.yaw-g.rotation.y),Math.cos(a.yaw-g.rotation.y));g.rotation.y+=diff*t;
   animateCharacter(g,dt,d>.035,a.stance);
  }
  this.stepNpc(dt,player);
  if(third&&this.own!==null){if(!this.local){this.local=avatar(this.own,this.profile);this.guestRoot.add(this.local);}this.local.visible=true;const moving=Math.hypot(this.local.position.x-player.x,this.local.position.z-player.z)>.005;this.local.position.set(player.x,player.y,player.z);this.local.rotation.y=player.yaw;animateCharacter(this.local,dt,moving,player.stance);}
  else if(this.local)this.local.visible=false;
 }
 // Share the exact corridor geometry and avatars between both scenes, not
 // a second approximation. Its own wall section is replaced by the room wall.
 projectInto(parent,slot){
  if(this.projectedSlot===slot&&this.root.parent===parent)return;
  this.restoreProjection();const t=roomHallTransform(slot);if(!t)return;
  this.projectedSlot=slot;
  for(const g of [this.root,this.guestRoot]){
   parent.add(g);g.position.set(...t.p);g.rotation.y=t.rotation;g.scale.set(1,1,t.mirror);
  }
  this.wallSections[slot].visible=false;this.doorSections[slot].visible=false;
  for(const p of [...this.plaques,...this.nameplates])p.scale.x=t.mirror;
  if(this.local)this.local.visible=false;
 }
 restoreProjection(){
  if(this.projectedSlot!==null){this.wallSections[this.projectedSlot].visible=true;this.doorSections[this.projectedSlot].visible=true;}
  for(const g of [this.root,this.guestRoot]){if(g.parent!==this.scene)this.scene.add(g);g.position.set(0,0,0);g.rotation.set(0,0,0);g.scale.set(1,1,1);}
  for(const p of [...this.plaques,...this.nameplates])p.scale.x=1;
  this.projectedSlot=null;
 }
 clear(){this.restoreProjection();this.sync([]);this.syncNpc(null);this.setOwn(null);this.setRooms([]);}
}
