import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const game=readFileSync(new URL('./game.js',import.meta.url),'utf8');
const updater=readFileSync(new URL('./updater.js',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length);
for(const [,id] of (game+'\n'+updater).matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),'Missing DOM element '+id);
for(const obsolete of ['phone-app-capture','start-gps','/scanner.html','/panorama.html','/api/capture/locate','locationFix'])assert.ok(!(html+game).includes(obsolete),obsolete);
assert.ok(game.includes('health.personal_world===true'));
assert.ok(game.includes("api('/api/session',{})"));
assert.ok(ids.includes('phone-app-world')&&ids.includes('phone-page-world')&&ids.includes('update-open-phone'));
assert.ok(html.includes('Eigene Welten')&&html.includes('3D-Modelle importieren'));
assert.ok(ids.includes('phone-app-models')&&ids.includes('phone-page-models')&&ids.includes('room-model-file')&&ids.includes('room-model-save'));
assert.ok(html.includes('https://polyhaven.com/models/furniture'));
assert.ok(game.includes("fetch('/api/room-models/upload?name="));
// Run the actual pure interaction-selection functions with a minimal room state.
// Function construction is test-only, never delivered to the browser.
const start=game.indexOf('const CURTAIN_TARGETS='),end=game.indexOf('function updateInteractionHint(',start);
assert.ok(start>=0&&end>start);
const testState={curtains_closed:false,lights_on:true,decor:{},objects:{table:100,window:35,sofa:150,surface_bed:4,surface_rug:4},walls:{},marks:[]};
const options=new Function('state','spec','WALLS','REMOVED','movable','movableDecor',game.slice(start,end)+';return {primaryInteraction,damaged,objectName};')(
 testState,{table:{max:100},window:{max:35}},{surface_0:{},surface_8:{}},4,id=>['table','sofa','surface_bed','surface_rug'].includes(id)&&testState.objects[id]>0,id=>id==='surface_bed'||id==='surface_rug');
const hit=id=>({id,dist:1.5});
assert.equal(options.primaryInteraction(hit('surface_curtain_l')).label,'Vorhänge schließen');
testState.curtains_closed=true;
assert.equal(options.primaryInteraction(hit('surface_curtain_r')).label,'Vorhänge öffnen');
assert.equal(options.primaryInteraction(hit('window')).op,'toggle_curtains');
assert.equal(options.primaryInteraction(hit('surface_switch')).label,'Licht ausschalten');
assert.equal(options.primaryInteraction(hit('table')).op,'pick_up');
assert.equal(options.primaryInteraction({id:'table',dist:3.1}),null);
assert.equal(options.primaryInteraction(hit('surface_8')),null);
assert.equal(options.damaged('table'),false);
testState.objects.table=75;
assert.equal(options.damaged('table'),true);
testState.decor.surface_curtain_l=4;
assert.equal(options.primaryInteraction(hit('surface_curtain_r')).op,'toggle_curtains');
testState.decor.surface_curtain_r=4;
assert.equal(options.primaryInteraction(hit('window')),null);
testState.decor.surface_curtain_r=0;testState.decor.surface_curtainrod=4;
assert.equal(options.primaryInteraction(hit('window')),null);
assert.equal(options.objectName('surface_curtain_l'),'Vorhänge');
assert.equal(options.primaryInteraction(hit('sofa')).op,'sit');
assert.equal(options.primaryInteraction(hit('surface_bed')).op,'lie');
assert.equal(options.primaryInteraction(hit('surface_bed')).secondary,'Aufheben');
assert.equal(options.primaryInteraction(hit('surface_rug')).op,'pick_up');
testState.objects.surface_rug=0;assert.equal(options.primaryInteraction(hit('surface_rug')),null);
testState.objects.sofa=0;assert.equal(options.primaryInteraction(hit('sofa')),null);

const getPart=(a,b)=>{const i=game.indexOf(a),j=game.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return game.slice(i,j);};
const modelFront=new Function(getPart("function modelFrontPlacement(","function readRoomModelPlacement(")+"return modelFrontPlacement;")();
for(const size of [.1,.8,2.4])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
 const p=modelFront({x:4.6,z:4.6,yaw},size);
 assert.ok(Math.abs(p.x)+size*Math.SQRT2/2<=4.72);
 assert.ok(Math.abs(p.z)+size*Math.SQRT2/2<=4.72);
 assert.equal(p.y,0);assert.equal(p.solid,false);
}
const ahead=modelFront({x:0,z:0,yaw:0},.8);
assert.equal(ahead.x,0);assert.ok(ahead.z< -1);
console.log('Room model placement and phone UI checks passed');
const cycle=new Function(getPart("const weaponIds=","const clipSize=")+"return nextWeapon;")();
assert.equal(cycle(null,1),'pistol');assert.equal(cycle('pistol',1),'rifle');
assert.equal(cycle('rifle',1),'m16');assert.equal(cycle('m16',1),'none');
assert.equal(cycle('none',-1),'m16');assert.equal(cycle('rifle',-1),'pistol');


// Exercise the actual client fire/reload functions with mocked game objects.
const weaponTest=new Function('assert',"const weaponIds=['pistol','rifle','m16'];\nlet equipped='rifle',posture=null,lobbyState=null,lobbyTransition=false,busy=false,held=null;\nlet shots=[],mutations=[],notices={},impulses=[];\nconst $=id=>notices[id]??={textContent:'',classList:{add(){},remove(){}}};\nconst canPlay=()=>true,setScopeZoom=()=>{},setTimeout=()=>{};\nconst renderer={surfaceHit:()=>({id:'surface_0',dist:1,mark:{point:[0,0,0],normal:[0,0,1]}}),shot:id=>shots.push(id),reload(){}};\nconst audio={play(){}},physicsWorld={impulse(...a){impulses.push(a)}},state={objects:{}},WALLS={surface_0:{}},DECOR_BOUNDS={};\nconst dir=()=>[0,0,-1],playerEye=()=>[0,1,0],movableDecor=()=>false;\nconst action=(op,id,mark,extra)=>mutations.push({op,id,extra});\n"+getPart("const clipSize=","const rgb=")+getPart("function fire(ray=null){","function repairTarget(")+"assert.equal(clipSize.rifle,1);\npressTrigger();assert.equal(shots.length,1);assert.equal(ammo.rifle,0);assert.equal(reloadId,'rifle');assert.equal(triggerHeld,false);\nstepTrigger(1);pressTrigger();assert.equal(shots.length,1);\nstepReload(.1);pressTrigger();assert.equal(shots.length,1);\nstepReload(10);stepTrigger(1);assert.equal(ammo.rifle,1);assert.equal(shots.length,1);\npressTrigger();assert.equal(shots.length,2);assert.equal(reloadId,'rifle');\nassert.equal(mutations[0].extra.weapon,'rifle');\nstepReload(10);stepTrigger(1);\nequipped='pistol';pressTrigger();stepTrigger(1);assert.equal(shots.length,3);assert.equal(triggerHeld,false);\nammo.pistol=1;pressTrigger();assert.equal(shots.length,4);assert.equal(reloadId,'pistol');\nstepReload(10);stepTrigger(1);assert.equal(ammo.pistol,clipSize.pistol);\nequipped='m16';pressTrigger();assert.equal(shots.length,5);assert.equal(triggerHeld,true);\nfor(let i=0;i<10;i++)stepTrigger(.1);\nassert.equal(shots.length,15);assert.ok(mutations.slice(4).every(x=>x.extra.weapon==='m16'));\nbusy=true;stepTrigger(1);assert.equal(shots.length,15);busy=false;\nreleaseTrigger();stepTrigger(1);assert.equal(shots.length,15);\nammo.m16=1;pressTrigger();assert.equal(shots.length,16);assert.equal(reloadId,'m16');assert.equal(triggerHeld,true);\nstepTrigger(1);assert.equal(shots.length,16);stepReload(10);stepTrigger(1);assert.equal(shots.length,17);\nreleaseTrigger();stepTrigger(1);assert.equal(shots.length,17);\nammo.m16=1;pressTrigger();assert.equal(reloadId,'m16');releaseTrigger();stepReload(10);stepTrigger(1);assert.equal(shots.length,18);\nequipped='rifle';ammo.rifle=0;stepTrigger(1);assert.equal(reloadId,'rifle');stepReload(10);\nlobbyState={};pressTrigger();assert.equal(shots.length,18);\n");
weaponTest(assert);
console.log('Automatic reload, single-shot rifle and held-fire regression checks passed');

// Test actual posture state transitions with minimal DOM/room stand-ins.
const postureTest=new Function('assert',`
let held=null,posture=null,first=false,renderer=null;
let player={x:0,y:0,z:0,vy:0,yaw:1,pitch:0},nodes={};
const $=id=>nodes[id]??=( {hidden:true,textContent:''} );
const spec={sofa:{s:[2.5,1.1,1.4]},surface_bed:{s:[1.56,1.2,2.26]}};
const bodies={sofa:{p:[2,.55,-2],v:[0,0,0],q:[0,0,0,1]},surface_bed:{p:[-1,.6,2],v:[0,0,0],q:[0,Math.SQRT1_2,0,Math.SQRT1_2]}};
const HOTEL_LAYOUT={spawn:{p:[.8,0,.55]}};
const movable=id=>!!bodies[id],groundAt=()=>0,coll=(x,z)=>Math.abs(x)+Math.abs(z)>10;
const chooseWeapon=()=>{},clearControls=()=>{};
`+getPart("function furniturePose(","function secondaryInteraction(")+`
assert.ok(enterPosture('sofa','sit'));assert.equal(posture.kind,'sit');assert.equal(posture.yaw,furniturePose('sofa',bodies.sofa).yaw);
assert.ok(Math.abs(playerEye()[1]-1.18)<.001);
assert.ok(leavePosture());assert.equal(player.x,0);assert.equal(first,false);
const p=furniturePose('surface_bed',bodies.surface_bed);
assert.ok(Math.abs(p.x-(-.34))<.001);assert.ok(Math.abs(p.z-1.92)<.001);
assert.ok(enterPosture('surface_bed','lie'));assert.ok(player.pitch<0);assert.equal(posture.yaw,p.yaw);
setSleeping(true);assert.equal(posture.sleeping,true);assert.equal($('sleep-overlay').hidden,false);
setSleeping(false);assert.equal($('sleep-overlay').hidden,true);
assert.ok(leavePosture());assert.equal(posture,null);assert.equal(player.z,0);
bodies.sofa.v=[1,0,0];assert.equal(furniturePose('sofa',bodies.sofa),null);
`);postureTest(assert);

// Scope mode is visual only: toggle and reject wrong weapon / reload / posture.
const zoomTest=new Function('assert',`
let equipped='rifle',scopeZoom=false,held=null,posture=null,reloadId=null,first=true,renderer=null;
const nodes={},$=id=>nodes[id]??={hidden:true,textContent:'',setAttribute(){}};
const canPlay=()=>true,document={body:{classList:{toggle(){}}}};
`+getPart("function setScopeZoom(","function chooseWeapon(")+`
toggleScope();assert.equal(scopeZoom,true);assert.equal($('scope-overlay').hidden,false);
toggleScope();assert.equal(scopeZoom,false);
equipped='pistol';toggleScope();assert.equal(scopeZoom,false);
equipped='rifle';reloadId='rifle';toggleScope();assert.equal(scopeZoom,false);
reloadId=null;first=false;toggleScope();assert.equal(first,true);assert.equal(scopeZoom,true);
setScopeZoom(false);posture={kind:'sit'};toggleScope();assert.equal(scopeZoom,false);
`);zoomTest(assert);

// Initial UI must not reveal update actions; server authorization is always required.
for(const id of ['update-open-welcome','update-open-phone']){
 const button=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))?.[0];
 assert.ok(button&&/\bhidden\b/.test(button),id+' hidden before authorization');
}
assert.ok(!html.includes('id="update-token"'));
assert.ok(!updater.includes('X-SecondLive-Admin'));
assert.ok(updater.includes("credentials:'same-origin'"));
assert.ok(updater.includes("api('/api/update/status')")&&updater.includes("api('/api/update',body)"));
assert.ok(game.includes("new Event('sl-account-change')"));
// Movement modes, speed, safe standing and one greeting per encounter.
const movement=new Function(getPart("function movementStance(","function wantsCrouch(")+"return {movementStance,movementSpeed};")();
assert.equal(movement.movementStance(false,true,true,true,false),'sprint');
assert.equal(movement.movementStance(false,true,false,true,false),'walk');
assert.equal(movement.movementStance(true,true,true,true,false),'crouch');
assert.equal(movement.movementStance(false,true,true,false,false),'crouch');
assert.equal(movement.movementStance(false,true,true,true,true),'walk');
assert.ok(movement.movementSpeed('sprint')>movement.movementSpeed('walk'));
assert.ok(movement.movementSpeed('crouch')<movement.movementSpeed('walk'));
assert.equal(movement.movementSpeed('sprint',true),1.6);
const greet=new Function(getPart("function encounterGreeting(","function resetGreeting(")+"return encounterGreeting;")();
const greeting={near:false,last:-Infinity};
assert.equal(greet(greeting,5,0),false);assert.equal(greet(greeting,2,100),true);
assert.equal(greet(greeting,2,200),false);assert.equal(greet(greeting,3,13000),false);
assert.equal(greet(greeting,2,14000),false);assert.equal(greet(greeting,5,15000),false);
assert.equal(greet(greeting,2,16000),true);assert.equal(greet(greeting,5,17000),false);
assert.equal(greet(greeting,2,18000),false);
assert.ok(game.includes("yaw:player.yaw,stance:player.stance"));
assert.ok(game.includes("audio.play('greeting'"));
assert.ok(game.includes("player.stance!=='crouch'&&keys.has('Space')"));
console.log('Game-only UI, movement and proximity greetings passed');

assert.ok(game.includes('posture.yaw=pose.yaw'));
assert.ok(game.includes('started&&!vr,{posture,weapon:equipped}'));
console.log('Room avatar receives furniture direction, posture and equipped cosmetic prop state');


// Session recovery is distinct from wrong passwords or the protected-game key.
// Exercise the actual production functions with controlled account responses.
const sessionTest=new Function('assert',getPart('let enteringGame=false,pendingAvatar=null;','function authButtons(){')+`
 let accountsEnabled=true,started=false,active=true,studioOpen=true,editingFromGame=false;
 let accountProfile={slot:0,nickname:'Alpha',avatar:{model:1}},characterDraft={model:8};
 const first={...accountProfile},second={slot:1,nickname:'Beta',avatar:{model:2}};
 let reply=first,failure=null,cleared=0,notified=0,resetMode=null,reloads=0;
 const api=async()=>{if(failure)throw failure;return reply;};
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',textContent:''});return nodes.get(id);};
 const renderer={studio:{clear(){cleared++;}},roomModels:{clear(){cleared++;}}};
 const clearControls=()=>{},updateWorldStatus=()=>{},setAuthMode=mode=>{resetMode=mode;};
 const document={exitPointerLock(){},body:{classList:{remove(){}}}},location={reload(){reloads++;}};
 const window={dispatchEvent(){notified++;}},Event=class{};
 const expired=Object.assign(Error('expired'),{status:401,code:'session_required'});
 const wrong=Object.assign(Error('E-Mail oder Passwort falsch'),{status:401});
 const tokenError=Object.assign(Error('Zugriffsschluessel fehlt oder ist falsch'),{status:401});
 return (async()=>{
  assert.ok(isPersonalSessionError(expired));assert.ok(!isPersonalSessionError(wrong));assert.ok(!isPersonalSessionError(tokenError));
  assert.ok(isPersonalSessionError({status:401,message:'Persoenliche Sitzung fehlt; Spiel erneut betreten'}));
  assert.equal(await verifyAccountSession(first),first);
  reply=second;
  try{await verifyAccountSession(first);throw Error('account mismatch accepted');}catch(e){assert.ok(isPersonalSessionError(e));}
  failure=expired;
  try{await verifyAccountSession(first);throw Error('expired session accepted');}catch(e){assert.equal(e,expired);}
  assert.equal(recoverAccountSession(wrong),false);assert.equal(recoverAccountSession(expired),true);
  assert.equal(accountProfile,null);assert.equal(studioOpen,false);assert.equal($('welcome').hidden,false);
  assert.equal($('character-editor').hidden,true);assert.equal(resetMode,'login');assert.equal(cleared,2);assert.equal(notified,1);
  assert.equal(resumePendingAvatar(first).model,8);
  pendingAvatar={profile:first,avatar:{model:8}};assert.equal(resumePendingAvatar(second),null);
  pendingAvatar={profile:first,avatar:{model:8}};assert.equal(resumePendingAvatar({...first,nickname:'Someone else'}),null);
  started=true;active=true;assert.equal(recoverAccountSession(expired),true);assert.equal(active,false);assert.equal(started,false);assert.equal(reloads,1);
 })();
`);
await sessionTest(assert);
assert.ok(game.includes("credentials:'same-origin'")&&game.includes("cache:'no-store'"));
assert.ok(game.includes("expected_slot:accountProfile.slot"));
console.log('Account session verification, reauthentication, draft ownership and restart recovery checks passed');

assert.ok(ids.includes('room-model-repair'));
const importBody=new Function('yawQuat',getPart('function importedSavedBody(','function syncRoomModelBodies(')+'return importedSavedBody;')(a=>[0,Math.sin(a*Math.PI/360),0,Math.cos(a*Math.PI/360)]);
const normal=importBody({x:1,y:.3,z:2,rotation:90},[.4,.6,.5]);
assert.equal(normal.p[1],.6);assert.ok(Math.abs(normal.q[1]-Math.SQRT1_2)<.001);
const fallen=importBody({pose:{p:[2,.4,3],q:[1,0,0,0]}},[.4,.6,.5]);
assert.equal(fallen.p[0],2);assert.equal(fallen.q[0],1);
assert.ok(game.includes('syncRoomModelBodies();')&&game.includes('renderer.roomModels.drawBody(id,b,hp)'));
assert.ok(game.includes("action('drop_import',id,null,motion)")&&game.includes("action('motion',id,null,motion)"));
console.log('Imported rigid-body state, saved poses, drop and repair UI checks passed');

const importedLifecycle=new Function('assert',`
 const spec={},bodies={},state={objects:{}};let debris=[],held=null;
 let rows=[{row:{id:'x',name:'Test',x:1,y:0,z:2,extent:1,rotation:0,hp:100,revision:0,solid:true},size:[.5,1,.5]}];
 const renderer={roomModels:{physicsModels:()=>rows}},rgb=()=>[.5,.5,.5];
 const yawQuat=a=>[0,Math.sin(a*Math.PI/360),0,Math.cos(a*Math.PI/360)];
 `+getPart('function importedSavedBody(','function importedMotion(')+`
 syncRoomModelBodies();assert.equal(state.objects.x,100);assert.equal(bodies.x.p[1],.5);
 const live=bodies.x;live.p[0]=1.4;live.v[0]=.7;
 // A hit acknowledgement stores a physical snapshot, not a body reset.
 rows[0].row={...rows[0].row,hp:75,revision:1,pose:{p:[1.1,.5,2],q:[0,0,0,1]}};
 syncRoomModelBodies('x');assert.equal(bodies.x,live);assert.equal(bodies.x.v[0],.7);assert.equal(state.objects.x,75);
 syncRoomModelBodies();assert.equal(bodies.x,live);
 // A remote resize/placement must recreate the collider.
 rows[0].row={...rows[0].row,extent:.8,pose:null,x:2,revision:2};
 syncRoomModelBodies();assert.ok(bodies.x!==live);assert.equal(bodies.x.p[0],2);
 held='x';rows[0].row={...rows[0].row,hp:0,revision:3};
 syncRoomModelBodies();assert.equal(state.objects.x,0);assert.equal(held,null);assert.equal(debris.length,6);
 syncRoomModelBodies();assert.equal(debris.length,6);
 rows[0].row={...rows[0].row,hp:100,revision:4};
 syncRoomModelBodies();assert.equal(state.objects.x,100);assert.equal(debris.length,0);
 rows=[];syncRoomModelBodies();assert.equal(bodies.x,undefined);assert.equal(spec.x,undefined);assert.equal(state.objects.x,undefined);
 `);
importedLifecycle(assert);
console.log('Imported object lifecycle: preserve live motion, remote edit, destroy, repair and remove passed');
