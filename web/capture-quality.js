// Pure image-quality and orientation helpers, independent of camera permissions.
export function frameMetric(rgba,w,h){
  const g=new Float32Array(w*h);let mean=0,lap=0,lap2=0,count=0;
  for(let i=0;i<g.length;i++){g[i]=.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2];mean+=g[i];}
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,v=4*g[i]-g[i-1]-g[i+1]-g[i-w]-g[i+w];lap+=v;lap2+=v*v;count++;}
  return {g,mean:mean/g.length,sharp:count?lap2/count-(lap/count)**2:0};
}
export function difference(a,b){if(!a||!b)return 999;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length;}
export function captureDecision(m,previous,last,elapsed){
  const movement=difference(m.g,previous),novelty=difference(m.g,last),good=m.mean>35&&m.mean<220&&m.sharp>85,steady=movement<12,newView=novelty>10;
  return {movement,novelty,eligible:good&&steady&&newView&&elapsed>1800,hint:!good?(m.mean<=35?'Mehr Licht benötigt':m.mean>=220?'Zu hell – Belichtung ändern':'Bild unscharf – ruhiger halten'):!steady?'Kurz ruhig halten':!newView?'Seitlich versetzen und neuen Blickwinkel aufnehmen':'Perspektive geeignet'};
}
export function orientationSector(heading,origin){if(!Number.isFinite(heading)||!Number.isFinite(origin))return null;return Math.floor((((heading-origin)%360+360)%360+22.5)/45)%8;}
