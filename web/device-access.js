// Mobile scanner capabilities. No permissions are requested until an explicit action.
export function pairOrigin(value){
  let u;try{u=new URL(value.trim());}catch{throw Error('Erreichbare HTTPS-Adresse eingeben, z. B. https://SERVER-IP:8443.');}
  const host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['/','/scanner.html','/panorama.html'].includes(u.pathname))throw Error('Handy-Kopplung benötigt eine HTTPS-Adresse ohne Zugangsdaten oder Zusatzparameter.');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.startsWith('127.')||['0.0.0.0','[::]','[::1]'].includes(host))throw Error('Die Adresse muss vom Handy erreichbar sein (LAN-IP oder eigener DNS-Name, nicht localhost).');
  return u.origin;
}
export function suggestPairOrigin(loc){
  try{const u=new URL(loc.origin);if(u.protocol==='http:'){u.protocol='https:';u.port='8443';}return pairOrigin(u.origin);}catch{return '';}
}
export function secureMessage(){return 'Keine sichere Browserverbindung. Öffne den Scanner über https://SERVER-IP:8443 in Safari und vertraue dem geprüften lokalen Serverzertifikat. HTTP im WLAN reicht nicht.';}
export function cameraError(e){
  const m={NotAllowedError:'Kamerazugriff verweigert. In Safari die Website-Einstellungen öffnen und Kamera auf Erlauben oder Fragen stellen; danach erneut versuchen.',SecurityError:'Kamera durch Browser oder Sicherheitsrichtlinie gesperrt. HTTPS und Safari-Websiteberechtigungen prüfen.',NotFoundError:'Keine verwendbare Kamera gefunden. Die native Fotoaufnahme oder Fotoimport verwenden.',OverconstrainedError:'Kamera unterstützt die angeforderten Einstellungen nicht. Native Fotoaufnahme versuchen.',NotReadableError:'Kamera ist belegt oder nicht verfügbar. Andere Kamera-Apps schließen und erneut versuchen.',AbortError:'Kamera konnte nicht gestartet werden. Erneut versuchen.'};
  return (m[e?.name]||'Kamera konnte nicht geöffnet werden. Native Fotoaufnahme versuchen.')+(e?.name?' ('+e.name+')':'');
}
export async function cameraStream(nav=globalThis.navigator,secure=globalThis.isSecureContext){
  if(!secure)throw Error(secureMessage());
  if(!nav?.mediaDevices?.getUserMedia)throw Error('Live-Kamera in diesem Browser nicht verfügbar. Native Fotoaufnahme oder Fotoimport verwenden.');
  try{return await nav.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});}
  catch(e){if(!['NotFoundError','OverconstrainedError','ConstraintNotSatisfiedError'].includes(e?.name))throw Error(cameraError(e));}
  try{return await nav.mediaDevices.getUserMedia({audio:false,video:true});}catch(e){throw Error(cameraError(e));}
}
function position(nav,opts){return new Promise((resolve,reject)=>nav.geolocation.getCurrentPosition(resolve,reject,opts));}
function coords(p){return {lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};}
export async function locationFix(nav=globalThis.navigator,secure=globalThis.isSecureContext,progress=()=>{}){
  if(!secure)throw Error(secureMessage());
  if(!nav?.geolocation)throw Error('Standort-API nicht verfügbar. Safari und Ortungsdienste prüfen.');
  const explain=e=>e?.code===1?'Standortzugriff verweigert. In iOS unter Datenschutz & Sicherheit > Ortungsdienste Safari-Websites und genauen Standort freigeben; auch die Website-Einstellung prüfen.':e?.code===2?'Standort nicht verfügbar. Ortungsdienste, WLAN und Empfang prüfen; nahe einem Fenster erneut versuchen.':'Standortabfrage hat zu lange gedauert. Erneut versuchen, am besten bei freiem Himmel.';
  let best=null;
  for(const opts of [{enableHighAccuracy:true,maximumAge:0,timeout:15000},{enableHighAccuracy:false,maximumAge:15000,timeout:10000}]){
    try{const c=coords(await position(nav,opts));if(Number.isFinite(c.accuracy)&&c.accuracy>=0&&(!best||c.accuracy<best.accuracy))best=c;if(best&&best.accuracy<=50)return best;}
    catch(e){if(e?.code===1)throw Error(explain(e));if(opts.enableHighAccuracy===false&&!best)throw Error(explain(e));}
    if(opts.enableHighAccuracy)progress(best?'GPS bisher ±'+Math.round(best.accuracy)+' m. Zweiter Ortungsversuch …':'GPS: zweiter Ortungsversuch …');
  }
  if(best)throw Error('Standort ermittelt, aber zu ungenau (±'+Math.round(best.accuracy)+' m; benötigt höchstens 50 m). Privater Scan ohne GPS möglich.');
  throw Error('Kein Standort verfügbar. Privater Scan ohne GPS möglich.');
}
