import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export function renderPreview(container,data){
  container.replaceChildren();const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c141c);const camera=new THREE.PerspectiveCamera(55,1,.01,20);camera.position.set(1.8,1.35,2.6);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.2;controls.maxDistance=10;
  const group=new THREE.Group();group.rotation.x=Math.PI;scene.add(group); // COLMAP camera coordinates: Y down, initial view only; orientation not surveyed.
  const geometry=(vertices,colors)=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));if(colors?.length===vertices.length)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors.flat().map(x=>x/255),3));return geo;};
  const points=geometry(data.points,data.colors);group.add(new THREE.Points(points,new THREE.PointsMaterial({size:.012,color:0x94cbbf,vertexColors:!!points.attributes.color,transparent:true,opacity:.9})));
  if(data.vertices?.length&&data.triangles?.length){const mesh=geometry(data.vertices,data.mesh_colors);mesh.setIndex(data.triangles.flat());mesh.computeVertexNormals();group.add(new THREE.Mesh(mesh,new THREE.MeshBasicMaterial({color:mesh.attributes.color?0xffffff:0x92a7b5,vertexColors:!!mesh.attributes.color,side:THREE.DoubleSide,transparent:true,opacity:.78})));}
  const resize=()=>{const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(container);resize();renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  return ()=>{renderer.setAnimationLoop(null);ro.disconnect();controls.dispose();group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();renderer.domElement.remove();};
}
