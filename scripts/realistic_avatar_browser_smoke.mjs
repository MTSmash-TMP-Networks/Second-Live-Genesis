// Run against a development Docker instance with Playwright installed:
 // node scripts/realistic_avatar_browser_smoke.mjs http://127.0.0.1:8765
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {avatarRecipe} from '../web/engine/avatar_recipe.js';
const options=JSON.parse(fs.readFileSync(new URL('../web/engine/character_options.json',import.meta.url),'utf8'));
const recipe=avatarRecipe(Object.fromEntries(Object.entries(options).map(([k,v])=>[k,v.default])),options);
const url=process.argv[2]||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),external=[],security=[];
 page.on('request',r=>{const target=new URL(r.url());if(target.protocol.startsWith('http')&&target.origin!==new URL(url).origin)external.push(r.url());});
 page.on('console',m=>{if(/content.security.policy|refused to|unsafe.eval/i.test(m.text()))security.push(m.text());});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async recipe=>{
  const provider=await import('/engine/realistic-avatar.bundle.js');
  const starter=await provider.generateAvatar(recipe);
  if(new DataView(starter.bytes).getUint32(0,true)!==0x46546c67)throw Error('Invalid prebuilt starter model');
  const {bytes,clips}=await provider.generateAvatar(recipe,{forceGenerate:true});
  const v=new DataView(bytes),length=v.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
  return {magic:v.getUint32(0,true),skins:json.skins?.length||0,meshes:json.meshes?.length||0,clips:json.animations?.map(a=>a.name)||[],expected:clips,bytes:bytes.byteLength};
 },recipe);
 assert.equal(result.magic,0x46546c67);assert.ok(result.skins>0&&result.meshes>0&&result.clips.length>=4);
 assert.deepEqual(external,[]);assert.deepEqual(security,[]);
 console.log('Browser generated a real rigged local GLB:',result);
}finally{await browser.close();}
