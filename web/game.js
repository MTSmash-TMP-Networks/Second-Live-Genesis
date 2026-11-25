import { RoomRenderer, RoomPhysics, HOTEL_LAYOUT, DECOR, curtainBounds, LOBBY_LAYOUT, lobbyDoor, lobbyWalkable, lobbyDoorAt, hotelOpenings, CHARACTER_OPTIONS, DEFAULT_CHARACTER, normalizeCharacter, WALLS, REMOVED, cellBox, solidRuns, solidContains, solidRay, floorSupported, nearestCell, PORTAL_SIDES, FREE_LAYOUT, FreeWorldView, freeBounds, freeRay, freePlacement, freeBlocked, freeGround, freeExitAt, freeWorldDoorAt } from './engine/renderer.bundle.js';
import { GameAudio } from './audio.js';
const audio=new GameAudio();
const $=id=>document.getElementById(id), canvas=$('world');
let renderer=null, physicsWorld=null, graphicsReady=false;
let equipped=null, xrEntering=false, xrReturnFirst=true, posture=null, scopeZoom=false, lastWheel=-Infinity;
let lobbyEnabled=false,lobbyState=null,lobbyTransition=false;
let freeEnabled=false,freeState=null,freeView=null,freeTool='build',freeSize=2,freeShape='cube',freeTexture=null;
let hotelHallPending=false,hotelNeighborPending=false,hotelViewEpoch=0,hotelViewMask='',hotelNeighborAt=0;
let accountsEnabled=false,accountProfile=null,authMode='login',studioOpen=false,editingFromGame=false,characterDraft=null,accountBusy=false;
const weaponIds=['pistol','rifle','m16'];
const weaponCycle=['none',...weaponIds];
function nextWeapon(current,direction){const i=Math.max(0,weaponCycle.indexOf(current||'none'));return weaponCycle[(i+(direction>0?1:-1)+weaponCycle.length)%weaponCycle.length];}
// Abstract, tunable game parameters, not real firearm specifications.
const clipSize={pistol:12,rifle:1,m16:40};
const ammo={...clipSize};let reloadLeft=0,reloadId=null;
const RELOAD_TIME={pistol:1.05,rifle:1.65,m16:1.35};
const FIRE_INTERVAL={pistol:.24,rifle:.45,m16:.08};
const GAME_IMPULSE={pistol:1,m16:1.4,rifle:1.8};
let triggerHeld=false,triggerPointer=null,fireCooldown=0;
function releaseTrigger(){triggerHeld=false;triggerPointer=null;}
function pressTrigger(){
 if(!canPlay()||posture||!equipped||lobbyState||lobbyTransition||reloadId)return;
 triggerHeld=equipped==='m16';fire();
}
function stepTrigger(dt){
 fireCooldown=Math.max(0,fireCooldown-dt);
 if(!canPlay()||posture||!equipped||lobbyState||lobbyTransition){releaseTrigger();return;}
 if(!reloadId&&ammo[equipped]===0)startReload(true);
 if(equipped!=='m16'){releaseTrigger();return;}
 if(triggerHeld&&!reloadId&&!busy&&fireCooldown<=0)fire();
}
function updateAmmo(){
 const el=$('ammo');
 el.textContent=!equipped?'':reloadId?'Wird nachgeladen …':ammo[equipped]===0?'Leer · Automatisches Nachladen':`${ammo[equipped]} / ${clipSize[equipped]} · T: Nachladen`;
}
function startReload(automatic=false){
 if(!canPlay()||posture||!equipped||reloadId||ammo[equipped]===clipSize[equipped]||lobbyState||lobbyTransition)return;
 if(automatic!==true||equipped!=='m16')releaseTrigger();
 setScopeZoom(false);reloadId=equipped;reloadLeft=RELOAD_TIME[reloadId];audio.play('reload',null,0);updateAmmo();
}
function stepReload(dt){
 if(!reloadId)return;
 const total=RELOAD_TIME[reloadId],before=reloadLeft;
 reloadLeft=Math.max(0,reloadLeft-dt);
 if(before>total*.48&&reloadLeft<=total*.48)audio.play('reload',null,1);
 renderer.reload?.(1-reloadLeft/total);
 if(reloadLeft===0){ammo[reloadId]=clipSize[reloadId];audio.play('click');reloadId=null;renderer.reload?.(0);updateAmmo();}
}
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
let state={walls:{},decor:{},marks:[],lights_on:true,curtains_closed:false,placements:{},rotations:{},objects:Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,o.max])),unlocked:false}, bodies=Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,{p:[...o.p],v:[0,0,0]}])), debris=[], busy=false, held=null, player={x:HOTEL_LAYOUT.spawn.p[0],z:HOTEL_LAYOUT.spawn.p[2],y:0,vy:0,yaw:HOTEL_LAYOUT.spawn.yaw,pitch:0,stance:'walk',eyeHeight:1.65}, keys=new Set(), first=true, started=false, active=false;
let lastInteractionHint=-Infinity, heldAngle=0;
const yawQuat=a=>[0,Math.sin(a*Math.PI/360),0,Math.cos(a*Math.PI/360)];
const quarter=a=>((Math.round(a/90)*90%360)+360)%360;
const yawAngle=q=>q?quarter(Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[2]*q[2]))*180/Math.PI):0;
const turnedSize=(s,a)=>a===90||a===270?[s[2],s[1],s[0]]:s;
const savedBody=(s,id)=>spec[id].imported?importedSavedBody(spec[id].row,spec[id].savedSize||spec[id].s):({p:[...(s.placements?.[id]||spec[id].p)],v:[0,0,0],q:yawQuat(s.rotations?.[id]||0)});
const movableDecor=id=>!!spec[id]?.decor;
function boundsSize(s,q){if(!q)return s;return [0,1,2].map(i=>{const axis=[0,0,0];axis[i]=1;return rotateInverse(axis,q).reduce((n,v,j)=>n+Math.abs(v)*s[j],0);});}
function turnHeld(delta){if(!canPlay()||busy||!held)return;heldAngle=quarter(heldAngle+delta);$('notice').textContent='Drehung: '+heldAngle+'°';}
function nextModelExtent(current,delta){
 return Math.max(.1,Math.min(2.4,Math.round((current+delta*.1)*100)/100));
}
function resizeHeld(delta){
 if(!canPlay()||busy||roomModelBusy||lobbyState||lobbyTransition||!held||!spec[held]?.imported||!state.objects[held])return;
 const o=spec[held],next=nextModelExtent(o.extent??o.row.extent,delta);
 if(next===(o.extent??o.row.extent))return;
 o.previewExtent=next;
 syncRoomModelBodies();
 updateInteractionHint();
}
function importedPlacementAllowed(o,p){
 const extent=o.extent??o.row.extent,margin=extent*Math.SQRT2/2,y=p[1]-o.s[1]/2;
 return y>=-0.00005&&y+extent<=2.9&&Math.abs(p[0])+margin<=4.72&&Math.abs(p[2])+margin<=4.72&&
  !(o.row.solid&&p[2]-margin<-3.65&&Math.abs(p[0])<.85+margin);
}
let mobile=matchMedia('(pointer:coarse)').matches, touchMove=[0,0], look=null,touchSprint=false,touchCrouch=false;
// Locomotion is independent of the seated/sleeping furniture state.
function movementStance(crouch,sprint,moving,canStand,blockedSprint){
 if(crouch||!canStand)return 'crouch';
 return sprint&&moving&&!blockedSprint?'sprint':'walk';
}
function movementSpeed(stance,vr=false){return vr?1.6:stance==='sprint'?5.8:stance==='crouch'?1.65:3.4;}
function wantsCrouch(){return touchCrouch||keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyC');}
function wantsSprint(){return touchSprint||keys.has('ShiftLeft')||keys.has('ShiftRight');}
function clearControls(){releaseTrigger();setScopeZoom(false);keys.clear();touchSprint=false;touchCrouch=false;touchMove=[0,0];look=null;$('stick').classList.remove('moving');$('stick').style.removeProperty('--jx');$('stick').style.removeProperty('--jy');}
function setMode(v){mobile=v;document.body.classList.toggle('mobile',v);$('mode').textContent=v?'Desktop-Modus':'Touch-Modus';clearControls();if(v)document.exitPointerLock?.();}
let token=sessionStorage.getItem('second_live_token')||'';let protectedGame=false,personalWorld=false; $('token').value=token;
const api=async(path,data)=>{
 const r=await fetch(path,{cache:'no-store',credentials:'same-origin',headers:{...(protectedGame?{'X-SecondLive-Token':token}:{}),'Content-Type':'application/json'},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 let j;try{j=await r.json();}catch{const e=Error('Spielserver antwortet nicht wie erwartet (HTTP '+r.status+').');e.status=r.status;throw e;}
 if(!r.ok){const e=Error(j?.error||r.status);e.status=r.status;e.code=j?.code;throw e;}return j;
};
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
    if(o.imported){s.objects[id]=o.row.hp??100;continue;}
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
let mutationVersion=0;async function refresh(){const v=mutationVersion;try{let s=await api('/api/game');if(!busy&&v===mutationVersion)sync(s);}catch(e){if(started&&accountsEnabled&&e.status===401)location.reload();throw e;}}
async function action(action,id,mark,extra={}){if(busy||lobbyState||freeState||lobbyTransition)return false;busy=true;mutationVersion++;try{if(spec[id]?.imported)return await importedAction(action,id,extra);const result=await api('/api/game',{action,id,...(mark?{mark}:{}),...extra});sync(result);if(action==='damage_wall'&&roomModelAllowed())void refreshRoomModels().catch(()=>{});$('notice').textContent=action==='reset_hotel_layout'?'Hotelanordnung wiederhergestellt':action==='toggle_curtains'?(result.curtains_closed?'Vorhänge geschlossen':'Vorhänge geöffnet'):action==='toggle_light'?(result.lights_on?'Licht eingeschaltet':'Licht ausgeschaltet'):action==='place_object'?'Gegenstand abgestellt und gespeichert':action==='repair'||action==='repair_surface'?'Oberfläche repariert':action==='unlock'?'Testbereich freigeschaltet':result.wall_result?.stage===REMOVED?'Bruchstück entfernt':result.wall_result?'Fläche beschädigt · Stufe '+result.wall_result.stage+'/'+REMOVED:result.decor_result?.stage===REMOVED?'Einrichtung zerstört':result.decor_result?'Einrichtung beschädigt · Stufe '+result.decor_result.stage+'/'+REMOVED:result.mark_saved===false?'Treffer registriert · Markierungslimit erreicht':'Treffer gespeichert';return true;}catch(e){$('notice').textContent=e.message;return false;}finally{busy=false;}}
function dir(){let a=player.yaw,p=player.pitch;return [-Math.sin(a)*Math.cos(p),-Math.sin(p),-Math.cos(a)*Math.cos(p)];}
function rotateInverse(v,q){if(!q)return v;const [x,y,z,w]=q,u=[-x,-y,-z],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=cross(u,v).map(n=>2*n),c=cross(u,t);return v.map((n,i)=>n+w*t[i]+c[i]);}
function rayBox(eye,d,p,s,q=null){let pos=rotateInverse(eye.map((v,i)=>v-p[i]),q),dir=rotateInverse(d,q),lo=0,hi=8;for(let i=0;i<3;i++){if(Math.abs(dir[i])<1e-8){if(Math.abs(pos[i])>s[i]/2)return Infinity;}else{let a=(-s[i]/2-pos[i])/dir[i],z=(s[i]/2-pos[i])/dir[i];lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));if(lo>hi)return Infinity;}}return lo;}
function aim(ray=null,includeDestroyed=true){let d=ray?.direction||dir(),eye=ray?.origin||playerEye(),best=8.01,id=null;for(const o of collisionRoom())best=Math.min(best,(solidRay(o,eye,d)??rayBox(eye,d,o.p,o.s)));if(lobbyEnabled||!state.unlocked)best=Math.min(best,rayBox(eye,d,[0,1.1,-4.95],[1.85,2.2,.18]));for(const [k,b] of Object.entries(bodies)){if(k===held)continue;const live=state.objects[k]>0;if(!live&&!includeDestroyed)continue;const dist=rayBox(eye,d,live||spec[k].imported?b.p:(state.placements?.[k]||spec[k].p),spec[k].s,live||spec[k].imported?b.q:yawQuat(state.rotations?.[k]||0));if(dist<best){best=dist;id=k;}}return {id,dist:best};}
function setScopeZoom(on){
 scopeZoom=!!on&&equipped==='rifle'&&!held&&!posture&&!reloadId&&canPlay()&&!renderer?.xrMode?.active&&first;
 $('scope-overlay').hidden=!scopeZoom;
 $('touchZoom').textContent=scopeZoom?'Zoom aus':'Zoom';
 $('touchZoom').setAttribute('aria-pressed',String(scopeZoom));
 document.body.classList.toggle('scope-zoom',scopeZoom);
}
function toggleScope(){if(equipped!=='rifle'||held||posture||reloadId||!canPlay()||renderer?.xrMode?.active)return;if(!first)first=true;setScopeZoom(!scopeZoom);}
function chooseWeapon(id){if((held||posture||lobbyState||freeState||lobbyTransition)&&id!=='none')return;if(![...weaponIds,'none'].includes(id))return;setScopeZoom(false);releaseTrigger();if(reloadId){reloadId=null;reloadLeft=0;renderer?.reload?.(0);}equipped=id==='none'?null:id;updateAmmo();$('weaponstatus').textContent=equipped==='pistol'?'Pistole · Einzelfeuer':equipped==='rifle'?'Scharfschützengewehr · Einzelschuss · Rechtsklick: Zoom':equipped==='m16'?'M16 · Dauerfeuer':'Unbewaffnet';}
function arsenal(){if(freeState){phone('free');return;}if(!started||studioOpen||lobbyState||lobbyTransition){$('notice').textContent='Das Inventar ist in deinem Hotelzimmer verfügbar.';return;}phone('inventory');}
$('closearsenal').onclick=()=>showPhonePage('home');
for(const id of [...weaponIds,'none'])$('equip-'+id).onclick=()=>{if(!started||studioOpen||lobbyState||lobbyTransition)return;chooseWeapon(id);$('closephone').onclick();};
chooseWeapon('none');
function phone(page='home'){if(!started||studioOpen)return;if(renderer?.xrMode?.active){renderer.xrMode.end().then(()=>phone(page)).catch(e=>$('notice').textContent=e.message);return;}document.exitPointerLock?.();clearControls();$('phone').hidden=false;active=false;audio.stopAll();audio.play('phone');showPhonePage(page);updatePhone();}
const movable=id=>id&&id!=='window'&&Object.hasOwn(spec,id)&&state.objects[id]>0;
function updateWorldStatus(){
 const message=freeState?'Free World · '+freeState.online+' Spieler':lobbyState?'Hotelflur · '+lobbyState.online+' / '+lobbyState.capacity+' Gäste · Zimmer '+lobbyDoor(lobbyState.slot).number:accountProfile?'Zimmer '+lobbyDoor(accountProfile.slot).number+' · '+accountProfile.nickname:personalWorld?'Privater Startraum':state.unlocked?'Testbereich freigeschaltet':'Startraum';
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
 if(!lobbyEnabled||lobbyState||freeState||lobbyTransition||busy||held||posture)return;
 lobbyTransition=true;chooseWeapon('none');clearControls();$('notice').textContent='Hotelflur wird verbunden …';
 try{
  const result=await lobbyRequest({action:'enter'});
  if(!lobbyDoor(result.slot)||!Array.isArray(result.position)||!lobbyWalkable(result.position[0],result.position[2])||typeof result.lease!=='string')throw Error('Ungültige Flursitzung');
  lobbyState={slot:result.slot,lease:result.lease,online:result.online,capacity:result.capacity,lastOK:performance.now(),sending:false};
  resetHotelViews();renderer.lobby.restoreProjection();renderer.lobby.setOwn(result.slot,accountProfile);renderer.lobby.setRooms(result.rooms||[]);renderer.lobby.sync(result.peers||[]);renderer.lobby.syncNpc(result.npc);renderer.syncHallFacades(result.facades||[],result.slot,state);
  Object.assign(player,{x:result.position[0],y:0,z:result.position[2],yaw:result.yaw,pitch:0,vy:0,stance:'walk',eyeHeight:1.65});
  resetGreeting();
  audio.play('door');updateWorldStatus();$('notice').textContent='Willkommen im Hotelflur. Dein Zimmer: '+lobbyDoor(result.slot).number;
 }catch(e){$('notice').textContent=e.message||'Hotelflur nicht erreichbar';}
 finally{lobbyTransition=false;clearControls();}
}
function returnToRoom(message='Du bist wieder in deinem Zimmer.',notify=true){
 const old=lobbyState;if(!old)return;
 lobbyState=null;lobbyTransition=false;resetHotelViews();renderer.lobby.clear();resetGreeting();clearControls();player.y=0;player.vy=0;player.stance='walk';player.eyeHeight=1.65;
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
  const result=await lobbyRequest({action:'update',lease:visit.lease,position:[player.x,player.y,player.z],yaw:player.yaw,stance:player.stance});
  if(lobbyState!==visit)return;
  if(visit.offline)$('notice').textContent='Flurverbindung wiederhergestellt';visit.offline=false;visit.lastOK=performance.now();visit.online=result.online;visit.capacity=result.capacity;renderer.lobby.setRooms(result.rooms||[]);renderer.lobby.sync(result.peers||[]);renderer.lobby.syncNpc(result.npc);renderer.syncHallFacades(result.facades||[],visit.slot,state);updateWorldStatus();
 }catch(e){
  if(lobbyState!==visit)return;
  if(e.status===401){location.reload();return;}if(e.status===409||performance.now()-visit.lastOK>LOBBY_LAYOUT.leaseSeconds*1000){returnToRoom('Flurverbindung beendet. Du bist wieder in deinem Zimmer.',false);}
  else {visit.offline=true;$('notice').textContent='Flurverbindung unterbrochen – erneuter Verbindungsversuch';}
 }finally{visit.sending=false;}
}
setInterval(updateLobby,LOBBY_LAYOUT.pollMilliseconds);
function resetHotelViews(){
 hotelViewEpoch++;hotelViewMask='';hotelNeighborAt=0;
 renderer?.setNeighborSnapshot(null);
}
async function hotelViews(){
 if(!started||!accountProfile||!renderer||lobbyState||freeState||lobbyTransition||studioOpen)return;
 const opening=hotelOpenings(state.walls||{}),mask=String(opening.hall)+String(opening.neighbor);
 if(mask!==hotelViewMask){
  resetHotelViews();hotelViewMask=mask;
  if(!opening.hall){renderer.lobby.sync([]);renderer.lobby.syncNpc(null);}
 }
 const epoch=hotelViewEpoch,profile=accountProfile;
 const current=()=>epoch===hotelViewEpoch&&profile===accountProfile&&!lobbyState&&!freeState&&!lobbyTransition;
 if(opening.hall&&!hotelHallPending){
  hotelHallPending=true;
  api('/api/hotel/view',{action:'hall'}).then(data=>{if(current()&&hotelOpenings(state.walls||{}).hall){renderer.lobby.setRooms(data.rooms||[]);renderer.lobby.sync(data.peers||[]);renderer.lobby.syncNpc(data.npc);renderer.syncHallFacades(data.facades||[],profile.slot,state);}}).catch(()=>{}).finally(()=>hotelHallPending=false);
 }
 if(opening.neighbor&&!hotelNeighborPending&&performance.now()>=hotelNeighborAt){
  hotelNeighborPending=true;hotelNeighborAt=performance.now()+2000;
  api('/api/hotel/view',{action:'neighbor'}).then(data=>{if(current()&&hotelOpenings(state.walls||{}).neighbor)renderer.setNeighborSnapshot(data);}).catch(()=>{}).finally(()=>hotelNeighborPending=false);
 }
}
setInterval(hotelViews,500);
window.addEventListener('pagehide',()=>{if(lobbyState)lobbyRequest({action:'leave',lease:lobbyState.lease},true).catch(()=>{});});
// Trigger only once per encounter. Re-arm after separation, never on each poll.
const greeting={near:false,last:-Infinity,until:0};
function encounterGreeting(g,dist,now){
 if(dist>4)g.near=false;
 if(dist>2.4||g.near)return false;
 g.near=true;
 if(now-g.last<12000)return false;
 g.last=now;return true;
}
function resetGreeting(){greeting.near=false;greeting.last=-Infinity;greeting.until=0;$('npc-greeting').hidden=true;}
function updateGreeting(now,eye,direction){
 const npc=renderer.lobby.npc;
 if(!lobbyState||!canPlay()||document.hidden||!npc.visible){$('npc-greeting').hidden=true;return;}
 const distance=Math.hypot(npc.position.x-player.x,npc.position.z-player.z);
 if(encounterGreeting(greeting,distance,now)){
  greeting.until=now+2400;renderer.lobby.greetNpc();
  audio.listener(eye,direction);audio.play('greeting',[npc.position.x,1.65,npc.position.z],0);
 }
 $('npc-greeting').hidden=now>=greeting.until;
}
function lobbyInteraction(ray=null){
 if(!lobbyState)return null;const {origin,direction}=interactionRay(ray);if(freeEnabled&&freeWorldDoorAt(origin,direction))return {free:true};return lobbyDoorAt(origin,direction);
}
const CURTAIN_TARGETS=new Set(['surface_curtain_l','surface_curtain_r','surface_curtainrod','surface_windowframe','window']);
const OBJECT_NAMES={surface_bed:'Bett',surface_wardrobe:'Garderobe',surface_nightstand:'Nachttisch',surface_lamp:'Nachttischleuchte',surface_rug:'Teppich',surface_picture:'Kopfteil und Wandregal',surface_ceilinglamp:'Deckenbeleuchtung',surface_switch:'Lichtschalter',surface_outlet:'Steckdose',surface_doortrim:'Türzarge',surface_windowframe:'Fensterrahmen',surface_curtain_l:'Vorhänge',surface_curtain_r:'Vorhänge',surface_curtainrod:'Vorhangstange',surface_radiator:'Heizkörper',crate:'Koffer',table:'Schreibtisch',chair:'Stuhl',sofa:'Sofa',coffee_table:'Couchtisch',window:'Fenster'};
function objectName(id){
  if(OBJECT_NAMES[id])return OBJECT_NAMES[id];
  if(spec[id]?.imported)return spec[id].row.name;
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
function playerEye(){return [player.x,player.y+(posture?.eye||player.eyeHeight||1.65),player.z];}
function enterPosture(id,kind){
 if(held||posture||!movable(id)||renderer?.xrMode?.active)return false;
 const pose=furniturePose(id,bodies[id]);
 if(!pose||pose.y<-.05||pose.y>.25||groundAt(pose.x,pose.z)<-.1){$('notice').textContent='Möbel steht nicht sicher – zuerst richtig abstellen';return false;}
 chooseWeapon('none');clearControls();
 posture={id,kind,eye:pose.eye,yaw:pose.yaw,returnPose:{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch,first},sleeping:false};
 first=true;Object.assign(player,{x:pose.x,z:pose.z,y:pose.y,vy:0,yaw:pose.yaw,pitch:pose.pitch,stance:'walk',eyeHeight:1.65});
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
 const place=candidates.find(([x,z])=>groundAt(x,z)>=-.05&&!coll(x,z,1.6));
 if(!place){player.y=oldY;setSleeping(false);$('notice').textContent='Kein freier Platz zum Aufstehen';return false;}
 posture=null;$('sleep-overlay').hidden=true;first=base.first;clearControls();
 Object.assign(player,{x:place[0],z:place[1],y:groundAt(...place),vy:0,yaw:base.yaw,pitch:base.pitch,stance:'walk',eyeHeight:1.65});
 $('notice').textContent='Aufgestanden';return true;
}
function secondaryInteraction(){
 if(freeState){if(freeTool==='build')void freeEdit('remove');return;}
 if(canPlay()&&!lobbyState&&!lobbyTransition&&!busy&&held&&spec[held]?.imported){void dropImported();return;}
 if(!canPlay()||lobbyState||lobbyTransition||busy||held)return;
 if(posture){if(posture.kind==='lie')setSleeping(!posture.sleeping);return;}
 const hit=interactionTarget(),primary=primaryInteraction(hit);
 if(primary?.secondary&&movable(primary.id))pickUp(primary.id);
}
function pickUp(id){
 if(!movable(id)||held||posture)return;
 chooseWeapon('none');held=id;heldAngle=yawAngle(bodies[held].q);
 $('notice').textContent=spec[id].imported?'Gegenstand aufgenommen · +/-: Größe · Q/F: drehen · E: abstellen':'Gegenstand aufgenommen · Q/F: drehen · E: abstellen';
}
function updateInteractionHint(vr=false){
  if(freeState){updateFreeHint(vr);return;}
  $('touchFreeMode').hidden=true;$('touchFire').textContent='Feuer';$('touchArsenal').textContent='Inventar';
  const playing=canPlay()&&!vr,panel=$('interaction-prompt'),actionButton=$('touchInteract'),repairButton=$('touchRepair');
  $('touchRotateLeft').hidden=$('touchRotateRight').hidden=!held;
  const resize=playing&&!lobbyState&&!lobbyTransition&&!!held&&!!spec[held]?.imported&&state.objects[held]>0;
  $('held-model-size').hidden=!resize;
  if(resize){const extent=spec[held].extent??spec[held].row.extent;
    const mount=mountCandidate(held);
    $('held-mount').disabled=busy||roomModelBusy||!mount;
    $('held-mount').title=mount?'An dieser Wand befestigen (B)':'Auf eine freie Wandfläche in Reichweite schauen';
    $('held-model-extent').textContent=extent.toFixed(2).replace('.',',')+' m';
    $('held-size-minus').disabled=busy||roomModelBusy||extent<=.1;
    $('held-size-plus').disabled=busy||roomModelBusy||extent>=2.4;
  }
  let name='',lines=[],short='Aktion',secondary='',canAct=false,canRepair=false;
  if(playing&&lobbyState){
    const door=lobbyInteraction();if(door?.free){name='Free World';short='Betreten';canAct=true;lines.push(mobile?short:'E · Free World betreten');}else if(door){name='Zimmer '+door.number;if(door.slot===lobbyState.slot){short='Zimmer betreten';canAct=true;lines.push(mobile?short:'E · '+short);}else lines.push('Privates Gästezimmer · kein Zutritt');}
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
    if(spec[held]?.imported){secondary='Fallenlassen';lines.push(mobile?secondary:'G · Fallenlassen');if(!mobile)lines.push('+ / − · Größe','B · Wandbefestigung');}
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
  $('touchArsenal').disabled=!!lobbyState||lobbyTransition;
  $('touchFire').disabled=!!posture||!!lobbyState||lobbyTransition;$('touchJump').disabled=!!posture||player.stance==='crouch';
  $('touchSprint').disabled=!!posture||!!held||scopeZoom||lobbyTransition;$('touchCrouch').disabled=!!posture||lobbyTransition;
  $('touchSprint').setAttribute('aria-pressed',String(player.stance==='sprint'||touchSprint));$('touchCrouch').setAttribute('aria-pressed',String(player.stance==='crouch'||touchCrouch));
  $('touchReload').disabled=!!posture||!!lobbyState||!equipped;
  const movement=player.stance==='crouch'?' · Geduckt':player.stance==='sprint'?' · Sprint':'';
  $('hint').textContent=started?((lobbyState?'Gemeinsamer Hotelflur · E: eigenes Zimmer':mobile?'Handy · Inventar':'P: Smartphone · I: Inventar')+(mobile?'':' · Shift: Sprint · Strg/C: Ducken')+movement):'Spiel starten';
}
// Upright wall attachment is separate from ordinary floor placement.
function wallMountPose(w,anchor,size){
 if(!w||w.kind==='floor'||w.kind==='ceiling'||(w.verticalAxis??1)!==1)return null;
 const u=w.axis,b=2-u,inward=w.p[b]>0?-1:1,face=w.p[b]+inward*w.s[b]/2;
 if(Math.abs(anchor[b]-face)>=.035||Math.abs(anchor[u]-w.p[u])+size[0]/2+.02>w.s[u]/2||
    Math.abs(anchor[1]-w.p[1])+size[1]/2+.02>w.s[1]/2)return null;
 const at=[...anchor];at[b]=face;const center=[...at];center[b]+=inward*(size[2]/2+.012);
 const rotation=b===0?(inward>0?90:270):(inward>0?0:180);
 return {anchor:at,center,rotation,size:turnedSize(size,rotation)};
}
function mountCandidate(id,ray=null){
 const o=spec[id];if(!o?.imported||!state.objects[id])return null;
 const {origin,direction}=interactionRay(ray),hit=interactionTarget(ray),w=WALLS[hit.id];
 if(!w||hit.dist>3||!Number.isFinite(hit.dist))return null;
 const anchor=origin.map((v,i)=>v+direction[i]*hit.dist),mount=wallMountPose(w,anchor,o.s);
 if(!mount)return null;
 const cell=nearestCell(w,mount.anchor[w.axis]-w.p[w.axis],mount.anchor[1]-w.p[1]);
 if((state.walls?.[hit.id]||[]).some(c=>c[0]===cell[0]&&c[1]===cell[1]&&c[2]>=REMOVED))return null;
 const overlap=(p,s)=>mount.center.every((v,i)=>Math.abs(v-p[i])<(mount.size[i]+s[i])/2-.018);
 if(overlap([player.x,player.y+.8,player.z],[.56,1.6,.56])||collisionRoom().some(b=>overlap(b.p,b.s)))return null;
 if(Object.entries(bodies).some(([k,b])=>k!==id&&state.objects[k]>0&&overlap(b.p,boundsSize(spec[k].s,b.q))))return null;
 return {...mount,wall:hit.id};
}
async function mountHeld(){
 if(!canPlay()||busy||roomModelBusy||lobbyState||lobbyTransition||!held||!spec[held]?.imported)return;
 const id=held,m=mountCandidate(id);
 if(!m){$('notice').textContent='Auf eine freie, passende Wandfläche in Reichweite schauen';return;}
 await action('mount_import',id,null,{wall:m.wall,anchor:m.anchor});
}
function horizontalHold(id){
  const s=turnedSize(spec[id].s,heldAngle),d=dir(),dist=1.0+Math.hypot(s[0],s[2])*.52,flat=Math.hypot(d[0],d[2]);
  const dx=flat>.01?d[0]/flat:-Math.sin(player.yaw),dz=flat>.01?d[2]/flat:-Math.cos(player.yaw);
  const clamp=(v,h)=>{const limit=spec[id].imported?4.72-Math.max(h/2,(spec[id].extent??spec[id].row.extent)*Math.SQRT2/2+.04):4.84-h/2;return Math.max(-limit,Math.min(limit,v));};
  return [clamp(player.x+dx*dist,s[0]),clamp(player.z+dz*dist,s[2])];
}
function placementPoint(id){
  const s=turnedSize(spec[id].s,heldAngle),[x,z]=horizontalHold(id);
  const grounds=[[-1,-1],[-1,1],[1,-1],[1,1],[0,0]].map(([u,v])=>groundAt(x+u*s[0]*.45,z+v*s[2]*.45));if(grounds.some(v=>v!==grounds[0]))return null;
  const p=[x,grounds[0]+s[1]/2,z],overlap=(q,t)=>p.every((v,i)=>Math.abs(v-q[i])<(s[i]+t[i])/2-.018);
  if(spec[id].imported&&!importedPlacementAllowed(spec[id],p))return null;
  if(id!=='surface_rug'&&overlap([player.x,player.y+.8,player.z],[.56,1.6,.56]))return null;
  if(collisionRoom().some(b=>!['surface_0','surface_1'].includes(b.surfaceId)&&overlap(b.p,b.s)))return null;
  if(id!=='surface_rug'&&Object.entries(bodies).some(([k,b])=>k!==id&&k!=='surface_rug'&&state.objects[k]>0&&overlap(b.p,boundsSize(spec[k].s,b.q))))return null;
  return p.map(v=>Math.round(v*10000)/10000);
}
async function interact(ray=null){if(!canPlay()||busy||lobbyTransition)return;if(freeState){if(freeExitAt(playerEye(),dir()))await leaveFreeWorld();else if(freeTool==='build')void freeEdit('place');return;}if(lobbyState){const door=lobbyInteraction(ray);if(door?.free){await enterFreeWorld();return;}if(door?.slot===lobbyState.slot)returnToRoom();else if(door)$('notice').textContent='Dieses Gästezimmer ist privat.';return;}if(posture){if(posture.sleeping)setSleeping(false);else leavePosture();return;}if(held){const id=held,p=placementPoint(id);if(!p){$('notice').textContent='Kein freier Stellplatz – weiter bewegen';return;}const angle=heldAngle;if(await action('place_object',id,null,{position:p,rotation:angle})){held=null;bodies[id]={p:[...p],v:[0,0,0],q:yawQuat(angle)};}return;}
  const hit=interactionTarget(ray),primary=primaryInteraction(hit,ray);
  if(primary?.op==='toggle_light'){audio.play('click');await action(primary.op,primary.id);return;}
  if(primary?.op==='toggle_curtains'){await action(primary.op,primary.id);return;}
  if(primary?.op==='sit'||primary?.op==='lie'){enterPosture(primary.id,primary.op);return;}
  if(primary?.op==='pick_up'){pickUp(primary.id);return;}
  if(doorInView(hit,ray)){if(lobbyEnabled)await enterLobby();else $('notice').textContent='Gemeinsamer Hotelflur nicht verfügbar.';}
}
function groundAt(x,z){if(freeState)return freeGround(freeState.blocks,x,player.y,z);if(lobbyState)return 0;if(z<-5&&state.unlocked&&!lobbyEnabled)return 0;return floorSupported(WALLS.surface_0,state.walls?.surface_0||[],x,z)?0:-1.35;}
function coll(x,z,height=player.stance==='crouch'?1.12:1.6){if(freeState)return freeBlocked(freeState.blocks,x,player.y,z,height);if(lobbyState)return !lobbyWalkable(x,z);if(Math.abs(x)>4.65||z>4.65||z<(!lobbyEnabled&&state.unlocked?-14.5:-4.65))return true;if(z<-4.65&&Math.abs(x)>.72&&z>-5.4)return true;return collisionRoom().some(b=>b.p[1]-b.s[1]/2<player.y+height&&b.p[1]+b.s[1]/2>Math.max(.1,player.y+.1)&&[.25,height*.53,height-.15].some(h=>solidContains(b,[x,player.y+h,z],.25)))||Object.entries(bodies).some(([id,b])=>id!==held&&id!=='surface_rug'&&state.objects[id]>0&&(!spec[id].imported||spec[id].row.solid)&&(()=>{const s=boundsSize(spec[id].s,b.q);return b.p[1]-s[1]/2<player.y+height&&b.p[1]+s[1]/2>player.y+.1&&Math.abs(x-b.p[0])<s[0]/2+.28&&Math.abs(z-b.p[2])<s[2]/2+.28;})());}
let enteringGame=false,pendingAvatar=null;
function isPersonalSessionError(e){
 return e?.status===401&&(e.code==='session_required'||/^Persoenliche Sitzung fehlt/i.test(e.message||''));
}
function sameAccount(a,b){
 return !!a&&!!b&&Number.isInteger(a.slot)&&a.slot===b.slot&&a.nickname===b.nickname;
}
async function verifyAccountSession(expected){
 const actual=await api('/api/account',{action:'profile'});
 if(!sameAccount(expected,actual)){
  const e=Error('Das aktive Konto wurde gewechselt. Bitte melde dich erneut an.');e.status=401;e.code='session_required';throw e;
 }
 return actual;
}
function resumePendingAvatar(profile){
 const draft=pendingAvatar;pendingAvatar=null;
 return sameAccount(draft?.profile,profile)?{...draft.avatar}:null;
}
function recoverAccountSession(e){
 if(!accountsEnabled||!isPersonalSessionError(e))return false;
 // If already playing, a fresh document is required to discard private
 // room state, outstanding world requests and the active physics scene.
 if(started){active=false;started=false;clearControls();location.reload();return true;}
 if(studioOpen&&accountProfile&&characterDraft){
  pendingAvatar={profile:{nickname:accountProfile.nickname,slot:accountProfile.slot},avatar:{...characterDraft}};
 }
 studioOpen=false;editingFromGame=false;characterDraft=null;accountProfile=null;active=false;
 renderer?.studio?.clear();renderer?.roomModels?.clear();
 clearControls();document.exitPointerLock?.();
 $('account-phone').hidden=true;document.body.classList.remove('character-editing');
 showPhonePage('welcome');
 setAuthMode('login');
 $('account-password').value='';
 $('loginerror').textContent='Deine persönliche Sitzung ist nicht mehr gültig. Melde dich erneut mit deinem bestehenden Konto an. '+(pendingAvatar?'Deine aktuelle Charakterauswahl bleibt für dieses Konto erhalten.':'Dein Zimmer und Charakter bleiben gespeichert.');
 updateWorldStatus();window.dispatchEvent(new Event('sl-account-change'));return true;
}
function authButtons(){
 const ready=graphicsReady&&!accountBusy;
 $('account-submit').disabled=!ready;$('account-continue').disabled=!ready;
 $('auth-login').disabled=accountBusy;$('auth-register').disabled=accountBusy;
}
function setAuthMode(mode){
 authMode=mode==='register'?'register':'login';const register=authMode==='register';
 $('account-form').hidden=false;$('account-resume').hidden=true;$('auth-login').setAttribute('aria-pressed',String(!register));$('auth-register').setAttribute('aria-pressed',String(register));
 $('nickname-field').hidden=!register;$('account-nickname').disabled=!register;$('account-nickname').required=register;
 $('account-password').autocomplete=register?'new-password':'current-password';$('account-password').minLength=register?10:1;
 $('account-submit').textContent=register?'Konto erstellen':'Anmelden';
 $('account-note').textContent=register?'Mindestens 10 Zeichen. Dein bisheriger privater Raum wird bei gültiger alter Sitzung einmalig übernommen.':'Melde dich an, um dein Zimmer und deinen Charakter zu laden.';
 $('loginerror').textContent='';
}
function applyAccount(profile){
 if(!profile||typeof profile.nickname!=='string'||!lobbyDoor(profile.slot))throw Error('Ungültiges Spielerprofil');
 accountProfile={nickname:profile.nickname,slot:profile.slot,avatar:normalizeCharacter(profile.avatar)};
 renderer?.setCharacter(accountProfile);$('account-phone').hidden=false;$('account-phone-name').textContent=accountProfile.nickname+' · Zimmer '+lobbyDoor(accountProfile.slot).number;updateWorldStatus();window.dispatchEvent(new Event('sl-account-change'));
}
function openStudio(fromGame=false){
 if(!accountProfile||!graphicsReady||lobbyState||freeState||lobbyTransition)return;
 if(fromGame&&posture&&!leavePosture())return;
 editingFromGame=fromGame;studioOpen=true;characterDraft={...accountProfile.avatar};clearControls();active=false;document.exitPointerLock?.();
 document.body.classList.add('character-editing');showPhonePage('character');
 $('character-player').textContent=accountProfile.nickname+' · Zimmer '+lobbyDoor(accountProfile.slot).number;
 $('character-save').textContent=fromGame?'Charakter speichern':'Speichern und spielen';$('character-error').textContent='';
 renderCharacterFields();renderer.studio.set(characterDraft);
}
function updateAvatarModelStatus(){
 const studio=renderer?.studio,u=studio?.root?.userData,status=u?.realisticStatus;
 const node=$('character-model-status'),retry=$('character-model-retry');
 const previous=studio?.previous?' Die letzte fertige Vorschau bleibt sichtbar.':'';
 const message=status==='ready'?'Rocketbox · '+(u.realistic?.look.model.label||'')+' · 3D-Modell bereit':status==='loading'?'3D-Charakter wird geladen …'+previous:status==='fallback'?'Modell konnte nicht geladen werden. '+(u.realisticError||'')+previous:'';
 if(node&&node.textContent!==message)node.textContent=message;
 if(retry)retry.hidden=status!=='fallback';
}
// Rocketbox identities carry their own face, skin, hair and shoe meshes.
const studioFields=['model','height','top','topColor','trousersColor'];
function renderCharacterFields(){
 const area=$('character-fields');area.replaceChildren();
 for(const key of studioFields){
  const entry=CHARACTER_OPTIONS[key];
  const label=document.createElement('label');label.textContent=entry.label;
  if(key==='model')label.className='character-model-field';
  if(key==='trousersColor'&&![0,2].includes(characterDraft.top))label.hidden=true;
  const select=document.createElement('select');select.dataset.character=key;
  for(const [index,name] of entry.values.entries()){const o=document.createElement('option');o.value=String(index);o.textContent=name;select.append(o);}
  select.value=String(characterDraft[key]);select.onchange=()=>{
   characterDraft[key]=Number(select.value);
   if(key==='top')renderCharacterFields();
   renderer.studio.set(characterDraft);
  };label.append(select);area.append(label);
 }
 $('character-outfit-note').textContent=[0,2].includes(characterDraft.top)?'Oberteil und Hose lassen sich getrennt färben.':'Original-Outfit und Anzug sind zusammenhängende Kleidungsmodelle; die Farbe wirkt auf das gesamte Outfit.';
}
function closeStudio(){
 studioOpen=false;renderer?.studio?.clear();$('character-editor').hidden=true;document.body.classList.remove('character-editing');clearControls();
 if(editingFromGame){active=false;showPhonePage('settings');}else{showPhonePage('welcome');showAccountResume();}
}
function showAccountResume(){
 if(!accountProfile)return;
 $('account-form').hidden=true;$('account-resume').hidden=false;$('account-resume-name').textContent='Angemeldet als '+accountProfile.nickname;
}
async function authenticate(){
 if(!graphicsReady||accountBusy||!accountsEnabled||!$('account-form').reportValidity())return;
 accountBusy=true;authButtons();$('loginerror').textContent='';
 if(protectedGame)token=$('token').value;
 const data={action:authMode,email:$('account-email').value.trim(),password:$('account-password').value};
 if(authMode==='register')data.nickname=$('account-nickname').value;
 try{
  const profile=await api('/api/account',data);
  // A successful password check is not enough: confirm that the browser
  // actually sends the issued HttpOnly cookie back to this origin.
  let verified;
  try{verified=await verifyAccountSession(profile);}
  catch(e){
   if(isPersonalSessionError(e)){
    accountProfile=null;setAuthMode('login');
    throw Error('Anmeldung bestätigt, aber die Sitzung konnte nicht übernommen werden. Bitte Cookies für diese Spieladresse zulassen, dieselbe HTTP-/HTTPS-Adresse verwenden und erneut anmelden.');
   }
   throw e;
  }
  applyAccount(verified);$('account-password').value='';showAccountResume();
  if(protectedGame)sessionStorage.setItem('second_live_token',token);
  const draft=resumePendingAvatar(accountProfile);openStudio();
  if(draft&&studioOpen){characterDraft=normalizeCharacter(draft);renderCharacterFields();renderer.studio.set(characterDraft);}
 }catch(e){$('loginerror').textContent=e.message;}
 finally{data.password='';$('account-password').value='';accountBusy=false;authButtons();}
}
async function enterGame(){
 if(!graphicsReady||enteringGame)return;enteringGame=true;void audio.unlock();if(protectedGame)token=$('token').value;
 try{
  if(accountsEnabled){if(!accountProfile)throw Error('Bitte zuerst anmelden');await verifyAccountSession(accountProfile);}
  if(personalWorld&&!accountsEnabled)await api('/api/session',{});
  await refresh();if(protectedGame)sessionStorage.setItem('second_live_token',token);
  studioOpen=false;editingFromGame=false;renderer?.studio?.clear();document.body.classList.remove('character-editing');
  started=true;document.body.classList.add('playing');showPhonePage('home');$('phone').hidden=true;active=true;
  void refreshRoomModels().catch(e=>{$('room-model-message').textContent=e.message;});
  if(!mobile)canvas.requestPointerLock?.()?.catch?.(()=>{});
 }catch(e){if(!recoverAccountSession(e)){if(studioOpen)$('character-error').textContent=e.message;else $('loginerror').textContent=e.message;}}
 finally{enteringGame=false;}
}
$('auth-login').onclick=()=>setAuthMode('login');$('auth-register').onclick=()=>setAuthMode('register');
$('account-form').onsubmit=e=>{e.preventDefault();authenticate();};
$('account-continue').onclick=async()=>{
 if(accountBusy||!accountProfile)return;
 accountBusy=true;authButtons();
 try{await verifyAccountSession(accountProfile);openStudio();}
 catch(e){if(!recoverAccountSession(e))$('loginerror').textContent=e.message;}
 finally{accountBusy=false;authButtons();}
};
$('account-switch').onclick=async()=>{
 if(accountBusy)return;accountBusy=true;authButtons();
 try{
  try{await api('/api/account',{action:'logout'});}catch(e){if(!isPersonalSessionError(e))throw e;}
  pendingAvatar=null;accountProfile=null;$('account-phone').hidden=true;window.dispatchEvent(new Event('sl-account-change'));setAuthMode('login');
 }catch(e){$('loginerror').textContent=e.message;}finally{accountBusy=false;authButtons();}
};
$('character-left').onclick=()=>renderer.studio.turn(-Math.PI/6);$('character-right').onclick=()=>renderer.studio.turn(Math.PI/6);
$('character-random').onclick=()=>{for(const k of studioFields){const v=CHARACTER_OPTIONS[k];characterDraft[k]=k==='model'?1+Math.floor(Math.random()*(v.values.length-1)):Math.floor(Math.random()*v.values.length);}renderCharacterFields();renderer.studio.set(characterDraft);};
$('character-model-retry').onclick=()=>{if(studioOpen&&characterDraft)renderer.studio.set(characterDraft);};
$('character-cancel').onclick=()=>{if(!accountBusy)closeStudio();};
$('character-save').onclick=async()=>{if(accountBusy||!studioOpen)return;accountBusy=true;$('character-save').disabled=true;$('character-error').textContent='';
 try{
  await verifyAccountSession(accountProfile);
  applyAccount(await api('/api/account',{action:'avatar',expected_slot:accountProfile.slot,avatar:characterDraft}));
  if(editingFromGame)closeStudio();else await enterGame();
 }catch(e){if(!recoverAccountSession(e))$('character-error').textContent=e.message;}
 finally{accountBusy=false;$('character-save').disabled=false;authButtons();}
};
$('edit-character').onclick=()=>{if(lobbyState||freeState){$('notice').textContent='Bitte zuerst in dein Zimmer zurückkehren.';return;}openStudio(true);};
$('account-logout').onclick=async()=>{if(accountBusy||!confirm('Vom Spiel abmelden? Dein Zimmer und Charakter bleiben gespeichert.'))return;accountBusy=true;try{await api('/api/account',{action:'logout'});location.reload();}catch(e){$('notice').textContent=e.message;accountBusy=false;}};
$('start').onclick=()=>enterGame();
const phonePages={welcome:'welcome',character:'character-editor',home:'phone-page-home',world:'phone-page-world',settings:'phone-page-settings',models:'phone-page-models',inventory:'arsenal',free:'phone-page-free'};
function allowedPhonePage(page,playing,editing){
 if(editing)return 'character';
 if(!playing)return 'welcome';
 return ['home','world','settings','models','inventory','free'].includes(page)?page:'home';
}
function showPhonePage(page){
 page=allowedPhonePage(page,started,studioOpen);
 for(const [key,id] of Object.entries(phonePages))$(id).hidden=key!==page;
 $('phone').hidden=false;
 $('closephone').hidden=!started||studioOpen;$('phone-home').hidden=!started||studioOpen;
 if(page==='settings'||page==='welcome')$(page==='settings'?'settings-graphics':'login-graphics').append($('phone-graphics'));
 if(page==='free')updateFreeUI();
 $('phone').querySelector('.sl-phone-content').scrollTop=0;
}
function updatePhone(){const now=new Date();$('phone-clock').textContent=now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});$('phone-date').textContent=now.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});$('phone-worldstate').textContent=$('worldstate').textContent;$('phone-volume').value=String(Math.round(audio.volume*100));$('phone-sound').checked=audio.enabled;$('phone-volume-label').textContent=Math.round(audio.volume*100)+' %';}
$('phone-home').onclick=()=>{if(started&&!studioOpen&&$('updater').hidden)showPhonePage('home');};
$('phone-app-models').onclick=$('world-open-models').onclick=()=>{showPhonePage('models');updateRoomModelUI();void refreshRoomModels(true).catch(e=>{$('room-model-message').textContent=e.message;});};$('phone-app-world').onclick=()=>{showPhonePage('world');updatePhone();};$('phone-app-settings').onclick=()=>{showPhonePage('settings');updatePhone();};$('phone-app-inventory').onclick=()=>arsenal();$('phone-app-free').onclick=()=>showPhonePage('free');


// Free World is a separate, authenticated shared scene and server lease.
// The private room stays untouched while the player is in the creative area.
function freeDims(size=freeSize,shape=freeShape){
 return shape==='wall-z'?[size,size,1]:shape==='wall-x'?[1,size,size]:shape==='floor'?[size,1,size]:[size,size,size];
}
function freeShapeLabel(){return {'cube':'Würfel','wall-z':'Wandplatte Z','wall-x':'Wandplatte X','floor':'Bodenplatte'}[freeShape];}
function freeCandidate(){
 if(!freeState||freeExitAt(playerEye(),dir()))return null;
 const hit=freeRay(playerEye(),dir(),freeState.blocks);
 return freePlacement(hit,freeDims(),freeState.blocks,[[player.x,player.y,player.z],...freeState.peers.map(p=>p.position)]);
}
function freeTextureHeaders(){return protectedGame?{'X-SecondLive-Token':token}:{};}
async function freeRequest(data,keepalive=false){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const r=await fetch('/api/free-world',{method:'POST',cache:'no-store',credentials:'same-origin',keepalive,signal:controller.signal,headers:{...freeTextureHeaders(),'Content-Type':'application/json'},body:JSON.stringify(data)});
  const j=await r.json();if(!r.ok){const e=Error(j.error||'HTTP '+r.status);e.status=r.status;throw e;}return j;
 }finally{clearTimeout(timer);}
}
async function loadFreeTexture(id){
 const r=await fetch('/api/free-world/texture/'+encodeURIComponent(id),{headers:freeTextureHeaders(),credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('Textur nicht verfügbar');return r.blob();
}
function applyFreeSnapshot(s,result,initial=false){
 if(freeState!==s)return;
 if(initial||result.life!==s.life||result.corrected){
  Object.assign(player,{x:result.position[0],y:result.position[1],z:result.position[2],yaw:result.yaw,pitch:0,vy:0,stance:'walk',eyeHeight:1.65});
  if(!initial&&result.life!==s.life){clearControls();$('notice').textContent='Neu gespawnt · kurzer Schutz aktiv';}
  else if(!initial&&result.corrected)$('notice').textContent='Position korrigiert';
 }
 s.hp=result.hp;s.life=result.life;s.score=result.score;s.online=result.online;s.peers=result.peers||[];s.textures=result.textures||[];
 if(Array.isArray(result.blocks)){s.blocks=result.blocks;s.revision=result.revision;freeView.setBlocks(s.blocks,s.revision,loadFreeTexture);}
 freeView.sync(s.peers);s.lastOK=performance.now();
 if(result.notice)$('notice').textContent=result.notice;
 updateWorldStatus();updateFreeUI();
}
async function enterFreeWorld(){
 if(!freeEnabled||!lobbyState||lobbyTransition||freeState)return;
 if(renderer.xrMode?.active){$('notice').textContent='Bitte VR beenden, um die Free World zu betreten.';return;}
 const hall=lobbyState;lobbyTransition=true;clearControls();
 try{
  const result=await freeRequest({action:'enter',lease:hall.lease});
  if(lobbyState!==hall)return;
  lobbyState=null;resetHotelViews();renderer.lobby.clear();resetGreeting();chooseWeapon('none');
  freeView??=new FreeWorldView();freeView.clear();
  freeState={lease:result.lease,life:0,blocks:[],peers:[],textures:[],revision:-1,online:1,hp:100,score:0,lastOK:performance.now(),pending:null,editing:false};
  freeTool='build';freeSize=2;freeShape='cube';freeTexture=null;
  document.body.classList.add('free-playing');$('free-hud').hidden=false;
  applyFreeSnapshot(freeState,result,true);audio.play('door');$('notice').textContent='Willkommen in der Free World · B: Baumodus / PvP · P: Texturen';
 }catch(e){$('notice').textContent=e.message||'Free World nicht erreichbar';}
 finally{lobbyTransition=false;clearControls();}
}
async function leaveFreeWorld(){
 const s=freeState;if(!s||lobbyTransition||s.editing)return;
 lobbyTransition=true;clearControls();
 try{
  if(s.pending)await s.pending.catch(()=>{});
  const result=await freeRequest({action:'leave',lease:s.lease});
  if(freeState!==s)return;
  freeState=null;freeView?.clear();document.body.classList.remove('free-playing');$('free-hud').hidden=true;
  lobbyState={slot:result.slot,lease:result.lease,online:result.online,capacity:result.capacity,lastOK:performance.now(),sending:false};
  resetHotelViews();renderer.lobby.restoreProjection();renderer.lobby.setOwn(result.slot,accountProfile);renderer.lobby.setRooms(result.rooms||[]);renderer.lobby.sync(result.peers||[]);renderer.lobby.syncNpc(result.npc);renderer.syncHallFacades(result.facades||[],result.slot,state);
  Object.assign(player,{x:result.position[0],y:0,z:result.position[2],yaw:result.yaw,pitch:0,vy:0,stance:'walk',eyeHeight:1.65});
  resetGreeting();updateWorldStatus();updateFreeUI();if(!$('phone').hidden)$('closephone').onclick();
  audio.play('door');$('notice').textContent='Zurück im Hotelflur';
 }catch(e){$('notice').textContent=e.message;if(e.status===401||e.status===409)location.reload();}
 finally{lobbyTransition=false;clearControls();}
}
function freeMove(s){return {action:'update',lease:s.lease,revision:s.revision,life:s.life,position:[player.x,player.y,player.z],yaw:player.yaw,stance:player.stance};}
function freePoll(){
 const s=freeState;if(!s||s.pending||s.editing||lobbyTransition)return;
 const p=freeRequest(freeMove(s)).then(result=>applyFreeSnapshot(s,result)).catch(e=>{
  if(freeState!==s)return;
  if(e.status===401||e.status===409||performance.now()-s.lastOK>FREE_LAYOUT.leaseSeconds*1000){location.reload();return;}
  $('notice').textContent='Free World: Verbindung wird wiederhergestellt';
 }).finally(()=>{if(s.pending===p)s.pending=null;});
 s.pending=p;
}
async function freeEdit(op){
 const s=freeState;if(!s||!canPlay()||s.editing||lobbyTransition)return;
 if((op==='pulse')!==(freeTool==='pvp'))return;
 s.editing=true;
 try{
  if(s.pending)await s.pending;
  if(freeState!==s||lobbyTransition||!canPlay())return;
  const life=s.life;
  applyFreeSnapshot(s,await freeRequest(freeMove(s)));
  if(freeState!==s||lobbyTransition||s.life!==life||!canPlay())return;
  let extra={};
  if(op==='place'){const c=freeCandidate();if(!c){$('notice').textContent='Kein freier Bauplatz';return;}extra={...c,texture:freeTexture||null};}
  else if(op==='remove'){const hit=freeRay(playerEye(),dir(),s.blocks);if(!hit?.id){$('notice').textContent='Kein Block ausgewählt';return;}extra={id:hit.id};}
  else if(op==='pulse'){extra={direction:dir()};$('cross').classList.add('pulse');setTimeout(()=>$('cross').classList.remove('pulse'),100);}
  const result=await freeRequest({action:op,lease:s.lease,revision:s.revision,life:s.life,...extra});
  applyFreeSnapshot(s,result);audio.play('click');
 }catch(e){$('notice').textContent=e.message;if(e.status===401)location.reload();}
 finally{s.editing=false;}
}
function freePrimary(){void freeEdit(freeTool==='build'?'remove':'pulse');}
function setFreeTool(mode){
 if(!freeState)return;
 freeTool=mode==='pvp'?'pvp':'build';updateFreeUI();updateFreeHint(false);
}
function freeKey(code){
 if(code==='KeyB'){setFreeTool(freeTool==='build'?'pvp':'build');return true;}
 if(code==='KeyQ'){const shapes=['cube','wall-z','wall-x','floor'];freeShape=shapes[(shapes.indexOf(freeShape)+1)%shapes.length];updateFreeUI();return true;}
 if(/^Digit[1-4]$/.test(code)){freeSize=FREE_LAYOUT.sizes[Number(code.at(-1))-1];updateFreeUI();return true;}
 if(code==='KeyE'){void interact();return true;}
 if(code==='KeyG'){if(freeTool==='build')void freeEdit('remove');return true;}
 if(code==='KeyI'){phone('free');return true;}
 if(['Digit0','KeyR','KeyT','KeyF'].includes(code))return true;
 return false;
}
let freeTextureKey='';
function updateFreeUI(){
 const s=freeState;$('free-outside').hidden=!!s;$('free-tools').hidden=!s;
 $('free-hud').hidden=!s||!$('phone').hidden||studioOpen;
 if(!s)return;
 $('free-online').textContent=s.online+' Spieler';$('free-health-bar').style.width=Math.max(0,Math.min(100,s.hp))+'%';
 $('free-hud-detail').textContent=s.hp+' HP · '+(freeTool==='build'?'Baumodus':'PvP')+' · '+s.score+' Punkte';
 $('free-hud-size').textContent=(freeSize*FREE_LAYOUT.grid).toFixed(2).replace('.',',')+' m · '+freeShapeLabel();
 $('free-size').value=String(freeSize);$('free-shape').value=freeShape;
 $('free-build-mode').disabled=freeTool==='build';$('free-pvp-mode').disabled=freeTool==='pvp';
 const key=JSON.stringify(s.textures);if(key!==freeTextureKey){
  const select=$('free-texture-select');select.replaceChildren(new Option('Weiß / Standard',''));
  for(const t of s.textures)select.add(new Option(t.name,t.id));
  if(!s.textures.some(t=>t.id===freeTexture))freeTexture=null;
  freeTextureKey=key;
 }
 $('free-texture-select').value=freeTexture||'';
 $('free-texture-delete').disabled=!freeTexture||s.editing;
 $('free-texture-upload').disabled=s.editing;$('free-leave').disabled=s.editing||lobbyTransition;
 $('free-usage').textContent=s.blocks.filter(b=>b.ownerSlot===accountProfile?.slot).length+' / '+FREE_LAYOUT.maxOwned+' eigene Blöcke · '+s.blocks.length+' / '+FREE_LAYOUT.maxBlocks+' gesamt · '+s.textures.length+' / '+FREE_LAYOUT.maxOwnTextures+' Bilder';
}
function updateFreeHint(vr=false){
 const s=freeState;if(!s)return;
 const playing=canPlay()&&!vr,exit=freeExitAt(playerEye(),dir()),candidate=playing&&freeTool==='build'?freeCandidate():null;
 const panel=$('interaction-prompt');panel.hidden=!playing;
 $('held-model-size').hidden=true;$('touchRotateLeft').hidden=$('touchRotateRight').hidden=true;$('touchZoom').hidden=true;
 $('touchSecondary').hidden=true;$('touchFreeMode').hidden=false;
 $('touchFire').disabled=!playing||s.editing;$('touchFire').textContent=freeTool==='build'?'Abbauen':'Impuls';
 $('touchInteract').disabled=!playing||(!exit&&!candidate)||s.editing;$('touchInteract').textContent=exit?'Hotel':'Setzen';
 $('touchRepair').disabled=$('touchReload').disabled=true;$('touchArsenal').disabled=false;$('touchArsenal').textContent='Bauen';
 $('touchJump').disabled=player.stance==='crouch';$('touchSprint').disabled=$('touchCrouch').disabled=!playing;
 $('touchSprint').setAttribute('aria-pressed',String(player.stance==='sprint'||touchSprint));$('touchCrouch').setAttribute('aria-pressed',String(player.stance==='crouch'||touchCrouch));
 $('interaction-name').textContent=exit?'HOTEL · Ausgang':freeTool==='build'?(candidate?'Bauplatz frei':'Baumodus'):'PvP-Modus';
 $('interaction-actions').textContent=exit?'E · Zum Hotel':freeTool==='build'?'E / Rechtsklick: setzen · G / Linksklick: abbauen · B: PvP':'Linksklick: Spielimpuls · B: Bauen';
 $('cross').classList.toggle('actionable',playing&&(exit||!!candidate));
 $('hint').textContent='Free World · B: Bauen / PvP · I: Bauwerkzeug';
 updateFreeUI();
}
$('free-size').onchange=()=>{freeSize=Number($('free-size').value);updateFreeUI();};
$('free-shape').onchange=()=>{freeShape=$('free-shape').value;updateFreeUI();};
$('free-texture-select').onchange=()=>{freeTexture=$('free-texture-select').value||null;updateFreeUI();};
$('free-build-mode').onclick=()=>{setFreeTool('build');$('closephone').onclick();};
$('free-pvp-mode').onclick=()=>{setFreeTool('pvp');$('closephone').onclick();};
$('free-leave').onclick=()=>void leaveFreeWorld();
$('free-texture-upload').onclick=async()=>{
 const s=freeState,file=$('free-texture-file').files[0];if(!s||s.editing||!file)return;
 s.editing=true;updateFreeUI();
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('PNG, JPEG oder WebP bis 8 MiB auswählen');
  const bitmap=await createImageBitmap(file);
  let blob;
  try{
   const factor=Math.min(1,FREE_LAYOUT.textureSize/Math.max(bitmap.width,bitmap.height));
   const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*factor));c.height=Math.max(1,Math.round(bitmap.height*factor));
   const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);
   blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.82));
  }finally{bitmap.close?.();}
  if(!blob||blob.size>FREE_LAYOUT.textureBytes)throw Error('Bild konnte nicht auf 256 KiB verkleinert werden');
  if(freeState!==s)return;
  if(s.pending)await s.pending;
  const r=await fetch('/api/free-world/texture?name='+encodeURIComponent(file.name.slice(0,64)),{method:'POST',cache:'no-store',credentials:'same-origin',headers:{...freeTextureHeaders(),'Content-Type':'image/jpeg','X-SecondLive-World-Lease':s.lease},body:blob});
  const j=await r.json();if(!r.ok)throw Error(j.error||'Texturimport fehlgeschlagen');
  if(freeState!==s)return;
  s.textures=j.textures;freeTexture=j.added;$('free-texture-file').value='';$('free-texture-message').textContent='Textur importiert und ausgewählt. Neue Blöcke verwenden dieses Bild.';
 }catch(e){$('free-texture-message').textContent=e.message;}
 finally{s.editing=false;updateFreeUI();}
};
$('free-texture-delete').onclick=async()=>{
 const s=freeState,id=freeTexture;if(!s||s.editing||!id)return;
 s.editing=true;updateFreeUI();
 try{if(s.pending)await s.pending;const j=await freeRequest({action:'texture_delete',lease:s.lease,revision:s.revision,id});applyFreeSnapshot(s,j);$('free-texture-message').textContent='Textur gelöscht.';}
 catch(e){$('free-texture-message').textContent=e.message;}
 finally{s.editing=false;updateFreeUI();}
};
setInterval(freePoll,FREE_LAYOUT.pollMilliseconds);
window.addEventListener('pagehide',()=>{if(freeState)freeRequest({action:'abandon',lease:freeState.lease},true).catch(()=>{});});

/* User-owned GLB furnishings: upload, select, place and persist during gameplay. */
// Imported objects participate in the normal room rigid-body system.
// Server coordinates are a floor anchor for edited placement; a saved motion
// pose contains the exact centre and quaternion of a settled body.
function importedSavedBody(row,size){
 const q=row.pose?.q||yawQuat(row.rotation),p=row.pose?.p||[row.x,row.y+size[1]/2,row.z];
 return {p:[...p],q:[...q],v:[0,0,0]};
}
function syncRoomModelBodies(preserveId=null){
 const models=renderer.roomModels.physicsModels(),wanted=new Set(models.map(m=>m.row.id));
 for(const id of Object.keys(spec))if(spec[id].imported&&!wanted.has(id)){
  if(held===id)held=null;delete spec[id];delete bodies[id];delete state.objects[id];debris=debris.filter(d=>d.source!==id);
 }
 for(const {row,size} of models){
  const id=row.id,hp=row.hp??100,old=spec[id];
  // A preview is local to this grab and the revision it started with.
  // A remote edit must not silently overwrite or save a stale draft.
  if(held===id&&old&&(old.row.revision!==row.revision||!hp))held=null;
  const previewExtent=held===id&&hp>0?old?.previewExtent:undefined;
  const extent=previewExtent??row.extent;
  const s=size.map(v=>Math.max(.015,v*extent)),savedSize=size.map(v=>Math.max(.015,v*row.extent));
  const key=JSON.stringify([row.x,row.y,row.z,row.extent,row.rotation,row.pose,row.mount]);
  const saved=importedSavedBody(row,savedSize);
  // Our own hit/motion acknowledgements must not replace the live rigid body
  // and discard its velocity. External edits, resizes and repairs restore it.
  const preserve=id===preserveId&&old&&bodies[id]&&hp>0&&old.row.extent===row.extent&&JSON.stringify(old.row.mount)===JSON.stringify(row.mount);
  if(!old||!bodies[id]||(!preserve&&old.poseKey!==key)||(!state.objects[id]&&hp>0)||(held!==id&&old.previewExtent!==undefined))bodies[id]=saved;
  if(old&&state.objects[id]>0&&!hp){
   if(held===id)held=null;
   const b=bodies[id];
   for(let i=0;i<6;i++)debris.push({source:id,kind:'wallChip',variant:i,p:b.p.map((v,j)=>v+(Math.random()-.5)*s[j]*.35),s:s.map(v=>Math.max(.025,Math.min(.22,v*.18))),v:[(Math.random()-.5)*1.8,.6+Math.random(),(Math.random()-.5)*1.8],c:rgb('8b8377'),m:null,r:Math.random()*6});
  }
  if(old&&!state.objects[id]&&hp>0)debris=debris.filter(d=>d.source!==id);
  spec[id]={imported:true,row,mounted:!!row.mount,s,savedSize,extent,previewExtent,p:saved.p,max:100,c:'8b8377',poseKey:key,quiet:old?.poseKey===key?old.quiet||0:0};
  state.objects[id]=hp;
 }
}
function importedMotion(id,body=bodies[id]){
 const o=spec[id],p=body.p,q=body.q||[0,0,0,1],h=boundsSize(o.s,q)[1];
 if(![...p,...q].every(Number.isFinite)||Math.abs(p[0])>4.9||Math.abs(p[2])>4.9||p[1]<0||p[1]>2.95)return null;
 return {position:p.map(v=>Math.round(v*10000)/10000),quaternion:q.map(v=>Math.round(v*1000000)/1000000),base_y:Math.max(0,Math.min(2.75,p[1]-h/2))};
}
async function importedAction(op,id,extra={}){
 const o=spec[id];if(!o?.imported||roomModelBusy||!roomModelAllowed())return false;
 roomModelBusy=true;roomModelRevision++;
 try{
  let request={id,revision:o.row.revision};
  if(op==='place_object')request={...request,action:'place',x:extra.position[0],y:Math.max(0,extra.position[1]-o.s[1]/2),z:extra.position[2],extent:o.extent??o.row.extent,rotation:extra.rotation,solid:o.row.solid};
  else if(op==='mount_import')request={...request,action:'mount',wall:extra.wall,anchor:extra.anchor,size:o.s,extent:o.extent??o.row.extent,solid:o.row.solid};
  else if(op==='hit')request={...request,action:'hit',weapon:extra.weapon,...(o.mounted?{}:importedMotion(id)||{})};
  else if(op==='repair')request={...request,action:'repair'};
  else if(op==='drop_import'&&(o.extent??o.row.extent)!==o.row.extent){
   request={...request,action:'place',x:extra.position[0],y:extra.base_y,z:extra.position[2],extent:o.extent,rotation:heldAngle,solid:o.row.solid};
  }
  else if(op==='drop_import'||op==='motion')request={...request,action:'motion',...extra};
  else if(op==='hide')request={...request,action:'hide'};
  else return false;
  const result=await api('/api/room-models',request);
  if((op==='place_object'||op==='drop_import'||op==='mount_import')&&held===id){held=null;o.previewExtent=undefined;}
  applyRoomModelList(result);syncRoomModelBodies(op==='hit'||op==='motion'?id:null);
  if(op!=='motion')$('notice').textContent=op==='hit'?(state.objects[id]?'Modell beschädigt · '+state.objects[id]+' %':'Modell zerstört · R: reparieren'):op==='repair'?'Modell repariert':op==='hide'?'Modell zurück im Inventar':op==='drop_import'?'Modell losgelassen':op==='mount_import'?'Modell an der Wand befestigt und gespeichert':'Modell abgestellt und gespeichert';
  return true;
 }catch(e){
  $('notice').textContent=e.message;
  if(e.status===409)queueMicrotask(()=>refreshRoomModels().catch(()=>{}));
  return false;
 }finally{roomModelBusy=false;}
}
async function dropImported(){
 const id=held,o=spec[id];if(!o?.imported||!placementPoint(id))return;
 const q=yawQuat(heldAngle),p=heldPosition(id),s=turnedSize(o.s,heldAngle);
 if(!importedPlacementAllowed(o,p)){$('notice').textContent='Modell passt hier nicht vollständig hinein';return;}
 // Releasing at the carried height uses the existing collision-safe footprint.
 if(collisionRoom().some(x=>p.every((v,i)=>Math.abs(v-x.p[i])<(s[i]+x.s[i])/2-.018))||
 Object.entries(bodies).some(([k,x])=>k!==id&&state.objects[k]>0&&p.every((v,i)=>Math.abs(v-x.p[i])<(s[i]+boundsSize(spec[k].s,x.q)[i])/2-.018))){
  $('notice').textContent='Kein freier Platz zum Fallenlassen';return;
 }
 const motion=importedMotion(id,{p,q});if(!motion)return;
 if(await action('drop_import',id,null,motion))held=null;
}
// Match the live preview, collider and the server's conservative placement envelope.
function heldPosition(id){
 const o=spec[id],s=o.s,[x,z]=horizontalHold(id),floor=groundAt(x,z),d=dir(),dist=1.0+Math.hypot(s[0],s[2])*.52;
 const ceiling=o.imported?Math.min(2.85-s[1]/2,2.9-(o.extent??o.row.extent)+s[1]/2):2.85-s[1]/2;
 const y=movableDecor(id)?floor+s[1]/2:Math.min(ceiling,Math.max(floor+s[1]/2,player.y+1.2+d[1]*dist));
 return [x,y,z];
}
let importedSaveAt=0;
function saveSettledImports(dt,now){
 if(!roomModelAllowed()||busy||roomModelBusy||held||now<importedSaveAt)return;
 for(const [id,o] of Object.entries(spec)){
  if(!o.imported||!state.objects[id]||o.mounted)continue;
  const b=bodies[id],saved=importedSavedBody(o.row,o.s);
  if(b.p[1]<-1.5||b.p[1]>4.5||Math.abs(b.p[0])>5.2||Math.abs(b.p[2])>5.2){importedSaveAt=now+1200;void action('hide',id);return;}
  if(Math.hypot(...b.v)>.055||Math.hypot(...(b.angular||[0,0,0]))>.075){o.quiet=0;continue;}
  o.quiet=(o.quiet||0)+dt;
  const q=b.q||[0,0,0,1],dot=Math.abs(q.reduce((n,v,i)=>n+v*saved.q[i],0));
  if(o.quiet<.65||(Math.hypot(...b.p.map((v,i)=>v-saved.p[i]))<.035&&dot>.999))continue;
  const motion=importedMotion(id);if(!motion)continue;
  importedSaveAt=now+1200;o.quiet=0;void action('motion',id,null,motion);return;
 }
}
const ROOM_MODEL_MAX=16*1024*1024;
let roomModelRows=[],roomModelBusy=false,roomModelRevision=0,roomModelRefreshing=false,roomModelLimits={max_models:8,max_owner:64*1024*1024},roomModelListKey='';
const modelSelection=()=>$('room-model-select').value;
const selectedRoomModel=()=>roomModelRows.find(r=>r.id===modelSelection());
const roomModelAllowed=()=>!!(started&&accountProfile&&!lobbyState&&!freeState&&!lobbyTransition);
const modelHeaders=()=>protectedGame?{'X-SecondLive-Token':token}:{};
async function roomModelBytes(id,signal){
 const r=await fetch('/api/room-models/'+encodeURIComponent(id),{headers:modelHeaders(),signal});
 if(!r.ok)throw Error('Modelldatei nicht verfügbar (HTTP '+r.status+')');
 return r.arrayBuffer();
}
function modelFrontPlacement(player,extent){
 const margin=extent*Math.SQRT2/2+.04,limit=4.72-margin,dist=Math.max(1.5,extent*.75+.8);
 const clamp=v=>Math.round(Math.max(-limit,Math.min(limit,v))*100)/100;
 return {x:clamp(player.x-Math.sin(player.yaw)*dist),y:0,z:clamp(player.z-Math.cos(player.yaw)*dist),rotation:0,extent,solid:false};
}
function readRoomModelPlacement(){
 const fields=['x','y','z','extent','rotation'];
 return {...Object.fromEntries(fields.map(key=>[key,$('room-model-'+key).valueAsNumber])),solid:$('room-model-solid').checked};
}
function writeRoomModelPlacement(p){
 for(const key of ['x','y','z','extent','rotation'])$('room-model-'+key).value=String(p[key]);
 $('room-model-solid').checked=!!p.solid;
}
function fillRoomModelForm(){
 const row=selectedRoomModel();
 if(row)writeRoomModelPlacement(row.placed?row:{...modelFrontPlacement(player,row.extent),rotation:row.rotation,solid:row.solid});
 updateRoomModelUI();
}
function updateRoomModelUI(){
 const row=selectedRoomModel(),allowed=roomModelAllowed(),ready=allowed&&!roomModelBusy&&!busy&&!held;
 $('room-model-usage').textContent=roomModelRows.length+' / '+roomModelLimits.max_models+' Modelle · '+(roomModelRows.reduce((n,r)=>n+r.bytes,0)/1048576).toFixed(1)+' / '+Math.round(roomModelLimits.max_owner/1048576)+' MiB';
 $('room-model-login').hidden=allowed;
 $('room-model-file').disabled=!ready;
 $('room-model-upload').disabled=!ready||!$('room-model-file').files?.length;
 $('room-model-select').disabled=!ready||!roomModelRows.length;
 $('room-model-editor').hidden=!row;
 for(const id of ['x','y','z','extent','rotation','solid','front','save','hide','delete','retry','repair'])$('room-model-'+id).disabled=!ready||!row;
 $('room-model-hide').disabled=!ready||!row?.placed;
 $('room-model-repair').disabled=!ready||!row||(row.hp??100)===100;
 const entry=row?renderer?.roomModels?.status(row.id):null;
 $('room-model-retry').hidden=entry?.status!=='error';
 $('room-model-render').textContent=!row?'':!row.placed?'Im Inventar · noch nicht platziert':entry?.status==='ready'?((row.hp??100)>0?(row.mount?'An Wand befestigt':'Im Zimmer')+' · Zustand '+(row.hp??100)+' %':'Zerstört · Reparatur möglich'):entry?.status==='error'?'Darstellung fehlgeschlagen: '+entry.error:'3D-Modell wird geladen …';
}
function applyRoomModelList(data,prefer=null,fill=false){
 if(!Array.isArray(data.models))throw Error('Ungültige Modellliste');
 const prior=modelSelection();
 roomModelRows=data.models;
 roomModelLimits={max_models:data.max_models||8,max_owner:data.max_owner||64*1024*1024};
 renderer?.roomModels?.sync(roomModelRows,roomModelBytes);
 const key=JSON.stringify(roomModelRows.map(r=>[r.id,r.name,r.placed,r.hp]));
 if(key!==roomModelListKey||prefer){
  roomModelListKey=key;const select=$('room-model-select');select.replaceChildren();
  if(!roomModelRows.length){const opt=document.createElement('option');opt.value='';opt.textContent='Noch keine Modelle';select.append(opt);}
  for(const row of roomModelRows){const opt=document.createElement('option');opt.value=row.id;opt.textContent=row.name+((row.hp??100)===0?' · zerstört':row.placed?' · im Zimmer':' · Inventar');select.append(opt);}
  const wanted=prefer||prior;select.value=roomModelRows.some(r=>r.id===wanted)?wanted:(roomModelRows[0]?.id||'');
 }
 if(fill||prior!==modelSelection())fillRoomModelForm();else updateRoomModelUI();
}
async function refreshRoomModels(fill=false){
 if(!roomModelAllowed()||roomModelBusy||roomModelRefreshing){updateRoomModelUI();return;}
 const revision=roomModelRevision,profile=accountProfile;roomModelRefreshing=true;
 try{const data=await api('/api/room-models');if(revision===roomModelRevision&&profile===accountProfile)applyRoomModelList(data,null,fill);}
 finally{roomModelRefreshing=false;}
}
async function changeRoomModel(work){
 if(!roomModelAllowed()||roomModelBusy||busy||held)return;
 roomModelBusy=true;roomModelRevision++;updateRoomModelUI();
 try{await work();}catch(e){$('room-model-message').textContent=e.message;}
 finally{roomModelBusy=false;updateRoomModelUI();}
}
function modelDoesNotTrapPlayer(p){
 const margin=p.extent*Math.SQRT2/2+.30;
 return !p.solid||p.y>player.y+1.7||p.y+p.extent<player.y+.1||Math.abs(p.x-player.x)>margin||Math.abs(p.z-player.z)>margin;
}
async function persistRoomModel(row,p){
 if(!modelDoesNotTrapPlayer(p))throw Error('Zu nah an deinem Charakter – Modell weiter entfernt platzieren oder Kollision deaktivieren.');
 const result=await api('/api/room-models',{action:'place',id:row.id,...p});
 applyRoomModelList(result,row.id,true);
}
$('room-model-file').onchange=()=>updateRoomModelUI();
$('room-model-select').onchange=()=>fillRoomModelForm();
$('room-model-placement').onsubmit=e=>{e.preventDefault();$('room-model-save').click();};
$('room-model-upload').onclick=()=>changeRoomModel(async()=>{
 const file=$('room-model-file').files?.[0];
 if(!file||!file.name.toLowerCase().endsWith('.glb'))throw Error('Bitte eine GLB-Datei auswählen.');
 if(!file.size||file.size>ROOM_MODEL_MAX)throw Error('Die Datei darf maximal 16 MiB groß sein.');
 $('room-model-message').textContent='Datei wird hochgeladen und geprüft …';
 const response=await fetch('/api/room-models/upload?name='+encodeURIComponent(file.name),{method:'POST',headers:{...modelHeaders(),'Content-Type':'model/gltf-binary'},body:file});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Upload fehlgeschlagen');
 $('room-model-file').value='';applyRoomModelList(result,result.added,true);
 const row=selectedRoomModel();
 if(row){
  try{await persistRoomModel(row,{...modelFrontPlacement(player,row.extent),solid:true});$('room-model-message').textContent='Importiert und vor dir platziert. Du kannst Größe und Position anpassen.';}
  catch(e){$('room-model-message').textContent='Importiert. Im Inventar gespeichert: '+e.message;}
 }
});
$('room-model-front').onclick=()=>changeRoomModel(async()=>{
 const row=selectedRoomModel();if(!row)return;
 const current=readRoomModelPlacement(),extent=current.extent;
 if(!Number.isFinite(extent)||extent<.1||extent>2.4)throw Error('Größe zwischen 0,1 und 2,4 m wählen.');
 const p={...modelFrontPlacement(player,extent),rotation:current.rotation,solid:current.solid};
 await persistRoomModel(row,p);$('room-model-message').textContent='Vor dir platziert.';
});
$('room-model-save').onclick=()=>changeRoomModel(async()=>{
 const row=selectedRoomModel();if(!row)return;
 if(!$('room-model-placement').reportValidity())return;
 await persistRoomModel(row,readRoomModelPlacement());$('room-model-message').textContent='Position, Größe und Drehung gespeichert.';
});
$('room-model-repair').onclick=()=>changeRoomModel(async()=>{
 const row=selectedRoomModel();if(!row)return;
 applyRoomModelList(await api('/api/room-models',{action:'repair',id:row.id,revision:row.revision}),row.id,true);
 $('room-model-message').textContent='Modell vollständig repariert.';
});
$('room-model-hide').onclick=()=>changeRoomModel(async()=>{
 const row=selectedRoomModel();if(!row)return;
 applyRoomModelList(await api('/api/room-models',{action:'hide',id:row.id}),row.id,true);
 $('room-model-message').textContent='Modell zurück ins Inventar gelegt.';
});
$('room-model-delete').onclick=()=>changeRoomModel(async()=>{
 const row=selectedRoomModel();if(!row||!confirm(row.name+' dauerhaft löschen?'))return;
 applyRoomModelList(await api('/api/room-models',{action:'delete',id:row.id}),null,true);
 $('room-model-message').textContent='Modell gelöscht.';
});
$('room-model-retry').onclick=()=>{const row=selectedRoomModel();if(row&&roomModelAllowed()){renderer.roomModels.retry(row.id);updateRoomModelUI();}};
setInterval(()=>{if(roomModelAllowed())refreshRoomModels().catch(()=>{});},6000);
setInterval(()=>{if(!$('phone').hidden&&!$('phone-page-models').hidden)updateRoomModelUI();},500);

$('phone-sound').onchange=()=>{audio.configure($('phone-sound').checked,Number($('phone-volume').value)/100);updatePhone();};$('phone-volume').oninput=()=>{audio.configure($('phone-sound').checked,Number($('phone-volume').value)/100);$('phone-volume-label').textContent=$('phone-volume').value+' %';};$('phone-audio-test').onclick=async()=>{await audio.unlock();audio.play('phone');};
setInterval(()=>{if(!$('phone').hidden)updatePhone();},15000);
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('phone').hidden&&$('updater').hidden){$('closephone').onclick();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stopAll();});
$('restore-hotel').onclick=async()=>{if(lobbyState||freeState||lobbyTransition){$('notice').textContent='Bitte zuerst in dein Zimmer zurückkehren.';return;}if(busy||!confirm('Möbel auf Hotel-Standardpositionen zurücksetzen? Schäden und Fortschritt bleiben erhalten.'))return;if(posture&&!leavePosture())return;if(held){bodies[held]=savedBody(state,held);held=null;}if(await action('reset_hotel_layout',null,null,{confirm:true})){for(const id of Object.keys(spec))if(id!=='window'&&!spec[id].imported)bodies[id]=savedBody(state,id);const p=HOTEL_LAYOUT.spawn.p;player.x=p[0];player.y=0;player.z=p[2];player.vy=0;player.yaw=HOTEL_LAYOUT.spawn.yaw;player.pitch=0;updatePhone();}};
$('closephone').onclick=()=>{if(!started||studioOpen||!$('updater').hidden)return;showPhonePage('home');$('phone').hidden=true;clearControls();active=true;};$('refresh').onclick=async()=>{try{await refresh();$('notice').textContent='Weltstatus aktualisiert';updatePhone();}catch(e){$('notice').textContent=e.message;}};
canvas.onclick=()=>{if(mobile||!canPlay())return;void audio.unlock();if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.()?.catch?.(()=>{});active=true;}};
canvas.addEventListener('pointerdown',e=>{if(!mobile&&e.button===0&&document.pointerLockElement===canvas&&canPlay()){if(freeState)freePrimary();else pressTrigger();}});
canvas.addEventListener('contextmenu',e=>{if(canPlay()&&!mobile)e.preventDefault();});
window.addEventListener('mousedown',e=>{if(e.button===2&&!mobile&&document.pointerLockElement===canvas&&canPlay()){e.preventDefault();if(freeState){if(freeTool==='build')void freeEdit('place');}else toggleScope();}});
window.addEventListener('wheel',e=>{
 if(!canPlay()||lobbyState||freeState||lobbyTransition||renderer?.xrMode?.active||mobile||held||posture||!e.deltaY)return;
 e.preventDefault();
 const now=performance.now();if(now-lastWheel<140)return;lastWheel=now;
 chooseWeapon(nextWeapon(equipped,e.deltaY));
},{passive:false});
window.addEventListener('pointerup',e=>{if(triggerPointer===null||triggerPointer===e.pointerId)releaseTrigger();});
window.addEventListener('pointercancel',releaseTrigger);
window.addEventListener('keydown',e=>{if(!canPlay())return;if(canPlay()&&held&&spec[held]?.imported&&(e.key==='+'||e.key==='-'||e.code==='NumpadAdd'||e.code==='NumpadSubtract')){e.preventDefault();if(!e.repeat)resizeHeld(e.key==='-'||e.code==='NumpadSubtract'?-1:1);return;}if(['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyC'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(freeState&&freeKey(e.code))return;if(e.code==='KeyE')interact();if(e.code==='KeyB')void mountHeld();if(e.code==='KeyQ')turnHeld(-90);if(e.code==='KeyF'){if(posture?.kind==='lie')secondaryInteraction();else turnHeld(90);}if(e.code==='KeyG'&&!posture)secondaryInteraction();if(e.code==='KeyV'&&!posture){setScopeZoom(false);first=!first;}if(e.code==='KeyP')phone();if(e.code==='KeyI')arsenal();if(e.code==='Digit1')chooseWeapon('pistol');if(e.code==='Digit2')chooseWeapon('rifle');if(e.code==='Digit3')chooseWeapon('m16');if(e.code==='Digit0')chooseWeapon('none');if(e.code==='KeyT')startReload();if(e.code==='KeyR')repair();});
for(const [id,delta] of [['held-size-minus',-1],['held-size-plus',1]])$(id).addEventListener('click',e=>{e.stopPropagation();resizeHeld(delta);});
$('held-mount').addEventListener('click',e=>{e.stopPropagation();void mountHeld();});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)clearControls();});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&canPlay()&&!posture?.sleeping){const sensitivity=scopeZoom ? .0012 : .003;player.yaw-=e.movementX*sensitivity;player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch+e.movementY*sensitivity));}});
function part(p,s,c,r=0,q=null){draw({p,s,c:rgb(c),r,q,m:mat(c)});}
function canPlay(){return started&&active&&$('phone').hidden&&$('arsenal').hidden&&$('updater').hidden;}
function fire(ray=null){
  if(!canPlay()||lobbyState||lobbyTransition||posture||!equipped||busy||reloadId||fireCooldown>0)return false;
  const weapon=equipped;
  if(ammo[weapon]<=0){startReload(true);return false;}
  const direction=ray?.direction||dir(),origin=ray?.origin||playerEye(),a=renderer.surfaceHit(origin,direction,held);
  ammo[weapon]--;fireCooldown=FIRE_INTERVAL[weapon];updateAmmo();
  renderer.shot(weapon,{origin,direction,distance:Math.min(8,a.dist),impact:a.dist<=8});
  audio.play('shot',null,weaponIds.indexOf(weapon));if(a.dist<=8)audio.play('impact',origin.map((v,i)=>v+direction[i]*a.dist));
  $('cross').classList.add('pulse');setTimeout(()=>$('cross').classList.remove('pulse'),100);
  const extra={weapon};
  if(a.id&&state.objects[a.id]>0&&!movableDecor(a.id)){physicsWorld.impulse(a.id,direction,GAME_IMPULSE[weapon]);action('hit',a.id,a.mark,extra);}
  else if(WALLS[a.id])action('damage_wall',a.id,a.mark,extra);
  else if(DECOR_BOUNDS[a.id])action('damage_decor',a.id,a.mark,extra);
  else if(a.id?.startsWith('surface_'))action('mark_surface',a.id,a.mark,extra);
  else $('notice').textContent=a.dist<=8?'Oberfläche ohne Schadensspeicher':'Kein Objekt getroffen';
  if(ammo[weapon]===0)startReload(true);
  return true;
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
  if(!canPlay()||freeState||lobbyState||lobbyTransition||busy||held||posture)return;
  const target=repairTarget(ray);
  if(target&&damaged(target.id))action(target.op,target.id);
}
$('mode').onclick=()=>setMode(!mobile);setMode(mobile);
const stick=$('stick');let stickId=null;function moveStick(e){let r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.36),y=(e.clientY-r.top-r.height/2)/(r.height*.36),l=Math.max(1,Math.hypot(x,y));touchMove=[x/l,-y/l];stick.style.setProperty('--jx',`${x/l*33}px`);stick.style.setProperty('--jy',`${y/l*33}px`);}stick.addEventListener('pointerdown',e=>{if(!canPlay()||stickId!==null)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId&&canPlay())moveStick(e);});for(const n of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(n,e=>{if(e.pointerId===stickId){stickId=null;touchMove=[0,0];stick.style.setProperty('--jx','0px');stick.style.setProperty('--jy','0px');}});
canvas.addEventListener('pointerdown',e=>{if(!canPlay()||posture?.sleeping||(!mobile&&document.pointerLockElement===canvas))return;if(look)return;look={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!look||look.id!==e.pointerId||!canPlay()||posture?.sleeping)return;const sensitivity=scopeZoom ? .002 : .005;player.yaw-=(e.clientX-look.x)*sensitivity;player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch+(e.clientY-look.y)*sensitivity));look.x=e.clientX;look.y=e.clientY;});for(const n of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(n,e=>{if(look?.id===e.pointerId)look=null;});
for(const [id,fn] of [['touchFreeMode',()=>setFreeTool(freeTool==='build'?'pvp':'build')],['touchInteract',interact],['touchSecondary',secondaryInteraction],['touchZoom',toggleScope],['touchRotateLeft',()=>turnHeld(-90)],['touchRotateRight',()=>turnHeld(90)],['touchReload',startReload],['touchRepair',()=>repair()],['touchView',()=>{if(!posture){setScopeZoom(false);first=!first;}}],['touchPhone',phone],['touchArsenal',arsenal],['touchSprint',()=>{if(!posture&&!held&&!scopeZoom){touchSprint=!touchSprint;if(touchSprint)touchCrouch=false;}}],['touchCrouch',()=>{if(!posture){touchCrouch=!touchCrouch;if(touchCrouch)touchSprint=false;}}],['touchJump',()=>{if(!posture&&player.stance!=='crouch'&&!wantsCrouch()&&Math.abs(player.y-groundAt(player.x,player.z))<1e-5)player.vy=4.2;}]])$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())fn();});const fireButton=$('touchFire');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();if(!canPlay()||triggerPointer!==null)return;void audio.unlock();if(freeState){freePrimary();return;}pressTrigger();if(triggerHeld){triggerPointer=e.pointerId;fireButton.setPointerCapture?.(e.pointerId);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(event,e=>{if(triggerPointer===e.pointerId)releaseTrigger();});
window.addEventListener('blur',()=>{clearControls();audio.stopAll();});document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});

// The HUD map is a local 2D projection of the actual game layout, not a second
// WebGL scene. Only the local room and the already shared corridor are shown.
function minimapProject(x,z,player,scale){
 const dx=x-player.x,dz=z-player.z,c=Math.cos(player.yaw),s=Math.sin(player.yaw);
 return [96+(c*dx-s*dz)*scale,96+(s*dx+c*dz)*scale];
}
function minimapEdge(p,r=77){
 const dx=p[0]-96,dy=p[1]-96,d=Math.hypot(dx,dy);
 return d>r?[96+dx*r/d,96+dy*r/d]:p;
}
function minimapRoomShapes(walls,objects,layout,bodies,held){
 const shapes=[];
 for(const [id,w] of Object.entries(layout)){
  if(w.kind==='floor'||w.kind==='ceiling'||w.p[1]-w.s[1]/2>1.9)continue;
  // Use the actual opening layout. Wall damage is indicated, not reconstructed.
  const damaged=(walls[id]||[]).some(c=>c[2]>=4);
  shapes.push({p:w.p,s:w.s,color:damaged?'#bd9273':'#82929e'});
 }
 for(const [id,b] of Object.entries(bodies)){
  if(id==='window'||id===held||!(objects[id]>0))continue;
  const o=spec[id];if(!o||id==='surface_rug')continue;
  shapes.push({p:b.p,s:boundsSize(o.s,b.q),color:o.imported?'#7baaa4':'#566873'});
 }
 return shapes;
}
let lastMinimap=-Infinity;
function updateMinimap(now,vr=false){
 const hud=$('minimap'),visible=started&&!studioOpen&&!vr&&!posture?.sleeping&&!scopeZoom&&$('phone').hidden;
 hud.hidden=!visible;
 if(!visible||now-lastMinimap<80)return;lastMinimap=now;
 const map=$('minimap-canvas'),ctx=map.getContext('2d');if(!ctx)return;
 const dpr=Math.min(2,window.devicePixelRatio||1),res=Math.round(192*dpr);
 if(map.width!==res||map.height!==res){map.width=res;map.height=res;}
 ctx.setTransform(res/192,0,0,res/192,0,0);ctx.clearRect(0,0,192,192);
 ctx.save();ctx.beginPath();ctx.arc(96,96,91,0,Math.PI*2);ctx.clip();
 ctx.fillStyle='#101923';ctx.fillRect(0,0,192,192);
 const scale=freeState?5:lobbyState?8:13;
 const box=(p,s,color)=>{ctx.fillStyle=color;ctx.fillRect(p[0]-s[0]/2,p[2]-s[2]/2,s[0],s[2]);};
 ctx.save();ctx.translate(96,96);ctx.scale(scale,scale);ctx.rotate(player.yaw);ctx.translate(-player.x,-player.z);
 if(freeState){
  const half=FREE_LAYOUT.half;box([0,0,0],[half*2,0,half*2],'#46535d');
  for(const b of freeState.blocks){const {p,s}=freeBounds(b);box(p,s,b.texture?'#9bbeb8':'#a9b5bc');}
  for(const x of [-half,half])box([x,0,0],[.2,0,2*half],'#abb8bf');
  for(const z of [-half,half])box([0,0,z],[2*half,0,.2],'#abb8bf');box([0,0,half],[2,0,.3],'#68e3b7');
 }else if(lobbyState){
  const L=LOBBY_LAYOUT;box([0,0,0],[L.halfWidth*2,0,L.halfLength*2],'#394854');
  for(const x of [-L.halfWidth,L.halfWidth])box([x,0,0],[.15,0,L.halfLength*2],'#82929e');
  for(const z of [-L.halfLength,L.halfLength])box([0,0,z],[L.halfWidth*2,0,.15],'#82929e');
  for(let i=0;i<L.roomsPerSide*2;i++){const d=lobbyDoor(i);if(d)box([d.x,0,d.z],[.23,0,L.doorWidth],i===lobbyState.slot?'#68e3b7':'#a6b2bd');}
  if(freeEnabled)box([0,0,-L.halfLength],[2,0,.25],'#7bddd8');
 }else{
  box([0,0,0],[9.8,0,9.8],'#34434e');
  for(const a of minimapRoomShapes(state.walls||{},state.objects,WALLS,bodies,held))box(a.p,a.s,a.color);
  box([0,0,-4.94],[1.12,0,.16],'#68e3b7');box([-4.94,0,-1],[.15,0,2.6],'#6eafc6');
  if(state.unlocked&&!lobbyEnabled){box([0,0,-10],[9.8,0,10],'#34434e');for(const x of [-4.8,4.8])box([x,0,-10],[.2,0,10],'#82929e');box([0,0,-15],[9.8,0,.2],'#82929e');}
 }
 ctx.restore();
 function dot(p,color,r=3){if(Math.hypot(p[0]-96,p[1]-96)>87)return;ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#16232e';ctx.stroke();}
 const project=(x,z)=>minimapProject(x,z,player,scale);
 if(freeState){
  for(const peer of freeView.peers.values()){const v=peer.g.position;dot(project(v.x,v.z),'#8db8f5',3.5);}
  const p=minimapEdge(project(0,FREE_LAYOUT.half),78);ctx.fillStyle='#71edc0';ctx.fillRect(p[0]-3.5,p[1]-3.5,7,7);
 }else if(lobbyState){
  for(const peer of renderer.lobby.peers.values()){const v=peer.g.position;dot(project(v.x,v.z),'#8db8f5',3.5);}
  const npc=renderer.lobby.npc;if(npc?.visible)dot(project(npc.position.x,npc.position.z),'#e9bc74',3.5);
  if(freeEnabled){const p=minimapEdge(project(0,-LOBBY_LAYOUT.halfLength),78);ctx.fillStyle='#7bddd8';ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fill();}
  const own=lobbyDoor(lobbyState.slot);
  if(own){const p=minimapEdge(project(own.x,own.z),78);ctx.fillStyle='#71edc0';ctx.fillRect(p[0]-3.5,p[1]-3.5,7,7);ctx.strokeStyle='#17252f';ctx.strokeRect(p[0]-3.5,p[1]-3.5,7,7);}
 }
 // Compass is rotated with the world while the player arrow always points up.
 const north=minimapEdge(project(player.x,player.z-100),80);ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e6edf1';ctx.fillText('N',...north);
 ctx.beginPath();ctx.moveTo(96,86);ctx.lineTo(89,104);ctx.lineTo(96,100);ctx.lineTo(103,104);ctx.closePath();ctx.fillStyle='#f6fafc';ctx.fill();ctx.strokeStyle='#17252f';ctx.lineWidth=1.5;ctx.stroke();
 ctx.restore();ctx.beginPath();ctx.arc(96,96,91,0,Math.PI*2);ctx.strokeStyle='#a2b5c5b0';ctx.lineWidth=2;ctx.stroke();
 const own=accountProfile?lobbyDoor(accountProfile.slot)?.number:null;
 const label=freeState?'Free World':lobbyState?'Hotelflur · '+(own?'Zimmer '+own:'Hotel'):own?'Zimmer '+own:'Hotelzimmer';
 if($('minimap-location').textContent!==label)$('minimap-location').textContent=label;
}

let prev=performance.now();
function frame(now,xrFrame){
  let dt=Math.max(0,Math.min(.035,(now-prev)/1000));prev=now;
  if(studioOpen){$('minimap').hidden=true;updateAvatarModelStatus();renderer.renderStudio(canvas,dt,$('character-preview'));return;}
  const vr=!!renderer.xrMode?.active;const xrInput=vr?renderer.xrMode.inputs(xrFrame):null;
  if(canPlay()&&!posture&&!lobbyTransition){
    if(!freeState){stepReload(dt);stepTrigger(dt);}
    if(vr)player.yaw+=xrInput.turn;
    let f=vr?xrInput.move[1]:Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touchMove[1],s=vr?xrInput.move[0]:Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touchMove[0],a=player.yaw+(vr?xrInput.headYaw:0);
    const canStand=player.stance!=='crouch'||!coll(player.x,player.z,1.6);
    player.stance=movementStance(!vr&&wantsCrouch(),!vr&&wantsSprint(),Math.hypot(f,s)>.03,canStand,!!held||scopeZoom);
    const m=movementSpeed(player.stance,vr)*dt/Math.max(1,Math.hypot(f,s)),dx=(-Math.sin(a)*f+Math.cos(a)*s)*m,dz=(-Math.cos(a)*f-Math.sin(a)*s)*m;
    if(!coll(player.x+dx,player.z))player.x+=dx;
    if(!coll(player.x,player.z+dz))player.z+=dz;
    const ground=groundAt(player.x,player.z);
    if(!vr&&player.stance!=='crouch'&&keys.has('Space')&&Math.abs(player.y-ground)<1e-5)player.vy=4.2;
    player.vy-=9.81*dt;const nextY=Math.max(ground,player.y+player.vy*dt);
    if(freeState&&player.vy>0&&freeBlocked(freeState.blocks,player.x,nextY,player.z,player.stance==='crouch'?1.12:1.6))player.vy=0;
    else{player.y=nextY;if(player.y===ground)player.vy=0;}
  }
  if(!canPlay()||posture||lobbyTransition){if(player.stance==='sprint')player.stance='walk';}
  const eyeTarget=player.stance==='crouch'?1.10:1.65;
  player.eyeHeight+=(eyeTarget-player.eyeHeight)*Math.min(1,dt*13);
  if(debris.length>80)debris.splice(0,debris.length-80);
  if(started&&!lobbyState&&!freeState){
    syncRoomModelBodies();
    const holdPoint=held?heldPosition(held):[0,0,0];
    physicsWorld.step(dt,bodies,lobbyEnabled?{...state,unlocked:false}:state,held,holdPoint,debris,yawQuat(heldAngle));
    saveSettledImports(dt,now);
  }
  if(posture){
    const pose=furniturePose(posture.id,bodies[posture.id]);
    if(!movable(posture.id)||!pose||pose.y<-.05||pose.y>.25||Math.hypot(player.x-pose.x,player.z-pose.z)>.25||groundAt(pose.x,pose.z)<-.1)leavePosture();
    else{player.x=pose.x;player.z=pose.z;player.y=pose.y;player.vy=0;posture.yaw=pose.yaw;}
  }
  let d=dir(),eye=playerEye(),target=eye.map((v,i)=>v+d[i]);
  if(!first&&!vr&&!posture){let t=eye.map((v,i)=>v-d[i]*2.1);if(!coll(t[0],t[2])){eye=t;target=eye.map((v,i)=>v+d[i]);}}
  renderer.begin();
  if(freeState){
    $('npc-greeting').hidden=true;renderer.equip(null,false);
    freeView.step(dt,player,accountProfile,!first&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5);
    if(canPlay()&&freeTool==='build')freeView.showPreview(freeCandidate());else freeView.showPreview(null);
    audio.listener(eye,d);renderer.render(canvas,eye,target,mobile,dt,player,false,false,freeView.scene);
    updateMinimap(now,vr);
    if(now-lastInteractionHint>=100){lastInteractionHint=now;updateInteractionHint(vr);}return;
  }
  if(lobbyState){
    renderer.setHotelOpenings(lobbyState.slot,{},true);
    renderer.lobby.step(dt,player,!first&&!vr&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5);
    audio.listener(eye,d);updateGreeting(now,eye,d);
    renderer.equip(null,false);renderer.render(canvas,eye,target,mobile,dt,player,false,true);
    updateMinimap(now,vr);
    if(performance.now()-lastInteractionHint>=100){lastInteractionHint=performance.now();updateInteractionHint(vr);}
    return;
  }
  $('npc-greeting').hidden=true;
  const openings=renderer.setHotelOpenings(accountProfile?.slot,state.walls||{});
  if(openings.hall)renderer.lobby.step(dt,null,false);
  renderer.setDoorOpen?.(!lobbyEnabled&&state.unlocked);
  renderer.advanceCurtains?.(dt,state.decor||{});
  if(state.unlocked&&!lobbyEnabled){part([0,-.12,-10],[10,.24,10],'a8a69a');part([-4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([0,1.4,-15],[10,2.8,.2],'c1b6a6');}
  for(let [id,b] of Object.entries(bodies)){
    let o=spec[id],hp=state.objects[id];
    if(o.imported){renderer.roomModels.drawBody(id,b,hp,o.extent);if(!hp&&!debris.some(d=>d.source===id)){for(let i=0;i<3;i++){const a=i*2.1;part([b.p[0]+Math.cos(a)*.15,Math.max(.04,o.row.y+.04),b.p[2]+Math.sin(a)*.15],[.12,.07,.09],o.c,a);}}continue;}
    if(o.decor){renderer.drawMovableDecor(id,b.p,o.s,b.q,hp>0,id===held);continue;}
    if(hp>0){if(!renderer.drawModel(id,b.p,o.s,hp,o.max,b.q))part(b.p,o.s,id==='window'?o.c:hp<o.max?'947665':o.c,0,b.q);}else {for(let i=0;i<4;i++){let a=i*1.73;const at=state.placements?.[id]||o.p,x=id==='window'?-4.42:at[0];part([x+Math.cos(a)*.19,at[1]-o.s[1]/2+.032,at[2]+Math.sin(a)*.26],id==='window'?[.13,.012,.08]:[.23,.06,.12],o.c,a);}}
  }
  for(let b of debris)draw(b);
  const third=!first&&!vr&&!posture&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5;
  renderer.showCharacter(player,third&&started,dt,!posture&&(keys.has('KeyW')||keys.has('KeyA')||keys.has('KeyS')||keys.has('KeyD')||Math.hypot(...touchMove)>.05),started&&!vr,{posture,weapon:equipped});
  renderer.syncMarks(state.marks||[]);
  if(started&&active)audio.listener(eye,d);renderer.equip(equipped,first&&started&&!scopeZoom);renderer.render(canvas,eye,target,mobile,dt,player,scopeZoom);
  updateMinimap(now,vr);
  if(performance.now()-lastInteractionHint>=100){lastInteractionHint=performance.now();updateInteractionHint(vr);}
}
setInterval(()=>{if(started&&!busy&&!freeState)refresh().catch(()=>{});},3000);

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
    if(xrEntering||!started||!canPlay())return;if(freeState){$('notice').textContent='Free World zunächst im Desktop- oder Touch-Modus verwenden.';return;}
    if(mode.active){await mode.end();return;}
    if(posture&&!leavePosture())return;
    xrEntering=true;button.disabled=true;xrReturnFirst=first;clearControls();if(held){bodies[held]=savedBody(state,held);held=null;}document.exitPointerLock?.();first=true;player.y=0;player.vy=0;
    try{await mode.enter();document.body.classList.add('xr-playing');button.textContent='VR beenden';}
    catch(e){first=xrReturnFirst;hint.textContent='VR-Start fehlgeschlagen: '+e.message;$('notice').textContent=hint.textContent;}
    finally{xrEntering=false;button.disabled=false;}
  };
}

const qualityChoice=$('quality'), lightChoice=$('lighting'), status=$('assetstatus');
showPhonePage('welcome');updatePhone();
qualityChoice.value=sessionStorage.getItem('sl_quality')||'auto';
lightChoice.value=sessionStorage.getItem('sl_lighting')||'lebombo';
function changeProfile(){sessionStorage.setItem('sl_quality',qualityChoice.value);sessionStorage.setItem('sl_lighting',lightChoice.value);location.reload();}
qualityChoice.addEventListener('change',changeProfile);lightChoice.addEventListener('change',changeProfile);
(async()=>{
  try{
    const health=await fetch('/api/health',{cache:'no-store'}).then(r=>r.json());protectedGame=health.requires_game_token===true; personalWorld=health.personal_world===true;lobbyEnabled=health.hotel_lobby===true;freeEnabled=health.free_world===true;$('phone-app-free').hidden=!freeEnabled;accountsEnabled=health.accounts===true; $('game-auth').hidden=!protectedGame;$('account-access').hidden=!accountsEnabled;$('start').hidden=accountsEnabled;setAuthMode('login');authButtons();
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
    graphicsReady=true;$('start').disabled=false;authButtons();
    if(accountsEnabled){try{if(protectedGame)token=$('token').value;applyAccount(await api('/api/account',{action:'profile'}));showAccountResume();}catch(e){if(e.status!==401)console.warn('Konto:',e.message);}}else renderer.setCharacter({avatar:DEFAULT_CHARACTER});
    prev=performance.now();renderer.setLoop(frame);setupXR();
  }catch(e){console.error(e);status.textContent='Grafik konnte nicht geladen werden: '+e.message;$('error').hidden=false;$('error').textContent='WebGL 2 oder lokale Grafikdateien fehlen. Bitte Docker-Build und Browser prüfen.';}
})();
