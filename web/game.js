import { RoomRenderer, RoomPhysics } from './engine/renderer.bundle.js';
const $=id=>document.getElementById(id), canvas=$('world');
let renderer=null, physicsWorld=null, graphicsReady=false;
let equipped=null, xrEntering=false, xrReturnFirst=true;
const rgb=h=>[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];
function mat(c){
  return ['a58d72','aa8b67','b28f68'].includes(c)?'wooden_floor_01'
    :['e3ded3','e4e1d9','e9e5dc','d8d2c9','d7d3ce','ddd7cf'].includes(c)?'white_plaster_02':c==='f0ede8'?'paint'
    :['765742','81664b','655343','a77a48','967e64','ac9478','7f6752','8a715c','70553f'].includes(c)?'oak_veneer_01'
    :['667d89','9caeb3','536c76','466c79','ccd7df','c3ced7','d6dce2','bfc8cf'].includes(c)?'rough_linen'
    :c==='75b6d1'?'glass':c==='c6b8a1'?'metal':c==='fff2cb'?'light':null;
}
const objects=[],blocks=[];
function box(x,y,z,w,h,d,col,r=0){objects.push({p:[x,y,z],s:[w,h,d],c:rgb(col),r,m:mat(col)});}
function draw(o){renderer.drawBox(o);}
const room=[];
function solid(x,y,z,w,h,d,c){box(x,y,z,w,h,d,c);room.push({p:[x,y,z],s:[w,h,d]});}

// Room shell.
solid(0,-.15,0,10,.3,10,'aa8b67');
solid(0,3.15,0,10,.3,10,'e4e1d9');
solid(-5,1.5,-3.65,.24,3,2.70,'d8d2c9');
solid(-5,1.5,2.65,.24,3,4.70,'d8d2c9');
solid(-5,.46,-1,.24,.92,2.60,'d8d2c9');
solid(-5,2.78,-1,.24,.44,2.60,'d8d2c9');
solid(5,1.5,0,.2,3,10,'d8d2c9');
solid(0,1.5,5,10,3,.2,'d8d2c9');
solid(-3.0,1.5,-5,4,3,.2,'d8d2c9');
solid(3.0,1.5,-5,4,3,.2,'d8d2c9');
solid(0,2.6,-5,2,.8,.2,'d8d2c9');

// Baseboards, crown details, outlet and switch.
for(let x of [-4.86,4.86])box(x,.075,0,.08,.15,9.78,'f0ede8');
box(0,.075,4.86,9.78,.15,.08,'f0ede8');
for(let x of [-3,3])box(x,.075,-4.86,3.85,.15,.08,'f0ede8');
for(let x of [-4.86,4.86])box(x,2.965,0,.1,.08,9.8,'f0ede8');
for(let z of [-4.86,4.86])box(0,2.965,z,9.8,.08,.1,'f0ede8');
box(4.87,.33,-1.35,.03,.13,.19,'f0ede8');box(4.85,.33,-1.35,.012,.055,.095,'655343');
box(.94,1.1,-4.86,.13,.14,.03,'f0ede8');box(.94,1.1,-4.84,.055,.065,.015,'c6b8a1');

// Window frame, cloth, pane and outdoor panorama are built by architecture.js.
// Leave the wall opening free of any static pane or fake outdoor building.
// Door trim; moving/unlocked door stays governed by the existing game state.
for(let x of [-.98,.98])box(x,1.11,-4.86,.1,2.22,.09,'f0ede8');
box(0,2.25,-4.86,2.06,.10,.09,'f0ede8');

// Rug and bed area.
box(2.55,.02,2.45,3.15,.035,2.35,'ccd7df');
solid(3.35,.27,2.42,2.55,.54,3.05,'7f6752');
box(3.35,.6,2.42,2.46,.12,2.96,'f0ede8');
box(3.35,.79,3.32,1.88,.22,.72,'f0ede8');
box(2.78,.82,1.55,.58,.11,.46,'d6dce2');
box(3.93,.82,1.56,.58,.11,.46,'d6dce2');

// Wardrobe and shelf.
solid(3.95,1.4,-3.62,1.44,2.8,.74,'967e64');
for(let y of [.36,1.03,1.72,2.38])box(3.95,y,-3.27,1.34,.025,.04,'655343');
box(3.61,1.4,-3.26,.03,2.45,.04,'655343');
box(4.29,1.4,-3.26,.03,2.45,.04,'655343');
box(3.95,1.2,-3.28,.48,.06,.03,'252a2e');

solid(-1.75,.42,3.05,.58,.84,.52,'967e64');
box(-1.75,.88,3.05,.5,.11,.44,'f0ede8');
box(-1.75,1.08,3.05,.12,.31,.12,'655343');
box(-1.75,1.31,3.05,.5,.24,.5,'f0ede8');

// Decorative radiator beneath the window.
box(-4.72,.52,-.96,.12,.84,1.6,'f0ede8');
for(let i=0;i<7;i++)box(-4.66,.53,-1.58+i*.26,.03,.78,.13,'f0ede8');
box(-4.61,.95,-1.72,.03,.14,.08,'c6b8a1');
box(-4.61,.95,-.18,.03,.14,.08,'c6b8a1');

// Small architectural and decor details.
box(0,.015,1.08,4.15,.025,3.18,'536c76');
box(0,2.95,0,1.8,.09,.62,'fff2cb');
box(0,1.55,4.86,1.82,1.1,.08,'70553f');
box(0,1.56,4.79,1.66,.95,.04,'9caeb3');
for(let x of [-.63,-.21,.21,.63])box(x,1.56,4.75,.18,.68,.03,'75846b');

const spec={
  crate:{p:[-1.4,.45,-2.05],s:[.9,.9,.9],c:'a77a48',max:60},
  table:{p:[2.25,.39,-1.7],s:[1.6,.78,.85],c:'765742',max:100},
  window:{p:[-4.94,1.74,-1],s:[.045,1.44,2.38],c:'75b6d1',max:35},
  chair:{p:[2.15,.5,.15],s:[.86,1,.9],c:'466c79',max:60},
  sofa:{p:[-3.32,.55,2.84],s:[2.5,1.1,1.4],c:'667d89',max:150},
  coffee_table:{p:[-3.3,.25,1.22],s:[1.4,.5,.76],c:'765742',max:100}
};

let state={objects:Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,o.max])),unlocked:false}, bodies=Object.fromEntries(Object.entries(spec).map(([id,o])=>[id,{p:[...o.p],v:[0,0,0]}])), debris=[], busy=false, held=null, player={x:0,z:3,y:0,vy:0,yaw:.62,pitch:0}, keys=new Set(), first=true, started=false, active=false;
let mobile=matchMedia('(pointer:coarse)').matches, touchMove=[0,0], look=null;
function clearControls(){keys.clear();touchMove=[0,0];look=null;$('stick').classList.remove('moving');$('stick').style.removeProperty('--jx');$('stick').style.removeProperty('--jy');}
function setMode(v){mobile=v;document.body.classList.toggle('mobile',v);$('mode').textContent=v?'Desktop-Modus':'Touch-Modus';clearControls();if(v)document.exitPointerLock?.();}
let token=sessionStorage.getItem('second_live_token')||''; $('token').value=token;
const api=async(path,data)=>{let r=await fetch(path,{headers:{'X-SecondLive-Token':token,'Content-Type':'application/json'},...(data?{method:'POST',body:JSON.stringify(data)}:{})});let j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j;};
function sync(s){for(const [id,o] of Object.entries(spec)){let hp=s.objects[id];if(!bodies[id]||((state.objects[id]||0)===0&&hp>0)){bodies[id]={p:[...o.p],v:[0,0,0]};debris=debris.filter(d=>d.source!==id);}if(state.objects[id]>0&&hp===0){let p=id==='window'?[-4.45,1.52,-1]:bodies[id].p;for(let i=0;i<8;i++)debris.push({source:id,p:[...p],v:[(Math.random()-.5)*4,2+Math.random()*3,(Math.random()-.5)*4],s:id==='window'?[.035,.07+Math.random()*.09,.09+Math.random()*.12]:[.10+Math.random()*.15,.045+Math.random()*.08,.10+Math.random()*.18],c:rgb(o.c),m:id==='window'?'glass':mat(o.c),r:Math.random()*6});if(held===id)held=null;}}state=s; $('worldstate').textContent=s.unlocked?'Testbereich freigeschaltet':'Welt noch nicht erschlossen';}
let mutationVersion=0;async function refresh(){const v=mutationVersion;let s=await api('/api/game');if(!busy&&v===mutationVersion)sync(s);}
async function action(action,id){if(busy)return;busy=true;mutationVersion++;try{sync(await api('/api/game',{action,id}));$('notice').textContent=action==='repair'?'Objekt repariert':action==='unlock'?'Testbereich freigeschaltet':'Treffer gespeichert';}catch(e){$('notice').textContent=e.message;}finally{busy=false;}}
function dir(){let a=player.yaw,p=player.pitch;return [-Math.sin(a)*Math.cos(p),-Math.sin(p),-Math.cos(a)*Math.cos(p)];}
function rotateInverse(v,q){if(!q)return v;const [x,y,z,w]=q,u=[-x,-y,-z],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=cross(u,v).map(n=>2*n),c=cross(u,t);return v.map((n,i)=>n+w*t[i]+c[i]);}
function rayBox(eye,d,p,s,q=null){let pos=rotateInverse(eye.map((v,i)=>v-p[i]),q),dir=rotateInverse(d,q),lo=0,hi=8;for(let i=0;i<3;i++){if(Math.abs(dir[i])<1e-8){if(Math.abs(pos[i])>s[i]/2)return Infinity;}else{let a=(-s[i]/2-pos[i])/dir[i],z=(s[i]/2-pos[i])/dir[i];lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));if(lo>hi)return Infinity;}}return lo;}
function aim(ray=null,includeDestroyed=true){let d=ray?.direction||dir(),eye=ray?.origin||[player.x,player.y+1.65,player.z],best=8.01,id=null;for(const o of room)best=Math.min(best,rayBox(eye,d,o.p,o.s));if(!state.unlocked)best=Math.min(best,rayBox(eye,d,[0,1.1,-4.95],[1.85,2.2,.18]));for(const [k,b] of Object.entries(bodies)){if(k===held)continue;const live=state.objects[k]>0;if(!live&&!includeDestroyed)continue;const dist=rayBox(eye,d,live?b.p:spec[k].p,spec[k].s,live?b.q:null);if(dist<best){best=dist;id=k;}}return {id,dist:best};}
function chooseWeapon(id){if(!['pistol','rifle','none'].includes(id))return;equipped=id==='none'?null:id;$('weaponstatus').textContent=equipped==='pistol'?'Pistole · Testmodus':equipped==='rifle'?'Gewehr · Testmodus':'Unbewaffnet';}
function arsenal(){document.exitPointerLock?.();clearControls();active=false;$('arsenal').hidden=false;}
$('closearsenal').onclick=()=>{$('arsenal').hidden=true;active=true;clearControls();};
for(const id of ['pistol','rifle','none'])$('equip-'+id).onclick=()=>{chooseWeapon(id);$('closearsenal').onclick();};
chooseWeapon('none');
function phone(){if(renderer?.xrMode?.active){renderer.xrMode.end().then(()=>phone()).catch(e=>$('notice').textContent=e.message);return;}document.exitPointerLock?.();clearControls();$('phone').hidden=false;active=false;}
function interact(){if(Math.abs(player.x)<1.7&&player.z<-3.2&&!state.unlocked){phone();return;}let a=aim();if(held){let d=dir();bodies[held].v=d.map(v=>v*6);held=null;}else if(a.id&&a.dist<3&&state.objects[a.id]>0&&!['window','sofa'].includes(a.id))held=a.id;}
function coll(x,z){if(Math.abs(x)>4.65||z>4.65||z<(state.unlocked?-14.5:-4.65))return true;if(z<-4.65&&Math.abs(x)>.72&&z>-5.4)return true;return room.some(b=>b.p[1]<1.6&&b.p[1]+b.s[1]/2>.1&&Math.abs(x-b.p[0])<b.s[0]/2+.28&&Math.abs(z-b.p[2])<b.s[2]/2+.28)||Object.entries(bodies).some(([id,b])=>id!==held&&state.objects[id]>0&&b.p[1]-spec[id].s[1]/2<1.5&&Math.abs(x-b.p[0])<spec[id].s[0]/2+.28&&Math.abs(z-b.p[2])<spec[id].s[2]/2+.28);}
$('start').onclick=async()=>{if(!graphicsReady)return;token=$('token').value;try{await refresh();sessionStorage.setItem('second_live_token',token);$('welcome').hidden=true;started=true;active=true;document.body.classList.add('playing');if(!mobile)canvas.requestPointerLock?.()?.catch?.(()=>{});}catch(e){$('loginerror').textContent=e.message;}};
$('closephone').onclick=()=>{$('phone').hidden=true;clearControls();active=true;};$('unlock').onclick=()=>action('unlock');$('refresh').onclick=async()=>{try{await refresh();$('notice').textContent='Weltstatus aktualisiert';}catch(e){$('notice').textContent=e.message;}};
canvas.onclick=()=>{if(mobile||!started||!$('phone').hidden||!$('arsenal').hidden)return;if(document.pointerLockElement!==canvas){if(!mobile)canvas.requestPointerLock?.()?.catch?.(()=>{});active=true;return;}fire();};
window.addEventListener('keydown',e=>{if(!active||!started||!$('updater').hidden)return;if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyE')interact();if(e.code==='KeyV')first=!first;if(e.code==='KeyP')phone();if(e.code==='KeyI')arsenal();if(e.code==='Digit1')chooseWeapon('pistol');if(e.code==='Digit2')chooseWeapon('rifle');if(e.code==='Digit0')chooseWeapon('none');if(e.code==='KeyR'){let a=aim();if(a.id&&a.dist<3)action('repair',a.id);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)keys.clear();});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){player.yaw-=e.movementX*.003;player.pitch=Math.max(-1.2,Math.min(1.2,player.pitch+e.movementY*.003));}});
function part(p,s,c,r=0,q=null){draw({p,s,c:rgb(c),r,q,m:mat(c)});}
function canPlay(){return started&&active&&$('phone').hidden&&$('arsenal').hidden&&$('updater').hidden;}
function fire(ray=null){if(!canPlay()||!equipped||busy)return;renderer.shot();let a=aim(ray,false);$('cross').classList.add('pulse');setTimeout(()=>$('cross').classList.remove('pulse'),100);if(a.id&&state.objects[a.id]>0){physicsWorld.impulse(a.id,ray?.direction||dir());action('hit',a.id);}else $('notice').textContent='Kein Objekt getroffen';}
function repair(ray=null){if(!canPlay())return;let a=aim(ray);if(a.id&&a.dist<3)action('repair',a.id);}
$('mode').onclick=()=>setMode(!mobile);setMode(mobile);
const stick=$('stick');let stickId=null;function moveStick(e){let r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.36),y=(e.clientY-r.top-r.height/2)/(r.height*.36),l=Math.max(1,Math.hypot(x,y));touchMove=[x/l,-y/l];stick.style.setProperty('--jx',`${x/l*33}px`);stick.style.setProperty('--jy',`${y/l*33}px`);}stick.addEventListener('pointerdown',e=>{if(!canPlay()||stickId!==null)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId&&canPlay())moveStick(e);});for(const n of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(n,e=>{if(e.pointerId===stickId){stickId=null;touchMove=[0,0];stick.style.setProperty('--jx','0px');stick.style.setProperty('--jy','0px');}});
canvas.addEventListener('pointerdown',e=>{if(!canPlay()||(!mobile&&document.pointerLockElement===canvas))return;if(look)return;look={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!look||look.id!==e.pointerId||!canPlay())return;player.yaw-=(e.clientX-look.x)*.005;player.pitch=Math.max(-1.2,Math.min(1.2,player.pitch+(e.clientY-look.y)*.005));look.x=e.clientX;look.y=e.clientY;});for(const n of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(n,e=>{if(look?.id===e.pointerId)look=null;});
for(const [id,fn] of [['touchInteract',interact],['touchFire',()=>fire()],['touchRepair',()=>repair()],['touchView',()=>first=!first],['touchPhone',phone],['touchArsenal',arsenal],['touchJump',()=>{if(player.y===0)player.vy=4.2;}]])$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(canPlay())fn();});window.addEventListener('blur',clearControls);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});

let prev=performance.now();
function frame(now,xrFrame){
  let dt=Math.max(0,Math.min(.035,(now-prev)/1000));prev=now;
  const vr=!!renderer.xrMode?.active;const xrInput=vr?renderer.xrMode.inputs(xrFrame):null;
  if(started&&active){
    if(vr)player.yaw+=xrInput.turn;
    let f=vr?xrInput.move[1]:Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touchMove[1],s=vr?xrInput.move[0]:Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touchMove[0],a=player.yaw+(vr?xrInput.headYaw:0),m=(vr?1.6:3.4)*dt/Math.max(1,Math.hypot(f,s)),dx=(-Math.sin(a)*f+Math.cos(a)*s)*m,dz=(-Math.cos(a)*f-Math.sin(a)*s)*m;
    if(!coll(player.x+dx,player.z))player.x+=dx;
    if(!coll(player.x,player.z+dz))player.z+=dz;else if(dz<0&&Math.abs(player.x)<.75&&player.z<-4.3&&!state.unlocked)phone();
    if(!vr&&keys.has('Space')&&player.y===0)player.vy=4.2;
    player.vy-=9.81*dt;player.y=Math.max(0,player.y+player.vy*dt);if(player.y===0)player.vy=0;
  }
  if(debris.length>80)debris.splice(0,debris.length-80);
  if(started){let d=dir();let holdPoint=[player.x+d[0]*1.3,Math.max(held?spec[held].s[1]/2:0,player.y+1.4+d[1]*1.3),player.z+d[2]*1.3];physicsWorld.step(dt,bodies,state,held,holdPoint,debris);}
  let d=dir(),eye=[player.x,player.y+1.65,player.z],target=eye.map((v,i)=>v+d[i]);
  if(!first&&!vr){let t=eye.map((v,i)=>v-d[i]*2.1);if(!coll(t[0],t[2])){eye=t;target=eye.map((v,i)=>v+d[i]);}}
  renderer.begin();
  if(!state.unlocked){part([0,1.1,-4.95],[1.85,2.2,.18],'81664b');part([.68,1.05,-4.81],[.19,.045,.1],'c6b8a1');}
  else{part([0,-.12,-10],[10,.24,10],'a8a69a');part([-4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([4.8,1.4,-10],[.2,2.8,10],'c1b6a6');part([0,1.4,-15],[10,2.8,.2],'c1b6a6');}
  for(let [id,b] of Object.entries(bodies)){
    let o=spec[id],hp=state.objects[id];
    if(hp>0){if(!renderer.drawModel(id,b.p,o.s,hp,o.max,b.q))part(b.p,o.s,id==='window'?o.c:hp<o.max?'947665':o.c,0,b.q);}else {for(let i=0;i<4;i++){let a=i*1.73;const x=id==='window'?-4.42:o.p[0];part([x+Math.cos(a)*.19,.032,o.p[2]+Math.sin(a)*.26],id==='window'?[.13,.012,.08]:[.23,.06,.12],o.c,a);}}
  }
  for(let b of debris)draw(b);
  if(!first&&!vr&&Math.hypot(eye[0]-player.x,eye[2]-player.z)>.5){part([player.x,player.y+1,player.z],[.5,1.1,.32],'354d65');part([player.x,player.y+1.7,player.z],[.32,.34,.32],'cba384');}
  renderer.equip(equipped,first&&started);renderer.render(canvas,eye,target,mobile,dt,player);
  let a=aim();$('hint').textContent=held?'E: Werfen':Math.abs(player.x)<1.7&&player.z<-3.2&&!state.unlocked?'E: Tuer / Smartphone':a.id?`${a.id} · ${state.objects[a.id]} HP · R: Reparieren`:'P: Smartphone · I: Inventar';
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
  mode.onAction=(type,ray)=>{if(!canPlay())return;if(type==='repair'){repair(ray);return;}if(!state.unlocked&&Math.abs(player.x)<1.5&&player.z<-3.25){phone();return;}fire(ray);};
  button.onclick=async()=>{
    if(xrEntering||!started||!canPlay())return;
    if(mode.active){await mode.end();return;}
    xrEntering=true;button.disabled=true;xrReturnFirst=first;clearControls();held=null;document.exitPointerLock?.();first=true;player.y=0;player.vy=0;
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
    const q=qualityChoice.value==='auto'?(matchMedia('(pointer:coarse)').matches||innerWidth<800?'1k':'2k'):qualityChoice.value;
    renderer=new RoomRenderer(canvas,q,lightChoice.value,t=>status.textContent=t);
    await renderer.load(spec,objects);
    for(const id of ['pistol','rifle']){
      const img=$('photo-'+id),fallback=$('fallback-'+id),url=renderer.photoPaths?.[id];
      if(url){img.onerror=()=>{img.hidden=true;fallback.hidden=false;};img.onload=()=>{img.hidden=false;fallback.hidden=true;};img.src=url;}
    }
    for(const id of ['pistol','rifle']){ $('model-'+id).textContent=renderer.propPaths?.[id]?'Texturiertes 3D-Modell':'Eingebautes 3D-Testmodell'; }
    $('realismstatus').textContent=renderer.realismStatus?.outside==='ready'?'Fotografischer Fensterausblick geladen':'Fensterausblick: einfacher Ersatz (Original nicht verfügbar)';
    status.textContent='Rapier-Physik wird geladen …';
    physicsWorld=await RoomPhysics.create(room,spec);
    status.textContent='Fotomaterialien und Rapier-Physik bereit';
    graphicsReady=true;$('start').disabled=false;
    prev=performance.now();renderer.setLoop(frame);setupXR();
  }catch(e){console.error(e);status.textContent='Grafik konnte nicht geladen werden: '+e.message;$('error').hidden=false;$('error').textContent='WebGL 2 oder lokale Grafikdateien fehlen. Bitte Docker-Build und Browser prüfen.';}
})();
