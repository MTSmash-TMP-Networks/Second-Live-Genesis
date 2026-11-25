export { RoomPhysics } from './physics.js';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildArchitecture } from './architecture.js';
export { curtainBounds } from './architecture.js';
import { XRMode } from './xr.js';
import { ShotEffects } from './shotfx.js';
import { ImpactMarks } from './impact_marks.js';
import { WallMeshes } from './wall_mesh.js';
import { WALLS, floorSupported } from './wall_layout.js';
import { inspectHand, poseContactHand } from './avatar_hands.js';
export { WALLS, REMOVED, cellBox, solidRuns, solidContains, solidRay, floorSupported } from './wall_layout.js';
import { isolateDisplayProp } from './display_prop.js';
import { buildRoomDecor, fitDecor } from './room_decor.js';
import { withAssetDeadline } from './optional_asset.js';
import { HOTEL_LAYOUT, hotelMaterials, applyPhotoMaterials, createHotelModel } from './hotel_room.js';
export { HOTEL_LAYOUT };
import { buildPortalDoor, PORTAL_SIDES } from './portal_door.js';
export { PORTAL_SIDES };
export { DECOR } from './room_decor.js';

const BASE='/assets/polyhaven/';
const MATERIAL_SIZE={wooden_floor_01:2.1,white_plaster_02:2.5,oak_veneer_01:.95,rough_linen:.42};
const HOTEL_MODELS=['sofa','table','chair','coffee_table','crate'];

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
    this.effects=new ShotEffects(this.scene);
    this.impacts=new ImpactMarks();
    this.walls=new WallMeshes(this.impacts);
    this.scene.background=new THREE.Color(0xc8d6df);
    this.scene.fog=new THREE.Fog(0xc8d6df,70,300);
    this.camera=new THREE.PerspectiveCamera(65,1,.05,350);
    this.rig=new THREE.Group();this.scene.add(this.rig);this.rig.add(this.camera);
    this.xrMode=new XRMode(this);

    this.weaponRoot=new THREE.Group();
    this.camera.add(this.weaponRoot);
    this.weaponRoot.position.set(.24,-.25,-.44);
    this.weaponRoot.rotation.set(.02,.16,0);
    this.weaponModels={pistol:this.buildPistol(),rifle:this.buildRifle(),m16:this.buildM16()};
    for(const model of Object.values(this.weaponModels)){ model.visible=false; this.weaponRoot.add(model); }
    this.weaponRoot.visible=false;
    this.viewHands={};
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
    this.chipGeometries=new Map();
    this.textured={};
    this.models={};
    this.pool=[];
    this.staticGroup=new THREE.Group();
    this.dynamicGroup=new THREE.Group();
    this.scene.add(this.staticGroup,this.dynamicGroup);

    const hemi=new THREE.HemisphereLight(0xf5f2eb,0xb2a393,.36);
    this.scene.add(hemi);

    const sun=new THREE.DirectionalLight(0xffead1,2.5);
    sun.position.set(-8,3.65,-1.7);
    sun.target.position.set(.8,.35,.15);
    sun.castShadow=true;
    const shadowSize=quality==='1k'?1024:2048;
    sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:22});
    sun.shadow.normalBias=.023;
    sun.shadow.radius=3;
    sun.shadow.bias=-.00015;
    this.scene.add(sun,sun.target);

    RectAreaLightUniformsLib.init();
    const windowFill=new THREE.RectAreaLight(0xeaf0f5,4.0,2.2,1.5);
    windowFill.position.set(-4.15,1.78,-1);
    windowFill.lookAt(.2,1.5,-1);
    this.scene.add(windowFill);
    // Soft window spill produces furniture shadows even when the exterior sun is occluded.
    const spill=new THREE.SpotLight(0xffefd9,42,12,Math.PI/3,.72,2);spill.position.set(-4.51,2.36,-1.0);spill.target.position.set(-.8,.3,.4);spill.castShadow=true;spill.shadow.mapSize.set(shadowSize,shadowSize);spill.shadow.normalBias=.024;spill.shadow.bias=-.0002;spill.shadow.camera.near=.1;spill.shadow.camera.far=13;this.scene.add(spill,spill.target);this.windowDaylight={fill:windowFill,spill};

    const ceilingBounce=new THREE.PointLight(0xffefd9,2.0,10,2);
    ceilingBounce.position.set(0,2.75,.2);
    this.scene.add(ceilingBounce);this.ceilingLight=ceilingBounce;

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

  // A deliberately stylized local game silhouette, not a mechanical model.
  buildM16(){
    const g=new THREE.Group(),dark=new THREE.MeshStandardMaterial({color:0x22272a,roughness:.67,metalness:.25}),soft=new THREE.MeshStandardMaterial({color:0x343a3b,roughness:.85});
    this.cosmeticBox([.065,.105,.34],[0,0,-.08],dark,g);
    this.cosmeticBox([.068,.085,.22],[0,.005,.19],soft,g);
    this.cosmeticBox([.082,.085,.34],[0,.017,-.37],soft,g);
    this.makeCylinder(.012,.012,.22,12,[0,.02,-.64],dark,g,[Math.PI/2,0,0]);
    this.cosmeticBox([.05,.115,.08],[0,-.075,.045],soft,g,[.18,0,0]);
    this.cosmeticBox([.065,.13,.085],[0,-.075,-.13],dark,g,[.14,0,0]);
    g.userData.front=[0,.02,-.75];return g;
  }

  async loadM16(manifest,path,manager){
    this.realismStatus.m16='local';if(!manifest.m16_obj)return;
    try{
      const raw=await new OBJLoader(manager).loadAsync(path(manifest.m16_obj));
      const reference=this.weaponModels.m16.clone(true);reference.visible=true;
      const textures=new THREE.TextureLoader(manager);let color=null,normal=null;
      if(manifest.m16_color){color=await textures.loadAsync(path(manifest.m16_color));color.colorSpace=THREE.SRGBColorSpace;}
      if(manifest.m16_normal)normal=await textures.loadAsync(path(manifest.m16_normal));
      raw.traverse(o=>{if(o.isMesh){const uv=!!o.geometry?.attributes?.uv;o.material=new THREE.MeshStandardMaterial({color:color&&uv?0xffffff:0x323638,map:uv?color:null,normalMap:uv?normal:null,metalness:.18,roughness:.66});}});
      const root=isolateDisplayProp(raw,reference);this.weaponRoot.remove(this.weaponModels.m16);this.weaponRoot.add(root);this.weaponModels.m16=root;this.propPaths.m16=manifest.m16_obj;this.realismStatus.m16='ready';this.m16Credit=manifest.m16_credit||'OpenGameArt';
    }catch(e){console.warn('Optionales M16-Spielmodell nicht verfuegbar',e);}
  }

  // Imported skinned avatar meshes, with local sleeve geometry. The old
  // disconnected procedural hand is not drawn if the asset is unavailable.
  buildGloves(kind){
    const g=new THREE.Group();g.userData.importedHands=0;
    const sleeve=new THREE.MeshStandardMaterial({color:0x343b42,roughness:.93,normalMap:this.textured?.rough_linen?.normalMap||null,normalScale:new THREE.Vector2(.28,.28)});
    const cuff=new THREE.MeshStandardMaterial({color:0x25292e,roughness:.88});
    const capsule=(a,b,r,mat)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(.006,d.length()-2*r),8,18),mat);mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());g.add(mesh);};
    const prop=this.weaponModels[kind].clone(true);prop.visible=true;prop.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(prop,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(bounds.isEmpty()||!Number.isFinite(size.length()))return g;
    // Derive avatar contact points from the displayed mesh, not from a fixed
    // hand pose shared between unrelated props. These are game-art anchors.
    const verts=[];prop.traverse(o=>{if(!o.isMesh)return;const a=o.geometry?.attributes?.position;if(!a)return;const step=Math.max(1,Math.floor(a.count/1600));for(let i=0;i<a.count;i+=step)verts.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));});
    const contact=(along,span,edge)=>{
      const z=bounds.min.z+size.z*along, band=verts.filter(v=>Math.abs(v.z-z)<=size.z*span);
      if(!band.length)return [center.x,bounds.min.y-.012,z];
      const ys=band.map(v=>v.y).sort((a,b)=>a-b),xs=band.map(v=>v.x).sort((a,b)=>a-b);
      const y=ys[Math.floor((ys.length-1)*(edge==='side'?.22:.12))],x=edge==='side'?xs[Math.floor((xs.length-1)*.78)]+.009:xs[Math.floor((xs.length-1)*.5)];
      return [x,y-(edge==='side'?0:.012),z];
    };
    const hand=(side,anchor,forward,normal,curl,elbow)=>{if(!this.handModels?.[side])return;try{
      const model=poseContactHand(this.handModels[side],side,anchor,forward,normal,curl),a=new THREE.Vector3(...model.userData.wrist),b=new THREE.Vector3(...elbow);
      capsule(a.toArray(),b.toArray(),.034,sleeve);capsule(a.toArray(),a.clone().lerp(b,.16).toArray(),.035,cuff);g.add(model);g.userData.importedHands++;
    }catch(e){console.warn('Handpose nicht verfuegbar',side,e);}};
    hand('right',contact(kind==='pistol'?.76:.69,.12,'side'),[-.50,.40,-.76],[-1,.05,0],[.95,1.0,.65],[.182,-.265,.342]);
    if(kind!=='pistol')hand('left',contact(.38,.11,'under'),[.90,.10,-.35],[0,1,0],[.74,.97,.57],[-.224,-.248,.176]);
    return g;
  }

  createWeaponPreview(id){
    const source=this.weaponModels[id];if(!source)return null;
    const width=360,height=208,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x253242);scene.environment=this.scene.environment;
    scene.add(new THREE.HemisphereLight(0xf4f5f2,0x33404c,1.6));
    for(const [p,color,intensity] of [[[2,3,2],0xfff4df,2.2],[[-2,1,-1],0xadc3d7,1.1]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...p);scene.add(light);}
    const model=source.clone(true);model.visible=true;const root=new THREE.Group();root.add(model);scene.add(root);
    root.rotation.set(-.08,id!=='pistol'?Math.PI*.45:Math.PI*.38,.04);root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    if(box.isEmpty()||!Number.isFinite(size.length()))return null;
    const aspect=width/height,half=Math.max(size.y/2,size.x/(2*aspect),.05)*1.18;
    const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.01,100);
    camera.position.copy(center).add(new THREE.Vector3(0,0,Math.max(2,size.length()*3)));camera.lookAt(center);
    const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
    const prev=this.renderer.getRenderTarget();const pixels=new Uint8Array(width*height*4);
    try{
      this.renderer.setRenderTarget(target);this.renderer.render(scene,camera);this.renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      const ctx=canvas.getContext('2d');if(!ctx)return null;const image=ctx.createImageData(width,height);
      for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-y-1)*width*4,(height-y)*width*4),y*width*4);
      ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
    }finally{this.renderer.setRenderTarget(prev);target.dispose();}
  }
  ensureInventoryPreviews(){
    this.previewPaths={};
    for(const id of ['pistol','rifle','m16']){
      try{const uri=this.createWeaponPreview(id);if(uri)this.previewPaths[id]=uri;}
      catch(e){console.warn('Lokale Inventarvorschau fehlgeschlagen',id,e);}
    }
  }

  async loadOptionalWeaponPhotos(manifest,path,_textureLoader){
    this.photoPaths={};
    for(const id of ['pistol','rifle']){
      const url=manifest.photos?.[id];
      if(!url)continue;
      try{ this.photoPaths[id]=path(url); }
      catch(e){ console.warn('Optionales Inventarfoto nicht ladbar, Inventar nutzt lokale Vorschau:',id,e); }
    }
  }

  async loadRealism(manifest,path,loader,manager){
    this.realismStatus={...manifest.realism_status};
    if(manifest.outside){try{
      const tex=await new RGBELoader(manager).loadAsync(path(manifest.outside));
      tex.mapping=THREE.EquirectangularReflectionMapping;this.scene.background=tex;this.scene.backgroundIntensity=.85;this.outsideTexture=tex;
      this.realismStatus.outside='ready';
    }catch(e){this.realismStatus.outside='unavailable';console.warn('Aussenfoto fehlt',e);}}
    // Library scenes can contain alternate versions and detached display objects.
    // Select and fit a single visual assembly rather than rendering the whole scene.
    for(const id of ['pistol','rifle']){
      const url=manifest.prop_models?.[this.quality]?.[id];if(!url){this.realismStatus[id]='local';continue;}
      try{
        const gltf=await loader.loadAsync(path(url));
        const reference=this.weaponModels[id].clone(true);
        reference.visible=true;
        const root=isolateDisplayProp(gltf.scene,reference);
        this.weaponRoot.remove(this.weaponModels[id]);this.weaponRoot.add(root);this.weaponModels[id]=root;
        this.propPaths[id]=url;this.realismStatus[id]='ready';
      }catch(e){this.realismStatus[id]='local';console.warn('Spielmodell konnte nicht isoliert werden; lokale Darstellung bleibt aktiv',id,e);}
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
        mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.87,0.85,0.81), 0.92);');};
        mat.customProgramCacheKey=()=> 'sl-painted-plaster-064';
      }
      if(id==='wooden_floor_01'){
        mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(0.58, 0.97, roughnessFactor);');};
        mat.customProgramCacheKey=()=> 'sl-matte-floor-061';
      }
      this.textured[id]=mat;
    }
    const hotel=hotelMaterials(this);this.textured.hotel_carpet=hotel.carpet;this.textured.hotel_stripe=hotel.stripe;this.textured.hotel_wall=hotel.wall;this.textured.hotel_ceiling=hotel.ceiling;
    this.status('Fotovorlage: Tapete, Teppich und Stoff');
    await applyPhotoMaterials(this,new THREE.TextureLoader(new THREE.LoadingManager()),anisotropy);
    this.status('Inventarbildquellen werden geprüft');
    await this.loadOptionalWeaponPhotos(manifest,path,textureLoader);

    this.status('Fotografische Raumbeleuchtung wird geladen');
    const hdri=await new RGBELoader(manager).loadAsync(path(manifest.lighting[this.lighting]));
    hdri.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget=pmrem.fromEquirectangular(hdri);
    this.scene.environment=this.environmentTarget.texture;
    this.scene.environmentIntensity=.36;
    hdri.dispose();pmrem.dispose();

    const loader=new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    await this.loadRealism(manifest,path,loader,manager);
    await this.loadM16(manifest,path,manager);
    this.ensureInventoryPreviews();
    this.status('Originale WebXR-Handmodelle werden geladen');
    this.handModels={};
    for(const side of ['left','right']){const url=manifest.hands?.[side];if(!url)continue;try{const gltf=await loader.loadAsync(path(url));inspectHand(gltf.scene);this.handModels[side]=gltf.scene;}catch(e){console.warn('Originalhand nicht verfuegbar',side,e);}}
    this.realismStatus.hands='partial';
    for(const id of ['pistol','rifle','m16']){try{this.viewHands[id]=this.buildGloves(id);this.viewHands[id].visible=false;this.weaponRoot.add(this.viewHands[id]);}catch(e){console.warn('Optionales Handmesh nicht verfügbar',id,e);}}
    if(this.viewHands.pistol?.userData.importedHands===1&&this.viewHands.rifle?.userData.importedHands===2&&this.viewHands.m16?.userData.importedHands===2)this.realismStatus.hands='ready';
    for(const id of HOTEL_MODELS){
      this.status('Hotelmöbel: '+id);
      let root=createHotelModel(this,id);const materials=[];
      if(id==='chair'&&manifest.hotel_models?.chair){
        try{
          const optionalLoader=new GLTFLoader(new THREE.LoadingManager());
          const gltf=await withAssetDeadline(()=>optionalLoader.loadAsync(path(manifest.hotel_models.chair)),6000);
          // Preserve the authored velvet normal/roughness/AO maps and match the reference's mustard hue.
          gltf.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
            if(/fabric/i.test(m.name||'')){m.color.set(0xcba13b);m.sheenColor?.set(0xf0c066);m.metalness=0;m.roughness=.88;}
            else if(/wood/i.test(m.name||'')){m.color.set(0x2d2722);}
          }});
          const fitted=fitDecor(gltf.scene,spec[id]);const original=new THREE.Group();original.add(fitted.root);root=original;this.realismStatus.chair='original';
        }catch(e){console.warn('Optionales Samt-Stuhlmodell:',e);}
      }
      root.traverse(o=>{if(!o.isMesh)return;
        const copy=m=>{const c=m.clone();if(c.color)materials.push([c,c.color.clone()]);return c;};
        o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
      });
      root.visible=false;this.models[id]={root,materials,damage:null};this.dynamicGroup.add(root);
    }

    const surfaceGroups=new Map();
    for(const o of objects){
      if(o.surfaceId==='surface_wardrobe'){
        const root=new THREE.Group(),model=createHotelModel(this,'surface_wardrobe');
        root.position.set(...o.p);model.position.y=-o.s[1]/2;root.add(model);this.staticGroup.add(root);
        this.impacts.register(o.surfaceId,root,'wood');continue;
      }
      const m=new THREE.Mesh(this.geometry(o),this.material(o));
      this.place(m,o);if(o.switchRocker)this.switchRocker=m;m.castShadow=o.m!=='glass';m.receiveShadow=true;this.staticGroup.add(m);
      if(o.surfaceId){this.impacts.register(o.surfaceId,m,o.m==='hotel_carpet'?'fabric':o.m==='wooden_floor_01'?'wood':'wall');this.walls.register(o.surfaceId,m);}
      if(o.groupSurface){let g=surfaceGroups.get(o.groupSurface);if(!g){g=new THREE.Group();g.name=o.groupSurface;this.staticGroup.add(g);surfaceGroups.set(o.groupSurface,g);this.impacts.register(o.groupSurface,g,'wood');}g.add(m);}
      if(o.parentSurface){const parent=this.impacts.targets.get(o.parentSurface)?.root;if(parent){parent.updateWorldMatrix(true,false);m.updateWorldMatrix(true,false);parent.attach(m);}}
    }
    buildArchitecture(this,spec);
    await buildRoomDecor(this,manifest,path,loader);
    // Optional door must not block the core loading manager. KTX2 is converted during build.
    this.status('Tuermodell wird vorbereitet');
    const doorLoader=new GLTFLoader(new THREE.LoadingManager()).setMeshoptDecoder(MeshoptDecoder);
    this.portalDoor=await buildPortalDoor(this,manifest,path,doorLoader);
    for(const [id,m] of Object.entries(this.models))if(spec[id])this.impacts.register(id,m.root,id==='window'?'glass':id==='sofa'||id==='chair'?'fabric':'wood');
    for(const [id,o] of Object.entries(spec))if(id!=='window'&&!o.decor){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false,opacity:.78,polygonOffset:true,polygonOffsetFactor:-1}));
      m.rotation.x=-Math.PI/2;m.position.y=.006;m.scale.set(o.s[0]*1.55,o.s[2]*1.55,1);this.scene.add(m);this.contactShadows[id]=m;
    }
    this.status('Fotomaterialien und 3D-Modelle bereit · '+this.quality.toUpperCase());
  }

  geometry(o){
    const size=o.s, tile=o.m==='hotel_carpet'?2.1:o.m==='hotel_stripe'?2.5:MATERIAL_SIZE[o.m]||1;
    const continuous=['white_plaster_02','wooden_floor_01','hotel_carpet','hotel_stripe'].includes(o.m);
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
  setDoorOpen(open){this.portalDoor?.setOpen(open);}
  setCurtainsClosed(closed,immediate=false,decor={}){this.curtainControl?.setClosed(closed,immediate,decor);}
  advanceCurtains(dt,decor={}){this.curtainControl?.step(dt,decor);}
  get curtainProgress(){return this.curtainControl?.progress||0;}
  setRoomLight(on,decor={}){
    const ceiling=on&&(decor.surface_ceilinglamp||0)<4;
    if(this.ceilingLight)this.ceilingLight.intensity=ceiling?2.8:0;
    if(this.ceilingDiffuser)this.ceilingDiffuser.material.emissiveIntensity=ceiling?.35:0;
    const lamp=on&&(decor.surface_lamp||0)<4&&(decor.surface_nightstand||0)<4;
    if(this.bedsideLight)this.bedsideLight.intensity=lamp?6:0;
    if(this.bedsideShade)this.bedsideShade.emissiveIntensity=lamp?.17:0;
    if(this.bedsideBulb)this.bedsideBulb.emissiveIntensity=lamp?1.3:0;
    if(this.switchRocker)this.switchRocker.rotation.x=on?-.14:.14;
    for(const h of this.hotelLights||[]){const active=on&&(decor[h.surface]||0)<4&&(h.surface!=='surface_lamp'||(decor.surface_nightstand||0)<4);h.light.intensity=active?h.intensity:0;if(h.material)h.material.emissiveIntensity=active?h.emissive:0;}
    // Window/daylight sources deliberately remain active.
  }
  begin(){this.cursor=0;for(const m of Object.values(this.models))m.root.visible=false;for(const m of Object.values(this.contactShadows))m.visible=false;}
  chipGeometry(variant){
    const k=(variant||0)%4;if(!this.chipGeometries.has(k)){
      const geo=new THREE.IcosahedronGeometry(.5,0),a=geo.attributes.position;
      for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),v=.83+.18*Math.sin(17*x+11*y+23*z+k);a.setXYZ(i,x*v,y*v,z*v);}
      geo.computeVertexNormals();this.chipGeometries.set(k,geo);
    }return this.chipGeometries.get(k);
  }
  drawBox(o){
    let mesh=this.pool[this.cursor++];
    const chip=o.kind==='wallChip',geometry=chip?this.chipGeometry(o.variant):this.geometry(o);
    if(!mesh){mesh=new THREE.Mesh(geometry,this.material(o));mesh.receiveShadow=true;this.pool.push(mesh);this.dynamicGroup.add(mesh);}
    mesh.geometry=geometry;mesh.scale.set(...(chip?o.s:[1,1,1]));mesh.material=this.material(o);mesh.castShadow=o.m!=='glass'&&o.s[0]<5&&o.s[2]<5;mesh.visible=true;this.place(mesh,o);
  }
  drawModel(id,p,s,hp,max,q){
    const sh=this.contactShadows[id];if(sh){sh.rotation.z=q?2*Math.atan2(q[1],q[3]):0;sh.visible=floorSupported(WALLS.surface_0,this.wallState?.surface_0||[],p[0],p[2]);sh.position.set(p[0],.006,p[2]);sh.material.opacity=Math.max(0,.82-(p[1]-s[1]/2)*.68);}
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
  drawMovableDecor(id,p,s,q,visible,held){
    const root=this.impacts.targets.get(id)?.root;if(!root)return;
    // Preserve existing impact coordinate systems: bed root at floor, wardrobe at centre.
    const rot=q?new THREE.Quaternion(...q):new THREE.Quaternion();
    root.position.set(...p);if(id==='surface_bed')root.position.add(new THREE.Vector3(0,-s[1]/2,0).applyQuaternion(rot));
    root.quaternion.copy(rot);root.visible=visible;
    root.traverse(o=>{if(o.userData.floorShadow)o.visible=!held&&Math.abs(p[1]-s[1]/2)<.04&&floorSupported(WALLS.surface_0,this.wallState?.surface_0||[],p[0],p[2]);});
  }
  surfaceHit(origin,direction,held){this.scene.updateMatrixWorld(true);return this.impacts.cast(origin,direction,[this.staticGroup,this.dynamicGroup],held);}
  syncWalls(walls){this.walls.sync(walls);this.wallState=walls||{};this.staticGroup.updateMatrixWorld(true);this.staticGroup.traverse(o=>{if(o.userData.floorShadow){const p=o.getWorldPosition(new THREE.Vector3());o.visible=floorSupported(WALLS.surface_0,this.wallState.surface_0||[],p.x,p.z);}});}
  syncDecor(decor={}){
    for(const [id,target] of this.impacts.targets){if(!id.startsWith('surface_')||this.walls.entries.has(id))continue;const visible=(decor[id]||0)<4;if(target.root.visible!==visible){target.root.visible=visible;this.impacts.invalidateTarget(id);}}
  }
  syncMarks(marks){this.impacts.sync(marks);}
  equip(id,first){this.currentWeapon=id||null;this.weaponRoot.visible=!!id&&first&&!this.xrMode.active;for(const [key,g] of Object.entries(this.weaponModels))g.visible=key===id;for(const [key,g] of Object.entries(this.viewHands))g.visible=key===id;this.xrMode.equip(this.xrMode.active?id:null);}
  setLoop(fn){this.renderer.setAnimationLoop(fn);}
  shot(kind,ray){
    this.kick=kind!=='pistol'?.085:.060;
    if(ray){
      let source=null,caseSource=null;
      if(this.weaponRoot.visible&&!this.xrMode.active){
        this.camera.updateMatrixWorld(true);
        const anchor=this.weaponModels[kind]?.userData.front||[0,.035,kind!=='pistol'?-.79:-.20];
        const front=this.weaponRoot.localToWorld(new THREE.Vector3(...anchor));
        if(front.distanceTo(new THREE.Vector3(...ray.origin))<ray.distance)source=front.toArray();
        caseSource=this.weaponRoot.localToWorld(new THREE.Vector3(.055,.025,0)).toArray();
      }
      this.effects.fire({...ray,source,caseSource});
    }
  }
  reload(progress){this.reloadProgress=Math.max(0,Math.min(1,progress||0));}
  render(canvas,eye,target,mobile,dt=1/60,player=null,scopeZoom=false){
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
    const fov=scopeZoom?28:65;if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    this.camera.position.set(...eye);this.camera.lookAt(...target);this.renderer.render(this.scene,this.camera);
  }
}
