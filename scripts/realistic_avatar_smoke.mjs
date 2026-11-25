import assert from 'node:assert/strict';
import options from './character_options.json';
import {avatarRecipe} from './avatar_recipe.js';
const defaults=Object.fromEntries(Object.entries(options).map(([k,v])=>[k,v.default]));
const base=avatarRecipe(defaults,options);
assert.equal(base.params.jacket,'racing_jacket_long');
assert.equal(base.colors.top,'#85878d');assert.equal(base.colors.jacket,'#272a2e');
assert.equal(base.colors.bottom,'#24262a');assert.equal(base.colors.shoes,'#eeeeea');
for(const [key,opt] of Object.entries(options)){
 const results=new Set();
 for(let i=0;i<opt.values.length;i++){
  const r=avatarRecipe({...defaults,[key]:i},options);
  const s=JSON.stringify(r);assert.ok(!s.includes('undefined')&&!s.includes('null'));
  assert.notEqual(r.params.top,'none');assert.notEqual(r.params.bottom,'none');
  assert.notEqual(r.params.shoes,'none');assert.equal(r.params.underwear,true);assert.equal(r.params.rig,'game');
  results.add(s);
 }
 assert.equal(results.size,opt.values.length,'Unmapped option: '+key);
}
console.log('Realistic avatar: all stored profile categories mapped and standard outfit validated');
