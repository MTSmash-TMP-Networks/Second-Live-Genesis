import { RoomRenderer, RoomPhysics, HOTEL_LAYOUT, DECOR, WALLS, REMOVED, cellBox, solidRuns, solidContains, solidRay, floorSupported, PORTAL_SIDES } from './engine/renderer.bundle.js';
import { GameAudio } from './audio.js';
const audio=new GameAudio();
const $=id=>document.getElementById(id), canvas=$('world');
let renderer=null, physicsWorld=null, graphicsReady=false;
let equipped=null, xrEntering=false, xrReturnFirst=true;
const weaponIds=['pistol','rifle','m16'];
const clipSize={pistol:12,rifle:18,m16:24}; // fictional game balance, not real weapon specifications
const ammo={...clipSize};let reloadLeft=0,reloadId=null;
const RELOAD_TIME=1.05;
// Fictional arcade cadence; wait for each server mutation before another.
let triggerHeld=false,triggerPointer=null,fireCooldown=0;
const AUTO_INTERVAL=.16;
function releaseTrigger(){triggerHeld=false;triggerPointer=null;}
function pressTrigger(){if(!canPlay())return;triggerHeld=equipped==='m16';fire();fireCooldown=AUTO_INTERVAL;}
function stepTrigger(dt){fireCooldown=Math.max(0,fireCooldown-dt);if(!canPlay()||equipped!=='m16'){releaseTrigger();return;}if(triggerHeld&&!reloadId&&!busy&&fireCooldown<=0){fire();fireCooldown=AUTO_INTERVAL;}}
function updateAmmo(){const el=$('ammo');el.textContent=!equipped?'':reloadId?'Wird nachgeladen …':`${ammo[equipped]} / ${clipSize[equipped]} · T: Nachladen`;}
function startReload(){if(!canPlay()||!equipped||reloadId||ammo[equipped]===clipSize[equipped])return;reloadId=equipped;reloadLeft=RELOAD_TIME;audio.play('reload',null,0);updateAmmo();}
function stepReload(dt){if(!reloadId)return;const before=reloadLeft;reloadLeft=Math.max(0,reloadLeft-dt);if(before>RELOAD_TIME*.48&&reloadLeft<=RELOAD_TIME*.48)audio.play('reload',null,1);renderer.reload?.(1-reloadLeft/RELOAD_TIME);if(reloadLeft===0){ammo[reloadId]=clipSize[reloadId];audio.play('click');reloadId=null;renderer.reload?.(0);updateAmmo();}}
const rgb=h=>[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];
function mat(c){
  return c==='465a70'?'hotel_carpet':c==='464749'?'hotel_stripe':c==='d6cfc3'?'hotel_wall':c==='f1eae0'?'hotel_ceiling':['a58d72','aa8b67','b28f68'].includes(c)?'wooden_floor_01'
    :['e3ded3','e4e1d9','e9e5dc','d8d2c9','d7d3ce','ddd7cf'].includes(c)?'white_plaster_02':c==='f0ede8'?'paint'
    :['765742','81664b','655343','a77a48','967e64','ac9478','7f6752','8a715c','70553f'].includes(c)?'oak_veneer_01'
    :['667d89','9caeb3','536c76','466c79','ccd7df','c3ced7','d6dce2','bfc8cf'].includes(c)?'rough_linen'
    :c==='75b6d1'?'glass':c==='c6b8a1'?'metal':c==='fff2cb'?'light':null;
}
const objects=[],decorBounds={};
function box(x,y,z,w,h,d,col,r=0){objects.push({p:[x,y,z],s:[w,h,d],c:rgb(col),r,m:mat(col)});}
function draw(o){renderer.drawBox(o);}
function groupSurface(id,start){const group=objects.slice(start);if(!group.length)return;for(const o of group)o.groupSurface=id;const lo=[0,1,2].map(i=>Math.min(...group.map(o=>o.p[i]-o.s[i]/2))),hi=[0,1,2].map(i=>Math.max(...group.map(o=>o.p[i]+o.s[i]/2)));decorBounds[id]={p:lo.map((x,i)=>(x+hi[i])/2),s:lo.map((x,i)=>hi[i]-x)};}
const room=[];
function solid(x,y,z,w,h,d,c){box(x,y,z,w,h,d,c);room.push({p:[x,y,z],s:[w,h,d]});}

// Room shell.
for(const [id,w] of Object.entries(WALLS)){solid(...w.p,...w.s,w.kind==='floor'?'465a70':w.kind==='ceiling'?'f1eae0':id==='surface_7'?'464749':'d6cfc3');objects.at(-1).surfaceId=id;room.at(-1).surfaceId=id;}
// A visible lower safety foundation keeps the unfinished world bounded.
solid(0,-1.46,0,10,.22,10,'605a50');

// Baseboards, crown details, outlet and switch.
for(let x of [-4.86,4.86]){const start=objects.length;box(x,.075,0,.08,.15,9.78,'f0ede8');groupSurface(x<0?'surface_trim_w':'surface_trim_e',start);}
{const start=objects.length;box(0,.075,4.86,9.78,.15,.08,'252a2e');groupSurface('surface_trim_s',start);}
for(let x of [-3,3]){const start=objects.length;box(x,.075,-4.86,3.85,.15,.08,'f0ede8');groupSurface(x<0?'surface_trim_nw':'surface_trim_ne',start);}
for(let x of [-4.86,4.86]){const start=objects.length;box(x,2.965,0,.1,.08,9.8,'f0ede8');groupSurface(x<0?'surface_crown_w':'surface_crown_e',start);}
for(let z of [-4.86,4.86]){const start=objects.length;box(0,2.965,z,9.8,.08,.1,'f0ede8');groupSurface(z<0?'surface_crown_n':'surface_crown_s',start);}
{const start=objects.length;box(4.87,.33,-1.35,.03,.13,.19,'f0ede8');box(4.85,.33,-1.35,.012,.055,.095,'655343');groupSurface('surface_outlet',start);}
{const start=objects.length;box(1.38,1.12,-4.86,.13,.14,.03,'f0ede8');box(1.38,1.12,-4.835,.072,.085,.018,'f0ede8');objects.at(-1).switchRocker=true;groupSurface('surface_switch',start);}

// Window frame, cloth, pane and outdoor panorama are built by architecture.js.
// Leave the wall opening free of any static pane or fake outdoor building.
// Door trim; moving/unlocked door stays governed by the existing game state.
// Portal module provides its own fitted frame; no second oversized trim.
{const start=objects.length;for(let x of [-.60,.60])box(x,1.1,-4.865,.045,2.2,.025,'f0ede8');box(0,2.225,-4.865,1.245,.05,.025,'f0ede8');groupSurface('surface_doortrim',start);}

// Permanent side panels preserve the existing portal boundary.
room.push(...PORTAL_SIDES);
// Furniture visuals and collision layout share the same dimensions.
for(const [id,slot] of Object.entries(DECOR))room.push({p:[slot.p[0],slot.p[1]+slot.s[1]/2,slot.p[2]],s:slot.s,surfaceId:'surface_'+id});

// Open hotel wardrobe with TV; use the same collider and damage ID.
{const {p,s}=HOTEL_LAYOUT.surface_wardrobe;solid(...p,...s,'24282c');objects.at(-1).surfaceId='surface_wardrobe';room.at(-1).surfaceId='surface_wardrobe';}

// Decorative radiator beneath the window.
{const start=objects.length;box(-4.72,.52,-.96,.12,.84,1.6,'f0ede8');
for(let i=0;i<7;i++)box(-4.66,.53,-1.58+i*.26,.03,.78,.13,'f0ede8');
box(-4.61,.95,-1.72,.03,.14,.08,'c6b8a1');
box(-4.61,.95,-.18,.03,.14,.08,'c6b8a1');groupSurface('surface_radiator',start);}

// Hotel headboard, shelves and recessed lighting are rendered by room_decor.js.

const DECOR_BOUNDS={...decorBounds,surface_windowframe:{p:[-4.88,1.74,-1],s:[.45,1.7,2.8]},surface_curtain_l:{p:[-4.52,1.48,-2.12],s:[.34,2.85,.98]},surface_curtain_r:{p:[-4.52,1.48,.12],s:[.34,2.85,.98]},surface_curtainrod:{p:[-4.5,2.925,-1],s:[.45,.14,3.3]},surface_ceilinglamp:{p:[0,2.95,0],s:[.74,.10,.74]},surface_picture:{p:[-2.1,1.5,4.58],s:[3.2,1.2,.25]},...Object.fromEntries(room.filter(o=>o.surfaceId&&!WALLS[o.surfaceId]).map(o=>[o.surfaceId,o])),surface_lamp:{p:[HOTEL_LAYOUT.nightstand.p[0],.85,HOTEL_LAYOUT.nightstand.p[2]],s:[.42,.46,.42]},surface_rug:HOTEL_LAYOUT.rug};
const spec=Object.fromEntries(Object.entries(HOTEL_LAYOUT).filter(([,o])=>typeof o.max==='number'));

let wallSolids=Object.values(WALLS).map(w=>({p:w.p,s:w.s})),wallSignatures={};
let state={walls:{},decor:{},marks:[],lights_on:true,placements:{},rotations:{},objects:Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,o.max])),unlocked:false}, bodies=Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,{p:[...o.p],v:[0,0,0]}])), debris=[], busy=false, held=null, player={x:HOTEL_LAYOUT.spawn.p[0],z:HOTEL_LAYOUT.spawn.p[2],y:0,vy:0,yaw:HOTEL_LAYOUT.spawn.yaw,pitch:0}, keys=new Set(), first=true, started=false, active=false;
let lastInteractionHint=-Infinity, heldAngle=0;
const yawQuat=a=>[0,Math.sin(a*Math.PI/360),0,Math.cos(a*Math.PI/360)];
const quarter=a=>((Math.round(a/90)*90%360)+360)%360;
const yawAngle=q=>q?quarter(Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[2]*q[2]))*180/Math.PI):0;
const turnedSize=(s,a)=>a===90||a===270?[s[2],s[1],s[0]]:s;
const savedBody=(s,id)=>({p:[...(s.placements?.[id]||spec[id].p)],v:[0,0,0],q:yawQuat(s.rotations?.[id]||0)});
const movableDecor=id=>!!spec[id]?.decor;
function boundsSize(s,q){if(!q)return s;return [0,1,2].map(i=>{const axis=[0,0,0];axis[i]=1;return rotateInverse(axis,q).reduce((n,v,j)=>n+Math.abs(v)*s[j],0);});}
function turnHeld(delta){if(!canPlay()||busy||!held)return;heldAngle=quarter(heldAngle+delta);$('notice').textContent='Drehung: '+heldAngle+'°';}
let mobile=matchMedia('(pointer:coarse)').matches, touchMove=[0,0], look=null;
function clearControls(){releaseTrigger();keys.clear();touchMove=[0,0];look=null;$('stick').classList.remove('moving');$('stick').style.removeProperty('--jx');$('stick').style.removeProperty('--jy');}
function setMode(v){mobile=v;document.body.classList.toggle('mobile',v);$('mode').textContent=v?'Desktop-Modus':'Touch-Modus';clearControls();if(v)document.exitPointerLock?.();}
let token=sessionStorage.getItem('second_live_token')||'';let protectedGame=false,personalWorld=false; $('token').value=token;
const api=async(path,data)=>{let r=await fetch(path,{headers:{...(protectedGame?{'X-SecondLive-Token':token}:{}),'Content-Type':'application/json'},...(data?{method:'POST',body:JSON.stringify(data)}:{})});let j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j;};
function syncWallState(next){
  for(const [id,w] of Object.entries(WALLS)){
    const prev=new Set((state.walls?.[id]||[]).filter(c=>c[2]>=REMOVED).map(c=>`${c[0]},${c[1]}`));
    const gone=(next[id]||[]).filter(c=>c[2]>=REMOVED);const now=new Set(gone.map(c=>`${c[0]},${c[1]}`));
    if([...prev].some(k=>!now.has(k)))debris=debris.filter(d=>d.source!==id);
    if(started)for(const [c,r] of gone)if(!prev.has(`${c},${r}`)){
      const cell=cellBox(w,c,r);for(let j=0;j<4;j++){
        const p=cell.p.map((x,i)=>x+(Math.random()-.5)*cell.s[i]*.42);
        debris.push({source:id,kind:'wallChip',variant:j,p,s:cell.s.map(x=>x*(.25+Math.random()*.22)),v:[(Math.random()-.5)*1.2,.3+Math.random()*.7,(Math.random()-.5)*1.2],c:rgb(w.kind==='floor'?(j%2?'906946':'c2a177'):(j%2?'b8a794':'d3ccc1')),m:null,r:Math.random()*6});
      }
    }
  }
  const sig=JSON.stringify(Object.entries(next).filter(([id,cells])=>cells.some(c=>c[2]>=REMOVED)).map(([id,cells])=>[id,cells.filter(c=>c[2]>=REMOVED)]));
  if(wallSignatures!==sig){wallSignatures=sig;wallSolids=Object.entries(WALLS).flatMap(([id,w])=>solidRuns(w,next[id]||[]));}
  renderer?.syncWalls?.(next);physicsWorld?.syncWalls?.(next);
}
function collisionRoom(){return [...room.filter(o=>(!o.surfaceId||!WALLS[o.surfaceId])&&!movableDecor(o.surfaceId)&&(state.decor?.[o.surfaceId]||0)<REMOVED),...wallSolids];}
function syncDecorState(next){
  for(const [id,o] of Object.entries(DECOR_BOUNDS)){
    const was=(state.decor?.[id]||0)>=REMOVED,now=(next[id]||0)>=REMOVED;
    if(was&&!now)debris=debris.filter(d=>d.source!==id);
    if(started&&!was&&now)for(let j=0;j<6;j++){const pos=movableDecor(id)?bodies[id].p:o.p;const s=o.s.map(x=>Math.max(.025,Math.min(.24,x*(.12+Math.random()*.14))));debris.push({source:id,kind:'wallChip',variant:j,p:pos.map((x,i)=>x+(Math.random()-.5)*o.s[i]*.65),s,v:[(Math.random()-.5)*1.2,.4+Math.random()*.6,(Math.random()-.5)*1.2],c:rgb(j%2?'806b52':'b5aa9a'),m:null,r:Math.random()*6});}
  }
  renderer?.syncDecor?.(next);physicsWorld?.syncDecor?.(next);
}
function sync(s){
  // Keep existing decor damage IDs and stages; expose their live state only to local physics.
  s={...s,objects:{...s.objects}};
  for(const [id,o] of Object.entries(spec))if(o.decor)s.objects[id]=Math.max(0,REMOVED-(s.decor?.[id]||0));
  for(const [id,o] of Object.entries(spec)){
    const hp=s.objects[id],was=state.objects[id]||0;
    const changed=JSON.stringify(s.placements?.[id])!==JSON.stringify(state.placements?.[id])||(s.rotations?.[id]||0)!==(state.rotations?.[id]||0);
    if(!bodies[id]||(!was&&hp>0)||changed){bodies[id]=savedBody(s,id);if(!was&&hp>0)debris=debris.filter(d=>d.source!==id);}
    if(was>0&&hp===0){
      if(held===id)held=null;
      if(!o.decor){let p=id==='window'?[-4.45,1.52,-1]:bodies[id].p;for(let i=0;i<8;i++)debris.push({source:id,p:[...p],v:[(Math.random()-.5)*4,2+Math.random()*3,(Math.random()-.5)*4],s:id==='window'?[.035,.07+Math.random()*.09,.09+Math.random()*.12]:[.10+Math.random()*.15,.045+Math.random()*.07,.10+Math.random()*.18],c:rgb(o.c),m:id==='window'?'glass':mat(o.c),r:Math.random()*6});}
    }
  }
  syncWallState(s.walls||{});syncDecorState(s.decor||{});renderer?.setRoomLight?.(s.lights_on!==false,s.decor||{});
  const wasOpen=state.unlocked;state=s;renderer?.setDoorOpen?.(s.unlocked);if(started&&wasOpen!==s.unlocked)audio.play('door',[0,1.1,-4.95]); $('worldstate').textContent=personalWorld?'Privater Startraum':s.unlocked?'Testbereich freigeschaltet':'Startraum';
}
let mutationVersion=0;async function refresh(){const v=mutationVersion;let s=await api('/api/game');if(!busy&&v===mutationVersion)sync(s);}
async function action(action,id,mark,extra={}){if(busy)return false;busy=true;mutationVersion++;try{const result=await api('/api/game',{action,id,...(mark?{mark}:{}),...extra});sync(result);$('notice').textContent=action==='reset_hotel_layout'?'Hotelanordnung wiederhergestellt':action==='toggle_light'?(result.lights_on?'Licht eingeschaltet':'Licht ausgeschaltet'):action==='place_object'?'Gegenstand abgestellt und gespeichert':action==='repair'||action==='repair_surface'?'Oberfläche repariert':action==='unlock'?'Testbereich freigeschaltet':result.wall_result?.stage===REMOVED?'Bruchstück entfernt':result.wall_result?'Fläche beschädigt · Stufe '+result.wall_result.stage+'/'+REMOVED:result.decor_result?.stage===REMOVED?'Einrichtung zerstört':result.decor_result?'Einrichtung beschädigt · Stufe '+result.decor_result.stage+'/'+REMOVED:result.mark_saved===false?'Treffer registriert · Markierungslimit erreicht':'Treffer gespeichert';return true;}catch(e){$('notice').textContent=e.message;return false;}finally{busy=false;}}
function dir(){let a=player.yaw,p=player.pitch;return [-Math.sin(a)*Math.cos(p),-Math.sin(p),-Math.cos(a)*Math.cos(p)];}
function rotateInverse(v,q){if(!q)return v;const [x,y,z,w]=q,u=[-x,-y,-z],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=cross(u,v).map(n=>2*n),c=cross(u,t);return v.map((n,i)=>n+w*t[i]+c[i]);}
function rayBox(eye,d,p,s,q=null){let pos=rotateInverse(eye.map((v,i)=>v-p[i]),q),dir=rotateInverse(d,q),lo=0,hi=8;for(let i=0;i<3;i++){if(Math.abs(dir[i])<1e-8){if(Math.abs(pos[i])>s[i]/2)return Infinity;}else{let a=(-s[i]/2-pos[i])/dir[i],z=(s[i]/2-pos[i])/dir[i];lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));if(lo>hi)return Infinity;}}return lo;}
function aim(ray=null,includeDestroyed=true){let d=ray?.direction||dir(),eye=ray?.origin||[player.x,player.y+1.65,player.z],best=8.01,id=null;for(const o of collisionRoom())best=Math.min(best,(solidRay(o,eye,d)??rayBox(eye,d,o.p,o.s)));if(!state.unlocked)best=Math.min(best,rayBox(eye,d,[0,1.1,-4.95],[1.85,2.2,.18]));for(const [k,b] of Object.entries(bodies)){if(k===held)continue;const live=state.objects[k]>0;if(!live&&!includeDestroyed)continue;const dist=rayBox(eye,d,live?b.p:(state.placements?.[k]||spec[k].p),spec[k].s,live?b.q:yawQuat(state.rotations?.[k]||0));if(dist<best){best=dist;id=k;}}return {id,dist:best};}
function chooseWeapon(id){if(held&&id!=='none')return;if(![...weaponIds,'none'].includes(id))return;releaseTrigger();if(reloadId){reloadId=null;reloadLeft=0;renderer?.reload?.(0);}equipped=id==='none'?null:id;updateAmmo();$('weaponstatus').textContent=equipped==='pistol'?'Pistole · Testmodus':equipped==='rifle'?'Gewehr · Testmodus':equipped==='m16'?'M16 · Dauerfeuer (Spielmodus)':'Unbewaffnet';}
function arsenal(){document.exitPointerLock?.();clearControls();active=false;$('arsenal').hidden=false;}
$('closearsenal').onclick=()=>{$('arsenal').hidden=true;active=true;clearControls();};
for(const id of [...weaponIds,'none'])$('equip-'+id).onclick=()=>{chooseWeapon(id);$('closearsenal').onclick();};
chooseWeapon('none');
function phone(){if(renderer?.xrMode?.active){renderer.xrMode.end().then(()=>phone()).catch(e=>$('notice').textContent=e.message);return;}document.exitPointerLock?.();clearControls();$('phone').hidden=false;active=false;audio.stopAll();audio.play('phone');showPhonePage('home');updatePhone();}
const movable=id=>id&&id!=='window'&&Object.hasOwn(spec,id)&&state.objects[id]>0;
function interactionTarget(){const d=dir(),eye=[player.x,player.y+1.65,player.z],hit=renderer?.surfaceHit(eye,d,held);return hit&&hit.dist<=3?hit:{id:null,dist:Infinity};}
function horizontalHold(id){
  const s=turnedSize(spec[id].s,heldAngle),d=dir(),dist=1.0+Math.hypot(s[0],s[2])*.52,flat=Math.hypot(d[0],d[2]);
  const dx=flat>.01?d[0]/flat:-Math.sin(player.yaw),dz=flat>.01?d[2]/flat:-Math.cos(player.yaw);
  const clamp=(v,h)=>Math.max(-4.84+h/2,Math.min(4.84-h/2,v));
  return [clamp(player.x+dx*dist,s[0]),clamp(player.z+dz*dist,s[2])];
}
function placementPoint(id){
  const s=turnedSize(spec[id].s,heldAngle),[x,z]=horizontalHold(id);
  const grounds=[[-1,-1],[-1,1],[1,-1],[1,1],[0,0]].map(([u,v])=>groundAt(x+u*s[0]*.45,z+v*s[2]*.45));if(grounds.some(v=>v!==grounds[0]))return null;
  const p=[x,grounds[0]+s[1]/2,z],overlap=(q,t)=>p.every((v,i)=>Math.abs(v-q[i])<(s[i]+t[i])/2-.018);
  if(overlap([player.x,player.y+.8,player.z],[.56,1.6,.56]))return null;
  if(collisionRoom().some(b=>!['surface_0','surface_1'].includes(b.surfaceId)&&overlap(b.p,b.s)))return null;
  if(Object.entries(bodies).some(([k,b])=>k!==id&&state.objects[k]>0&&overlap(b.p,boundsSize(spec[k].s,b.q))))return null;
  return p.map(v=>Math.round(v*10000)/10000);
}
async function interact(){if(!canPlay()||busy)return;if(held){const id=held,p=placementPoint(id);if(!p){$('notice').textContent='Kein freier Stellplatz – weiter bewegen';return;}const angle=heldAngle;if(await action('place_object',id,null,{position:p,rotation:angle})){held=null;bodies[id]={p:[...p],v:[0,0,0],q:yawQuat(angle)};}return;}
  const a=interactionTarget();if(a.id==='surface_switch'){if((state.decor?.surface_switch||0)>=REMOVED){$('notice').textContent='Schalter zuerst reparieren';return;}audio.play('click');await action('toggle_light','surface_switch');return;}
  if(movable(a.id)){chooseWeapon('none');held=a.id;heldAngle=yawAngle(bodies[held].q);$('notice').textContent='Gegenstand aufgenommen · Q/F: drehen · E: abstellen';return;}
  if(Math.abs(player.x)<1.3&&player.z<-3.2&&!state.unlocked)$('notice').textContent='Hinter dieser Tür entsteht die nächste Spielwelt.';
}
function groundAt(x,z){if(z<-5&&state.unlocked)return 0;return floorSupported(WALLS.surface_0,state.walls?.surface_0||[],x,z)?0:-1.35;}
function coll(x,z){if(Math.abs(x)>4.65||z>4.65||z<(state.unlocked?-14.5:-4.65))return true;if(z<-4.65&&Math.abs(x)>.72&&z>-5.4)return true;return collisionRoom().some(b=>b.p[1]-b.s[1]/2<player.y+1.6&&b.p[1]+b.s[1]/2>Math.max(.1,player.y+.1)&&[.25,.85,1.45].some(h=>solidContains(b,[x,player.y+h,z],.25)))||Object.entries(bodies).some(([id,b])=>id!==held&&state.objects[id]>0&&(()=>{const s=boundsSize(spec[id].s,b.q);return b.p[1]-s[1]/2<player.y+1.6&&b.p[1]+s[1]/2>player.y+.1&&Math.abs(x-b.p[0])<s[0]/2+.28&&Math.abs(z-b.p[2])<s[2]/2+.28;})());}
let enteringGame=false;async function enterGame(){if(!graphicsReady||enteringGame)return;enteringGame=true;void audio.unlock();if(protectedGame)token=$('token').value;try{if(personalWorld)await api('/api/session',{});await refresh();if(protectedGame)sessionStorage.setItem('second_live_token',token);$('welcome').hidden=true;started=true;active=true;document.body.classList.add('playing');if(!mobile)canvas.requestPointerLock?.()?.catch?.(()=>{});}catch(e){$('loginerror').textContent=e.message;}finally{enteringGame=false;}}
$('start').onclick=()=>enterGame();
const phonePages=['home','world','settings'];
function showPhonePage(page){for(const key of phonePages)$('phone-page-'+key).hidden=page!==key;}
function updatePhone(){const now=new Date();$('phone-clock').textContent=now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});$('phone-date').textContent=now.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});$('phone-worldstate').textContent=$('worldstate').textContent;$('phone-volume').value=String(Math.round(audio.volume*100));$('phone-sound').checked=audio.enabled;$('phone-volume-label').textContent=Math.round(audio.volume*100)+' %';}
$('phone-home').onclick=()=>showPhonePage('home');$('phone-app-world').onclick=()=>{showPhonePage('world');updatePhone();};$('phone-app-settings').onclick=()=>{showPhonePage('settings');updatePhone();};$('phone-app-inventory').onclick=()=>{$('closephone').onclick();arsenal();};
$('phone-sound').onchange=()=>{audio.configure($('phone-sound').checked,Number($('phone-volume').value)/100);updatePhone();};$('phone-volume').oninput=()=>{audio.configure($('phone-sound').checked,Number($('phone-volume').value)/100);$('phone-volume-label').textContent=$('phone-volume').value+' %';};$('phone-audio-test').onclick=async()=>{await audio.unlock();audio.play('phone');};
setInterval(()=>{if(!$('phone').hidden)updatePhone();},15000);
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('phone').hidden&&$('updater').hidden){$('closephone').onclick();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stopAll();});
$('restore-hotel').onclick=async()=>{if(busy||!confirm('Möbel auf Hotel-Standardpositionen zurücksetzen? Schäden und Fortschritt bleiben erhalten.'))return;if(held){bodies[held]=savedBody(state,held);held=null;}if(await action('reset_hotel_layout',null,null,{confirm:true})){for(const id of Object.keys(spec))if(id!=='window')bodies[id]=savedBody(state,id);const p=HOTEL_LAYOUT.spawn.p;player.x=p[0];player.y=0;player.z=p[2];player.vy=0;player.yaw=HOTEL_LAYOUT.spawn.yaw;player.pitch=0;updatePhone();}};
$('closephone').onclick=()=>{$('phone').hidden=true;clearControls();active=true;};$('refresh').onclick=async()=>{try{await refresh();$('notice').textContent='Weltstatus aktualisiert';updatePhone();}catch(e){$('notice').textContent=e.message;}};
canvas.onclick=()=>{if(mobile||!canPlay())return;void audio.unlock();if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.()?.catch?.(()=>{});active=true;}};
canvas.addEventListener('pointerdown',e=>{if(!mobile&&e.button===0&&document.pointerLockElement===canvas&&canPlay())pressTrigger();});
window.addEventListener('pointerup',e=>{if(triggerPointer===null||triggerPointer===e.pointerId)releaseTrigger();});
window.addEventListener('pointercancel',releaseTrigger);
window.addEventListener('keydown',e=>{if(!active||!started||!$('updater').hidden)return;if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyE')interact();if(e.code==='KeyQ')turnHeld(-90);if(e.code==='KeyF')turnHeld(90);if(e.code==='KeyV')first=!first;if(e.code==='KeyP')phone();if(e.code==='KeyI')arsenal();if(e.code==='Digit1')chooseWeapon('pistol');if(e.code==='Digit2')chooseWeapon('rifle');if(e.code==='Digit3')chooseWeapon('m16');if(e.code==='Digit0')chooseWeapon('none');if(e.code==='KeyT')startReload();if(e.code==='KeyR')repair();});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)clearControls();});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){player.yaw-=e.movementX*.003;player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch+e.movementY*.003));}});
function part(p,s,c,r=0,q=null){draw({p,s,c:rgb(c),r,q,m:mat(c)});}
function canPlay(){return started&&active&&$('phone').hidden&&$('arsenal').hidden&&$('updater').hidden;}
function fire(ray=null){
  if(!canPlay()||!equipped||busy||reloadId)return;
  if(ammo[equipped]<=0){startReload();return;}
  const direction=ray?.direction||dir(),origin=ray?.origin||[player.x,player.y+1.65,player.z],a=renderer.surfaceHit(origin,direction,held);
  ammo[equipped]--;updateAmmo();
  renderer.shot(equipped,{origin,direction,distance:Math.min(8,a.dist),impact:a.dist<=8});
  audio.play('shot',null,weaponIds.indexOf(equipped));if(a.dist<=8)audio.play('impact',origin.map((v,i)=>v+direction[i]*a.dist));
  $('cross').classList.add('pulse');setTimeout(()=>$('cross').classList.remove('pulse'),100);
  if(a.id&&state.objects[a.id]>0&&!movableDecor(a.id)){physicsWorld.impulse(a.id,direction);action('hit',a.id,a.mark);}else if(WALLS[a.id])action('damage_wall',a.id,a.mark);else if(DECOR_BOUNDS[a.id])action('damage_decor',a.id,a.mark);else if(a.id?.startsWith('surface_'))action('mark_surface',a.id,a.mark);else $('notice').textContent=a.dist<=8?'Oberfläche ohne Schadensspeicher':'Kein Objekt getroffen';
}
function repair(ray=null){
  if(!canPlay())return;const origin=ray?.origin||[player.x,player.y+1.65,player.z],direction=ray?.direction||dir();
  const surface=renderer.surfaceHit(origin,direction,held),a=aim(ray);let wall=null,dist=3;
  for(const [id,w] of Object.entries(WALLS)){if(!state.walls?.[id]?.some(c=>c[2]>=REMOVED))continue;const d=rayBox(origin,direction,w.p,w.s);if(d<dist&&d<=surface.dist+.01){dist=d;wall=id;}}
  for(const [id,o] of Object.entries(DECOR_BOUNDS)){if((state.decor?.[id]||0)<REMOVED)continue;const p=movableDecor(id)?(state.placements?.[id]||spec[id].p):o.p,q=movableDecor(id)?yawQuat(state.rotations?.[id]||0):null;const d=rayBox(origin,direction,p,o.s,q);if(d<dist&&d<=surface.dist+.01){dist=d;wall=id;}}
  if(a.id&&!movableDecor(a.id)&&state.objects[a.id]===0&&a.dist<Math.min(3,dist)&&a.dist<=surface.dist+.01){action('repair',a.id);return;}
  if(wall){action('repair_surface',wall);return;}
  if(surface.id&&surface.dist<3){if(surface.id.startsWith('surface_'))action('repair_surface',surface.id);else action('repair',surface.id);}
}
$('mode').onclick=()=>setMode(!mobile);setMode(mobile);
const stick=$('stick');let stickId=null;function moveStick(e){let r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.36),y=(e.clientY-r.top-r.height/2)/(r.height*.36),l=Math.max(1,Math.hypot(x,y));touchMove=[x/l,-y/l];stick.style.setProperty('--jx',`${x/l*33}px`);stick.style.setProperty('--jy',`${y/l*33}px`);}stick.addEventListener('pointerdown',e=>{if(!canPlay()||stickId!==null)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId&&canPlay())moveStick(e);});for(const n of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(n,e=>{if(e.pointerId===stickId){stickId=null;touchMove=[0,0];stick.style.setProperty('--jx','0px');stick.style.setProperty('--jy','0px');}});
canvas.addEventListener('pointerdown',e=>{if(!canPlay()||(!mobile&&document.pointerLockElement===canvas))return;if(look)return;look={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!look||look.id!==e.pointerId||!canPlay())return;player.yaw-=(e.clientX-look.x)*.005;player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch+(e.clientY-look.y)*.005));look.x=e.clientX;look.y=e.clientY;});for(const n of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(n,e=>{if(look?.id===e.pointerId)look=null;});
for(const [id,fn] of [['touchInteract',interact],['touchRotateLeft',()=>turnHeld(-90)],['touchRotateRight',()=>turnHeld(90)],['touchReload',startReload],['touchRepair',()=>repair()],['touchView',()=>first=!first],['touchPhone',phone],['touchArsenal',arsenal],['touchJump',()=>{if(Math.abs(player.y-groundAt(player.x,player.z))<1e-5)player.vy=4.2;}]])$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())fn();});const fireButton=$('touchFire');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();if(!canPlay()||triggerPointer!==null)return;void audio.unlock();pressTrigger();if(triggerHeld){triggerPointer=e.pointerId;fireButton.setPointerCapture?.(e.pointerId);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(event,e=>{if(triggerPointer===e.pointerId)releaseTrigger();});
window.addEventListener('blur',()=>{clearControls();audio.stopAll();});document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});

let prev=performance.now();
function frame(now,xrFrame){
  let dt=Math.max(0,Math.min(.035,(now-prev)/1000));prev=now;
  const vr=!!renderer.xrMode?.active;const xrInput=vr?renderer.xrMode.inputs(xrFrame):null;
  if(started&&active){
    stepReload(dt);stepTrigger(dt);
    if(vr)player.yaw+=xrInput.turn;
    let f=vr?xrInput.move[1]:Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touchMove[1],s=vr?xrInput.move[0]:Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touchMove[0],a=player.yaw+(vr?xrInput.headYaw:0),m=(vr?1.6:3.4)*dt/Math.max(1,Math.hypot(f,s)),dx=(-Math.sin(a)*f+Math.cos(a)*s)*m,dz=(-Math.cos(a)*f-Math.sin(a)*s)*m;
    if(!coll(player.x+dx,player.z))player.x+=dx;
    if(!coll(player.x,player.z+dz))player.z+=dz;
    const ground=groundAt(player.x,player.z);
    if(!vr&&keys.has('Space')&&Math.abs(player.y-ground)<1e-5)player.vy=4.2;
    player.vy-=9.81*dt;player.y=Math.max(ground,player.y+player.vy*dt);if(player.y===ground)player.vy=0;
  }
  if(debris.length>80)debris.splice(0,debris.length-80);
  if(started){
    let holdPoint=[0,0,0];if(held){const s=spec[held].s,[x,z]=horizontalHold(held),floor=groundAt(x,z),d=dir(),dist=1.0+Math.hypot(s[0],s[2])*.52;
      const y=movableDecor(held)?floor+s[1]/2:Math.min(2.85-s[1]/2,Math.max(floor+s[1]/2,player.y+1.2+d[1]*dist));holdPoint=[x,y,z];}
    physicsWorld.step(dt,bodies,state,held,holdPoint,debris,yawQuat(heldAngle));
  }
  let d=dir(),eye=[player.x,player.y+1.65,player.z],target=eye.map((v,i)=>v+d[i]);
  if(!first&&!vr){let t=eye.map((v,i)=>v-d[i]*2.1);if(!coll(t[0],t[2])){eye=t;target=eye.map((v,i)=>v+d[i]);}}
  renderer.begin();
  renderer.setDoorOpen?.(state.unlocked);
  if(state.unlocked){part([0,-.12,-10],[10,.24,10],'a8a69a');part([-4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([0,1.4,-15],[10,2.8,.2],'c1b6a6');}
  for(let [id,b] of Object.entries(bodies)){
    let o=spec[id],hp=state.objects[id];
    if(o.decor){renderer.drawMovableDecor(id,b.p,o.s,b.q,hp>0,id===held);continue;}
    if(hp>0){if(!renderer.drawModel(id,b.p,o.s,hp,o.max,b.q))part(b.p,o.s,id==='window'?o.c:hp<o.max?'947665':o.c,0,b.q);}else {for(let i=0;i<4;i++){let a=i*1.73;const at=state.placements?.[id]||o.p,x=id==='window'?-4.42:at[0];part([x+Math.cos(a)*.19,at[1]-o.s[1]/2+.032,at[2]+Math.sin(a)*.26],id==='window'?[.13,.012,.08]:[.23,.06,.12],o.c,a);}}
  }
  for(let b of debris)draw(b);
  if(!first&&!vr&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5){part([player.x,player.y+1,player.z],[.5,1.1,.32],'354d65');part([player.x,player.y+1.7,player.z],[.32,.34,.32],'cba384');}
  renderer.syncMarks(state.marks||[]);
  if(started&&active)audio.listener(eye,d);renderer.equip(equipped,first&&started);renderer.render(canvas,eye,target,mobile,dt,player);
  if(!started||performance.now()-lastInteractionHint>=100){lastInteractionHint=performance.now();$('touchRotateLeft').hidden=$('touchRotateRight').hidden=!held;let a=started?interactionTarget():{id:null};$('hint').textContent=held?(placementPoint(held)?'E: Abstellen · Q/F: drehen · Stellplatz frei':'Stellplatz blockiert · Q/F: drehen oder weiter bewegen'):a.id==='surface_switch'?'E: Licht '+(state.lights_on!==false?'ausschalten':'einschalten'):movable(a.id)?'E: Aufheben · R: Reparieren':Math.abs(player.x)<1.3&&player.z<-3.2&&!state.unlocked?'Tür · nächste Welterweiterung':'R: Oberfläche reparieren · P: Smartphone · I: Inventar';}
}
setInterval(()=>{if(started&&!busy)refresh().catch(()=>{});},3000);

// WebXR is optional, detected at runtime. Login and desktop/mobile controls remain independent.
async function setupXR(){
  const button=$('vr'), hint=$('vrstatus');const mode=renderer.xrMode;
  if(!mode){hint.textContent='VR in dieser Grafik-Engine nicht verfügbar';return;}
  const supported=await mode.supported();
  button.hidden=!supported;
  hint.textContent=supported?'VR bereit – nach dem Login starten':globalThis.isSecureContext?'Kein immersives WebXR erkannt':'VR benötigt HTTPS';
  if(!supported)return;
  mode.onEnd=()=>{xrEntering=false;first=xrReturnFirst;player.y=0;player.vy=0;clearControls();document.body.classList.remove('xr-playing');button.textContent='VR starten';button.disabled=false;active=$('phone').hidden&&$('arsenal').hidden;};
  mode.onAction=(type,ray)=>{if(!canPlay())return;if(type==='repair'){repair(ray);return;}if(!state.unlocked&&Math.abs(player.x)<1.5&&player.z<-3.25){$('notice').textContent='Hinter dieser Tür entsteht die nächste Spielwelt.';return;}fire(ray);};
  button.onclick=async()=>{
    if(xrEntering||!started||!canPlay())return;
    if(mode.active){await mode.end();return;}
    xrEntering=true;button.disabled=true;xrReturnFirst=first;clearControls();if(held){bodies[held]=savedBody(state,held);held=null;}document.exitPointerLock?.();first=true;player.y=0;player.vy=0;
    try{await mode.enter();document.body.classList.add('xr-playing');button.textContent='VR beenden';}
    catch(e){first=xrReturnFirst;hint.textContent='VR-Start fehlgeschlagen: '+e.message;$('notice').textContent=hint.textContent;}
    finally{xrEntering=false;button.disabled=false;}
  };
}

const qualityChoice=$('quality'), lightChoice=$('lighting'), status=$('assetstatus');
qualityChoice.value=sessionStorage.getItem('sl_quality')||'auto';
lightChoice.value=sessionStorage.getItem('sl_lighting')||'lebombo';
function changeProfile(){sessionStorage.setItem('sl_quality',qualityChoice.value);sessionStorage.setItem('sl_lighting',lightChoice.value);location.reload();}
qualityChoice.addEventListener('change',changeProfile);lightChoice.addEventListener('change',changeProfile);
(async()=>{
  try{
    const health=await fetch('/api/health',{cache:'no-store'}).then(r=>r.json());protectedGame=health.requires_game_token===true; personalWorld=health.personal_world===true; $('game-auth').hidden=!protectedGame;
    const q=qualityChoice.value==='auto'?(matchMedia('(pointer:coarse)').matches||innerWidth<800?'1k':'2k'):qualityChoice.value;
    renderer=new RoomRenderer(canvas,q,lightChoice.value,t=>status.textContent=t);
    await renderer.load(spec,objects);
    for(const id of weaponIds){
      const img=$('photo-'+id),fallback=$('fallback-'+id),url=renderer.previewPaths?.[id]||renderer.photoPaths?.[id];
      if(url){let alternate=renderer.photoPaths?.[id];if(alternate===url)alternate=null;img.onerror=()=>{if(alternate){img.src=alternate;alternate=null;return;}img.hidden=true;fallback.hidden=false;};img.onload=()=>{img.hidden=false;fallback.hidden=true;};img.src=url;}
    }
    $('m16-credit').textContent=renderer.m16Credit||'Lokale Spielrequisite';
    for(const id of weaponIds){ $('model-'+id).textContent=renderer.propPaths?.[id]?(id==='m16'?'OpenGameArt Originalmodell':'Fototexturiertes Originalmodell'):'Lokales Ersatzmodell'; }
    $('realismstatus').textContent=(renderer.realismStatus?.outside==='ready'?'Fotografischer Fensterausblick':'Fensterausblick: Ersatz')+' · Hotelzimmer: modellierte Stoffe und Möbel'+' · Tür: '+(renderer.realismStatus?.door==='ready'?'Originalmodell':'Lokale Kassettentür')+' · Hände: '+(renderer.realismStatus?.hands==='ready'?'WebXR-Originalmodelle':'Modell nicht vollständig verfügbar');
    status.textContent='Rapier-Physik wird geladen …';
    physicsWorld=await RoomPhysics.create(room.filter(o=>!movableDecor(o.surfaceId)),spec);
    status.textContent='Fotomaterialien und Rapier-Physik bereit';
    graphicsReady=true;$('start').disabled=false;
    prev=performance.now();renderer.setLoop(frame);setupXR();
  }catch(e){console.error(e);status.textContent='Grafik konnte nicht geladen werden: '+e.message;$('error').hidden=false;$('error').textContent='WebGL 2 oder lokale Grafikdateien fehlen. Bitte Docker-Build und Browser prüfen.';}
})();
