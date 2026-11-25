import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const base=existsSync(new URL('./capture.js',import.meta.url))?new URL('./',import.meta.url):new URL('../web/',import.meta.url);
const {defaultStage,allowedStage,taskHint}=await import(new URL('capture-flow.js',base));
const states=[
 [null,1],[{status:'unexplored'},1],[{status:'needs_location'},1],[{status:'capturing',mine:false},1],
 [{status:'capturing',mine:true},2],...['queued','processing','review','failed','published'].map(status=>[{status,mine:true},4]),
 [{status:'published',mine:false,preview:true},4],[{status:'queued',mine:false},1]
];
for(const [state,step] of states){assert.equal(defaultStage(state),step);assert.equal(allowedStage(1,state),true);assert.equal(allowedStage(2,state),step===2);assert.equal(allowedStage(3,state),step===2);assert.equal(allowedStage(4,state),step===4);}
for(const n of [0,1,7,8,16,24,39,40,60])assert.ok(taskHint(n).length>10);
const js=readFileSync(new URL('capture.js',base),'utf8'),html=readFileSync(new URL('scanner.html',base),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'unique HTML IDs');
for(const match of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(match[1]),'missing element: '+match[1]);
for(const step of [1,2,3,4]){assert.ok(html.includes('data-stage="'+step+'"'));assert.ok(html.includes('data-step="'+step+'"'));}
assert.ok(!/<script[^>]*>\s*[^<\s]/.test(html),'no inline scripts under CSP');
console.log('Capture UI: step access, recovery states, hints, DOM bindings and CSP markup passed');
