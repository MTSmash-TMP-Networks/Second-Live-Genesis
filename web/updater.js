// Independent of WebGL: server updates remain accessible even if rendering fails.
const $=id=>document.getElementById(id);
const panel=$('updater'), input=$('update-token'), check=$('update-check'), install=$('update-install'), reload=$('update-reload');
let timer=null, latest=null, pending=null, busy=false, pollActive=false, epoch=0;
const activeStates=new Set(['queued','checking','downloading','building','switching','rollback']);
const labels={idle:'Bereit / aktuell',available:'Update verfügbar',queued:'Auftrag eingereiht',checking:'GitHub wird geprüft',downloading:'Quellcode wird geladen',building:'Docker-Image wird gebaut',switching:'Container wird aktualisiert',rollback:'Vorheriges Image wird gestartet',rolled_back:'Vorherige Version wiederhergestellt',success:'Update installiert',error:'Update fehlgeschlagen',offline:'Host-Updater nicht erreichbar',disabled:'Nicht eingerichtet'};
const api=async(path,body)=>{
  const res=await fetch(path,{cache:'no-store',headers:{'X-SecondLive-Admin':input.value.trim(),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;
};
function show(data){
  latest=data.latest||null;
  const state=data.state||'offline';busy=activeStates.has(state);
  $('update-phase').textContent=labels[state]||state;
  $('update-message').textContent=data.message||'';
  $('update-current').textContent=data.current==='local'?'Lokaler Build':(data.current||'–');
  $('update-latest').textContent=latest||'–';
  check.disabled=busy||['offline','disabled'].includes(state);
  install.disabled=busy||state!=='available'||!latest;
  reload.hidden=state!=='success';
  if(state==='success'&&pending===data.current){pending=null;$('update-message').textContent='Update erfolgreich. Mit „Spiel neu laden“ wechselst du zur neuen Version.';}
  if(['error','rolled_back'].includes(state))pending=null;
}
async function poll(){
  if(panel.hidden||pollActive||input.value.trim().length<32)return;
  pollActive=true;const currentEpoch=epoch;
  try{const data=await api('/api/update/status');if(!panel.hidden&&epoch===currentEpoch)show(data);}
  catch(e){if(!panel.hidden&&epoch===currentEpoch){$('update-phase').textContent='Verbindung / Anmeldung';$('update-message').textContent=pending?'Spielserver startet neu oder ist vorübergehend nicht erreichbar. Status wird erneut abgerufen.':e.message;install.disabled=true;check.disabled=!!pending;}}
  finally{pollActive=false;}
}
async function submit(body){
  if(busy||input.value.trim().length<32)return;
  busy=true;check.disabled=install.disabled=true;epoch++;
  if(body.action==='install')pending=body.revision;
  try{await api('/api/update',body);show({state:'queued',latest,message:'Auftrag an den Docker-Host gesendet.'});}
  catch(e){pending=null;busy=false;$('update-message').textContent=e.message;check.disabled=false;}
  finally{await poll();}
}
function open(){document.exitPointerLock?.();panel.hidden=false;input.focus();if(timer===null)timer=setInterval(poll,2000);poll();}
function close(){panel.hidden=true;input.value='';latest=null;busy=false;epoch++;if(timer!==null){clearInterval(timer);timer=null;}check.disabled=install.disabled=true;reload.hidden=true;$('update-phase').textContent='Admin-Anmeldung';$('update-message').textContent='Separaten Schlüssel aus der .env eingeben.';}
for(const id of ['update-open-welcome','update-open-phone'])$(id).addEventListener('click',open);
$('update-close').addEventListener('click',close);
$('update-login').addEventListener('click',poll);
input.addEventListener('input',()=>{epoch++;check.disabled=install.disabled=true;});
check.addEventListener('click',()=>submit({action:'check'}));
install.addEventListener('click',()=>{if(latest&&confirm('Server-Update installieren? Das Spiel wird nach dem Build kurz neu gestartet.'))submit({action:'install',revision:latest});});
reload.addEventListener('click',()=>location.reload());
