import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export function renderPreview(container,data){
  container.replaceChildren();
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D-Vorschau: ziehen zum Drehen, zwei Finger zum Zoomen oder Verschieben');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c141c);
  const camera=new THREE.PerspectiveCamera(55,1,.01,30);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=true;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  const group=new THREE.Group();group.rotation.x=Math.PI;scene.add(group);
  const geometry=(vertices,colors)=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));if(colors?.length===vertices.length)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors.flat().map(x=>x/255),3));return geo;};
  const points=geometry(data.points,data.colors);group.add(new THREE.Points(points,new THREE.PointsMaterial({size:.017,color:0x94cbbf,vertexColors:!!points.attributes.color,transparent:true,opacity:.93})));
  if(data.vertices?.length&&data.triangles?.length){const mesh=geometry(data.vertices,data.mesh_colors);mesh.setIndex(data.triangles.flat());mesh.computeVertexNormals();group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color:mesh.attributes.color?0xffffff:0x92a7b5,vertexColors:!!mesh.attributes.color,side:THREE.DoubleSide,transparent:true,opacity:.78})));}
  group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group),sphere=bounds.getBoundingSphere(new THREE.Sphere());const center=sphere.center,radius=Math.max(.1,sphere.radius);
  const reset=()=>{const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect),distance=radius/Math.sin(Math.min(vfov,hfov)/2)*1.12;
    controls.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(1.8,1.35,2.6).normalize(),distance);
    camera.near=Math.max(.001,radius*.003);camera.far=Math.max(30,distance*8);camera.updateProjectionMatrix();controls.minDistance=Math.max(.03,radius*.1);controls.maxDistance=Math.max(10,distance*4);controls.update();};
  const resize=()=>{const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const ro=new ResizeObserver(resize);ro.observe(container);resize();reset();renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  const dispose=()=>{renderer.setAnimationLoop(null);ro.disconnect();controls.dispose();group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();renderer.domElement.remove();};
  dispose.reset=reset;return dispose;
}
