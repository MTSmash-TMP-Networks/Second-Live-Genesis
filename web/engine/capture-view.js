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
