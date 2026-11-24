export { RoomPhysics } from './physics.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildArchitecture } from './architecture.js';
import { XRMode } from './xr.js';
import { ShotEffects } from './shotfx.js';
import { buildRoomDecor } from './room_decor.js';
export { DECOR } from './room_decor.js';

const BASE='/assets/polyhaven/';
const MATERIAL_SIZE={wooden_floor_01:2.1,white_plaster_02:2.5,oak_veneer_01:.95,rough_linen:.42};
const MODEL_IDS={sofa:'sofa_02',table:'wooden_table_02',chair:'modern_arm_chair_01',coffee_table:'modern_coffee_table_01'};

export class RoomRenderer {
  constructor(canvas, quality, lighting, status){
    this.quality=quality; this.lighting=lighting; this.status=status;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:quality==='2k',powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.06;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();
    this.effects=new ShotEffects(this.scene);
    this.scene.background=new THREE.Color(0xc8d6df);
    this.scene.fog=new THREE.Fog(0xc8d6df,70,300);
    this.camera=new THREE.PerspectiveCamera(65,1,.05,350);
    this.rig=new THREE.Group();this.scene.add(this.rig);this.rig.add(this.camera);
    this.xrMode=new XRMode(this);

    this.weaponRoot=new THREE.Group();
    this.camera.add(this.weaponRoot);
    this.weaponRoot.position.set(.24,-.25,-.44);
    this.weaponRoot.rotation.set(.02,.16,0);
    this.weaponModels={pistol:this.buildPistol(),rifle:this.buildRifle()};
    for(const model of Object.values(this.weaponModels)){ model.visible=false; this.weaponRoot.add(model); }
    this.weaponRoot.visible=false;
    this.viewHands={pistol:this.buildGloves('pistol'),rifle:this.buildGloves('rifle')};
    for(const hands of Object.values(this.viewHands)){hands.visible=false;this.weaponRoot.add(hands);}
    this.currentWeapon=null;
    this.photoPaths={};this.propPaths={};this.realismStatus={};
    this.kick=0;this.reloadProgress=0;
    this.swayTime=0;


    const shCanvas=document.createElement('canvas');
    shCanvas.width=shCanvas.height=128;
    const ctx=shCanvas.getContext('2d');
    const grad=ctx.createRadialGradient(64,64,8,64,64,64);
    grad.addColorStop(0,'rgba(0,0,0,.60)');
    grad.addColorStop(.55,'rgba(0,0,0,.23)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
    this.shadowTexture=new THREE.CanvasTexture(shCanvas);
    this.contactShadows={};

    this.materials=new Map();
    this.geometries=new Map();
    this.textured={};
    this.models={};
    this.pool=[];
    this.staticGroup=new THREE.Group();
    this.dynamicGroup=new THREE.Group();
    this.scene.add(this.staticGroup,this.dynamicGroup);

    const hemi=new THREE.HemisphereLight(0xf3f2ef,0xa69e8f,.58);
    this.scene.add(hemi);

    const sun=new THREE.DirectionalLight(0xfff5e7,1.75);
    sun.position.set(-8,3.1,-1.4);
    sun.target.position.set(1,.55,-.4);
    sun.castShadow=true;
    const shadowSize=quality==='1k'?1024:2048;
    sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:22});
    sun.shadow.normalBias=.012;
    sun.shadow.radius=3;
    sun.shadow.bias=-.00015;
    this.scene.add(sun,sun.target);

    RectAreaLightUniformsLib.init();
    const windowFill=new THREE.RectAreaLight(0xeaf0f5,2.6,2.2,1.5);
    windowFill.position.set(-4.15,1.78,-1);
    windowFill.lookAt(.2,1.5,-1);
    this.scene.add(windowFill);

    const ceilingBounce=new THREE.PointLight(0xffefd9,2.0,10,2);
    ceilingBounce.position.set(0,2.75,.2);
    this.scene.add(ceilingBounce);

    this.cursor=0;this.width=0;this.height=0;this.dpr=0;
    this.onLost=e=>{e.preventDefault();this.status('Grafikkontext verloren. Bitte Seite neu laden.');};
    canvas.addEventListener('webglcontextlost',this.onLost);
  }

  makeBox(size,pos,mat,parent,rotation=[0,0,0]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
    mesh.position.set(...pos);mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.receiveShadow=true;
    parent.add(mesh);return mesh;
  }

  makeCylinder(rt,rb,h,segments,pos,mat,parent,rotation=[0,0,0]){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),mat);
    mesh.position.set(...pos);mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.receiveShadow=true;
    parent.add(mesh);return mesh;
  }

  cosmeticBox(size,pos,mat,parent,rotation=[0,0,0]){
    const radius=Math.min(...size)*.16;const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,radius),mat);mesh.position.set(...pos);mesh.rotation.set(...rotation);parent.add(mesh);return mesh;
  }


  buildPistol(){
    const g=new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x2b2f34,roughness:.26,metalness:.86,envMapIntensity:.75});
    const blued=new THREE.MeshStandardMaterial({color:0x20252b,roughness:.34,metalness:.78,envMapIntensity:.68});
    const polymer=new THREE.MeshStandardMaterial({color:0x1d1f21,roughness:.84,metalness:.04});
    const grip=new THREE.MeshStandardMaterial({color:0x514136,roughness:.92,metalness:.02});
    this.cosmeticBox([.06,.11,.225],[0,.03,-.02],metal,g);            // slide
    this.cosmeticBox([.052,.07,.175],[0,.005,-.005],blued,g);          // frame
    this.cosmeticBox([.012,.03,.03],[0,.016,.098],blued,g);            // rear sight
    this.cosmeticBox([.01,.018,.018],[0,.024,-.124],blued,g);          // front sight
    this.makeCylinder(.0105,.0105,.052,16,[0,-.004,-.159],metal,g,[Math.PI/2,0,0]); // barrel
    this.cosmeticBox([.021,.025,.038],[0,-.008,-.135],blued,g);        // muzzle block
    this.makeCylinder(.015,.015,.008,18,[0,.005,-.152],polymer,g,[Math.PI/2,0,0]);   // muzzle crown
    this.makeCylinder(.036,.036,.012,22,[0,-.032,.005],polymer,g,[Math.PI/2,0,0]);    // trigger guard
    this.cosmeticBox([.012,.032,.058],[.008,-.028,.056],blued,g,[.62,0,0]);            // trigger
    this.cosmeticBox([.040,.148,.074],[-.003,-.078,.052],grip,g,[0,0,.25]);            // grip
    this.cosmeticBox([.018,.048,.086],[0,-.112,.054],polymer,g,[0,0,.25]);             // backstrap
    this.cosmeticBox([.036,.11,.048],[0,-.115,.022],polymer,g,[0,0,.17]);              // magazine base
    this.cosmeticBox([.008,.042,.095],[.026,-.038,.008],blued,g,[0,0,.08]);            // ejection area / lever
    this.cosmeticBox([.028,.012,.06],[0,.056,-.014],metal,g);                          // top ridge
    this.cosmeticBox([.055,.013,.020],[0,.024,-.102],metal,g);                         // slide nose
    g.rotation.set(.02,.03,0);
    g.position.set(.014,-.022,.01);
    return g;
  }

  buildRifle(){
    const g=new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x2e3339,roughness:.28,metalness:.84,envMapIntensity:.78});
    const dark=new THREE.MeshStandardMaterial({color:0x212327,roughness:.68,metalness:.16});
    const stock=new THREE.MeshStandardMaterial({color:0x5a4638,roughness:.88,metalness:.02});
    this.cosmeticBox([.072,.13,.18],[.02,.015,.17],stock,g);            // stock
    this.cosmeticBox([.068,.11,.16],[.02,.015,.04],dark,g);             // receiver rear
    this.cosmeticBox([.064,.09,.26],[.02,.03,-.16],dark,g);             // receiver front
    this.cosmeticBox([.052,.056,.42],[.02,.03,-.45],metal,g);           // handguard
    this.makeCylinder(.013,.013,.56,18,[.02,.03,-.46],metal,g,[Math.PI/2,0,0]); // barrel
    this.cosmeticBox([.024,.034,.03],[.02,.032,-.73],metal,g);          // muzzle device
    this.cosmeticBox([.055,.16,.036],[.02,-.055,-.02],dark,g,[.22,0,0]); // mag
    this.cosmeticBox([.036,.12,.055],[.02,-.078,.11],dark,g,[0,0,.28]);  // grip
    this.makeCylinder(.022,.022,.010,20,[.02,-.02,.11],dark,g,[Math.PI/2,0,0]); // trigger guard
    this.cosmeticBox([.030,.030,.085],[.02,.11,-.12],metal,g);          // sight block
    this.cosmeticBox([.016,.11,.016],[.02,.15,-.12],metal,g);           // rear sight post
    this.cosmeticBox([.014,.07,.014],[.02,.118,-.56],metal,g);          // front sight post
    this.cosmeticBox([.016,.026,.085],[.02,.14,-.57],metal,g,[Math.PI/2,0,0]); // front sight hood
    this.cosmeticBox([.074,.022,.11],[.02,.065,-.01],metal,g);          // upper rail
    g.rotation.set(.01,.025,-.035);
    g.position.set(.02,-.01,.02);
    return g;
  }

  // Avatar-only silhouettes, separate from the VR controller props.
  buildGloves(kind){
    const g=new THREE.Group();
    const fabric=new THREE.MeshStandardMaterial({color:0x343c40,roughness:.94,metalness:0});
    const glove=new THREE.MeshStandardMaterial({color:0x272b2c,roughness:.88,metalness:0});
    const arm=(a,b,r)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(.01,d.length()-2*r),5,10),fabric);m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());g.add(m);};
    const palm=(p,scale)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),glove);m.position.set(...p);m.scale.set(...scale);g.add(m);};
    if(kind==='pistol'){arm([.021,-.13,.09],[.16,-.27,.34],.040);palm([.008,-.079,.057],[.041,.055,.039]);}
    else{arm([.036,-.12,.12],[.18,-.29,.36],.043);palm([.026,-.084,.11],[.042,.05,.041]);arm([-.012,-.045,-.32],[-.21,-.25,.20],.045);palm([.017,-.028,-.33],[.051,.044,.069]);}
    return g;
  }

  async loadOptionalWeaponPhotos(manifest,path,_textureLoader){
    this.photoPaths={};
    for(const id of ['pistol','rifle']){
      const url=manifest.photos?.[id];
      if(!url)continue;
      try{ this.photoPaths[id]=path(url); }
      catch(e){ console.warn('Optionales Inventarfoto nicht ladbar, Inventar nutzt Platzhalter:',id,e); }
    }
  }

  async loadRealism(manifest,path,loader,manager){
    this.realismStatus={...manifest.realism_status};
    if(manifest.outside){try{
      const tex=await new RGBELoader(manager).loadAsync(path(manifest.outside));
      tex.mapping=THREE.EquirectangularReflectionMapping;this.scene.background=tex;this.scene.backgroundIntensity=.85;this.outsideTexture=tex;
      this.realismStatus.outside='ready';
    }catch(e){this.realismStatus.outside='unavailable';console.warn('Aussenfoto fehlt',e);}}
    // Imported multi-variant props are intentionally not loaded into the viewmodel.
    // This prevents detached magazines/duplicate weapon assemblies from appearing in hand.

  }
  async load(spec,objects){
    const response=await fetch(BASE+'manifest.json');
    if(!response.ok)throw new Error('Asset-Manifest fehlt. Docker-Image neu bauen.');
    const manifest=await response.json();
    const profile=manifest.profiles?.[this.quality];
    if(!profile)throw new Error('Grafikprofil fehlt: '+this.quality);
    const path=s=>{if(typeof s!=='string'||!s.startsWith(BASE))throw new Error('Ungültiger lokaler Asset-Pfad');return s;};
    const manager=new THREE.LoadingManager();
    manager.onProgress=(_url,done,total)=>this.status(`Grafikdateien werden geladen · ${done}/${total}`);
    const textureLoader=new THREE.TextureLoader(manager);
    const anisotropy=Math.min(this.renderer.capabilities.getMaxAnisotropy(),this.quality==='1k'?2:8);
    for(const id of Object.keys(MATERIAL_SIZE)){
      this.status('Material: '+id);
      const m=profile.textures[id];
      const [color,normal,roughness,ao]=await Promise.all(['color','normal','roughness','ao'].map(k=>m[k]?textureLoader.loadAsync(path(m[k])):null));
      color.colorSpace=THREE.SRGBColorSpace;
      for(const t of [color,normal,roughness,ao].filter(Boolean)){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;}
      const opts={color:0xffffff,map:color,normalMap:normal,roughnessMap:roughness,roughness:1,metalness:0,aoMap:ao,aoMapIntensity:.85};
      if(id==='wooden_floor_01')Object.assign(opts,{roughness:1,metalness:0,normalScale:new THREE.Vector2(.35,.35),envMapIntensity:.16});
      if(id==='white_plaster_02')Object.assign(opts,{roughness:1,normalScale:new THREE.Vector2(.09,.09),envMapIntensity:.04});
      if(id==='oak_veneer_01')Object.assign(opts,{roughness:.75,metalness:.01,normalScale:new THREE.Vector2(.34,.34),envMapIntensity:.14});
      if(id==='rough_linen')Object.assign(opts,{roughness:.96,normalScale:new THREE.Vector2(.22,.22),envMapIntensity:.04});
      const mat=new THREE.MeshStandardMaterial(opts);
      // The photographed plaster is unevenly dark; preserve fine photo detail,
      // but grade it toward a painted interior wall in linear color space.
      if(id==='white_plaster_02'){
        mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.87,0.85,0.81), 0.92);');};
        mat.customProgramCacheKey=()=> 'sl-painted-plaster-064';
      }
      if(id==='wooden_floor_01'){
        mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(0.58, 0.97, roughnessFactor);');};
        mat.customProgramCacheKey=()=> 'sl-matte-floor-061';
      }
      this.textured[id]=mat;
    }
    this.status('Inventarbildquellen werden geprüft');
    await this.loadOptionalWeaponPhotos(manifest,path,textureLoader);

    this.status('Fotografische Raumbeleuchtung wird geladen');
    const hdri=await new RGBELoader(manager).loadAsync(path(manifest.lighting[this.lighting]));
    hdri.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget=pmrem.fromEquirectangular(hdri);
    this.scene.environment=this.environmentTarget.texture;
    this.scene.environmentIntensity=.58;
    hdri.dispose();pmrem.dispose();

    const loader=new GLTFLoader(manager);
    await this.loadRealism(manifest,path,loader,manager);
    for(const [id,asset] of Object.entries(MODEL_IDS)){
      this.status('Möbelmodell: '+asset);
      const gltf=await loader.loadAsync(path(profile.models[asset]));
      const model=gltf.scene;model.updateMatrixWorld(true);
      let bounds=new THREE.Box3().setFromObject(model), size=bounds.getSize(new THREE.Vector3());
      if(!Number.isFinite(size.length())||Math.min(size.x,size.y,size.z)<=0)throw new Error('Ungültige Modellabmessungen: '+asset);
      const s=spec[id].s;
      if((size.x>size.z)!==(s[0]>s[2])&&Math.abs(s[0]-s[2])>.12){model.rotation.y+=Math.PI/2;model.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(model);size=bounds.getSize(new THREE.Vector3());}
      const scale=Math.min(s[0]/size.x,s[1]/size.y,s[2]/size.z);
      const center=bounds.getCenter(new THREE.Vector3());
      const inner=new THREE.Group();inner.add(model);inner.scale.setScalar(scale);
      inner.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      const root=new THREE.Group();root.add(inner);root.visible=false;
      const materials=[];
      model.traverse(o=>{if(o.isMesh){
        o.castShadow=true;o.receiveShadow=true;
        const copy=m=>{const c=m.clone();if(c.color)materials.push([c,c.color.clone()]);return c;};
        o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
      }});
      this.models[id]={root,materials,damage:null};this.dynamicGroup.add(root);
    }

    for(const o of objects){
      const m=new THREE.Mesh(this.geometry(o),this.material(o));
      this.place(m,o);m.castShadow=o.m!=='glass';m.receiveShadow=true;this.staticGroup.add(m);
    }
    buildArchitecture(this,spec);
    await buildRoomDecor(this,manifest,path,loader);
    for(const [id,o] of Object.entries(spec))if(id!=='window'){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false,opacity:.78,polygonOffset:true,polygonOffsetFactor:-1}));
      m.rotation.x=-Math.PI/2;m.position.y=.006;m.scale.set(o.s[0]*1.55,o.s[2]*1.55,1);this.scene.add(m);this.contactShadows[id]=m;
    }
    this.status('Fotomaterialien und 3D-Modelle bereit · '+this.quality.toUpperCase());
  }

  geometry(o){
    const size=o.s, tile=MATERIAL_SIZE[o.m]||1;
    const continuous=['white_plaster_02','wooden_floor_01'].includes(o.m);
    const key=size.join(',')+'|'+tile+(continuous?'|'+o.p.join(','):'');
    if(!this.geometries.has(key)){
      const g=new THREE.BoxGeometry(...size);
      const uv=g.attributes.uv, normal=g.attributes.normal;
      for(let i=0;i<uv.count;i++){
        const nx=Math.abs(normal.getX(i)), ny=Math.abs(normal.getY(i));
        const w=nx>.5?size[2]:size[0], h=ny>.5?size[2]:size[1];
        if(continuous){
          const pos=g.attributes.position,x=pos.getX(i)+o.p[0],y=pos.getY(i)+o.p[1],z=pos.getZ(i)+o.p[2];
          uv.setXY(i,(nx>.5?z:x)/tile,(ny>.5?-z:y)/tile);
        } else uv.setXY(i,uv.getX(i)*w/tile,uv.getY(i)*h/tile);
      }
      uv.needsUpdate=true;g.setAttribute('uv1',uv.clone());this.geometries.set(key,g);
    }
    return this.geometries.get(key);
  }

  material(o){
    if(this.textured[o.m])return this.textured[o.m];
    const key=o.m+'|'+o.c.join(',');
    if(!this.materials.has(key)){
      const color=new THREE.Color().setRGB(...o.c,THREE.SRGBColorSpace);
      let material;
      if(o.m==='glass') material=new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.18,depthWrite:false,roughness:.06,metalness:0,transmission:.76,thickness:.03,ior:1.12,reflectivity:.18});
      else if(o.m==='paint') material=new THREE.MeshStandardMaterial({color,roughness:.66,metalness:0});
      else if(o.m==='metal') material=new THREE.MeshStandardMaterial({color,roughness:.34,metalness:.72});
      else if(o.m==='light') material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.8,roughness:.25,metalness:0});
      else material=new THREE.MeshStandardMaterial({color,roughness:.82,metalness:0});
      this.materials.set(key,material);
    }
    return this.materials.get(key);
  }

  place(mesh,o){mesh.position.set(...o.p);if(o.q)mesh.quaternion.set(...o.q);else mesh.rotation.set(0,o.r||0,0);}
  begin(){this.cursor=0;for(const m of Object.values(this.models))m.root.visible=false;for(const m of Object.values(this.contactShadows))m.visible=false;}
  drawBox(o){
    let mesh=this.pool[this.cursor++];
    if(!mesh){mesh=new THREE.Mesh(this.geometry(o),this.material(o));mesh.receiveShadow=true;this.pool.push(mesh);this.dynamicGroup.add(mesh);}
    mesh.geometry=this.geometry(o);mesh.material=this.material(o);mesh.castShadow=o.m!=='glass'&&o.s[0]<5&&o.s[2]<5;mesh.visible=true;this.place(mesh,o);
  }
  drawModel(id,p,s,hp,max,q){
    const sh=this.contactShadows[id];if(sh){sh.visible=true;sh.position.set(p[0],.006,p[2]);sh.material.opacity=Math.max(0,.82-(p[1]-s[1]/2)*.68);}
    const m=this.models[id];if(!m)return false;
    m.root.visible=true;
    if(m.centered){m.root.position.set(...p);m.root.quaternion.identity();m.glass.opacity=.13+.08*(1-hp/max);return true;}
    const rot=q?new THREE.Quaternion(...q):new THREE.Quaternion();
    const offset=new THREE.Vector3(0,-s[1]/2,0).applyQuaternion(rot);
    m.root.position.set(...p).add(offset);m.root.quaternion.copy(rot);
    const damage=1-.35*(1-hp/max);
    if(m.damage!==damage){for(const [mat,color] of m.materials)mat.color.copy(color).multiplyScalar(damage);m.damage=damage;}
    return true;
  }
  equip(id,first){this.currentWeapon=id||null;this.weaponRoot.visible=!!id&&first&&!this.xrMode.active;for(const [key,g] of Object.entries(this.weaponModels))g.visible=key===id;for(const [key,g] of Object.entries(this.viewHands))g.visible=key===id;this.xrMode.equip(this.xrMode.active?id:null);}
  setLoop(fn){this.renderer.setAnimationLoop(fn);}
  shot(kind,ray){
    this.kick=kind==='rifle'?.085:.060;
    if(ray){
      let source=null,caseSource=null;
      if(this.weaponRoot.visible&&!this.xrMode.active){
        this.camera.updateMatrixWorld(true);
        const front=this.weaponRoot.localToWorld(new THREE.Vector3(0,.035,kind==='rifle'?-.79:-.20));
        if(front.distanceTo(new THREE.Vector3(...ray.origin))<ray.distance)source=front.toArray();
        caseSource=this.weaponRoot.localToWorld(new THREE.Vector3(.055,.025,0)).toArray();
      }
      this.effects.fire({...ray,source,caseSource});
    }
  }
  reload(progress){this.reloadProgress=Math.max(0,Math.min(1,progress||0));}
  render(canvas,eye,target,mobile,dt=1/60,player=null){
    this.swayTime+=dt;
    const idle=Math.sin(this.swayTime*1.4)*.004;
    this.weaponRoot.position.x=.23+idle;
    const lower=Math.sin(this.reloadProgress*Math.PI);
    this.weaponRoot.position.y=-.25+Math.cos(this.swayTime*1.2)*.003-lower*.24;
    this.weaponRoot.position.z=-.44+this.kick;
    this.weaponRoot.rotation.x=.02+this.kick*1.6-lower*.38;
    this.weaponRoot.rotation.y=.16+idle*1.6;
    this.kick*=Math.exp(-dt*19);
    this.effects.update(dt);
    for(let i=this.cursor;i<this.pool.length;i++)this.pool[i].visible=false;
    if(this.xrMode.active){if(player)this.xrMode.place(player);this.renderer.render(this.scene,this.camera);return;}
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,this.quality==='1k'||mobile?1.25:1.75);
    if(w!==this.width||h!==this.height||dpr!==this.dpr){this.width=w;this.height=h;this.dpr=dpr;this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
    this.camera.position.set(...eye);this.camera.lookAt(...target);this.renderer.render(this.scene,this.camera);
  }
}
