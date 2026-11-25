import {frameMetric,captureDecision,orientationSector} from './capture-quality.js';
import {defaultStage,allowedStage,taskHint} from './capture-flow.js';
import {pairOrigin,suggestPairOrigin,secureMessage,cameraStream,cameraError,locationFix} from './device-access.js';
const $=id=>document.getElementById(id);
let protectedGame=false,token=sessionStorage.getItem('second_live_token')||'',profile=null,current=null,stream=null,timer=null,pollTimer=null,uploading=false,generation=0,last=null,previous=null,lastTime=0,gpsValue=null,previewDispose=null,previewId=null,openingCamera=false,locating=false,importing=false,changing=false,stage=1,stageKey='',previewPending=null,previewAttempt=null,refreshVersion=0;
const pairParams=new URLSearchParams(location.hash.slice(1)),incomingPair=pairParams.get('pair');if(incomingPair){if(globalThis.isSecureContext)history.replaceState(null,'',location.pathname);if(pairParams.get('scope')==='shared')$('scope').value='shared';}let pairPending=incomingPair;
const captured=new Map();
let liveDispose=null,liveRevision=null,liveAttempt=null,livePending=null,liveEpoch=0;
function clearLive(){
  liveEpoch++;liveDispose?.();liveDispose=null;liveRevision=null;liveAttempt=null;livePending=null;
  $('live-empty').hidden=false;$('live-empty').textContent='Ab 4 Fotos';
}
function renderLive(s){
  const n=s?.frames?.length||0,l=s?.live||{},revision=l.revision,da3=l.kind==='da3_multiview',engine=s?.worker?.da3||{};
  const state=l.state||'waiting',connected=l.registered||0,total=l.source_count||0;
  $('engine-state').textContent=engine.status==='ready'?'DA3-Small · '+(engine.device||'CPU').toUpperCase():engine.status==='loading'?'DA3 wird geladen':engine.status==='error'?'DA3 nicht bereit · COLMAP-Fallback':'DA3 offline · COLMAP-Fallback';
  $('engine-state').dataset.ready=String(engine.status==='ready');
  $('live-info').dataset.state=state;
  $('live-count-3d').textContent=total?connected+' / '+total+(da3?' Ansichten konsistent':' Fotos verbunden'):'Noch keine 3D-Prüfung';
  let title='Erste Bilder aufnehmen',hint='Geh ein Stück seitlich und halte dieselben Details im Bild.';
  if(n<4)hint='Noch '+(4-n)+' Fotos bis zur ersten 3D-Prüfung. '+hint;
  else if(state==='running'){title=revision?'3D-Vorschau wird ergänzt':'Erste 3D-Vorschau entsteht';hint='Du kannst langsam weitergehen. Der Server prüft ausgewählte Ansichten.';}
  else if(state==='ready'){title=da3?'KI-3D-Vorschau vorhanden':'COLMAP-Punktwolke vorhanden';hint=connected<Math.ceil(total*.7)?'Einige Ansichten sind noch nicht ausreichend konsistent. Fotografiere dieselben Stellen aus leicht versetzten Positionen.':'Sieh dir das Modell an. Wenn wichtige Bereiche fehlen, gehe weiter; andernfalls kannst du abschließen.';if(n>(l.input_count||total))hint+=' Neue Bilder warten auf die nächste Berechnung.';}
  else if(state==='insufficient'){title='Weitere Blickwinkel nötig';hint='Mehr gemeinsame Bilddetails und seitliche Bewegung statt reiner Drehung. '+(revision?'Die letzte Vorschau bleibt sichtbar.':'Noch keine räumliche Vorschau vorhanden.');}
  else if(state==='error'){title='Live-Berechnung nicht verfügbar';hint=l.message||'Die Vorschau konnte nicht berechnet werden.';}
  else if(n>=4){title='Live-Berechnung wartet';hint=s?.worker?.online?'Fotos werden für die nächste Prüfung vorbereitet.':'Server-Worker noch nicht bereit; Fotos bleiben gespeichert.';}
  if(revision)hint+=' '+(l.point_count||0).toLocaleString('de-DE')+(da3?' KI-geschätzte':' triangulierte')+' 3D-Punkte in der letzten Vorschau.';
  if(l.warning)hint+=' '+l.warning;
  if(engine.status!=='ready'&&engine.status==='loading')hint+=' DA3-Modell wird geladen; COLMAP bleibt als Rückfall verfügbar.';
  $('live-state').textContent=title;$('live-advice').textContent=hint;
  $('live-review').textContent=total?connected+' von '+total+(da3?' ausgewählten Ansichten mit Tiefenübereinstimmung.':' Fotos räumlich verbunden.')+' Weitere Fotos sind ggf. noch nicht geprüft.':'Noch keine erfolgreiche räumliche Live-Prüfung vorhanden.';
  if(stage!==2||document.hidden||s?.status!=='capturing'||!s.mine){if(liveDispose||livePending)clearLive();return;}
  if(!revision){if(liveRevision||livePending)clearLive();$('live-empty').textContent=n<4?'Ab 4 Fotos':state==='running'?'3D wird berechnet …':state==='insufficient'?'Mehr Blickwinkel nötig':state==='error'?'Vorschau nicht verfügbar':'Warte auf 3D-Punkte';return;}
  if(liveRevision===revision||liveAttempt===revision||livePending)return;
  const id=s.id,epoch=liveEpoch;liveAttempt=revision;livePending=revision;
  (async()=>{
    try{
      const data=await request('live_preview',{id});
      if(epoch!==liveEpoch||stage!==2||current?.id!==id||current.live?.revision!==data.revision)return;
      const {renderPreview}=await import('/engine/capture-view.bundle.js');
      if(epoch!==liveEpoch||stage!==2||current?.id!==id||current.live?.revision!==data.revision)return;
      if(liveDispose)liveDispose.update(data);else liveDispose=renderPreview($('live-viewport'),data,{live:true});
      liveRevision=data.revision;liveAttempt=data.revision;$('live-empty').hidden=true;
    }catch(e){if(epoch===liveEpoch){$('live-empty').hidden=!!liveDispose;$('live-empty').textContent='3D-Vorschau nicht verfügbar';$('live-advice').textContent='Räumliche Berechnung läuft unabhängig von der Anzeige. '+(e.message||'');}}
    finally{if(epoch===liveEpoch){livePending=null;if(current?.live?.revision!==liveAttempt)renderLive(current);}}
  })();
}
$('live-expand').onclick=()=>{
  const expanded=$('live-model').classList.toggle('expanded');
  $('live-expand').setAttribute('aria-pressed',String(expanded));$('live-expand').textContent=expanded?'Verkleinern':'Vergrößern';liveDispose?.reset?.();
};
const stageTitles=[
  ['Deine Umgebung scannen','Erstelle aus Fotos eine 3D-Vorschau.'],
  ['Fotos aufnehmen','Bewege dich langsam und halte den Raum im Bild.'],
  ['Fotos prüfen','Wähle gute, unterschiedliche Perspektiven.'],
  ['Deine 3D-Rekonstruktion','Der Server setzt die Perspektiven zusammen.']
];
const isBusy=()=>uploading||importing||changing||locating;
function cameraUI(){const running=!!stream;$('camera-placeholder').hidden=running;$('camera').hidden=running;$('snap').hidden=$('pause').hidden=!running;$('live').textContent=running?'Kamera aktiv':openingCamera?'Kamera öffnet …':'Kamera aus';if(!running)$('guide-text').textContent=globalThis.isSecureContext?'Tippe auf „Kamera öffnen“ oder wähle Fotos aus der Galerie.':'Live-Kamera benötigt HTTPS. Galerie-Import ist weiterhin möglich.';}
function syncWizard(s,scroll=false){
  const key=[s?.scope,s?.id,s?.status,s?.mine].join('|');
  const old=stage;if(key!==stageKey){stageKey=key;stage=defaultStage(s);}
  if(!allowedStage(stage,s))stage=defaultStage(s);
  if(stage!==2&&(stream||openingCamera))stopCamera();
  if(stage!==4&&previewDispose){previewDispose();previewDispose=null;previewId=null;previewAttempt=null;}
  document.body.dataset.captureStage=String(stage);
  for(const el of document.querySelectorAll('[data-stage]'))el.hidden=Number(el.dataset.stage)!==stage;
  for(const el of document.querySelectorAll('[data-step]')){const n=Number(el.dataset.step);el.disabled=isBusy()||!allowedStage(n,s);if(n===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');}
  $('stage-title').textContent=stageTitles[stage-1][0];$('stage-subtitle').textContent=stageTitles[stage-1][1];
  $('gps-setup').hidden=$('scope').value!=='shared';
  const existing=defaultStage(s)>1;$('reserve').hidden=existing;$('resume-scan').hidden=!existing;$('resume-scan').disabled=isBusy();$('resume-scan').textContent=defaultStage(s)===4?'Zum 3D-Ergebnis / Status':'Scan fortsetzen';
  $('consent').disabled=existing||isBusy();
  if(scroll||old!==stage)window.scrollTo({top:0,behavior:'auto'});
  if(stage===4&&s?.preview&&previewId!==s.id&&previewAttempt!==s.id&&!previewPending)loadPreview().catch(fail);
  renderLive(s);
}
function goStage(n){if(isBusy()||!allowedStage(n,current))return;stage=n;if(current)render(current);else syncWizard(current);window.scrollTo({top:0,behavior:'auto'});}
for(const el of document.querySelectorAll('[data-step]'))el.onclick=()=>goStage(Number(el.dataset.step));
$('resume-scan').onclick=()=>goStage(defaultStage(current));$('to-review').onclick=()=>goStage(3);$('back-to-camera').onclick=()=>goStage(2);
$('preview-reset').onclick=()=>previewDispose?.reset?.();
const sample=document.createElement('canvas');sample.width=96;sample.height=72;const sampleCtx=sample.getContext('2d',{willReadFrequently:true});
const targets=[['Wände',[0,1]],['Boden',[3,6,11]],['Decke',[5,2]],['Fenster/Türen',[8,14]],['Möbel/Objekte',[7,10,15,17,18,19,23,24,28,30,33,35,44,64,85,89,146]]];
const colors=['#60bcd5','#9ae0aa','#e8d679','#e7a8e8','#f2b786','#9bc1fc'];
async function api(path,body){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(protectedGame?{'X-SecondLive-Token':token}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j;}
const request=(action,extra={})=>api('/api/capture',{action,scope:$('scope').value,...extra});
const fail=e=>{$('error-message').textContent=e.message||String(e);$('device-error').hidden=false;};
function clearError(){$('device-error').hidden=true;$('error-message').textContent='';}
$('dismiss-error').onclick=clearError;
function report(s){$('status').classList.remove('error-text');$('status').textContent=s;}
async function locate(){if(locating)throw Error('Standortabfrage läuft bereits.');locating=true;if(current)render(current);$('gps').disabled=true;clearError();$('gps-result').textContent='Standort wird ermittelt …';try{const fix=await locationFix(navigator,globalThis.isSecureContext,m=>$('gps-result').textContent=m);profile=await api('/api/capture/locate',{location:fix});gpsValue=fix;$('gps-result').textContent='Standort ermittelt · ±'+Math.round(fix.accuracy)+' m';showProfile();return gpsValue;}catch(e){$('gps-result').textContent='Standort nicht übernommen.';throw e;}finally{locating=false;if(current)render(current);else $('gps').disabled=false;}}
function showProfile(){$('home').textContent='Dein privater Startraum · '+profile.home.slice(0,8);$('region').textContent=profile.region?'Geografisches Startgebiet: '+profile.region+' · aktuelles Scangebiet: '+(profile.scan_region||profile.region):'Noch kein GPS-Startgebiet · privater Test möglich';$('pair').disabled=false;}
function stopCamera(){generation++;if(timer)clearTimeout(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('live').textContent='Standby';$('pause').disabled=true;$('snap').disabled=true;previous=null;last=null;lastTime=0;cameraUI();}
function active(){return current?.status==='capturing'&&current.mine;}
function render(s){const was=current?.id;if(!s.worker&&current?.worker)s={...s,worker:current.worker};current=s;if(was&&was!==s.id){stopCamera();clearLive();captured.clear();previewDispose?.();previewDispose=null;previewId=null;previewAttempt=null;}if(!active()&&(stream||openingCamera))stopCamera();
 $('worker').textContent=s.worker?.online?'Worker · '+s.worker.device:'Worker noch nicht bereit / offline';
 const labels={unexplored:'Noch nicht erzeugt – Scan möglich',capturing:s.mine?'Scanauftrag reserviert':'Anderer Spieler erfasst dieses Gebiet',queued:'Auftrag wartet auf Verarbeitung',processing:'3D-Rekonstruktion läuft',review:'Rekonstruktionsvorschau bereit',published:'Vorschau bestätigt · Scanner gesperrt',failed:'Weitere Perspektiven oder Fehlerprüfung erforderlich',needs_location:'Für ein gemeinsames Testgebiet zuerst den Standort bestimmen.',loading:'Scanbereich wird geprüft …'};
 report(labels[s.status]||s.status);const frames=s.frames||[];const n=frames.length;const locked=isBusy();
 $('reserve').disabled=s.status!=='unexplored'||!$('consent').checked||locked;$('scope').disabled=Boolean(stream)||locked;$('evaluation').disabled=s.status!=='unexplored'||locked;$('gps').disabled=Boolean(stream)||locked;
 $('camera').disabled=!active()||!!stream||openingCamera||locked||n>=60||!globalThis.isSecureContext;$('native-photo').disabled=!active()||locked||n>=60||!globalThis.isSecureContext;$('native-capture').disabled=$('native-photo').disabled;$('files').disabled=!active()||locked||n>=60;
 $('cancel').hidden=!s.mine||!['capturing','queued','failed','review','published'].includes(s.status);$('cancel').disabled=$('cancel').hidden||locked;
 $('cancel').textContent=s.status==='published'?'Vorschau und Fotos löschen':'Scan verwerfen';$('pause').disabled=!stream||locked;$('snap').disabled=!stream||locked||n>=60;const minimum=s.live?.kind==='da3_multiview'&&s.live?.registered>=2?4:8;const da3Good=s.live?.kind==='da3_multiview'&&s.live?.registered>=2&&s.worker?.da3?.status==='ready';$('submit').disabled=!active()||n<minimum||locked;$('finish-scan').disabled=!active()||locked||!(da3Good||n>=8&&s.live?.registered>=3);$('to-review').disabled=!active()||locked||n===0;$('back-to-camera').disabled=!active()||locked;
 $('progress').value=n;$('count').textContent=n+' / 60';$('live-progress').max=16;$('live-progress').value=Math.min(16,n);$('live-count').textContent=n+' '+(n===1?'Foto':'Fotos')+' gespeichert';$('capture-task').textContent=da3Good?'Prüfe die sichtbare 3D-Vorschau. Gehe weiter, wenn Bereiche fehlen.':taskHint(n);
 $('review-hint').textContent=da3Good?'DA3-Vorschau verfügbar: Jetzt abschließen oder weitere Bereiche aufnehmen.':n>=60?'Speichergrenze erreicht. Prüfe und entferne ungeeignete Fotos.':n<4?'Erste Vorschau ab 4 Fotos.':'Warte auf die räumliche Vorschau. Mehr Bilder sind nicht automatisch besser.';
 $('jobs').textContent=s.message||'';cameraUI();
 const seen=new Set();let newest=null,semError=null;for(const f of frames){for(const cls of f.analysis?.classes||[])seen.add(cls.id);if(f.analysis?.mask)newest=f;if(f.analysis?.semantic_error)semError=f.analysis.semantic_error;}
 $('checklist').replaceChildren(...targets.map(([name,ids])=>{const el=document.createElement('span');const ok=ids.some(id=>seen.has(id));el.textContent=name+' · '+(ok?'erkannt':'noch nicht erkannt');if(ok)el.className='seen';return el;}));
 $('coverage').textContent=n<minimum?'Noch '+(minimum-n)+' unterschiedliche Fotos bis zur Abschlussberechnung.':da3Good?'DA3 hat eine Vorschau erzeugt. Prüfe die Ansichten oder schließe ab.':'Die Anzahl allein garantiert kein gutes Modell. Prüfe die 3D-Rückmeldung.';
 if(s.evaluation&&seen.size){const missing=targets.filter(t=>!t[1].some(id=>seen.has(id))).map(t=>t[0]);if(missing.length)$('coverage').textContent+=' Noch nicht erkannt: '+missing.join(', ')+'. (Keine echte 3D-Abdeckung.)';}
 const signature=JSON.stringify([s.id,s.status,s.live?.revision,frames.map(f=>[f.id,f.status])]);if(signature!==frameSignature){frameSignature=signature;$('frames').replaceChildren(...frames.map((f,i)=>{const el=document.createElement('div');el.className='frame-card '+f.status;const img=document.createElement('img');img.src='/api/capture/photo/'+s.id+'/'+f.id;img.alt='Aufnahme '+(i+1);img.loading='lazy';el.append(img);const label=document.createElement('span');label.textContent=(i+1)+' · '+({done:'geprüft',pending:'wartet',processing:'KI',error:'Fehler'}[f.status]||f.status);el.append(label);if(s.live){const link=document.createElement('span'),included=s.live.frame_ids?.includes(f.id),linked=s.live.registered_ids?.includes(f.id);link.className=linked?'linked':included?'unlinked':'muted';link.textContent=linked?(s.live.kind==='da3_multiview'?'KI: Tiefe konsistent':'3D: verbunden'):included?'3D: unzureichend':'3D: nicht ausgewählt/ungeprüft';el.append(link);}if(active()){const del=document.createElement('button');del.type='button';del.textContent='Entfernen';del.onclick=async()=>{if(isBusy())return;stopCamera();changing=true;render(current);try{await request('remove_frame',{id:s.id,frame:f.id});captured.delete(f.id);lastMask=null;}catch(e){fail(e);}finally{changing=false;await refresh().catch(fail);}};el.append(del);}return el;}));}
 if(newest)showAnalysis(newest);else if(lastMask){lastMask=null;$('mask').getContext('2d').clearRect(0,0,320,240);$('classes').replaceChildren();}if(!newest&&semError)$('mask-note').textContent='KI-Modell nicht verfügbar: '+semError;else if(!newest&&!s.evaluation)$('mask-note').textContent='Semantischer Evaluationstest nicht aktiviert. Die 3D-Berechnung bleibt verfügbar.';
 $('processing-panel').hidden=!['queued','processing'].includes(s.status)||!s.mine;
 const done=frames.filter(f=>['done','error'].includes(f.status)).length;
 $('processing-title').textContent=s.status==='queued'?'Fotos werden vorbereitet':'3D-Modell wird berechnet';
 $('processing-text').textContent=s.status==='queued'?(s.worker?.online?'Der Server prüft deine Aufnahmen und wartet auf einen freien Rechenplatz.':'Der Rekonstruktionsdienst ist noch nicht bereit. Dein Auftrag bleibt in der Warteschlange.'):'Der Server berechnet räumliche Punkte und geschätzte Oberflächen mit DA3 oder COLMAP. Es gibt derzeit keine genaue Restzeit.';
 $('processing-frames').textContent=s.status==='queued'?done+' von '+n+' Fotos verarbeitet':n+' Fotos im Rekonstruktionsauftrag';
 if(s.status==='queued'&&done<n){$('processing-progress').max=Math.max(1,n);$('processing-progress').value=done;}else $('processing-progress').removeAttribute('value');
 $('result').hidden=!['review','failed','published'].includes(s.status)||(!s.mine&&!s.preview);
 $('publish').hidden=!s.mine||s.status!=='review';$('publish').disabled=$('publish').hidden||locked||previewId!==s.id;
 $('retry').hidden=!s.mine||s.status!=='failed';$('retry').disabled=$('retry').hidden||locked;
 $('preview-area').hidden=!s.preview;$('load-preview').disabled=!s.preview||!!previewPending;$('preview-reset').disabled=previewId!==s.id;
 $('result-title').textContent=s.status==='failed'?'Die Fotos konnten nicht vollständig verbunden werden':s.status==='published'?'Deine gespeicherte 3D-Vorschau':'Deine 3D-Vorschau ist bereit';
 $('result-explanation').textContent=s.status==='failed'?'Nimm weitere Fotos von denselben Stellen aus seitlich versetzten Positionen auf. Achte auf Licht, Schärfe und gemeinsame Bilddetails.':s.status==='published'?'Diese Vorschau wurde bestätigt.':'Drehe und zoome das Modell. Bestätige es erst, wenn die Vorschau für dich brauchbar ist.';
 if(previewId!==s.id&&!previewPending&&previewAttempt!==s.id)$('result-info').textContent=s.preview?'Die Vorschau wird geladen.':s.message||'';
 if(!s.preview&&previewDispose){previewDispose();previewDispose=null;previewId=null;previewAttempt=null;}
 if(n>=60&&stream)stopCamera();
 for(const b of $('frames').querySelectorAll('button'))b.disabled=locked;
 syncWizard(s);

}
let lastMask=null,frameSignature=null;
function showAnalysis(frame){if(lastMask===frame.id)return;lastMask=frame.id;const result=frame.analysis,mask=result.mask,c=$('mask'),ctx=c.getContext('2d');const draw=()=>{ctx.clearRect(0,0,c.width,c.height);const pic=captured.get(frame.id);if(pic?.complete&&pic.naturalWidth)ctx.drawImage(pic,0,0,c.width,c.height);else{ctx.fillStyle='#13202a';ctx.fillRect(0,0,c.width,c.height);}const sx=c.width/mask.width,sy=c.height/mask.height;ctx.globalAlpha=pic?.complete&&pic.naturalWidth ? .48 : .9;for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){ctx.fillStyle=colors[mask.labels[y*mask.width+x]%colors.length];ctx.fillRect(x*sx,y*sy,Math.ceil(sx),Math.ceil(sy));}ctx.globalAlpha=1;};let pic=captured.get(frame.id);if(!pic){pic=new Image();pic.src='/api/capture/photo/'+current.id+'/'+frame.id;captured.set(frame.id,pic);}if(!pic.complete)pic.addEventListener('load',draw,{once:true});draw();$('classes').replaceChildren(...result.classes.map(cls=>{const e=document.createElement('span');e.textContent=cls.label+' '+Math.round(cls.coverage*100)+' % Bildfläche';return e;}));$('mask-note').textContent='KI-Segmentierung von Aufnahme '+(current.frames.findIndex(f=>f.id===frame.id)+1)+' · Klassifikation, keine gemessene 3D-Abdeckung.';}
async function refresh(){
  if(!profile)return;const scope=$('scope').value,version=++refreshVersion;
  if(scope==='shared'&&!profile.scan_region){stopCamera();render({scope,status:'needs_location',mine:false,frames:[],preview:false});return;}
  const s=await request('status');if(version===refreshVersion&&scope===$('scope').value)render(s);
}
async function poll(){try{if(!isBusy())await refresh();}catch(e){fail(e);}finally{pollTimer=setTimeout(poll,2000);}}
let heading=null,headingOrigin=null,directionSeen=new Set(),orientationEnabled=false;
function updateDirections(){const sector=orientationSector(heading,headingOrigin);$('directions').replaceChildren(...Array.from({length:8},(_,i)=>{const e=document.createElement('span');e.textContent=i*45+'°';if(directionSeen.has(i))e.classList.add('seen');if(i===sector)e.classList.add('current');return e;}));}
$('orientation').onclick=async()=>{try{const ev=globalThis.DeviceOrientationEvent;if(!ev)throw Error('Gerätesensor nicht verfügbar');if(typeof ev.requestPermission==='function'&&await ev.requestPermission()!=='granted')throw Error('Sensorfreigabe abgelehnt');if(!orientationEnabled){orientationEnabled=true;window.addEventListener('deviceorientation',e=>{const a=Number.isFinite(e.webkitCompassHeading)?e.webkitCompassHeading:e.alpha;if(!Number.isFinite(a))return;heading=a;if(headingOrigin===null)headingOrigin=a;$('directions').hidden=false;$('direction-note').hidden=false;updateDirections();});}$('orientation').textContent='Richtungshilfe aktiv (Sensor)';}catch(e){fail(e);}};
function metric(video){sampleCtx.drawImage(video,0,0,96,72);return frameMetric(sampleCtx.getImageData(0,0,96,72).data,96,72);}
function photoFrom(source,w,h){const c=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(w,h));c.width=Math.max(1,Math.round(w*ratio));c.height=Math.max(1,Math.round(h*ratio));c.getContext('2d').drawImage(source,0,0,c.width,c.height);let uri=c.toDataURL('image/jpeg',.86);if(uri.length>2700000)uri=c.toDataURL('image/jpeg',.70);return uri;}
async function savePhoto(uri){if(!active()||uploading)return false;const id=current.id,gen=generation;uploading=true;render(current);$('capture-feedback').textContent='Foto wird gespeichert …';try{const result=await request('frame',{id,photo:uri});if(current?.id===id&&!result.duplicate){const img=new Image();img.src=uri;captured.set(result.id,img);if(captured.size>10)captured.delete(captured.keys().next().value);$('guide-text').textContent='Foto gespeichert – jetzt seitlich weitergehen.';$('capture-feedback').textContent='Foto gespeichert. Gehe zur nächsten Perspektive.';const sector=orientationSector(heading,headingOrigin);if(sector!==null){directionSeen.add(sector);updateDirections();}}if(result.duplicate)$('capture-feedback').textContent='Dieses Foto ist schon vorhanden. Bitte den Blickwinkel ändern.';return !result.duplicate;}catch(e){fail(e);$('capture-feedback').textContent='Foto konnte nicht gespeichert werden. Bitte erneut versuchen.';if(current?.id===id&&generation===gen)stopCamera();return false;}finally{uploading=false;try{await refresh();}catch(e){fail(e);}}}
async function captureNow(){const v=$('video');if(!stream||!v.videoWidth||!active()||uploading)return;const m=metric(v);if(await savePhoto(photoFrom(v,v.videoWidth,v.videoHeight))){last=m.g;lastTime=performance.now();}}
async function tick(gen){if(gen!==generation||!stream||!active())return;try{const v=$('video');if(v.readyState>=2&&v.videoWidth){const m=metric(v),d=captureDecision(m,previous,last,performance.now()-lastTime);previous=m.g;$('quality').textContent='Helligkeit '+Math.round(m.mean)+' / 255 · Schärfe '+Math.round(m.sharp)+' · Bildänderung '+Math.round(d.novelty===999?0:d.novelty)+' (2D-Heuristik)';$('guide-text').textContent=d.eligible?($('auto').checked?'Kurz halten – Foto wird aufgenommen.':'Guter Moment: Jetzt Foto aufnehmen.'):d.hint==='Perspektive geeignet'?($('auto').checked?'Kurz ruhig halten – nächste Aufnahme folgt.':'Guter Blickwinkel – tippe auf Foto aufnehmen.'):d.hint;if(d.eligible&&$('auto').checked&&!uploading){if(await savePhoto(photoFrom(v,v.videoWidth,v.videoHeight))){last=m.g;lastTime=performance.now();}}}}catch(e){fail(e);stopCamera();}finally{if(gen===generation&&stream)timer=setTimeout(()=>tick(gen),450);}}
async function openCamera(){
 if(!active())throw Error('Zuerst einen freien Scanauftrag starten.');if(openingCamera||stream||isBusy()||current.frames.length>=60)return;clearError();openingCamera=true;$('camera').disabled=true;cameraUI();const gen=++generation;
 try{const s=await cameraStream();if(gen!==generation||!active()||document.hidden){s.getTracks().forEach(t=>t.stop());return;}stream=s;const v=$('video');v.muted=true;v.playsInline=true;v.srcObject=s;try{await v.play();}catch(e){throw Error(cameraError(e));}if(gen!==generation||!stream||!active()||document.hidden)return;cameraUI();$('pause').disabled=false;$('snap').disabled=false;previous=null;lastTime=performance.now();tick(gen);}
 finally{openingCamera=false;if(current)render(current);}
}
async function loadPreview(){
  const id=current?.id;if(!id||!current.preview||stage!==4||previewPending)return;previewAttempt=id;previewPending=id;
  $('load-preview').disabled=true;$('result-info').textContent='3D-Vorschau wird geladen …';$('preview-reset').disabled=true;
  try{
    const data=await request('preview',{id});if(current?.id!==id||stage!==4)return;
    const {renderPreview}=await import('/engine/capture-view.bundle.js');if(current?.id!==id||stage!==4)return;
    previewDispose?.();previewDispose=null;previewId=null;
    previewDispose=renderPreview($('preview'),data);previewId=id;
    $('result-info').textContent=(data.kind==='da3_multiview'?'DA3-Small · KI-Schätzung: ':'COLMAP: ')+(data.triangles?.length?'Punktwolke mit geschätzten Oberflächen':'Räumliche Punktwolke ohne geschlossene Oberflächen')+' · '+data.registered+' / '+(data.total_frames||'?')+(data.kind==='da3_multiview'?' ausgewählte Ansichten konsistent':' Fotos verbunden')+' · '+data.points.length+' 3D-Punkte. '+(data.warnings||[]).join(' ');
    $('load-preview').textContent='Vorschau neu laden';
  }catch(e){previewAttempt=id;previewId=null;$('result-info').textContent='Vorschau konnte nicht angezeigt werden. Bitte erneut laden (WebGL prüfen).';throw e;}
  finally{previewPending=null;if(current?.id===id){$('load-preview').disabled=false;$('preview-reset').disabled=previewId!==id;$('publish').disabled=!current.mine||current.status!=='review'||previewId!==id||isBusy();}if(current?.id!==id||stage!==4){previewAttempt=null;}}
}
async function connect(){token=$('token').value||token;if(pairPending){if(!globalThis.isSecureContext)throw Error(secureMessage()+' Erzeuge danach einen neuen HTTPS-QR-Code.');const code=pairPending;pairPending=null;if(confirm('Dieses Gerät mit dem Startraum des QR-Codes koppeln? Eine bisherige Gast-Sitzung auf diesem Gerät wird ersetzt.'))profile=await api('/api/session/pair',{code});else profile=await api('/api/session',{});}else profile=await api('/api/session',{});if(protectedGame)sessionStorage.setItem('second_live_token',token);$('auth').hidden=true;showProfile();await refresh();if(!pollTimer)pollTimer=setTimeout(poll,2000);}
$('connect').onclick=()=>connect().catch(fail);$('gps').onclick=()=>locate().then(refresh).catch(fail);$('consent').onchange=()=>{$('reserve').disabled=current?.status!=='unexplored'||!$('consent').checked||isBusy();};$('scope').onchange=()=>{refreshVersion++;stageKey='';stopCamera();directionSeen.clear();headingOrigin=heading;updateDirections();previewDispose?.();previewDispose=null;previewId=null;previewAttempt=null;lastMask=null;captured.clear();$('mask').getContext('2d').clearRect(0,0,320,240);changing=true;render({scope:$('scope').value,status:'loading',mine:false,frames:[],preview:false});refresh().catch(fail).finally(()=>{changing=false;if(current)render(current);});};
$('reserve').onclick=async()=>{if(!$('consent').checked||isBusy()||current?.status!=='unexplored')return;changing=true;refreshVersion++;render(current);try{let location=null;if($('scope').value==='shared')location=await locate();render(await request('reserve',{location,evaluation:$('evaluation').checked,consent:true}));}catch(e){fail(e);}finally{changing=false;await refresh().catch(fail);}};
$('camera').onclick=()=>openCamera().catch(e=>{stopCamera();$('camera').disabled=!active()||!globalThis.isSecureContext;fail(e);document.querySelector('.camera details').open=true;});$('pause').onclick=()=>{stopCamera();refresh().catch(fail);};$('snap').onclick=()=>captureNow().catch(fail);
async function photoSource(file){
 if(typeof createImageBitmap==='function'){try{const b=await createImageBitmap(file);return {source:b,width:b.width,height:b.height,close:()=>b.close()};}catch{}}
 const url=URL.createObjectURL(file);try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Bildformat nicht lesbar. Bitte JPEG aufnehmen oder exportieren.'));img.src=url;});return {source:img,width:img.naturalWidth,height:img.naturalHeight,close:()=>URL.revokeObjectURL(url)};}catch(e){URL.revokeObjectURL(url);throw e;}
}
async function importPhotos(input){
  const list=[...input.files];input.value='';if(!list.length||isBusy()||!active())return;stopCamera();clearError();importing=true;render(current);
  let i=0;
  try{for(const file of list){if(!active()||current.frames.length>=60)break;$('capture-feedback').textContent='Importiere Foto '+(++i)+' von '+list.length+' …';try{const b=await photoSource(file);let uri;try{uri=photoFrom(b.source,b.width,b.height);}finally{b.close();}await savePhoto(uri);}catch(e){fail(e);break;}}}
  finally{importing=false;await refresh().catch(fail);}
}
$('files').onchange=()=>importPhotos($('files')).catch(fail);
$('native-photo').onclick=()=>{if(!active()||isBusy()||!globalThis.isSecureContext)return;stopCamera();$('native-capture').click();};$('native-capture').onchange=()=>importPhotos($('native-capture')).catch(fail);
for(const [button,action] of [['submit','submit'],['finish-scan','submit'],['publish','publish'],['cancel','cancel'],['retry','retry']])$(button).onclick=async()=>{
  if(isBusy()||!current?.id||$(button).disabled)return;
  if(action==='publish'&&current.scope==='shared'&&!confirm('Nur farblose 3D-Geometrie mit anderen Testspielern teilen? Keine privaten Räume veröffentlichen.'))return;
  if(action==='cancel'&&!confirm('Scanauftrag mit Fotos und Vorschau löschen und Gebiet wieder freigeben?'))return;
  stopCamera();changing=true;refreshVersion++;render(current);
  try{await request(action,{id:current.id});}catch(e){fail(e);}finally{changing=false;await refresh().catch(fail);}
};
$('pair-address').value=suggestPairOrigin(location);$('pair').onclick=async()=>{clearError();$('pair-result').hidden=true;try{const address=pairOrigin($('pair-address').value);const p=await request('pair',{address});$('pair-qr').src=p.qr;$('pair-link').href=p.url;$('pair-result').hidden=false;$('pair-target').textContent=new URL(p.url).origin;report('Kopplungscode erstellt – 5 Minuten gültig.');}catch(e){fail(e);}};
$('load-preview').onclick=()=>loadPreview().catch(fail);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();clearLive();}else if(!isBusy())refresh().catch(fail);});window.addEventListener('pagehide',()=>{stopCamera();clearTimeout(pollTimer);clearLive();previewDispose?.();});
$('connection-status').textContent=globalThis.isSecureContext?'Sicherer Browserkontext · '+location.origin:'Unsichere Verbindung · '+location.origin;$('https-help').hidden=Boolean(globalThis.isSecureContext);if(!globalThis.isSecureContext){$('connection-status').classList.add('error-text');$('connection').open=true;document.querySelector('.camera details').open=true;}
(async()=>{try{const yes=await navigator.xr?.isSessionSupported?.('immersive-ar');$('ar-status').textContent=yes?'WebXR-AR erkannt; Kamera nutzt derzeit 2D-Modus.':'Geführter Kamera-Modus (kein natives AR).';}catch(e){$('ar-status').textContent='Geführter Kamera-Modus';}})();
(async()=>{try{const h=await fetch('/api/health').then(r=>r.json());if(!h.world_capture)throw Error('World Capture benötigt Server 0.7.0.');protectedGame=h.requires_game_token===true;$('token').value=token;if(protectedGame&&!token){$('auth').hidden=false;return;}await connect();}catch(e){if(protectedGame)$('auth').hidden=false;fail(e);}})();
