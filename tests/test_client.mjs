// Smoke test of game state/input integration. Renderer + DOM are test doubles,
// not a real browser/WebGL test and not a validation of Poly Haven files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../web/game.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
async function smoke(mobile){
  const callbacks=[], nodes=new Map(), values=new Map();
  const events=new Map();let world={objects:{crate:60,table:100,chair:60,window:35,sofa:150,coffee_table:100},unlocked:false};let instance;
  function element(id){if(!nodes.has(id))nodes.set(id,{id,hidden:['phone','arsenal','updater','photo-pistol','photo-rifle'].includes(id),disabled:id==='start',value:'',textContent:'',style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){events.set(id+':'+type,fn);},getBoundingClientRect(){return {left:0,top:0,width:100,height:100};},setPointerCapture(){},requestPointerLock(){return Promise.resolve();}});return nodes.get(id);}
  class RoomRenderer{constructor(_canvas,q,l,status){this.q=q;this.l=l;this.models=[];this.photoPaths=mobile?{}:{pistol:'/assets/polyhaven/photos/pistol.png'};instance=this;status('ready');}async load(spec){assert.equal(Object.keys(spec).length,6);}setLoop(fn){callbacks.push(fn);}begin(){this.models=[];}drawBox(){}drawModel(id){this.models.push(id);return true;}render(){}equip(id){this.weapon=id;}shot(){this.shots=(this.shots||0)+1;}}
  class RoomPhysics{static async create(){return new RoomPhysics();}step(){}impulse(id){this.hit=id;}}
  const ctx=vm.createContext({console,RoomRenderer,RoomPhysics,document:{getElementById:element,body:element('body'),pointerLockElement:null,addEventListener(){},exitPointerLock(){}},window:{addEventListener(){}},matchMedia:()=>({matches:mobile}),innerWidth:mobile?390:1280,sessionStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},location:{reload(){}},fetch:async(_path,opts)=>{if(opts?.body){const a=JSON.parse(opts.body);if(a.action==='hit')world.objects[a.id]=Math.max(0,world.objects[a.id]-25);if(a.action==='repair')world.objects[a.id]=60;}return {ok:true,json:async()=>structuredClone(world)};},performance:{now:()=>0},requestAnimationFrame:fn=>callbacks.push(fn),setInterval(){},setTimeout(){},devicePixelRatio:1});
  vm.runInContext(code,ctx);await new Promise(r=>setImmediate(r));
  assert.equal(instance.q,mobile?'1k':'2k');assert.equal(element('start').disabled,false);
  if(!mobile){assert.equal(element('photo-pistol').src,'/assets/polyhaven/photos/pistol.png');element('photo-pistol').onload();assert.equal(element('photo-pistol').hidden,false);assert.equal(element('fallback-pistol').hidden,true);element('photo-pistol').onerror();assert.equal(element('photo-pistol').hidden,true);assert.equal(element('fallback-pistol').hidden,false);}
  else{assert.equal(element('photo-pistol').src,undefined);assert.equal(element('photo-pistol').hidden,true);assert.equal(element('fallback-pistol').hidden,false);}
  assert.equal(element('photo-rifle').src,undefined);
  callbacks.shift()(16);assert.ok(instance.models.includes('sofa'));assert.ok(instance.models.includes('table'));
  await element('start').onclick();assert.equal(element('welcome').hidden,true);
  // Put the virtual player in front of the crate. Then exercise the real action.
  vm.runInContext('player.x=-1.4;player.z=-.3;player.pitch=.55;player.yaw=0',ctx);
  vm.runInContext("chooseWeapon('pistol');fire()",ctx);await new Promise(r=>setImmediate(r));assert.equal(world.objects.crate,35);assert.equal(instance.shots,1);
  events.get('touchArsenal:pointerdown')({preventDefault(){}});assert.equal(element('arsenal').hidden,false);element('equip-rifle').onclick();assert.equal(element('arsenal').hidden,true);assert.equal(vm.runInContext('equipped',ctx),'rifle');
  vm.runInContext("chooseWeapon('none');fire()",ctx);assert.equal(instance.shots,1);
  vm.runInContext("chooseWeapon('pistol')",ctx);
  events.get('touchPhone:pointerdown')({preventDefault(){}});assert.equal(element('phone').hidden,false);
  element('closephone').onclick();assert.equal(element('phone').hidden,true);
  console.log(`${mobile?'Mobile 1K':'Desktop 2K'}: profile, game start, model draw, hit and phone OK (mock renderer)`);
}
await smoke(false);await smoke(true);
