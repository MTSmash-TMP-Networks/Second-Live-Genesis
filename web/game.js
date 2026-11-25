import { RoomRenderer, RoomPhysics, HOTEL_LAYOUT, DECOR, curtainBounds, LOBBY_LAYOUT, lobbyDoor, lobbyWalkable, lobbyDoorAt, WALLS, REMOVED, cellBox, solidRuns, solidContains, solidRay, floorSupported, PORTAL_SIDES } from './engine/renderer.bundle.js';
import { GameAudio } from './audio.js';
const audio=new GameAudio();
const $=id=>document.getElementById(id), canvas=$('world');
let renderer=null, physicsWorld=null, graphicsReady=false;
let equipped=null, xrEntering=false, xrReturnFirst=true, posture=null, scopeZoom=false, lastWheel=-Infinity;
let lobbyEnabled=false,lobbyState=null,lobbyTransition=false;
const weaponIds=['pistol','rifle','m16'];
const weaponCycle=['none',...weaponIds];
function nextWeapon(current,direction){const i=Math.max(0,weaponCycle.indexOf(current||'none'));return weaponCycle[(i+(direction>0?1:-1)+weaponCycle.length)%weaponCycle.length];}
const clipSize={pistol:12,rifle:18,m16:24}; // fictional game balance, not real weapon specifications
const ammo={...clipSize};let reloadLeft=0,reloadId=null;
const RELOAD_TIME=1.05;
// Fictional arcade cadence; wait for each server mutation before another.
let triggerHeld=false,triggerPointer=null,fireCooldown=0;
const AUTO_INTERVAL=.16;
function releaseTrigger(){triggerHeld=false;triggerPointer=null;}
function pressTrigger(){if(!canPlay()||posture)return;triggerHeld=equipped==='m16';fire();fireCooldown=AUTO_INTERVAL;}
function stepTrigger(dt){fireCooldown=Math.max(0,fireCooldown-dt);if(!canPlay()||posture||equipped!=='m16'){releaseTrigger();return;}if(triggerHeld&&!reloadId&&!busy&&fireCooldown<=0){fire();fireCooldown=AUTO_INTERVAL;}}
function updateAmmo(){const el=$('ammo');el.textContent=!equipped?'':reloadId?'Wird nachgeladen …':`${ammo[equipped]} / ${clipSize[equipped]} · T: Nachladen`;}
function startReload(){if(!canPlay()||posture||!equipped||reloadId||ammo[equipped]===clipSize[equipped])return;setScopeZoom(false);reloadId=equipped;reloadLeft=RELOAD_TIME;audio.play('reload',null,0);updateAmmo();}
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
// Continue the existing baseboards to the outer edge of the door casing (x=±.6225).
for(let x of [-2.775,2.775]){const start=objects.length;box(x,.075,-4.86,4.30,.15,.08,'f0ede8');groupSurface(x<0?'surface_trim_nw':'surface_trim_ne',start);}
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

const DECOR_BOUNDS={...decorBounds,surface_windowframe:{p:[-4.88,1.74,-1],s:[.45,1.7,2.8]},surface_curtain_l:{p:[-4.52,1.48,-2.12],s:[.34,2.85,.98]},surface_curtain_r:{p:[-4.52,1.48,.12],s:[.34,2.85,.98]},surface_curtainrod:{p:[-4.5,2.925,-1],s:[.45,.14,3.3]},surface_ceilinglamp:{p:[0,2.95,0],s:[.74,.10,.74]},surface_picture:{p:[-2.1,1.5,4.58],s:[3.2,1.2,.25]},...Object.fromEntries(room.filter(o=>o.surfaceId&&!WALLS[o.surfaceId]).map(o=>[o.surfaceId,o])),surface_lamp:{p:[HOTEL_LAYOUT.nightstand.p[0],.85,HOTEL_LAYOUT.nightstand.p[2]],s:[.42,.46,.42]},surface_rug:HOTEL_LAYOUT.surface_rug};
const spec=Object.fromEntries(Object.entries(HOTEL_LAYOUT).filter(([,o])=>typeof o.max==='number'));

let wallSolids=Object.values(WALLS).map(w=>({p:w.p,s:w.s})),wallSignatures={};
let state={walls:{},decor:{},marks:[],lights_on:true,curtains_closed:false,placements:{},rotations:{},objects:Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,o.max])),unlocked:false}, bodies=Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,{p:[...o.p],v:[0,0,0]}])), debris=[], busy=false, held=null, player={x:HOTEL_LAYOUT.spawn.p[0],z:HOTEL_LAYOUT.spawn.p[2],y:0,vy:0,yaw:HOTEL_LAYOUT.spawn.yaw,pitch:0}, keys=new Set(), first=true, started=false, active=false;
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
function clearControls(){releaseTrigger();setScopeZoom(false);keys.clear();touchMove=[0,0];look=null;$('stick').classList.remove('moving');$('stick').style.removeProperty('--jx');$('stick').style.removeProperty('--jy');}
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
  for(const [id,original] of Object.entries(DECOR_BOUNDS)){
    const o=decorBoundsAt(id,original);
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
  const wasOpen=state.unlocked;state=s;renderer?.setCurtainsClosed?.(s.curtains_closed===true,!started,s.decor||{});renderer?.setDoorOpen?.(!lobbyEnabled&&s.unlocked);if(started&&!lobbyEnabled&&wasOpen!==s.unlocked)audio.play('door',[0,1.1,-4.95]); updateWorldStatus();
}
let mutationVersion=0;async function refresh(){const v=mutationVersion;let s=await api('/api/game');if(!busy&&v===mutationVersion)sync(s);}
async function action(action,id,mark,extra={}){if(busy||lobbyState||lobbyTransition)return false;busy=true;mutationVersion++;try{const result=await api('/api/game',{action,id,...(mark?{mark}:{}),...extra});sync(result);$('notice').textContent=action==='reset_hotel_layout'?'Hotelanordnung wiederhergestellt':action==='toggle_curtains'?(result.curtains_closed?'Vorhänge geschlossen':'Vorhänge geöffnet'):action==='toggle_light'?(result.lights_on?'Licht eingeschaltet':'Licht ausgeschaltet'):action==='place_object'?'Gegenstand abgestellt und gespeichert':action==='repair'||action==='repair_surface'?'Oberfläche repariert':action==='unlock'?'Testbereich freigeschaltet':result.wall_result?.stage===REMOVED?'Bruchstück entfernt':result.wall_result?'Fläche beschädigt · Stufe '+result.wall_result.stage+'/'+REMOVED:result.decor_result?.stage===REMOVED?'Einrichtung zerstört':result.decor_result?'Einrichtung beschädigt · Stufe '+result.decor_result.stage+'/'+REMOVED:result.mark_saved===false?'Treffer registriert · Markierungslimit erreicht':'Treffer gespeichert';return true;}catch(e){$('notice').textContent=e.message;return false;}finally{busy=false;}}
function dir(){let a=player.yaw,p=player.pitch;return [-Math.sin(a)*Math.cos(p),-Math.sin(p),-Math.cos(a)*Math.cos(p)];}
function rotateInverse(v,q){if(!q)return v;const [x,y,z,w]=q,u=[-x,-y,-z],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=cross(u,v).map(n=>2*n),c=cross(u,t);return v.map((n,i)=>n+w*t[i]+c[i]);}
function rayBox(eye,d,p,s,q=null){let pos=rotateInverse(eye.map((v,i)=>v-p[i]),q),dir=rotateInverse(d,q),lo=0,hi=8;for(let i=0;i<3;i++){if(Math.abs(dir[i])<1e-8){if(Math.abs(pos[i])>s[i]/2)return Infinity;}else{let a=(-s[i]/2-pos[i])/dir[i],z=(s[i]/2-pos[i])/dir[i];lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));if(lo>hi)return Infinity;}}return lo;}
function aim(ray=null,includeDestroyed=true){let d=ray?.direction||dir(),eye=ray?.origin||playerEye(),best=8.01,id=null;for(const o of collisionRoom())best=Math.min(best,(solidRay(o,eye,d)??rayBox(eye,d,o.p,o.s)));if(lobbyEnabled||!state.unlocked)best=Math.min(best,rayBox(eye,d,[0,1.1,-4.95],[1.85,2.2,.18]));for(const [k,b] of Object.entries(bodies)){if(k===held)continue;const live=state.objects[k]>0;if(!live&&!includeDestroyed)continue;const dist=rayBox(eye,d,live?b.p:(state.placements?.[k]||spec[k].p),spec[k].s,live?b.q:yawQuat(state.rotations?.[k]||0));if(dist<best){best=dist;id=k;}}return {id,dist:best};}
function setScopeZoom(on){
 scopeZoom=!!on&&equipped==='rifle'&&!held&&!posture&&!reloadId&&canPlay()&&!renderer?.xrMode?.active&&first;
 $('scope-overlay').hidden=!scopeZoom;
 $('touchZoom').textContent=scopeZoom?'Zoom aus':'Zoom';
 $('touchZoom').setAttribute('aria-pressed',String(scopeZoom));
 document.body.classList.toggle('scope-zoom',scopeZoom);
}
function toggleScope(){if(equipped!=='rifle'||held||posture||reloadId||!canPlay()||renderer?.xrMode?.active)return;if(!first)first=true;setScopeZoom(!scopeZoom);}
function chooseWeapon(id){if((held||posture||lobbyState||lobbyTransition)&&id!=='none')return;if(![...weaponIds,'none'].includes(id))return;setScopeZoom(false);releaseTrigger();if(reloadId){reloadId=null;reloadLeft=0;renderer?.reload?.(0);}equipped=id==='none'?null:id;updateAmmo();$('weaponstatus').textContent=equipped==='pistol'?'Pistole · Testmodus':equipped==='rifle'?'Gewehr · Rechtsklick: Zoom':equipped==='m16'?'M16 · Dauerfeuer (Spielmodus)':'Unbewaffnet';}
function arsenal(){if(lobbyState||lobbyTransition){$('notice').textContent='Der Hotelflur ist ein gemeinsamer, unbewaffneter Bereich.';return;}document.exitPointerLock?.();clearControls();active=false;$('arsenal').hidden=false;}
$('closearsenal').onclick=()=>{$('arsenal').hidden=true;active=true;clearControls();};
for(const id of [...weaponIds,'none'])$('equip-'+id).onclick=()=>{chooseWeapon(id);$('closearsenal').onclick();};
chooseWeapon('none');
function phone(){if(renderer?.xrMode?.active){renderer.xrMode.end().then(()=>phone()).catch(e=>$('notice').textContent=e.message);return;}document.exitPointerLock?.();clearControls();$('phone').hidden=false;active=false;audio.stopAll();audio.play('phone');showPhonePage('home');updatePhone();}
const movable=id=>id&&id!=='window'&&Object.hasOwn(spec,id)&&state.objects[id]>0;
const CURTAIN_TARGETS=new Set(['surface_curtain_l','surface_curtain_r','surface_curtainrod','surface_windowframe','window']);
const OBJECT_NAMES={surface_bed:'Bett',surface_wardrobe:'Garderobe',surface_nightstand:'Nachttisch',surface_lamp:'Nachttischleuchte',surface_rug:'Teppich',surface_picture:'Kopfteil und Wandregal',surface_ceilinglamp:'Deckenbeleuchtung',surface_switch:'Lichtschalter',surface_outlet:'Steckdose',surface_doortrim:'Türzarge',surface_windowframe:'Fensterrahmen',surface_curtain_l:'Vorhänge',surface_curtain_r:'Vorhänge',surface_curtainrod:'Vorhangstange',surface_radiator:'Heizkörper',crate:'Koffer',table:'Schreibtisch',chair:'Stuhl',sofa:'Sofa',coffee_table:'Couchtisch',window:'Fenster'};
function objectName(id){
  if(OBJECT_NAMES[id])return OBJECT_NAMES[id];
  if(id==='surface_0')return 'Boden';
  if(id==='surface_1')return 'Decke';
  if(WALLS[id])return 'Wand';
  if(id?.startsWith('surface_trim_'))return 'Sockelleiste';
  if(id?.startsWith('surface_crown_'))return 'Deckenleiste';
  return 'Einrichtung';
}
const removed=id=>(state.decor?.[id]||0)>=REMOVED;
function curtainsUsable(){return !removed('surface_curtainrod')&&!(removed('surface_curtain_l')&&removed('surface_curtain_r'));}
function interactionRay(ray=null){return ray||{origin:playerEye(),direction:dir()};}
function interactionTarget(ray=null){const {origin,direction}=interactionRay(ray);const hit=renderer?.surfaceHit(origin,direction,held);return hit||{id:null,dist:Infinity};}
function primaryInteraction(hit,ray=null){
  if(hit.dist>3)return null;
  const id=hit.id;
  if(id==='surface_switch'&&!removed(id))return {id,op:'toggle_light',label:state.lights_on!==false?'Licht ausschalten':'Licht einschalten',short:state.lights_on!==false?'Licht aus':'Licht an'};
  if(CURTAIN_TARGETS.has(id)&&curtainsUsable())return {id,op:'toggle_curtains',label:state.curtains_closed?'Vorhänge öffnen':'Vorhänge schließen',short:state.curtains_closed?'Öffnen':'Schließen'};
  if(movable(id)&&id==='sofa')return {id,op:'sit',label:'Hinsetzen',short:'Hinsetzen',secondary:'Aufheben'};
  if(movable(id)&&id==='surface_bed')return {id,op:'lie',label:'Hinlegen',short:'Hinlegen',secondary:'Aufheben'};
  if(movable(id))return {id,op:'pick_up',label:'Aufheben',short:'Aufheben'};
  return null;
}
function doorInView(hit,ray=null){
  if((!lobbyEnabled&&state.unlocked)||hit.dist>3||(hit.id&&hit.id!=='surface_doortrim'))return false;
  const {origin,direction}=interactionRay(ray);
  const d=rayBox(origin,direction,[0,1.1,-4.95],[1.245,2.25,.30]);
  return d<=3&&d<=hit.dist+.06;
}
function decorBoundsAt(id,original){return id==='surface_curtain_l'||id==='surface_curtain_r'?curtainBounds(id,renderer?.curtainProgress??Number(!!state.curtains_closed)):original;}
function damaged(id){
  if(!id)return false;
  if(spec[id]&&!movableDecor(id)&&state.objects[id]<spec[id].max)return true;
  return (state.decor?.[id]||0)>0||!!state.walls?.[id]?.length||!!state.marks?.some(m=>m.target===id);
}
// Camera poses follow furniture coordinates and saved rotations.
function furniturePose(id,b){
 if(!b||!spec[id])return null;
 const q=b.q||[0,0,0,1];
 if(Math.abs(q[0])>.10||Math.abs(q[2])>.10||Math.hypot(...(b.v||[0,0,0]))>.35)return null;
 const a=2*Math.atan2(q[1],q[3]),c=Math.cos(a),sn=Math.sin(a);
 const local=id==='sofa'?[0,.08]:[.08,.66];
 return {x:b.p[0]+local[0]*c+local[1]*sn,z:b.p[2]-local[0]*sn+local[1]*c,y:b.p[1]-spec[id].s[1]/2,eye:id==='sofa'?1.18:1.02,yaw:a+(id==='sofa'?Math.PI:0),pitch:id==='sofa'?0:-.91};
}
function playerEye(){return [player.x,player.y+(posture?.eye||1.65),player.z];}
function enterPosture(id,kind){
 if(held||posture||!movable(id)||renderer?.xrMode?.active)return false;
 const pose=furniturePose(id,bodies[id]);
 if(!pose||pose.y<-.05||pose.y>.25||groundAt(pose.x,pose.z)<-.1){$('notice').textContent='Möbel steht nicht sicher – zuerst richtig abstellen';return false;}
 chooseWeapon('none');clearControls();
 posture={id,kind,eye:pose.eye,returnPose:{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch,first},sleeping:false};
 first=true;Object.assign(player,{x:pose.x,z:pose.z,y:pose.y,vy:0,yaw:pose.yaw,pitch:pose.pitch});
 $('notice').textContent=kind==='sit'?'Du sitzt auf dem Sofa':'Du liegst im Bett';
 return true;
}
function setSleeping(on){
 if(!posture||posture.kind!=='lie')return;
 posture.sleeping=!!on;clearControls();$('sleep-overlay').hidden=!posture.sleeping;
 $('notice').textContent=posture.sleeping?'Du schläfst':'Du bist aufgewacht';
}
function leavePosture(){
 if(!posture)return true;
 const previous=posture,base=previous.returnPose,oldY=player.y;
 const candidates=[[base.x,base.z]];
 for(const radius of [1.1,1.6,2.1,2.7,3.4])for(let i=0;i<16;i++){const a=i*Math.PI/8;candidates.push([player.x+radius*Math.cos(a),player.z+radius*Math.sin(a)]);}
 const spawn=HOTEL_LAYOUT.spawn.p;candidates.push([spawn[0],spawn[2]]);
 player.y=0;
 const place=candidates.find(([x,z])=>groundAt(x,z)>=-.05&&!coll(x,z));
 if(!place){player.y=oldY;setSleeping(false);$('notice').textContent='Kein freier Platz zum Aufstehen';return false;}
 posture=null;$('sleep-overlay').hidden=true;first=base.first;clearControls();
 Object.assign(player,{x:place[0],z:place[1],y:groundAt(...place),vy:0,yaw:base.yaw,pitch:base.pitch});
 $('notice').textContent='Aufgestanden';return true;
}
function secondaryInteraction(){
 if(!canPlay()||lobbyState||lobbyTransition||busy||held)return;
 if(posture){if(posture.kind==='lie')setSleeping(!posture.sleeping);return;}
 const hit=interactionTarget(),primary=primaryInteraction(hit);
 if(primary?.secondary&&movable(primary.id))pickUp(primary.id);
}
function pickUp(id){
 if(!movable(id)||held||posture)return;
 chooseWeapon('none');held=id;heldAngle=yawAngle(bodies[held].q);
 $('notice').textContent='Gegenstand aufgenommen · Q/F: drehen · E: abstellen';
}
function updateWorldStatus(){
 const message=lobbyState?'Hotelflur · '+lobbyState.online+' / '+lobbyState.capacity+' Gäste · Zimmer '+lobbyDoor(lobbyState.slot).number:personalWorld?'Privater Startraum':state.unlocked?'Testbereich freigeschaltet':'Startraum';
 $('worldstate').textContent=message;$('phone-worldstate').textContent=message;
}
async function lobbyRequest(data,keepalive=false){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
 try{
  const res=await fetch('/api/lobby',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(protectedGame?{'X-SecondLive-Token':token}:{})},body:JSON.stringify(data),signal:controller.signal,keepalive});
  const result=await res.json();if(!res.ok){const e=Error(result.error||'Hotelflur nicht erreichbar');e.status=res.status;throw e;}return result;
 }finally{clearTimeout(timer);}
}
async function enterLobby(){
 if(!lobbyEnabled||lobbyState||lobbyTransition||busy||held||posture)return;
 lobbyTransition=true;chooseWeapon('none');clearControls();$('notice').textContent='Hotelflur wird verbunden …';
 try{
  const result=await lobbyRequest({action:'enter'});
  if(!lobbyDoor(result.slot)||!Array.isArray(result.position)||!lobbyWalkable(result.position[0],result.position[2])||typeof result.lease!=='string')throw Error('Ungültige Flursitzung');
  lobbyState={slot:result.slot,lease:result.lease,online:result.online,capacity:result.capacity,lastOK:performance.now(),sending:false};
  renderer.lobby.setOwn(result.slot);renderer.lobby.sync(result.peers||[]);
  Object.assign(player,{x:result.position[0],y:0,z:result.position[2],yaw:result.yaw,pitch:0,vy:0});
  audio.play('door');updateWorldStatus();$('notice').textContent='Willkommen im Hotelflur. Dein Zimmer: '+lobbyDoor(result.slot).number;
 }catch(e){$('notice').textContent=e.message||'Hotelflur nicht erreichbar';}
 finally{lobbyTransition=false;clearControls();}
}
function returnToRoom(message='Du bist wieder in deinem Zimmer.',notify=true){
 const old=lobbyState;if(!old)return;
 lobbyState=null;lobbyTransition=false;renderer.lobby.clear();clearControls();player.y=0;player.vy=0;
 const spawn=HOTEL_LAYOUT.spawn.p,candidates=[[0,-3.8],[-.8,-3.6],[.8,-3.6],[spawn[0],spawn[2]]];
 for(let z=-3.8;z<=4;z+=.65)for(let x=-4;x<=4;x+=.65)candidates.push([x,z]);
 const p=candidates.find(([x,z])=>groundAt(x,z)>=-.05&&!coll(x,z))||[spawn[0],spawn[2]];
 Object.assign(player,{x:p[0],z:p[1],y:groundAt(...p),yaw:Math.PI,pitch:0,vy:0});
 audio.play('door');updateWorldStatus();$('notice').textContent=message;
 if(notify)lobbyRequest({action:'leave',lease:old.lease},true).catch(()=>{});
}
async function updateLobby(){
 const visit=lobbyState;if(!visit||visit.sending||lobbyTransition)return;
 visit.sending=true;
 try{
  const result=await lobbyRequest({action:'update',lease:visit.lease,position:[player.x,player.y,player.z],yaw:player.yaw});
  if(lobbyState!==visit)return;
  visit.lastOK=performance.now();visit.online=result.online;visit.capacity=result.capacity;renderer.lobby.sync(result.peers||[]);updateWorldStatus();
 }catch(e){
  if(lobbyState!==visit)return;
  if(e.status===409||performance.now()-visit.lastOK>LOBBY_LAYOUT.leaseSeconds*1000){returnToRoom('Flurverbindung beendet. Du bist wieder in deinem Zimmer.',false);}
  else $('notice').textContent='Flurverbindung unterbrochen – erneuter Verbindungsversuch';
 }finally{visit.sending=false;}
}
setInterval(updateLobby,LOBBY_LAYOUT.pollMilliseconds);
window.addEventListener('pagehide',()=>{if(lobbyState)lobbyRequest({action:'leave',lease:lobbyState.lease},true).catch(()=>{});});
function lobbyInteraction(ray=null){
 if(!lobbyState)return null;const {origin,direction}=interactionRay(ray);return lobbyDoorAt(origin,direction);
}
function updateInteractionHint(vr=false){
  const playing=canPlay()&&!vr,panel=$('interaction-prompt'),actionButton=$('touchInteract'),repairButton=$('touchRepair');
  $('touchRotateLeft').hidden=$('touchRotateRight').hidden=!held;
  let name='',lines=[],short='Aktion',secondary='',canAct=false,canRepair=false;
  if(playing&&lobbyState){
    const door=lobbyInteraction();if(door){name='Zimmer '+door.number;if(door.slot===lobbyState.slot){short='Zimmer betreten';canAct=true;lines.push(mobile?short:'E · '+short);}else lines.push('Privates Gästezimmer · kein Zutritt');}
  }else if(playing&&posture){
    name=posture.kind==='sit'?'Sofa · sitzend':posture.sleeping?'Bett · schlafend':'Bett · liegend';
    short=posture.sleeping?'Aufwachen':'Aufstehen';canAct=true;
    lines.push(mobile?short:'E · '+short);
    if(posture.kind==='lie'&&!posture.sleeping){secondary='Schlafen';lines.push(mobile?'Schlafen':'F · Schlafen');}
  }else if(playing&&held){
    const clear=!!placementPoint(held);
    name=objectName(held);canAct=clear;short='Abstellen';
    lines.push(clear?(mobile?'Abstellen: Stellplatz frei':'E · Abstellen'):'Stellplatz blockiert');
    lines.push(mobile?'Drehtasten · 90°':'Q / F · Drehen');
  }else if(playing){
    const hit=interactionTarget(),primary=primaryInteraction(hit),fix=repairTarget(null,hit),id=hit.dist<=3?hit.id:null;
    const door=doorInView(hit);
    if(primary){name=objectName(primary.id);lines.push(mobile?primary.label:'E · '+primary.label);short=primary.short;canAct=true;if(primary.secondary){secondary=primary.secondary;lines.push(mobile?secondary:'G · '+secondary);}}
    else if(door){name='Zimmertür';if(lobbyEnabled){short='Flur betreten';canAct=true;lines.push(mobile?short:'E · '+short);}else lines.push('Gemeinsamer Flur nicht verfügbar');}
    else if(id&&CURTAIN_TARGETS.has(id)&&!curtainsUsable()){name=objectName(id);lines.push('Vorhänge oder Stange zuerst reparieren');}
    if(fix&&damaged(fix.id)){
      if(!name)name=objectName(fix.id);
      lines.push((mobile?'':'R · ')+(objectName(fix.id)===name?'Reparieren':objectName(fix.id)+' reparieren'));canRepair=true;
    }
    if(!name&&id&&!WALLS[id]){name=objectName(id);lines.push('Keine Aktion verfügbar');}
  }
  panel.hidden=!name;
  if(name){if($('interaction-name').textContent!==name)$('interaction-name').textContent=name;const msg=lines.join('  |  ');if($('interaction-actions').textContent!==msg)$('interaction-actions').textContent=msg;}
  $('cross').classList.toggle('actionable',playing&&(canAct||canRepair));
  if(actionButton.textContent!==short)actionButton.textContent=short;
  actionButton.disabled=!canAct||busy||lobbyTransition;repairButton.disabled=!canRepair||busy;
  const extra=$('touchSecondary');extra.hidden=!secondary;extra.disabled=busy;extra.textContent=secondary||'Weitere Aktion';
  $('touchZoom').hidden=equipped!=='rifle'||!!posture||!!held;$('touchZoom').disabled=!!reloadId;
  $('touchFire').disabled=!!posture||!!lobbyState||lobbyTransition;$('touchJump').disabled=!!posture;
  $('touchReload').disabled=!!posture||!!lobbyState||!equipped;
  $('hint').textContent=started?(lobbyState?'Gemeinsamer Hotelflur · E: eigenes Zimmer':mobile?'Handy · Inventar':'P: Smartphone · I: Inventar · Mausrad: Waffenwechsel'):'Spiel starten';
}
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
  if(id!=='surface_rug'&&overlap([player.x,player.y+.8,player.z],[.56,1.6,.56]))return null;
  if(collisionRoom().some(b=>!['surface_0','surface_1'].includes(b.surfaceId)&&overlap(b.p,b.s)))return null;
  if(id!=='surface_rug'&&Object.entries(bodies).some(([k,b])=>k!==id&&k!=='surface_rug'&&state.objects[k]>0&&overlap(b.p,boundsSize(spec[k].s,b.q))))return null;
  return p.map(v=>Math.round(v*10000)/10000);
}
async function interact(ray=null){if(!canPlay()||busy||lobbyTransition)return;if(lobbyState){const door=lobbyInteraction(ray);if(door?.slot===lobbyState.slot)returnToRoom();else if(door)$('notice').textContent='Dieses Gästezimmer ist privat.';return;}if(posture){if(posture.sleeping)setSleeping(false);else leavePosture();return;}if(held){const id=held,p=placementPoint(id);if(!p){$('notice').textContent='Kein freier Stellplatz – weiter bewegen';return;}const angle=heldAngle;if(await action('place_object',id,null,{position:p,rotation:angle})){held=null;bodies[id]={p:[...p],v:[0,0,0],q:yawQuat(angle)};}return;}
  const hit=interactionTarget(ray),primary=primaryInteraction(hit,ray);
  if(primary?.op==='toggle_light'){audio.play('click');await action(primary.op,primary.id);return;}
  if(primary?.op==='toggle_curtains'){await action(primary.op,primary.id);return;}
  if(primary?.op==='sit'||primary?.op==='lie'){enterPosture(primary.id,primary.op);return;}
  if(primary?.op==='pick_up'){pickUp(primary.id);return;}
  if(doorInView(hit,ray)){if(lobbyEnabled)await enterLobby();else $('notice').textContent='Gemeinsamer Hotelflur nicht verfügbar.';}
}
function groundAt(x,z){if(lobbyState)return 0;if(z<-5&&state.unlocked&&!lobbyEnabled)return 0;return floorSupported(WALLS.surface_0,state.walls?.surface_0||[],x,z)?0:-1.35;}
function coll(x,z){if(lobbyState)return !lobbyWalkable(x,z);if(Math.abs(x)>4.65||z>4.65||z<(!lobbyEnabled&&state.unlocked?-14.5:-4.65))return true;if(z<-4.65&&Math.abs(x)>.72&&z>-5.4)return true;return collisionRoom().some(b=>b.p[1]-b.s[1]/2<player.y+1.6&&b.p[1]+b.s[1]/2>Math.max(.1,player.y+.1)&&[.25,.85,1.45].some(h=>solidContains(b,[x,player.y+h,z],.25)))||Object.entries(bodies).some(([id,b])=>id!==held&&id!=='surface_rug'&&state.objects[id]>0&&(()=>{const s=boundsSize(spec[id].s,b.q);return b.p[1]-s[1]/2<player.y+1.6&&b.p[1]+s[1]/2>player.y+.1&&Math.abs(x-b.p[0])<s[0]/2+.28&&Math.abs(z-b.p[2])<s[2]/2+.28;})());}
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
$('restore-hotel').onclick=async()=>{if(lobbyState||lobbyTransition){$('notice').textContent='Bitte zuerst in dein Zimmer zurückkehren.';return;}if(busy||!confirm('Möbel auf Hotel-Standardpositionen zurücksetzen? Schäden und Fortschritt bleiben erhalten.'))return;if(posture&&!leavePosture())return;if(held){bodies[held]=savedBody(state,held);held=null;}if(await action('reset_hotel_layout',null,null,{confirm:true})){for(const id of Object.keys(spec))if(id!=='window')bodies[id]=savedBody(state,id);const p=HOTEL_LAYOUT.spawn.p;player.x=p[0];player.y=0;player.z=p[2];player.vy=0;player.yaw=HOTEL_LAYOUT.spawn.yaw;player.pitch=0;updatePhone();}};
$('closephone').onclick=()=>{$('phone').hidden=true;clearControls();active=true;};$('refresh').onclick=async()=>{try{await refresh();$('notice').textContent='Weltstatus aktualisiert';updatePhone();}catch(e){$('notice').textContent=e.message;}};
canvas.onclick=()=>{if(mobile||!canPlay())return;void audio.unlock();if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.()?.catch?.(()=>{});active=true;}};
canvas.addEventListener('pointerdown',e=>{if(!mobile&&e.button===0&&document.pointerLockElement===canvas&&canPlay())pressTrigger();});
canvas.addEventListener('contextmenu',e=>{if(canPlay()&&!mobile)e.preventDefault();});
window.addEventListener('mousedown',e=>{if(e.button===2&&!mobile&&document.pointerLockElement===canvas&&canPlay()){e.preventDefault();toggleScope();}});
window.addEventListener('wheel',e=>{
 if(!canPlay()||lobbyState||lobbyTransition||renderer?.xrMode?.active||mobile||held||posture||!e.deltaY)return;
 e.preventDefault();
 const now=performance.now();if(now-lastWheel<140)return;lastWheel=now;
 chooseWeapon(nextWeapon(equipped,e.deltaY));
},{passive:false});
window.addEventListener('pointerup',e=>{if(triggerPointer===null||triggerPointer===e.pointerId)releaseTrigger();});
window.addEventListener('pointercancel',releaseTrigger);
window.addEventListener('keydown',e=>{if(!active||!started||!$('updater').hidden)return;if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyE')interact();if(e.code==='KeyQ')turnHeld(-90);if(e.code==='KeyF'){if(posture?.kind==='lie')secondaryInteraction();else turnHeld(90);}if(e.code==='KeyG'&&!posture)secondaryInteraction();if(e.code==='KeyV'&&!posture){setScopeZoom(false);first=!first;}if(e.code==='KeyP')phone();if(e.code==='KeyI')arsenal();if(e.code==='Digit1')chooseWeapon('pistol');if(e.code==='Digit2')chooseWeapon('rifle');if(e.code==='Digit3')chooseWeapon('m16');if(e.code==='Digit0')chooseWeapon('none');if(e.code==='KeyT')startReload();if(e.code==='KeyR')repair();});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)clearControls();});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&canPlay()&&!posture?.sleeping){const sensitivity=scopeZoom ? .0012 : .003;player.yaw-=e.movementX*sensitivity;player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch+e.movementY*sensitivity));}});
function part(p,s,c,r=0,q=null){draw({p,s,c:rgb(c),r,q,m:mat(c)});}
function canPlay(){return started&&active&&$('phone').hidden&&$('arsenal').hidden&&$('updater').hidden;}
function fire(ray=null){
  if(!canPlay()||lobbyState||lobbyTransition||posture||!equipped||busy||reloadId)return;
  if(ammo[equipped]<=0){startReload();return;}
  const direction=ray?.direction||dir(),origin=ray?.origin||playerEye(),a=renderer.surfaceHit(origin,direction,held);
  ammo[equipped]--;updateAmmo();
  renderer.shot(equipped,{origin,direction,distance:Math.min(8,a.dist),impact:a.dist<=8});
  audio.play('shot',null,weaponIds.indexOf(equipped));if(a.dist<=8)audio.play('impact',origin.map((v,i)=>v+direction[i]*a.dist));
  $('cross').classList.add('pulse');setTimeout(()=>$('cross').classList.remove('pulse'),100);
  if(a.id&&state.objects[a.id]>0&&!movableDecor(a.id)){physicsWorld.impulse(a.id,direction);action('hit',a.id,a.mark);}else if(WALLS[a.id])action('damage_wall',a.id,a.mark);else if(DECOR_BOUNDS[a.id])action('damage_decor',a.id,a.mark);else if(a.id?.startsWith('surface_'))action('mark_surface',a.id,a.mark);else $('notice').textContent=a.dist<=8?'Oberfläche ohne Schadensspeicher':'Kein Objekt getroffen';
}
function repairTarget(ray=null,surface=null){
  const {origin,direction}=interactionRay(ray);surface=surface||interactionTarget(ray);const a=Object.entries(spec).some(([id,o])=>!o.decor&&state.objects[id]===0)?aim(ray):{id:null,dist:Infinity};let wall=null,dist=3;
  for(const [id,w] of Object.entries(WALLS)){if(!state.walls?.[id]?.some(c=>c[2]>=REMOVED))continue;const d=rayBox(origin,direction,w.p,w.s);if(d<dist&&d<=surface.dist+.01){dist=d;wall=id;}}
  for(const [id,original] of Object.entries(DECOR_BOUNDS)){
    if(!removed(id))continue;
    const o=decorBoundsAt(id,original);
    const p=movableDecor(id)?(state.placements?.[id]||spec[id].p):o.p,q=movableDecor(id)?yawQuat(state.rotations?.[id]||0):null;
    const d=rayBox(origin,direction,p,o.s,q);if(d<dist&&d<=surface.dist+.01){dist=d;wall=id;}
  }
  if(a.id&&!movableDecor(a.id)&&state.objects[a.id]===0&&a.dist<Math.min(3,dist)&&a.dist<=surface.dist+.01)return {id:a.id,op:'repair'};
  if(wall)return {id:wall,op:'repair_surface'};
  if(surface.id&&surface.dist<3)return {id:surface.id,op:surface.id.startsWith('surface_')?'repair_surface':'repair'};
  return null;
}
function repair(ray=null){
  if(!canPlay()||lobbyState||lobbyTransition||busy||held||posture)return;
  const target=repairTarget(ray);
  if(target&&damaged(target.id))action(target.op,target.id);
}
$('mode').onclick=()=>setMode(!mobile);setMode(mobile);
const stick=$('stick');let stickId=null;function moveStick(e){let r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.36),y=(e.clientY-r.top-r.height/2)/(r.height*.36),l=Math.max(1,Math.hypot(x,y));touchMove=[x/l,-y/l];stick.style.setProperty('--jx',`${x/l*33}px`);stick.style.setProperty('--jy',`${y/l*33}px`);}stick.addEventListener('pointerdown',e=>{if(!canPlay()||stickId!==null)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId&&canPlay())moveStick(e);});for(const n of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(n,e=>{if(e.pointerId===stickId){stickId=null;touchMove=[0,0];stick.style.setProperty('--jx','0px');stick.style.setProperty('--jy','0px');}});
canvas.addEventListener('pointerdown',e=>{if(!canPlay()||posture?.sleeping||(!mobile&&document.pointerLockElement===canvas))return;if(look)return;look={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!look||look.id!==e.pointerId||!canPlay()||posture?.sleeping)return;const sensitivity=scopeZoom ? .002 : .005;player.yaw-=(e.clientX-look.x)*sensitivity;player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch+(e.clientY-look.y)*sensitivity));look.x=e.clientX;look.y=e.clientY;});for(const n of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(n,e=>{if(look?.id===e.pointerId)look=null;});
for(const [id,fn] of [['touchInteract',interact],['touchSecondary',secondaryInteraction],['touchZoom',toggleScope],['touchRotateLeft',()=>turnHeld(-90)],['touchRotateRight',()=>turnHeld(90)],['touchReload',startReload],['touchRepair',()=>repair()],['touchView',()=>{if(!posture){setScopeZoom(false);first=!first;}}],['touchPhone',phone],['touchArsenal',arsenal],['touchJump',()=>{if(!posture&&Math.abs(player.y-groundAt(player.x,player.z))<1e-5)player.vy=4.2;}]])$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())fn();});const fireButton=$('touchFire');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();if(!canPlay()||triggerPointer!==null)return;void audio.unlock();pressTrigger();if(triggerHeld){triggerPointer=e.pointerId;fireButton.setPointerCapture?.(e.pointerId);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(event,e=>{if(triggerPointer===e.pointerId)releaseTrigger();});
window.addEventListener('blur',()=>{clearControls();audio.stopAll();});document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});

let prev=performance.now();
function frame(now,xrFrame){
  let dt=Math.max(0,Math.min(.035,(now-prev)/1000));prev=now;
  const vr=!!renderer.xrMode?.active;const xrInput=vr?renderer.xrMode.inputs(xrFrame):null;
  if(started&&active&&!posture&&!lobbyTransition){
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
  if(started&&!lobbyState){
    let holdPoint=[0,0,0];if(held){const s=spec[held].s,[x,z]=horizontalHold(held),floor=groundAt(x,z),d=dir(),dist=1.0+Math.hypot(s[0],s[2])*.52;
      const y=movableDecor(held)?floor+s[1]/2:Math.min(2.85-s[1]/2,Math.max(floor+s[1]/2,player.y+1.2+d[1]*dist));holdPoint=[x,y,z];}
    physicsWorld.step(dt,bodies,lobbyEnabled?{...state,unlocked:false}:state,held,holdPoint,debris,yawQuat(heldAngle));
  }
  if(posture){
    const pose=furniturePose(posture.id,bodies[posture.id]);
    if(!movable(posture.id)||!pose||pose.y<-.05||pose.y>.25||Math.hypot(player.x-pose.x,player.z-pose.z)>.25||groundAt(pose.x,pose.z)<-.1)leavePosture();
    else{player.x=pose.x;player.z=pose.z;player.y=pose.y;player.vy=0;}
  }
  let d=dir(),eye=playerEye(),target=eye.map((v,i)=>v+d[i]);
  if(!first&&!vr&&!posture){let t=eye.map((v,i)=>v-d[i]*2.1);if(!coll(t[0],t[2])){eye=t;target=eye.map((v,i)=>v+d[i]);}}
  renderer.begin();
  if(lobbyState){
    renderer.lobby.step(dt,player,!first&&!vr&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5);
    renderer.equip(null,false);renderer.render(canvas,eye,target,mobile,dt,player,false,true);
    if(performance.now()-lastInteractionHint>=100){lastInteractionHint=performance.now();updateInteractionHint(vr);}
    return;
  }
  renderer.setDoorOpen?.(!lobbyEnabled&&state.unlocked);
  renderer.advanceCurtains?.(dt,state.decor||{});
  if(state.unlocked&&!lobbyEnabled){part([0,-.12,-10],[10,.24,10],'a8a69a');part([-4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([0,1.4,-15],[10,2.8,.2],'c1b6a6');}
  for(let [id,b] of Object.entries(bodies)){
    let o=spec[id],hp=state.objects[id];
    if(o.decor){renderer.drawMovableDecor(id,b.p,o.s,b.q,hp>0,id===held);continue;}
    if(hp>0){if(!renderer.drawModel(id,b.p,o.s,hp,o.max,b.q))part(b.p,o.s,id==='window'?o.c:hp<o.max?'947665':o.c,0,b.q);}else {for(let i=0;i<4;i++){let a=i*1.73;const at=state.placements?.[id]||o.p,x=id==='window'?-4.42:at[0];part([x+Math.cos(a)*.19,at[1]-o.s[1]/2+.032,at[2]+Math.sin(a)*.26],id==='window'?[.13,.012,.08]:[.23,.06,.12],o.c,a);}}
  }
  for(let b of debris)draw(b);
  if(!first&&!vr&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5){part([player.x,player.y+1,player.z],[.5,1.1,.32],'354d65');part([player.x,player.y+1.7,player.z],[.32,.34,.32],'cba384');}
  renderer.syncMarks(state.marks||[]);
  if(started&&active)audio.listener(eye,d);renderer.equip(equipped,first&&started&&!scopeZoom);renderer.render(canvas,eye,target,mobile,dt,player,scopeZoom);
  if(performance.now()-lastInteractionHint>=100){lastInteractionHint=performance.now();updateInteractionHint(vr);}
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
  mode.onAction=(type,ray)=>{if(!canPlay())return;if(lobbyState){if(type==='select')interact(ray);return;}if(type==='repair'){repair(ray);return;}if(!equipped&&lobbyEnabled&&doorInView(interactionTarget(ray),ray)){interact(ray);return;}if(!equipped&&!busy){const primary=primaryInteraction(interactionTarget(ray),ray);if(primary?.op==='toggle_curtains'||primary?.op==='toggle_light'){action(primary.op,primary.id);return;}}if(!lobbyEnabled&&!state.unlocked&&Math.abs(player.x)<1.5&&player.z<-3.25){$('notice').textContent='Weitere Welt noch nicht verfügbar.';return;}fire(ray);};
  button.onclick=async()=>{
    if(xrEntering||!started||!canPlay())return;
    if(mode.active){await mode.end();return;}
    if(posture&&!leavePosture())return;
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
    const health=await fetch('/api/health',{cache:'no-store'}).then(r=>r.json());protectedGame=health.requires_game_token===true; personalWorld=health.personal_world===true;lobbyEnabled=health.hotel_lobby===true; $('game-auth').hidden=!protectedGame;
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
