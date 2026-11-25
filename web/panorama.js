// Guided fixed-position panorama capture. Sensor angles are estimates, never SLAM.
import {cameraStream,cameraError,pairOrigin,suggestPairOrigin} from './device-access.js';
import {frameMetric,difference} from './capture-quality.js';
import {angles,angleDiff,aligned} from './panorama-flow.js';
const $=id=>document.getElementById(id);
let token=sessionStorage.getItem('second_live_token')||'',protectedGame=false,profile=null,state=null,id=null,slot=0,ring='middle',stream=null,generation=0,timer=null,busy=false,orientation=null,zero=null,sensor=false,manual=false,steadySince=0,lastMetric=null,previewDispose=null,previewKey=null,previewEpoch=0;
let pair=new URLSearchParams(location.hash.slice(1)).get('pair');
if(pair&&isSecureContext)history.replaceState(null,'',location.pathname);
const rings={middle:[0,12],upper:[12,20],lower:[20,28],poles:[28,30]};
const names={middle:'Rundumsicht auf Augenhöhe',upper:'Oberer Bereich',lower:'Unterer Bereich',poles:'Direkt oben / unten'};
const current=()=>state?.stations.find(s=>s.id===id);
const frames=()=>new Map((current()?.frames||[]).map(f=>[f.slot,f]));
const allMiddle=s=>!!s&&Array.from({length:12},(_,i)=>i).every(i=>s.frames.some(f=>f.slot===i));
const say=t=>{$('status').textContent=t;};
const fail=e=>{$('error-text').textContent=e.message||String(e);$('error').hidden=false;};
$('dismiss').onclick=()=>{$('error').hidden=true;};
async function api(path,body){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(protectedGame?{'X-SecondLive-Token':token}:{})},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||r.status);return d;}
const request=(action,extra={})=>api('/api/capture',{action,...extra});
function clearPreview(){previewEpoch++;previewDispose?.();previewDispose=null;previewKey=null;$('pano-view').replaceChildren();}
function stopCamera(){generation++;clearTimeout(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;steadySince=0;lastMetric=null;}
function scrollToPanel(el){el.scrollIntoView({behavior:'auto',block:'start'});}
function nextSlot(){const [a,b]=rings[ring],saved=frames();return Array.from({length:b-a},(_,i)=>a+i).find(i=>!saved.has(i))??null;}
function selectRing(which){ring=which;slot=nextSlot();steadySince=0;lastMetric=null;$('source').hidden=true;render();}
function selectStation(sid,scroll=true){stopCamera();clearPreview();id=sid;zero=null;manual=!sensor;ring='middle';slot=nextSlot();$('source').hidden=true;render();if(scroll&&current())scrollToPanel(current().preview?$('preview-panel'):$('capture-panel'));}
function setState(s){state=s;if(!state.stations.some(x=>x.id===id)){const last=state.stations.at(-1);if(last)selectStation(last.id,false);else{id=null;stopCamera();clearPreview();}}render();}
const portrait=()=>!matchMedia('(orientation: landscape)').matches;
function pose(){if(!sensor||manual||!portrait()||zero===null||!orientation||performance.now()-orientation.time>2000)return null;return {...orientation,yaw:((orientation.yaw-zero)%360+360)%360};}
function isAligned(){const p=pose(),t=state?.targets[slot];return !!p&&!!t&&slot<28&&aligned(p,t);}
function guidance(){
 const target=state?.targets[slot],p=pose(),ok=isAligned();
 $('camera-box').classList.toggle('aligned',ok);
 $('sensor-status').textContent=sensor&&!portrait()?'Handy hochkant halten':p?'Sensor aktiv':sensor&&!manual?'Startrichtung ausrichten':'Manuelle Richtung';
 $('align').hidden=!sensor||manual||zero!==null;$('manual').hidden=!sensor||manual;
 $('auto').disabled=!p||slot===null||slot>=28;
 if(slot===null){$('instruction').textContent=ring==='middle'?'Rundumsicht aufgenommen. Erstelle das Panorama oder ergänze Boden und Decke.':'Dieser Bereich ist aufgenommen. Panorama neu erstellen.';$('camera-guide').textContent='Aufnahmebereich vollständig';$('snap').disabled=true;return;}
 const [yaw,pitch]=target;
 const tilt=pitch>=80?'direkt nach oben':pitch<=-80?'direkt nach unten':pitch>0?'nach oben neigen (ca. 50°)':pitch<0?'nach unten neigen (ca. 50°)':'auf Augenhöhe halten';
 $('instruction').textContent='Richtung '+yaw+'° · '+tilt+'. Bleibe am Aufnahmepunkt.';
 if(sensor&&!manual&&!portrait())$('camera-guide').textContent='Für die Sensorhilfe Handy hochkant halten.';
 else if(sensor&&!manual&&zero===null)$('camera-guide').textContent='Ersten Blick ausrichten und Startrichtung bestätigen.';
 else if(p&&slot<28){
   const dy=angleDiff(yaw,p.yaw),dp=pitch-p.pitch;
   $('camera-guide').textContent=ok?'Richtung passt – kurz ruhig halten':Math.abs(dy)>10?'Langsam '+(dy>0?'nach rechts':'nach links')+' drehen':Math.abs(dp)>10?'Handy '+(dp>0?'weiter nach oben':'weiter nach unten')+' neigen':'Handy gerade halten';
 }else $('camera-guide').textContent=slot>=28?'Steilen Blick manuell aufnehmen':'Drehe dich bis zur markierten Richtung. Foto manuell aufnehmen.';
 $('snap').disabled=busy||!stream||(!manual&&sensor&&slot<28&&!ok);
}
function render(){
 if(!state)return;
 const s=current(),saved=frames(),last=state.stations.at(-1),count=s?.frames.length||0;
 $('stations').replaceChildren(...state.stations.map(st=>{
   const b=document.createElement('button');b.type='button';b.disabled=busy;b.setAttribute('aria-pressed',String(st.id===id));
   const t=document.createElement('strong');t.textContent='Punkt '+st.ordinal;const v=document.createElement('small');v.textContent=st.preview?'Panorama bereit · '+st.frames.length+' Fotos':st.frames.length+' Fotos · offen';b.append(t,v);b.onclick=()=>selectStation(st.id);return b;
 }));
 $('step-options').hidden=!last;$('new-station').textContent=last?'Nächsten Aufnahmepunkt starten':'Ersten Aufnahmepunkt starten';
 $('new-station').disabled=busy||!$('consent').checked||!!(last&&!last.preview)||state.stations.length>=state.max_stations;
 $('setup-hint').textContent=last&&!last.preview?'Zuerst Punkt '+last.ordinal+' als Panorama erstellen.':'Standorte sind geschätzt; kein GPS nötig.';
 $('capture-panel').hidden=!s;$('preview-panel').hidden=!s?.preview;
 $('camera').hidden=!!stream;$('snap').hidden=$('pause').hidden=!stream;$('camera').disabled=busy||!isSecureContext;$('pause').disabled=busy;
 if(!s){clearPreview();return;}
 $('station-title').textContent='Aufnahmepunkt '+s.ordinal;$('station-count').textContent=saved.size+' / 30 Fotos';$('ring-title').textContent=names[ring];
 const [a,b]=rings[ring];
 $('ring').replaceChildren(...Array.from({length:b-a},(_,i)=>{const n=a+i,t=state.targets[n],el=document.createElement('button');el.type='button';el.disabled=busy;el.textContent=n>=28?(n===28?'Oben':'Unten'):t[0]+'°';el.classList.toggle('saved',saved.has(n));el.setAttribute('aria-pressed',String(n===slot));el.setAttribute('aria-label',el.textContent+(saved.has(n)?', gespeichert':', fehlt'));el.onclick=()=>{slot=n;steadySince=0;lastMetric=null;$('source').hidden=true;render();};return el;}));
 $('camera-placeholder').hidden=!!stream;
 $('build').disabled=busy||!allMiddle(s);$('build-hint').textContent=allMiddle(s)?'Rundumsicht bereit. Jetzt Vorschau erstellen; fehlende Flächen werden nicht ergänzt.':'Noch '+(12-[...saved.keys()].filter(k=>k<12).length)+' Blickrichtungen auf Augenhöhe fehlen.';
 $('show-source').disabled=busy||!saved.has(slot);$('remove-source').disabled=busy||!saved.has(slot);$('file').disabled=busy||slot===null;
 for(const name of ['upper','lower','middle','poles','sensor','align','manual','discard-point'])$(name).disabled=busy;
 $('delete-station').disabled=busy;$('rebuild').disabled=busy;$('reset-view').disabled=!previewDispose;$('next-station').disabled=busy||!last?.preview;
 if(s.preview){
   $('preview-number').textContent='Punkt '+s.ordinal;$('coverage').textContent='Horizont: '+s.horizontal+' % der Bildprojektion · Kugel: '+s.sphere+' %';
   $('prev').disabled=busy||!state.stations.some(t=>t.preview&&t.ordinal<s.ordinal);$('next').disabled=busy||!state.stations.some(t=>t.preview&&t.ordinal>s.ordinal);
   const key=s.id+':'+s.revision+':'+s.fov;
   if(key!==previewKey){$('fov').value=String(s.fov);void loadPreview(s,key);}
 }else if(previewKey||previewDispose)clearPreview();
 guidance();
}
async function loadPreview(s,key){clearPreview();previewKey=key;const epoch=previewEpoch;$('pano-view').textContent='Panorama wird geladen …';
 try{const d=await request('panorama_image',{id:s.id});if(epoch!==previewEpoch)return;const {renderPanorama}=await import('/engine/capture-view.bundle.js');if(epoch!==previewEpoch)return;const dispose=await renderPanorama($('pano-view'),d.image);if(epoch!==previewEpoch){dispose();return;}previewDispose=dispose;$('reset-view').disabled=false;}
 catch(e){if(epoch===previewEpoch){$('pano-view').textContent='Vorschau konnte nicht angezeigt werden. '+e.message;fail(e);}}
}
async function action(fn){if(busy)return;busy=true;$('error').hidden=true;render();try{await fn();}catch(e){fail(e);}finally{busy=false;render();}}
function createStation(){return action(async()=>{const result=await request('panorama_create',{distance:Number($('distance').value),bearing:Number($('bearing').value),consent:$('consent').checked});state=result;selectStation(result.id);say('Aufnahmepunkt angelegt. Kamera öffnen.');});}
$('consent').onchange=render;$('new-station').onclick=createStation;
$('next-station').onclick=()=>{stopCamera();render();scrollToPanel($('setup'));$('distance').focus();};
for(const name of Object.keys(rings))$(name).onclick=()=>selectRing(name);
$('sensor').onclick=async()=>{try{const ev=globalThis.DeviceOrientationEvent;if(!ev)throw Error('Kein Richtungssensor verfügbar. Manuelle Aufnahme verwenden.');if(typeof ev.requestPermission==='function'&&await ev.requestPermission()!=='granted')throw Error('Sensorfreigabe abgelehnt. Manuelle Aufnahme möglich.');
 if(!sensor){sensor=true;window.addEventListener('deviceorientation',e=>{const a=angles(e.alpha,e.beta,e.gamma);if(a)orientation={...a,time:performance.now()};guidance();});}manual=false;zero=null;render();}
 catch(e){manual=true;fail(e);render();}};
$('align').onclick=()=>{if(!orientation||performance.now()-orientation.time>2000||!portrait()){fail(Error('Noch keine aktuellen Sensordaten. Handy hochkant halten.'));return;}zero=orientation.yaw;steadySince=0;lastMetric=null;render();};
$('manual').onclick=()=>{manual=true;zero=null;steadySince=0;render();};
$('camera').onclick=()=>action(async()=>{const gen=++generation;const s=await cameraStream();if(gen!==generation||document.hidden){s.getTracks().forEach(t=>t.stop());return;}stream=s;const v=$('video');v.srcObject=s;v.muted=true;v.playsInline=true;try{await v.play();}catch(e){stopCamera();throw Error(cameraError(e));}if(gen!==generation||!stream)return;steadySince=0;lastMetric=null;tick(gen);});
$('pause').onclick=()=>{stopCamera();render();};
const sample=document.createElement('canvas');sample.width=96;sample.height=72;const ctx=sample.getContext('2d',{willReadFrequently:true});
function quality(v){ctx.drawImage(v,0,0,96,72);return frameMetric(ctx.getImageData(0,0,96,72).data,96,72);}
function jpeg(source,w,h){const c=document.createElement('canvas'),r=Math.min(1,1280/Math.max(w,h));c.width=Math.round(w*r);c.height=Math.round(h*r);if(Math.min(c.width,c.height)<160)throw Error('Bild zu klein');c.getContext('2d').drawImage(source,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.86);}
async function save(uri,p=null){
 const sid=id,n=slot;if(n===null||!current())return;
 await action(async()=>{const t=state.targets[n];const res=await request('panorama_frame',{id:sid,slot:n,photo:uri,source:p?'sensor':'manual',yaw:p?.yaw??t[0],pitch:p?.pitch??t[1],roll:p?.roll??0});
  state=res;$('capture-feedback').textContent='Richtung '+t[0]+'° gespeichert. Am gleichen Punkt bleiben.';slot=nextSlot();steadySince=0;lastMetric=null;$('source').hidden=true;say('Aufnahme gespeichert.');
 });
}
async function snap(){if(busy||!stream||slot===null)return;const v=$('video');if(!v.videoWidth||!v.videoHeight)return;const p=pose();if(sensor&&!manual&&slot<28&&!isAligned())return;await save(jpeg(v,v.videoWidth,v.videoHeight),slot<28&&isAligned()?p:null);}
$('snap').onclick=()=>snap().catch(fail);
async function tick(gen){
 if(gen!==generation||!stream)return;
 try{
  const v=$('video');if(!busy&&v.readyState>=2&&v.videoWidth&&slot!==null&&slot<28&&$('auto').checked&&!frames().has(slot)&&isAligned()){
   const q=quality(v),good=q.mean>30&&q.mean<230&&q.sharp>45&&difference(q.g,lastMetric?.g)<10;
   lastMetric=q;if(good){if(!steadySince)steadySince=performance.now();if(performance.now()-steadySince>650)await snap();}else steadySince=0;
  }else{steadySince=0;lastMetric=null;}
 }catch(e){fail(e);stopCamera();render();}
 finally{if(gen===generation&&stream)timer=setTimeout(()=>tick(gen),300);}
}
$('file').onchange=async()=>{const f=$('file').files[0];$('file').value='';if(!f||busy||slot===null)return;stopCamera();render();let url;try{url=URL.createObjectURL(f);const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('Bild nicht lesbar. Bitte JPEG verwenden.'));img.src=url;});await save(jpeg(img,img.naturalWidth,img.naturalHeight));}catch(e){fail(e);}finally{if(url)URL.revokeObjectURL(url);}};
$('show-source').onclick=()=>action(async()=>{const d=await request('panorama_image',{id,slot});$('source').src=d.image;$('source').hidden=false;});
$('remove-source').onclick=()=>action(async()=>{if(!confirm('Diese Aufnahme entfernen?'))return;state=await request('panorama_remove',{id,slot});$('source').hidden=true;});
async function build(){if(!allMiddle(current()))return;stopCamera();await action(async()=>{say('Panorama wird aus den gespeicherten Bildern zusammengesetzt …');state=await request('panorama_build',{id,fov:Number($('fov').value)});say('Panorama gespeichert. Du kannst dich rundum umsehen.');});if(current()?.preview)scrollToPanel($('preview-panel'));}
$('build').onclick=build;$('rebuild').onclick=build;
$('reset-view').onclick=()=>previewDispose?.reset?.();
$('prev').onclick=()=>{const st=state.stations.filter(s=>s.preview&&s.ordinal<current().ordinal).at(-1);if(st)selectStation(st.id);};
$('next').onclick=()=>{const st=state.stations.find(s=>s.preview&&s.ordinal>current().ordinal);if(st)selectStation(st.id);};
function deleteStation(){return action(async()=>{if(!confirm('Diesen Aufnahmepunkt und seine Fotos vollständig löschen?'))return;stopCamera();setState(await request('panorama_delete',{id}));say('Aufnahmepunkt gelöscht.');});}
$('delete-station').onclick=$('discard-point').onclick=deleteStation;
$('pair-address').value=suggestPairOrigin(location);
$('pair').onclick=()=>action(async()=>{const d=await request('pair',{address:pairOrigin($('pair-address').value),mode:'panorama'});$('pair-qr').src=d.qr;$('pair-link').href=d.url;$('pair-result').hidden=false;});
async function connect(){
 token=$('token').value||token;
 if(pair){if(!isSecureContext)throw Error('Handy-Kopplung benötigt HTTPS.');if(confirm('Dieses Gerät mit dem QR-Code-Spielstand koppeln?'))profile=await api('/api/session/pair',{code:pair});else profile=await api('/api/session',{});pair=null;}
 else profile=await api('/api/session',{});
 if(protectedGame)sessionStorage.setItem('second_live_token',token);
 $('auth').hidden=true;$('app').hidden=false;setState(await request('panorama_status'));say(isSecureContext?'Kamera bereit · privater Arbeitsbereich':'Live-Kamera benötigt HTTPS. Fotoimport bleibt möglich.');
}
$('connect').onclick=()=>connect().catch(fail);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();render();}});
window.addEventListener('resize',guidance);
window.addEventListener('pagehide',()=>{stopCamera();clearPreview();});
window.addEventListener('pageshow',e=>{if(e.persisted&&profile)request('panorama_status').then(setState).catch(fail);});
(async()=>{try{const h=await fetch('/api/health').then(r=>r.json());if(!h.world_capture)throw Error('World Capture ist auf diesem Server nicht aktiviert.');protectedGame=h.requires_game_token===true;$('token').value=token;if(protectedGame&&!token){$('auth').hidden=false;return;}await connect();}catch(e){if(protectedGame)$('auth').hidden=false;fail(e);}})();
