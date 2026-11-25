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
assert.ok(html.includes('Eigene Welten')&&html.includes('Weltimport'));
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
const cycle=new Function(getPart("const weaponIds=","const clipSize=")+"return nextWeapon;")();
assert.equal(cycle(null,1),'pistol');assert.equal(cycle('pistol',1),'rifle');
assert.equal(cycle('rifle',1),'m16');assert.equal(cycle('m16',1),'none');
assert.equal(cycle('none',-1),'m16');assert.equal(cycle('rifle',-1),'pistol');

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
assert.ok(enterPosture('sofa','sit'));assert.equal(posture.kind,'sit');
assert.ok(Math.abs(playerEye()[1]-1.18)<.001);
assert.ok(leavePosture());assert.equal(player.x,0);assert.equal(first,false);
const p=furniturePose('surface_bed',bodies.surface_bed);
assert.ok(Math.abs(p.x-(-.34))<.001);assert.ok(Math.abs(p.z-1.92)<.001);
assert.ok(enterPosture('surface_bed','lie'));assert.ok(player.pitch<0);
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
console.log('Game-only UI, session handling, DOM, contextual interactions and update menu checks passed');
