"""Local DA3 client, with no external upload destination or proxy."""
import base64, http.client, json, time
from pathlib import Path

class DA3Unavailable(RuntimeError):pass
class DA3Insufficient(ValueError):pass

def _request(method,path,body=None,timeout=3):
    conn=http.client.HTTPConnection('second-live-da3',8766,timeout=timeout)
    try:
        conn.request(method,path,body=body,headers={'Content-Type':'application/json'} if body else {})
        res=conn.getresponse();raw=res.read(12_000_001)
        if len(raw)>12_000_000:raise DA3Unavailable('DA3-Antwort zu groß')
        data=json.loads(raw)
        return res.status,data
    except (OSError,http.client.HTTPException,ValueError) as exc:raise DA3Unavailable('DA3-Dienst nicht erreichbar: '+str(exc)[:160]) from exc
    finally:conn.close()

def health():
    try:
        code,data=_request('GET','/health',timeout=1.5)
        if code==200 and data.get('model')=='depth-anything/DA3-SMALL':
            return {k:data[k] for k in ('status','device','busy','error','model') if k in data}
    except DA3Unavailable:pass
    return {'status':'offline','model':'depth-anything/DA3-SMALL'}

def reconstruct(paths,final=False,allowed=lambda:True):
    paths=list(paths);n=len(paths);limit=16 if final else 8
    if n<2:raise DA3Insufficient('Mehrere Ansichten nötig')
    ix=sorted(set(round(i*(n-1)/(min(n,limit)-1)) for i in range(min(n,limit))))
    selected=[paths[i] for i in ix]
    if not allowed():raise DA3Unavailable('Auftrag wurde beendet')
    rows=[]
    for fid,path in selected:
        raw=Path(path).read_bytes()
        if len(raw)>2_100_000:raise DA3Unavailable('Bild zu groß')
        rows.append({'id':fid,'jpeg':base64.b64encode(raw).decode('ascii')})
    body=json.dumps({'frames':rows,'final':final,'input_count':n},separators=(',',':')).encode()
    deadline=time.monotonic()+(360 if final else 120)
    while allowed() and time.monotonic()<deadline:
        remaining=max(1,deadline-time.monotonic())
        code,data=_request('POST','/reconstruct',body,timeout=remaining)
        if code==409:time.sleep(1);continue
        if code==422:raise DA3Insufficient(data.get('error','Keine konsistente DA3-Geometrie'))
        if code!=200:raise DA3Unavailable(data.get('error','DA3-Fehler'))
        if data.get('kind')!='da3_multiview' or not data.get('points') or data.get('frame_ids')!=[x[0] for x in selected]:
            raise DA3Unavailable('Ungültige DA3-Antwort')
        return data
    raise DA3Unavailable('DA3-Auftrag abgebrochen oder Zeitlimit erreicht')
