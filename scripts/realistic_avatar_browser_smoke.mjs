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
  const {CharacterStudio,DEFAULT_CHARACTER,createHotelNpc,animateCharacter,disposeCharacter,applyRoomAvatarPose,resetRoomAvatarPose}=await import('/engine/renderer.bundle.js');
  const studio=new CharacterStudio();
  const wait=async()=>{for(let i=0;i<600;i++){const u=studio.root?.userData;if(u?.realisticStatus==='ready')return u;if(u?.realisticStatus==='fallback')throw Error(u.realisticError);await new Promise(r=>setTimeout(r,100));}throw Error('Avatar timeout');};
  studio.set(DEFAULT_CHARACTER);
  const a=await wait(),model=a.realistic.model,first=a.realistic.look.model.id;
  studio.set({...DEFAULT_CHARACTER,top:0,topColor:1});
  const b=await wait(),same=b.realistic.model===model;
  const outfit=b.realistic.outfit,visible=b.realistic.parts.filter(p=>p.label==='Top_tee'&&p.mesh.visible).length;
  const avatar=studio.root,rig=b.realistic;
  applyRoomAvatarPose(avatar,{kind:'sit'});const seated=Math.abs(rig.pivot.position.y)>.05;
  resetRoomAvatarPose(avatar);applyRoomAvatarPose(avatar,{kind:'lie'});const lying=Math.abs(rig.pivot.quaternion.x)>0.5||Math.abs(rig.pivot.quaternion.z)>0.5;
  resetRoomAvatarPose(avatar);const reset=rig.pivot.position.length()<1e-6;
  if(!seated||!lying||!reset)throw Error('Actual Rocketbox room pose failed');
  studio.set({...DEFAULT_CHARACTER,model:2});
  const c=await wait(),second=c.realistic.look.model.id;
  studio.render({render(){}},1.8,.016);studio.clear();
  const npc=createHotelNpc();
  try{
   for(let i=0;i<600&&npc.userData.realisticStatus==='loading';i++)await new Promise(r=>setTimeout(r,100));
   const u=npc.userData,r=u.realistic;if(!r)throw Error(u.realisticError||'Hotel staff not loaded');
   if(!r.actions.greeting)throw Error('Hotel staff upper-body Wave clip missing');
   u.hotelGreeting=1.4;animateCharacter(npc,.05,true,'walk');
   const greeting=r.greetingActive&&r.actions.greeting.isRunning(),walking=r.current===r.actions.walk;
   const staff=r.look.model.id,formal=r.outfit==='original'||r.outfit==='formal';
   u.hotelGreeting=0;animateCharacter(npc,.05,true,'walk');
   return {first,second,same,outfit,visible,staff,formal,greeting,walking,ended:!r.greetingActive};
  }finally{disposeCharacter(npc);}
 });
 assert.equal(result.first,'ryan');assert.equal(result.second,'ethan');assert.equal(result.same,true);assert.equal(result.outfit,'tee');assert.ok(result.visible);
 assert.equal(result.staff,'daniel');assert.ok(result.formal&&result.greeting&&result.walking&&result.ended);
 assert.deepEqual(external,[]);assert.deepEqual(security,[]);
 console.log('Browser Rocketbox preview, outfit swap, identity swap and local-only loading:',result);
}finally{await browser.close();}
