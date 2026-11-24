export { RoomPhysics } from './physics.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildArchitecture } from './architecture.js';
import { XRMode } from './xr.js';

const BASE='/assets/polyhaven/';
const MATERIAL_SIZE={wooden_floor_01:2.1,white_plaster_02:2.5,oak_veneer_01:.95,rough_linen:.42};
const MODEL_IDS={sofa:'sofa_02',table:'wooden_table_02',chair:'modern_arm_chair_01',coffee_table:'modern_coffee_table_01'};

export class RoomRenderer {
  constructor(canvas, quality, lighting, status){
    this.quality=quality; this.lighting=lighting; this.status=status;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:quality==='2k',powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.02;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0xc8d6df);
    this.scene.fog=new THREE.Fog(0xc8d6df,70,300);
    this.camera=new THREE.PerspectiveCamera(65,1,.05,350);
    this.rig=new THREE.Group();this.scene.add(this.rig);this.rig.add(this.camera);
    this.xrMode=new XRMode(this);

    this.weaponRoot=new THREE.Group();
    this.camera.add(this.weaponRoot);
    this.weaponRoot.position.set(.19,-.22,-.40);
    this.weaponRoot.rotation.set(.02,.58,0);
    this.weaponModels={pistol:this.buildPistol(),rifle:this.buildRifle()};
    for(const model of Object.values(this.weaponModels)){ model.visible=false; this.weaponRoot.add(model); }
    this.weaponRoot.visible=false;
    this.photoPaths={};this.propPaths={};this.realismStatus={};
    this.kick=0;this.flash=0;
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

    const hemi=new THREE.HemisphereLight(0xe7eef5,0xb69270,.28);
    this.scene.add(hemi);

    const sun=new THREE.DirectionalLight(0xfff5e7,2.25);
    sun.position.set(-8,3.1,-1.4);
    sun.target.position.set(1,.55,-.4);
    sun.castShadow=true;
    const shadowSize=quality==='1k'?1024:2048;
    sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:22});
    sun.shadow.normalBias=.014;
    sun.shadow.bias=-.00015;
    this.scene.add(sun,sun.target);

    RectAreaLightUniformsLib.init();
    const windowFill=new THREE.RectAreaLight(0xeaf0f5,3.2,2.2,1.5);
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
    const metal=new THREE.MeshStandardMaterial({color:0x2c3138,roughness:.34,metalness:.72});
    const dark=new THREE.MeshStandardMaterial({color:0x1b1d20,roughness:.58,metalness:.15});
    const grip=new THREE.MeshStandardMaterial({color:0x3a3028,roughness:.88,metalness:.03});
    this.cosmeticBox([.05,.105,.22],[0,.02,-.01],metal,g);
    this.cosmeticBox([.042,.078,.19],[0,.048,-.005],dark,g);
    this.cosmeticBox([.038,.14,.07],[-.002,-.065,.045],grip,g,[0,0,.23]);
    this.cosmeticBox([.014,.045,.075],[.008,-.03,.045],dark,g,[0,0,.23]);
    this.cosmeticBox([.017,.042,.045],[0,-.02,-.10],metal,g,[.3,0,0]);
    this.makeCylinder(.011,.011,.04,14,[0,-.005,-.16],metal,g,[Math.PI/2,0,0]);
    this.cosmeticBox([.042,.02,.048],[0,.005,-.13],dark,g);
    this.cosmeticBox([.012,.03,.018],[0,.015,.105],dark,g);
    this.makeCylinder(.009,.009,.018,12,[0,-.112,.075],dark,g,[Math.PI/2,0,0]);
    g.position.set(0,-.02,0);
    return g;
  }

  buildRifle(){
    const g=new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x2e333a,roughness:.35,metalness:.68});
    const dark=new THREE.MeshStandardMaterial({color:0x1c1e22,roughness:.55,metalness:.1});
    const stock=new THREE.MeshStandardMaterial({color:0x44352a,roughness:.82,metalness:.02});
    this.cosmeticBox([.06,.12,.28],[.04,.015,.03],dark,g);
    this.cosmeticBox([.05,.055,.48],[.02,.03,-.34],metal,g);
    this.makeCylinder(.015,.015,.50,16,[.02,.03,-.34],metal,g,[Math.PI/2,0,0]);
    this.cosmeticBox([.07,.08,.16],[.02,-.005,.26],stock,g);
    this.cosmeticBox([.05,.12,.09],[.02,-.10,.07],dark,g,[0,0,.25]);
    this.cosmeticBox([.055,.17,.03],[.02,-.04,-.04],dark,g,[.22,0,0]);
    this.cosmeticBox([.034,.034,.18],[.02,.065,-.12],metal,g);
    this.cosmeticBox([.02,.10,.02],[.02,.12,.05],metal,g);
    this.cosmeticBox([.018,.018,.085],[.02,.145,.02],metal,g,[Math.PI/2,0,0]);
    this.cosmeticBox([.025,.03,.028],[.02,.03,-.57],metal,g);
    this.cosmeticBox([.06,.08,.12],[.02,.03,.15],dark,g);
    g.rotation.z=-.03;
    g.position.set(.01,-.015,0);
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
    for(const id of ['pistol','rifle']){
      const url=manifest.prop_models?.[this.quality]?.[id];if(!url)continue;
      try{
        const gltf=await loader.loadAsync(path(url)),model=gltf.scene;model.updateMatrixWorld(true);
        let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
        if(!Number.isFinite(size.length())||Math.min(size.x,size.y,size.z)<=0)throw Error('Leeres Spielmodell');
        if(size.x>size.z){model.rotation.y+=Math.PI/2;model.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(model);size=bounds.getSize(new THREE.Vector3());}
        const center=bounds.getCenter(new THREE.Vector3()),scale=(id==='pistol'?.27:.68)/Math.max(size.z,size.x);
        const holder=new THREE.Group();holder.add(model);holder.scale.setScalar(scale);holder.position.set(-center.x*scale,-center.y*scale,-center.z*scale-.05);
        const root=new THREE.Group();root.add(holder);root.visible=false;
        model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
        this.weaponRoot.remove(this.weaponModels[id]);this.weaponRoot.add(root);this.weaponModels[id]=root;this.propPaths[id]=url;this.realismStatus[id]='ready';
      }catch(e){this.realismStatus[id]='unavailable';console.warn('Optionales Spielmodell fehlt',id,e);}
    }
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
        mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.81,0.79,0.75), 0.72);');};
        mat.customProgramCacheKey=()=> 'sl-painted-plaster-061';
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
    this.scene.environmentIntensity=.46;
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
  equip(id,first){this.weaponRoot.visible=!!id&&first&&!this.xrMode.active;for(const [key,g] of Object.entries(this.weaponModels))g.visible=key===id;this.xrMode.equip(this.xrMode.active?id:null);}
  setLoop(fn){this.renderer.setAnimationLoop(fn);}
  shot(){this.kick=.072;this.flash=1;}
  render(canvas,eye,target,mobile,dt=1/60,player=null){
    this.swayTime+=dt;
    const idle=Math.sin(this.swayTime*1.4)*.004;
    this.weaponRoot.position.x=.19+idle;
    this.weaponRoot.position.y=-.22+Math.cos(this.swayTime*1.2)*.003;
    this.weaponRoot.position.z=-.40+this.kick;
    this.weaponRoot.rotation.x=.02+this.kick*1.6;
    this.weaponRoot.rotation.y=.58+idle*1.6;
    this.kick*=Math.exp(-dt*19);
    for(let i=this.cursor;i<this.pool.length;i++)this.pool[i].visible=false;
    if(this.xrMode.active){if(player)this.xrMode.place(player);this.renderer.render(this.scene,this.camera);return;}
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,this.quality==='1k'||mobile?1.25:1.75);
    if(w!==this.width||h!==this.height||dpr!==this.dpr){this.width=w;this.height=h;this.dpr=dpr;this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
    this.camera.position.set(...eye);this.camera.lookAt(...target);this.renderer.render(this.scene,this.camera);
  }
}
