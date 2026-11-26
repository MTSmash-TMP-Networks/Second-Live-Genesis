// Independent of WebGL: a valid admin account can recover a failed renderer.
const $=id=>document.getElementById(id);
const panel=$('updater'),check=$('update-check'),install=$('update-install'),reload=$('update-reload');
const openers=[$('update-open-welcome'),$('update-open-phone')];
let timer=null,latest=null,pending=null,busy=false,pollActive=false,epoch=0,accessEpoch=0,allowed=false,villageImporting=false;
const activeStates=new Set(['queued','checking','downloading','building','switching','rollback']);
const labels={idle:'Bereit / aktuell',available:'Update verfügbar',queued:'Auftrag eingereiht',checking:'GitHub wird geprüft',downloading:'Quellcode wird geladen',building:'Docker-Image wird gebaut',switching:'Container wird aktualisiert',rollback:'Vorheriges Image wird gestartet',rolled_back:'Vorherige Version wiederhergestellt',success:'Update installiert',error:'Update fehlgeschlagen',offline:'Host-Updater nicht erreichbar',disabled:'Nicht eingerichtet'};
const api=async(path,body)=>{
  const token=$('token').value||sessionStorage.getItem('second_live_token')||'';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const res=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{...(token?{'X-SecondLive-Token':token}:{}),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    const data=await res.json();if(!res.ok){const e=Error(data.error||`HTTP ${res.status}`);e.status=res.status;throw e;}return data;
  }finally{clearTimeout(timeout);}
};
function syncVillageImport(){
  $('village-asset-upload').disabled=!allowed||busy||villageImporting||!$('village-asset-file').files?.length;
}
async function refreshVillageAssets(){
  if(!allowed||villageImporting)return;
  try{
    const r=await fetch('/assets/village/manifest.json',{cache:'no-store',credentials:'same-origin'});
    if(!r.ok)throw Error('HTTP '+r.status);
    const models=await r.json();
    if(!villageImporting)$('village-asset-status').textContent=models.length+' / 4 Gebäudemodelle installiert.';
  }catch(e){if(!villageImporting)$('village-asset-status').textContent='Modellbestand nicht verfügbar.';}
}
async function importVillageAssets(){
  const file=$('village-asset-file').files?.[0];
  if(!allowed||busy||villageImporting||panel.hidden||!file)return;
  const status=$('village-asset-status');
  if(!file.name.toLowerCase().endsWith('.zip')||!file.size||file.size>24*1024*1024){status.textContent='Bitte das vorbereitete Modell-ZIP bis 24 MiB wählen.';return;}
  villageImporting=true;syncVillageImport();check.disabled=install.disabled=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),120000);
  try{
    status.textContent='Modelle werden übertragen und geprüft …';
    const token=$('token').value||sessionStorage.getItem('second_live_token')||'';
    const r=await fetch('/api/admin/village-assets',{method:'POST',body:file,credentials:'same-origin',signal:controller.signal,headers:{...(token?{'X-SecondLive-Token':token}:{}),'Content-Type':'application/zip'}});
    const result=await r.json();if(!r.ok)throw Error(result.error||'HTTP '+r.status);
    $('village-asset-file').value='';
    status.textContent=result.models.length+' Modelle installiert. Spiel neu laden, um die Originalgebäude zu sehen.';
    $('village-asset-reload').hidden=false;
  }catch(e){status.textContent='Import nicht abgeschlossen: '+e.message;}
  finally{clearTimeout(timeout);villageImporting=false;syncVillageImport();await poll();}
}
$('village-asset-file').addEventListener('change',syncVillageImport);
$('village-asset-upload').addEventListener('click',importVillageAssets);
$('village-asset-reload').addEventListener('click',()=>location.reload());
function show(data){
  latest=data.latest||null;
  const state=data.state||'offline';busy=activeStates.has(state);
  $('update-phase').textContent=labels[state]||state;
  $('update-message').textContent=data.message||'';
  $('update-current').textContent=data.current==='local'?'Lokaler Build':(data.current||'–');
  $('update-latest').textContent=latest||'–';
  check.disabled=!allowed||busy||villageImporting||['offline','disabled'].includes(state);
  install.disabled=!allowed||busy||villageImporting||state!=='available'||!latest;
  syncVillageImport();
  reload.hidden=state!=='success';
  if(state==='success'&&pending===data.current){pending=null;$('update-message').textContent='Update erfolgreich. Mit „Spiel neu laden“ wechselst du zur neuen Version.';}
  if(['error','rolled_back'].includes(state))pending=null;
}
function close(){
  panel.hidden=true;latest=null;busy=false;epoch++;
  if(timer!==null){clearInterval(timer);timer=null;}
  check.disabled=install.disabled=true;reload.hidden=true;
  $('update-current').textContent=$('update-latest').textContent='–';
  $('update-phase').textContent='Systemstatus';$('update-message').textContent='Status wird abgerufen.';
}
function setAccess(on){
  allowed=on===true;
  for(const button of openers)button.hidden=!allowed;
  if(!allowed){pending=null;close();}
  syncVillageImport();
}
async function refreshAccess(){
  const id=++accessEpoch;
  // Never trust a nickname, browser event or locally stored role.
  try{const data=await api('/api/update/status');if(id!==accessEpoch)return;setAccess(true);if(!panel.hidden)show(data);}
  catch(e){if(id!==accessEpoch)return;if(e.status===401||e.status===403||!allowed)setAccess(false);}
}
async function poll(){
  if(!allowed||panel.hidden||pollActive)return;
  pollActive=true;const currentEpoch=epoch;
  try{const data=await api('/api/update/status');if(!panel.hidden&&epoch===currentEpoch)show(data);}
  catch(e){
    if(!panel.hidden&&epoch===currentEpoch){
      if(e.status===401||e.status===403){accessEpoch++;setAccess(false);return;}
      $('update-phase').textContent='Verbindung';$('update-message').textContent=pending?'Spielserver startet neu oder ist vorübergehend nicht erreichbar. Status wird erneut abgerufen.':e.message;
      install.disabled=check.disabled=true;
    }
  }finally{pollActive=false;}
}
async function submit(body){
  if(!allowed||panel.hidden||busy||villageImporting)return;
  busy=true;check.disabled=install.disabled=true;const currentEpoch=++epoch;
  if(body.action==='install')pending=body.revision;
  try{await api('/api/update',body);if(currentEpoch===epoch&&!panel.hidden)show({state:'queued',latest,message:'Auftrag an den Docker-Host gesendet.'});}
  catch(e){
    if(currentEpoch!==epoch)return;
    if(e.status===401||e.status===403){accessEpoch++;setAccess(false);return;}
    pending=null;busy=false;$('update-message').textContent=e.message;
  }finally{await poll();}
}
function open(){if(!allowed)return;document.exitPointerLock?.();panel.hidden=false;check.disabled=install.disabled=true;if(timer===null)timer=setInterval(poll,2000);poll();refreshVillageAssets();}
for(const button of openers)button.addEventListener('click',open);
$('update-close').addEventListener('click',close);
check.addEventListener('click',()=>submit({action:'check'}));
install.addEventListener('click',()=>{if(latest&&confirm('Server-Update installieren? Das Spiel wird nach dem Build kurz neu gestartet.'))submit({action:'install',revision:latest});});
reload.addEventListener('click',()=>location.reload());
window.addEventListener('sl-account-change',()=>{accessEpoch++;setAccess(false);refreshAccess();});
window.addEventListener('focus',refreshAccess);
$('token').addEventListener('change',refreshAccess);
refreshAccess();
