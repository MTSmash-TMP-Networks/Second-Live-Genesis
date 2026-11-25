// Export genuine rigged starter models from the exact npm data shipped to browsers.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {ANIMATIONS} from 'ara3d';
import options from './character_options.json';
import {avatarRecipe,resolveAvatarRecipe,standardProfiles} from './avatar_recipe.js';

const cwd=process.cwd(),cli=path.join(cwd,'node_modules/.bin/ara3d');
const env={...process.env,ARA3D_DATA:path.join(cwd,'node_modules/ara3d-data/assets')};
const schema=JSON.parse(execFileSync(cli,['schema','character'],{env,encoding:'utf8',maxBuffer:32*1024*1024}));
const rules=schema.properties.params.properties;
fs.writeFileSync('avatar-schema.json',JSON.stringify(schema));
const profiles=standardProfiles(options);
let variants=0;
for(const [key,opt] of Object.entries(options))for(let i=0;i<opt.values.length;i++){
 const input=resolveAvatarRecipe(avatarRecipe({...profiles.standard,[key]:i},options),schema);
 for(const [k,v] of Object.entries(input.params)){
  const rule=rules[k];assert.ok(rule,'Unknown parameter '+k);
  if(rule.enum)assert.ok(rule.enum.includes(v),'Invalid '+k+': '+v);
  if(rule.type==='number'||rule.type==='integer'){
   if(rule.minimum!==undefined)assert.ok(v>=rule.minimum,k);
   if(rule.maximum!==undefined)assert.ok(v<=rule.maximum,k);
  }
 }
 for(const [id,style] of Object.entries(input.params.garmentStyles)){
  assert.ok(rules.garmentStyles.propertyNames.enum.includes(id));
  assert.match(style.color,/^#[0-9a-f]{6}$/i);
  assert.ok(!('pattern' in style),'No forced incompatible fabric pattern');
 }
 variants++;
}
console.log('Pinned schema validated:',variants,'profile variants');
const ids=['idle','walk','run','crouch'];
const clips=Object.fromEntries(ids.map(id=>[id,ANIMATIONS.find(c=>c.id===id)?.name]));
assert.ok(ids.every(id=>clips[id]));
const key=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_$/,'').replace(/_loop$/,'');
fs.mkdirSync('avatar-models',{recursive:true});
for(const [name,profile] of Object.entries(profiles)){
 const recipe=resolveAvatarRecipe(avatarRecipe(profile,options),schema),out=path.join(cwd,'avatar-export-'+name);
 const input=path.join(cwd,'avatar-'+name+'.json');
 fs.writeFileSync(input,JSON.stringify(recipe));
 fs.mkdirSync(out,{recursive:true});
 execFileSync(cli,['export','--params',input,'--formats','glb','--detail','low','--animations',ids.join(','),'--weapon','none','--carry','none','--vehicle','none','--out',out],{env,stdio:'inherit'});
 const models=fs.readdirSync(out).filter(f=>f.endsWith('.glb'));assert.equal(models.length,1,'Expected one GLB: '+name);
 const bytes=fs.readFileSync(path.join(out,models[0]));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
 assert.ok(json.skins?.length&&json.meshes?.length&&json.images?.length&&json.materials?.length,'Missing rig or textures');
 for(const id of ids)assert.ok(json.animations?.some(a=>key(a.name)===key(clips[id])||key(a.name)===id),'Missing baked animation '+id);
 for(const item of [...(json.buffers||[]),...(json.images||[])])assert.ok(!item.uri||item.uri.startsWith('data:'),'Nonembedded GLB asset');
 fs.copyFileSync(path.join(out,models[0]),path.join(cwd,'avatar-models',name+'.glb'));
 console.log('Verified rigged and textured starter GLB:',name,bytes.length,'bytes');
}
