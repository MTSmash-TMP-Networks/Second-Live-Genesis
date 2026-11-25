import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const game=readFileSync(new URL('./game.js',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length);
for(const [,id] of game.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),'Missing DOM element '+id);
for(const obsolete of ['phone-app-capture','start-gps','/scanner.html','/panorama.html','/api/capture/locate','locationFix'])assert.ok(!(html+game).includes(obsolete),obsolete);
assert.ok(game.includes('health.personal_world===true'));
assert.ok(game.includes("api('/api/session',{})"));
assert.ok(ids.includes('phone-app-world')&&ids.includes('phone-page-world')&&ids.includes('update-open-phone'));
assert.ok(html.includes('Eigene Welten')&&html.includes('Weltimport'));
// Run the actual pure interaction-selection functions with a minimal room state.
// Function construction is test-only, never delivered to the browser.
const start=game.indexOf('const CURTAIN_TARGETS='),end=game.indexOf('function updateInteractionHint(',start);
assert.ok(start>=0&&end>start);
const testState={curtains_closed:false,lights_on:true,decor:{},objects:{table:100,window:35},walls:{},marks:[]};
const options=new Function('state','spec','WALLS','REMOVED','movable','movableDecor',game.slice(start,end)+';return {primaryInteraction,damaged,objectName};')(
 testState,{table:{max:100},window:{max:35}},{surface_0:{},surface_8:{}},4,id=>id==='table'&&testState.objects.table>0,()=>false);
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
console.log('Game-only UI, session handling, DOM and contextual interaction checks passed');
