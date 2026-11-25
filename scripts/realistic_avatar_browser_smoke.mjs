// Run with Playwright installed, against a built development server.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const url=process.argv[2]||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),external=[],security=[];
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(url).origin)external.push(r.url());});
 page.on('console',m=>{if(/content.security.policy|refused to|unsafe.eval/i.test(m.text()))security.push(m.text());});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {CharacterStudio,DEFAULT_CHARACTER}=await import('/engine/renderer.bundle.js');
  const studio=new CharacterStudio();
  const wait=async()=>{for(let i=0;i<600;i++){const u=studio.root?.userData;if(u?.realisticStatus==='ready')return u;if(u?.realisticStatus==='fallback')throw Error(u.realisticError);await new Promise(r=>setTimeout(r,100));}throw Error('Avatar timeout');};
  studio.set(DEFAULT_CHARACTER);
  const a=await wait(),model=a.realistic.model,first=a.realistic.look.model.id;
  studio.set({...DEFAULT_CHARACTER,top:0,topColor:1});
  const b=await wait(),same=b.realistic.model===model;
  const outfit=b.realistic.outfit,visible=b.realistic.parts.filter(p=>p.label==='Top_tee'&&p.mesh.visible).length;
  studio.set({...DEFAULT_CHARACTER,model:2});
  const c=await wait(),second=c.realistic.look.model.id;
  studio.render({render(){}},1.8,.016);studio.clear();
  return {first,second,same,outfit,visible};
 });
 assert.equal(result.first,'ryan');assert.equal(result.second,'ethan');assert.equal(result.same,true);assert.equal(result.outfit,'tee');assert.ok(result.visible);
 assert.deepEqual(external,[]);assert.deepEqual(security,[]);
 console.log('Browser Rocketbox preview, outfit swap, identity swap and local-only loading:',result);
}finally{await browser.close();}
