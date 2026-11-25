// Original stylized human character meshes with articulated limbs, modular hair,
// facial features and clothing. Same model factory for editor and multiplayer.
import * as THREE from 'three';
import options from './character_options.json';
import {prepareRealistic,animateRealistic,disposeRealistic} from './realistic_character.js';
export const CHARACTER_OPTIONS=options;
export const DEFAULT_CHARACTER=Object.freeze(Object.fromEntries(Object.entries(options).map(([k,v])=>[k,v.default])));
export function normalizeCharacter(value){
 return Object.fromEntries(Object.entries(options).map(([k,v])=>[k,Number.isInteger(value?.[k])&&value[k]>=0&&value[k]<v.values.length?value[k]:v.default]));
}
const color=(a,k)=>parseInt(options[k].colors[a[k]],16);
const material=(c,r=.84)=>new THREE.MeshStandardMaterial({color:c,roughness:r});
const sharedSphere=new THREE.SphereGeometry(1,24,16);
function ellipsoid(parent,p,s,m,rot=null){
 const mesh=new THREE.Mesh(sharedSphere,m);mesh.position.set(...p);mesh.scale.set(...s);if(rot)mesh.rotation.set(...rot);parent.add(mesh);return mesh;
}
// A ring profile is [height, half-width, half-depth, center-z]. Closed ends,
// smoothly varying cross-sections; an optional sculpt function shapes the face.
export function sculptedMesh(rings,segments=36,sculpt=null){
 const positions=[],uv=[],indices=[];
 for(let j=0;j<rings.length;j++){
  const [y,w,d,z=0]=rings[j];
  for(let i=0;i<=segments;i++){
   const t=2*Math.PI*i/segments,x=Math.sin(t)*w,zz=z+Math.cos(t)*d;
   positions.push(...(sculpt?sculpt(x,y,zz,t):[x,y,zz]));uv.push(i/segments,j/(rings.length-1));
  }
  if(j){for(let i=0;i<segments;i++){const a=(j-1)*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function loft(parent,rings,m,segments=36,sculpt=null){
 const geo=sculptedMesh(rings,segments,sculpt),o=new THREE.Mesh(geo,m);o.userData.ownedGeometry=true;parent.add(o);return o;
}
function line(parent,points,r,m){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 const o=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*4),r,6,false),m);o.userData.ownedGeometry=true;parent.add(o);return o;
}
function part(parent,p){const g=new THREE.Group();g.position.set(...p);parent.add(g);return g;}
function hairModel(head,a,m){
 if(a.hair===5)return;
 const styles=[.085,.10,.115,.118,.10],length=styles[a.hair];
 // Scalp cap follows the skull with a nonuniform frontal hairline and temples.
 const pos=[],idx=[],steps=48,rows=18;
 for(let j=0;j<=rows;j++)for(let i=0;i<=steps;i++){
  const t=i/steps*Math.PI*2,front=Math.max(0,-Math.cos(t)),back=Math.max(0,Math.cos(t)),side=Math.abs(Math.sin(t));
  let end=1.82-.62*front+.12*back;
  if(a.hair===2)end+=.42*(1-front);
  const angle=.015+(end-.015)*j/rows,noise=1+.035*Math.sin(t*11+angle*5)+.022*Math.cos(t*19-angle*6);
  const x=.137*Math.sin(angle)*Math.sin(t)*noise;
  const y=.077+(.146+length*.12)*Math.cos(angle);
  const z=.014+(.135+length*.12)*Math.sin(angle)*Math.cos(t)*noise;
  pos.push(x,y,z);
  if(j&&i){const k=j*(steps+1)+i;idx.push(k,k-steps-1,k-1,k-1,k-steps-1,k-steps-2);}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
 const cap=new THREE.Mesh(geo,m);cap.userData.ownedGeometry=true;head.add(cap);
 if(a.hair===1){for(let i=0;i<6;i++){const x=-.085+i*.028;line(head,[[x,.19,-.07],[x+.026,.21,-.025],[x+.055,.18,.072]],.022,m);}}
 if(a.hair===2){for(const side of [-1,1])loft(head,[[-.15,.017,.045,.035],[-.10,.040,.085,.025],[.02,.055,.09,.025],[.12,.04,.07,.025],[.17,.002,.002]],m,24,(x,y,z)=>[x+side*.092,y,z]);}
 if(a.hair===3){for(let i=0;i<26;i++){const t=i*2.39996,y=.07+.132*(i/26),r=Math.sqrt(Math.max(.002,.14*.14-(y-.07)**2));ellipsoid(head,[Math.sin(t)*r,y,Math.cos(t)*r+.009],[.039,.042,.037],m);}}
 if(a.hair===4){ellipsoid(head,[0,.105,.151],[.058,.07,.055],m);loft(head,[[-.29,.018,.016,.15],[-.22,.034,.03,.178],[-.12,.046,.041,.181],[0,.042,.038,.162],[.12,.01,.01,.145]],m,24);}
}
function faceModel(parent,a,skin,hair){
 const h=part(parent,[0,1.64,0]),face=a.face,fw=face===2?1.07:face===1?1.025:1;
 const headRings=[[-.148,.008,.014,-.025],[-.126,.056,.052,-.015],[-.095,.083,.080,-.001],[-.055,.101,.095,.002],[-.012,.119,.104,.005],[.035,.124,.111,.009],[.081,.120,.118,.015],[.128,.107,.106,.019],[.171,.071,.074,.022],[.193,.002,.003,.02]];
 loft(h,headRings,skin,48,(x,y,z,t)=>{
   const front=Math.max(0,-Math.cos(t)),center=Math.exp(-((x/.027)**2)),nose=.031*Math.exp(-(((y-.006)/.045)**2))*center;
   const cheek=.012*Math.exp(-(((Math.abs(x)-.072)/.035)**2)-(((y+.028)/.046)**2));
   const sockets=.010*Math.exp(-(((Math.abs(x)-.053)/.029)**2)-(((y-.036)/.022)**2));
   return [x*fw,y,z-front*(nose+cheek-sockets)];
 });
 const white=material(0xf6f0e7,.53),iris=material(color(a,'eyes'),.37),pupil=material(0x181d21,.32),lip=material(0xa76e60,.82),dark=material(0x604037,.92);
 for(const side of [-1,1]){
  const x=side*.053*fw;
  ellipsoid(h,[side*.121*fw,-.009,.012],[.027,.046,.025],skin,[0,0,side*.10]);
  ellipsoid(h,[x,.034,-.098],[.037,.018,.018],white);
  ellipsoid(h,[x,.034,-.114],[.016,.016,.007],iris);
  ellipsoid(h,[x,.034,-.120],[.008,.011,.004],pupil);
  ellipsoid(h,[x-.004,.040,-.124],[.004,.004,.002],white);
  line(h,[[x-.037,.035,-.098],[x-.020,.050,-.110],[x+.015,.050,-.110],[x+.037,.035,-.099]],.0048,skin);
  line(h,[[x-.036,.066,-.106],[x-.012,.074,-.111],[x+.019,.072,-.108],[x+.037,.060,-.100]],.0056,hair);
 }
 ellipsoid(h,[0,-.012,-.121],[.023,.034,.025],skin);
 for(const x of [-.018,.018])ellipsoid(h,[x,-.031,-.125],[.012,.006,.012],skin);
 ellipsoid(h,[0,-.075,-.091],[.036,.010,.011],lip);
 line(h,[[-.035,-.074,-.092],[-.014,-.077,-.103],[.014,-.077,-.103],[.035,-.074,-.092]],.002,dark);
 if(a.beard){const beard=material(color(a,'hairColor'),.95);beard.color.lerp(skin.color,a.beard===1?.68:.20);
  loft(h,[[-.146,.013,.015,-.024],[-.128,.058,.055,-.014],[-.098,.087,.084,-.003],[-.069,.097,.099,.005]],beard,32,(x,y,z,t)=>[x,y,z-.002*Math.max(0,-Math.cos(t))]);
 }
 if(a.glasses){const frame=material(0x272a2c,.55),w=a.glasses===1?.043:.047,hh=a.glasses===1?.033:.025;
  for(const side of [-1,1]){
   const pts=[];for(let i=0;i<=32;i++){const t=i/32*Math.PI*2,k=a.glasses===1?1:.48;pts.push([side*.053+Math.sign(Math.cos(t))*Math.pow(Math.abs(Math.cos(t)),k)*w,.037+Math.sign(Math.sin(t))*Math.pow(Math.abs(Math.sin(t)),k)*hh,-.137]);}
   line(h,pts,.0036,frame);line(h,[[side*.10,.045,-.134],[side*.127,.046,-.055],[side*.125,.02,.016]],.0035,frame);
  }
  line(h,[[-.015,.04,-.137],[0,.048,-.14],[.015,.04,-.137]],.0035,frame);
 }
 hairModel(h,a,hair);return h;
}
export function createCharacter(value,{legacyOnly=false,studio=false}={}){
 const a=normalizeCharacter(value),root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const bw=[.88,1,1.16,.99][a.body],hip=[.88,1,1.14,1.12][a.body],height=[.925,1,1.075][a.height];
 const skin=material(color(a,'skin'),.84),hair=material(color(a,'hairColor'),.89);hair.side=THREE.DoubleSide;
 const top=material(color(a,'topColor'),.94),pants=material(color(a,'trousersColor'),.95),shoe=material(a.shoes===0?0xe2e1dc:a.shoes===1?0x323b45:0x4c382d,.64),sole=material(a.shoes===2?0x282322:0xb3b4b0,.9);
 const seam=top.clone();seam.color.multiplyScalar(.77);const pantsSeam=pants.clone();pantsSeam.color.multiplyScalar(.72);
 const longSleeve=a.top!==0;
 // Shirt collar, chest, waist and pelvis are sculpted profiles rather than blocks.
 loft(body,[[.88,.01,.012],[.91,.16*hip,.105],[1.00,.177*hip,.115],[1.08,.163*bw,.104],[1.18,.162*bw,.113],[1.30,.202*bw,.13],[1.40,.216*bw,.114],[1.47,.178*bw,.092],[1.52,.088,.075],[1.535,.067,.061],[1.54,.003,.003]],top,40);
 loft(body,[[.85,.12*hip,.084],[.91,.175*hip,.113],[.99,.177*hip,.112],[1.04,.165*hip,.104],[1.045,.005,.004]],pants,36);
 loft(body,[[1.50,.07,.063],[1.55,.069,.063],[1.60,.061,.058],[1.65,.061,.056]],skin,24);
 line(body,[[-.065,1.514,-.043],[-.032,1.488,-.066],[0,1.481,-.071],[.032,1.488,-.066],[.065,1.514,-.043]],.009,seam);
 if(a.top>=2){
  line(body,[[0,1.47,-.095],[0,1.34,-.132],[0,1.19,-.115],[0,1.02,-.12]],.008,seam);
  for(let y=1.08;y<1.44;y+=.085)ellipsoid(body,[0,y,-.133],[.009,.009,.005],material(0xe2d9c8,.7));
  for(const side of [-1,1])line(body,[[side*.068,1.52,-.045],[side*.102,1.43,-.108],[side*.028,1.37,-.128]],.012,seam);
 }
 if(a.top===1){line(body,[[-.155*bw,1.055,-.07],[0,1.045,-.117],[.155*bw,1.055,-.07]],.01,seam);}
 const head=faceModel(body,a,skin,hair);
 const arms=[],elbows=[],legs=[],knees=[];
 for(const side of [-1,1]){
  const arm=part(body,[side*.204*bw,1.425,0]);arms.push(arm);arm.rotation.z=side*.10;
  loft(arm,[[-.31,.045*bw,.045],[-.23,.055*bw,.054],[-.115,.068*bw,.065],[-.015,.078*bw,.076],[.04,.051,.05],[.065,.002,.002]],longSleeve?top:skin,28);
  if(!longSleeve)loft(arm,[[-.155,.07*bw,.068],[-.10,.078*bw,.075],[.025,.087*bw,.081],[.061,.008,.008]],top,28);
  const elbow=part(arm,[0,-.29,0]);elbows.push(elbow);
  loft(elbow,[[-.29,.031,.03],[-.21,.037,.035],[-.11,.049*bw,.047],[-.025,.045*bw,.044],[.02,.043,.042]],longSleeve?top:skin,24);
  ellipsoid(elbow,[0,-.34,0],[.043,.075,.028],skin);
  ellipsoid(elbow,[-side*.036,-.322,-.015],[.022,.043,.022],skin,[0,0,side*.3]);
  if(longSleeve)loft(elbow,[[-.29,.034,.032],[-.255,.038,.036],[-.25,.038,.036]],seam,20);
  const leg=part(body,[side*.091*hip,.925,0]);legs.push(leg);
  loft(leg,[[-.455,.061*hip,.063],[-.35,.075*hip,.072],[-.22,.088*hip,.086],[-.065,.097*hip,.098],[.035,.084*hip,.087]],pants,28);
  const knee=part(leg,[0,-.425,0]);knees.push(knee);
  const ankle=a.trousers===1?.052:a.trousers===2?.049:.059;
  loft(knee,[[-.39,ankle,.055],[-.30,.060,.065],[-.16,.074*hip,.075],[-.035,.065*hip,.067],[.03,.060*hip,.061]],pants,28);
  line(knee,[[side*.052,-.39,0],[side*.07,-.18,0],[side*.06,0,0]],.0022,pantsSeam);
  const shoeRoot=part(knee,[0,-.414,-.026]);
  ellipsoid(shoeRoot,[0,.002,-.038],[.077,.065,.144],shoe);
  ellipsoid(shoeRoot,[0,-.056,-.035],[.080,.022,.147],sole);
  for(let j=0;j<3;j++)line(shoeRoot,[[-.031,.047,-.033-j*.019],[.031,.047,-.033-j*.019]],.003,sole);
 }
 body.scale.set(1,height,1);root.userData={character:a,body,head,arms,elbows,legs,knees,phase:0,height};
 // Never show the procedural fallback as the real studio preview in the browser.
 if(studio&&typeof window!=='undefined')body.visible=false;
 if(!legacyOnly)prepareRealistic(root,a,options);
 return root;
}
// Original concierge character inspired by classic red hotel uniforms.
export function createHotelNpc(){
 const g=createCharacter({...DEFAULT_CHARACTER,body:1,height:1,face:1,skin:1,hair:1,hairColor:2,eyes:0,top:3,topColor:4,trousers:1,trousersColor:3,shoes:2,beard:0,glasses:0},{legacyOnly:true});
 const {head,body,arms}=g.userData,red=material(0x9d2636,.8),gold=material(0xbda56d,.36),black=material(0x26272c,.68);
 // Pillbox concierge hat: shaped crown, dark band, gold piping and insignia.
 loft(head,[[.136,.142,.135,.012],[.158,.148,.14,.012],[.223,.141,.137,.012],[.244,.124,.124,.012],[.249,.003,.003,.012]],red,48);
 loft(head,[[.142,.149,.141,.012],[.168,.150,.142,.012]],black,48);
 loft(head,[[.166,.151,.143,.012],[.176,.151,.143,.012]],gold,48);
 ellipsoid(head,[0,.191,-.13],[.025,.027,.009],gold);
 for(const [i,arm] of arms.entries()){
  const side=i?1:-1;
  ellipsoid(arm,[side*.012,.041,0],[.093,.018,.067],black);
  ellipsoid(arm,[side*.012,.056,0],[.065,.008,.041],gold);
 }
 for(const side of [-1,1]){
  for(let j=0;j<4;j++)ellipsoid(body,[side*.065,1.385-j*.085,-.137],[.012,.012,.008],gold);
  line(body,[[side*.065,1.515,-.049],[side*.09,1.435,-.109],[side*.035,1.38,-.133]],.008,gold);
 }
 ellipsoid(body,[-.135,1.39,-.129],[.036,.013,.006],gold);
 return g;
}
export function animateCharacter(root,dt,moving=false,stance='walk'){
 if(animateRealistic(root,dt,moving,stance))return;
 const u=root.userData,crouch=stance==='crouch',sprint=stance==='sprint'&&moving;
 u.phase+=dt*(moving?(sprint?15:crouch?6.2:9.5):2.0);
 const a=moving?Math.sin(u.phase)*(sprint?.82:crouch?.21:.48):Math.sin(u.phase)*.018,t=Math.min(1,dt*12);
 u.crouchBlend=(u.crouchBlend||0)+((crouch?1:0)-(u.crouchBlend||0))*t;
 const c=u.crouchBlend;
 for(let i=0;i<2;i++){
  const sign=i?1:-1,leg=-a*sign,armTarget=a*sign*(1-.65*c)-.3*c;
  u.arms[i].rotation.x+=(armTarget-u.arms[i].rotation.x)*t;
  u.elbows[i].rotation.x+=((sprint?-.85:-.12)-Math.max(0,a*sign)*.3-.45*c-u.elbows[i].rotation.x)*t;
  u.legs[i].rotation.x+=(leg+1.05*c-u.legs[i].rotation.x)*t;
  u.knees[i].rotation.x+=(Math.max(0,-leg)*.65*(1-c)-1.85*c-u.knees[i].rotation.x)*t;
 }
 u.body.position.y=-.35*c*u.height+(moving?Math.abs(Math.sin(u.phase))*(sprint?.04:.018):Math.sin(u.phase)*.003)*(1-.65*c);
 u.head.rotation.y=Math.sin(u.phase*.23)*.035;
 if(u.nameTag)u.nameTag.position.y=(2.03-.35*c)*u.height;
}
export function disposeCharacter(root){
 disposeRealistic(root);
 root.removeFromParent();const materials=new Set(),geometry=new Set(),textures=new Set();
 root.traverse(o=>{if(o.userData.ownedGeometry&&o.geometry)geometry.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.map)textures.add(m.map);}}});
 for(const t of textures)t.dispose();for(const g of geometry)g.dispose();for(const m of materials)m.dispose();
}
export class CharacterStudio{
 constructor(){
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x263845);
  this.camera=new THREE.OrthographicCamera(-1.5,1.5,1.35,-1.35,.1,20);
  this.scene.add(new THREE.HemisphereLight(0xf5f2eb,0x838895,2.2));
  for(const [x,y,z,c,p] of [[-3,4,-4,0xffe5c8,3.1],[3,2,1,0xb8d9ff,2.4]]){const light=new THREE.DirectionalLight(c,p);light.position.set(x,y,z);this.scene.add(light);}
  const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.72,.79,.1,64),material(0x657e84,.68));plinth.position.y=-.06;this.scene.add(plinth);
  this.root=null;this.previous=null;this.angle=.25;
 }
 set(value){
  if(this.root){
   if(this.root.userData.realisticStatus==='ready'){
    if(this.previous)disposeCharacter(this.previous);this.previous=this.root;
   }else disposeCharacter(this.root);
  }
  this.root=createCharacter(value,{studio:true});this.scene.add(this.root);
 }
 clear(){if(this.root)disposeCharacter(this.root);if(this.previous)disposeCharacter(this.previous);this.root=null;this.previous=null;}
 turn(angle){this.angle+=angle;}
 render(renderer,aspect,dt){
  if(!this.root)this.set(DEFAULT_CHARACTER);
  if(this.root.userData.realisticStatus==='ready'&&this.previous){disposeCharacter(this.previous);this.previous=null;}
  this.root.rotation.y=this.angle;animateCharacter(this.root,dt,false);
  if(this.previous){this.previous.rotation.y=this.angle;animateCharacter(this.previous,dt,false);}
  const mobile=aspect<1.15,hh=mobile?2.65:1.27,hw=hh*aspect;
  this.camera.left=-hw;this.camera.right=hw;this.camera.top=hh;this.camera.bottom=-hh;
  const x=mobile?0:-hw*.45,y=mobile?-.48:.98;
  this.camera.position.set(x,y+.1,-4);this.camera.lookAt(x,y,0);this.camera.updateProjectionMatrix();renderer.render(this.scene,this.camera);
 }
}
