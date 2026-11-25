import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export function renderPreview(container,data,{live=false}={}){
  container.replaceChildren();
  const renderer=new THREE.WebGLRenderer({antialias:!live,powerPreference:live?'low-power':'default'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,live?1.25:1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D-Vorschau: ziehen zum Drehen, zwei Finger zum Zoomen oder Verschieben');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c141c);
  const camera=new THREE.PerspectiveCamera(55,1,.01,30);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!live;controls.enablePan=true;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  const group=new THREE.Group();group.rotation.x=Math.PI;scene.add(group);
  const geometry=(vertices,colors)=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));if(colors?.length===vertices.length)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors.flat().map(x=>x/255),3));return geo;};
  const center=new THREE.Vector3();let radius=1;
  const reset=()=>{const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect),distance=radius/Math.sin(Math.min(vfov,hfov)/2)*1.12;
    controls.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(1.8,1.35,2.6).normalize(),distance);
    camera.near=Math.max(.001,radius*.003);camera.far=Math.max(30,distance*8);camera.updateProjectionMatrix();controls.minDistance=Math.max(.03,radius*.1);controls.maxDistance=Math.max(10,distance*4);controls.update();};
  const clear=()=>{for(const child of [...group.children]){child.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group.remove(child);}};
  const update=(next)=>{
    clear();
    const points=geometry(next.points,next.colors);
    group.add(new THREE.Points(points,new THREE.PointsMaterial({size:live?.027:.017,color:0x94cbbf,vertexColors:!!points.attributes.color,transparent:true,opacity:.93})));
    if(next.vertices?.length&&next.triangles?.length){const mesh=geometry(next.vertices,next.mesh_colors);mesh.setIndex(next.triangles.flat());mesh.computeVertexNormals();group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color:mesh.attributes.color?0xffffff:0x92a7b5,vertexColors:!!mesh.attributes.color,side:THREE.DoubleSide,transparent:true,opacity:.78})));}
    group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group),sphere=bounds.getBoundingSphere(new THREE.Sphere());center.copy(sphere.center);radius=Math.max(.1,sphere.radius);
    if(live&&next.camera_positions?.length){
      const positions=next.camera_positions.map(p=>p.position);
      const markers=geometry(positions);group.add(new THREE.Points(markers,new THREE.PointsMaterial({size:.055,color:0x70dfc6,depthTest:false})));
    }
    reset();
  };
  const draw=()=>renderer.render(scene,camera);
  const resize=()=>{const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();};
  const ro=new ResizeObserver(resize);ro.observe(container);resize();update(data);
  if(live){controls.addEventListener('change',draw);draw();}else renderer.setAnimationLoop(()=>{controls.update();draw();});
  const dispose=()=>{renderer.setAnimationLoop(null);ro.disconnect();controls.removeEventListener('change',draw);controls.dispose();clear();renderer.dispose();renderer.domElement.remove();};
  dispose.reset=()=>{reset();draw();};dispose.update=next=>{update(next);draw();};return dispose;
}

// Look around the real equirectangular image from its capture point.
// No positional movement: this is an optical panorama, not a 3D mesh.
export function renderPanorama(container,src){
  const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c141c);
  const camera=new THREE.PerspectiveCamera(75,1,.01,20);
  let yaw=0,pitch=0,fov=75,disposed=false,drag=null;
  const canvas=renderer.domElement;canvas.setAttribute('aria-label','360 Grad Panorama, ziehen zum Umsehen');
  const draw=()=>{if(disposed)return;const p=pitch*Math.PI/180,a=yaw*Math.PI/180;camera.lookAt(Math.sin(a)*Math.cos(p),Math.sin(p),Math.cos(a)*Math.cos(p));renderer.render(scene,camera);};
  const texture=new THREE.TextureLoader().load(src,()=>draw());texture.colorSpace=THREE.SRGBColorSpace;
  const geo=new THREE.SphereGeometry(5,64,32),material=new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide});
  const sphere=new THREE.Mesh(geo,material);sphere.rotation.y=-Math.PI/2;scene.add(sphere);
  container.replaceChildren(canvas);
  const resize=()=>{const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=fov;camera.updateProjectionMatrix();draw();};
  const reset=()=>{yaw=0;pitch=0;fov=75;resize();};
  const down=e=>{if(drag!==null)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
  const move=e=>{if(!drag||drag.id!==e.pointerId)return;const rate=fov/Math.max(1,canvas.clientHeight);yaw-=(e.clientX-drag.x)*rate;pitch=Math.max(-89,Math.min(89,pitch+(e.clientY-drag.y)*rate));drag.x=e.clientX;drag.y=e.clientY;draw();};
  const up=e=>{if(drag?.id===e.pointerId)drag=null;};
  const wheel=e=>{e.preventDefault();fov=Math.max(35,Math.min(95,fov+e.deltaY*.025));resize();};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,up);
  canvas.addEventListener('wheel',wheel,{passive:false});
  const ro=new ResizeObserver(resize);ro.observe(container);resize();
  const dispose=()=>{disposed=true;ro.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.removeEventListener(event,up);canvas.removeEventListener('wheel',wheel);texture.dispose();geo.dispose();material.dispose();renderer.dispose();canvas.remove();};
  dispose.reset=reset;return dispose;
}
