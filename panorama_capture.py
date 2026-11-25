"""Private, station-based panorama capture. Images never leave the game server."""
import base64, hashlib, io, math, threading, time, uuid
from world_capture import CaptureError, HEX, clean_jpeg

# Portrait phone recommended: 12 overlapping horizon views; optional upper/lower
# rings and two steep views for spherical coverage. Nominal angles, not SLAM.
TARGETS=[(i*30,0) for i in range(12)]+[(i*45,50) for i in range(8)]+[(i*45,-50) for i in range(8)]+[(0,85),(0,-85)]
MAX_STATIONS=12
OWNER_LIMIT=96*1024**2
GLOBAL_LIMIT=512*1024**2
BUILD_LOCK=threading.Lock()

def wrap(a):return (a+180)%360-180

def project_panorama(rows, fov=75, width=1536):
    """Feather real perspective photos onto an equirectangular sphere.
    Orientation/FOV are approximate. Uncovered pixels remain neutral, never invented.
    """
    import cv2,numpy as np
    h=width//2
    lon=((np.arange(width,dtype=np.float32)+.5)/width*2-1)*np.pi
    lat=(.5-(np.arange(h,dtype=np.float32)+.5)/h)*np.pi
    cl=np.cos(lat)[:,None]
    rays=np.stack([cl*np.sin(lon)[None,:],np.broadcast_to(np.sin(lat)[:,None],(h,width)),cl*np.cos(lon)[None,:]],axis=2)
    accum=np.zeros((h,width,3),np.float32);weight=np.zeros((h,width),np.float32)
    for row in rows:
        image=cv2.imdecode(np.frombuffer(row['jpeg'],dtype=np.uint8),cv2.IMREAD_COLOR)
        if image is None:raise ValueError('Aufnahme nicht lesbar')
        ih,iw=image.shape[:2]
        a,p,r=map(math.radians,(row['yaw'],row['pitch'],row['roll']))
        forward=np.array([math.sin(a)*math.cos(p),math.sin(p),math.cos(a)*math.cos(p)],np.float32)
        right=np.array([math.cos(a),0,-math.sin(a)],np.float32)
        up=np.cross(forward,right)
        # Roll is the measured rotation of the image up axis around forward.
        right,up=right*math.cos(r)-up*math.sin(r),up*math.cos(r)+right*math.sin(r)
        f=(max(iw,ih)/2)/math.tan(math.radians(fov)/2)
        z=rays@forward;front=z>0.001
        safe=np.maximum(z,.001)
        u=(rays@right)*f/safe+(iw-1)/2
        v=-(rays@up)*f/safe+(ih-1)/2
        valid=front&(u>=0)&(u<iw-1)&(v>=0)&(v<ih-1)
        edge=np.minimum(np.minimum(u,iw-1-u)/(iw*.12),np.minimum(v,ih-1-v)/(ih*.12))
        w=np.where(valid,np.maximum(.005,np.minimum(1,edge))*z*z,0).astype(np.float32)
        if not valid.any():continue
        pixels=cv2.remap(image,u.astype(np.float32),v.astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        accum+=pixels*w[:,:,None];weight+=w
    good=weight>0
    out=np.full((h,width,3),(26,22,18),np.uint8)
    out[good]=(accum[good]/weight[good,None]).clip(0,255).astype(np.uint8)
    ok,jpg=cv2.imencode('.jpg',out,[int(cv2.IMWRITE_JPEG_QUALITY),88])
    if not ok:raise ValueError('Panorama konnte nicht gespeichert werden')
    # Solid-angle weighted sphere coverage; horizontal is a narrow equatorial band.
    sphere=float((good*cl).sum()/(cl.sum()*width))
    horizontal=float(good[h//2-2:h//2+2].mean())
    return jpg.tobytes(),round(horizontal*100,1),round(sphere*100,1)

class PanoramaStore:
    def __init__(self,capture):
        self.capture=capture
        with capture.tx() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS pano_stations(
              id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES players(id),
              ordinal INTEGER NOT NULL,x REAL NOT NULL,z REAL NOT NULL,
              fov INTEGER NOT NULL DEFAULT 75, revision INTEGER NOT NULL DEFAULT 0,
              preview BLOB, horizontal REAL, sphere REAL, created REAL NOT NULL,
              UNIQUE(owner,ordinal));
            CREATE TABLE IF NOT EXISTS pano_frames(
              station TEXT NOT NULL REFERENCES pano_stations(id) ON DELETE CASCADE,
              slot INTEGER NOT NULL,yaw REAL NOT NULL,pitch REAL NOT NULL,roll REAL NOT NULL,
              source TEXT NOT NULL,sha TEXT NOT NULL,jpeg BLOB NOT NULL,
              PRIMARY KEY(station,slot));
            """)
    def _own(self,db,player,sid):
        if not isinstance(sid,str) or not HEX.fullmatch(sid):raise CaptureError('Aufnahmepunkt nicht gefunden',404)
        row=db.execute('SELECT * FROM pano_stations WHERE id=? AND owner=?',(sid,player)).fetchone()
        if not row:raise CaptureError('Aufnahmepunkt nicht gefunden',404)
        return row
    def _status(self,db,player):
        stations=[]
        for s in db.execute('SELECT id,ordinal,x,z,fov,revision,preview IS NOT NULL AS preview,horizontal,sphere FROM pano_stations WHERE owner=? ORDER BY ordinal',(player,)):
            out=dict(s)
            out['frames']=[dict(f) for f in db.execute('SELECT slot,yaw,pitch,roll,source FROM pano_frames WHERE station=? ORDER BY slot',(s['id'],))]
            stations.append(out)
        return {'stations':stations,'max_stations':MAX_STATIONS,'targets':[list(t) for t in TARGETS]}
    def status(self,player):
        with self.capture.tx(False) as db:return self._status(db,player)
    def create(self,player,distance=1,bearing=0,consent=False):
        if consent is not True:raise CaptureError('Bitte Aufnahmeerlaubnis bestätigen',400)
        if type(distance) not in (int,float) or not math.isfinite(distance) or not .2<=distance<=10 or type(bearing) not in (int,float) or not math.isfinite(bearing) or not 0<=bearing<360:
            raise CaptureError('Ungültiger Positionswechsel',400)
        with self.capture.tx() as db:
            last=db.execute('SELECT ordinal,x,z,preview IS NOT NULL AS ready FROM pano_stations WHERE owner=? ORDER BY ordinal DESC LIMIT 1',(player,)).fetchone()
            if db.execute('SELECT count(*) FROM pano_stations WHERE owner=?',(player,)).fetchone()[0]>=MAX_STATIONS:raise CaptureError('Maximal zwölf Aufnahmepunkte in diesem Test',429)
            if last and not last['ready']:raise CaptureError('Zuerst den letzten Aufnahmepunkt als Panorama speichern')
            ordinal=last['ordinal']+1 if last else 1
            x=last['x']+distance*math.sin(math.radians(bearing)) if last else 0
            z=last['z']+distance*math.cos(math.radians(bearing)) if last else 0
            sid=uuid.uuid4().hex
            db.execute('INSERT INTO pano_stations(id,owner,ordinal,x,z,created) VALUES(?,?,?,?,?,?)',(sid,player,ordinal,round(x,3),round(z,3),time.time()))
            return {'id':sid,**self._status(db,player)}
    def frame(self,player,sid,slot,photo,yaw=None,pitch=None,roll=0,source='manual'):
        if type(slot) is not int or not 0<=slot<len(TARGETS):raise CaptureError('Ungültiger Blickwinkel',400)
        target_yaw,target_pitch=TARGETS[slot]
        if source not in ('sensor','manual'):raise CaptureError('Ungültige Richtungsquelle',400)
        if source=='manual':yaw,pitch,roll=target_yaw,target_pitch,0
        else:
            if any(type(v) not in (int,float) or not math.isfinite(v) for v in (yaw,pitch,roll)):raise CaptureError('Ungültige Sensordaten',400)
            if abs(wrap(yaw-target_yaw))>18 or abs(pitch-target_pitch)>18 or abs(roll)>18 or not -90<=pitch<=90:
                raise CaptureError('Handy an der markierten Blickrichtung ausrichten',400)
            yaw=yaw%360
        with self.capture.tx(False) as db:self._own(db,player,sid)
        jpeg=clean_jpeg(photo);sha=hashlib.sha256(jpeg).hexdigest()
        with self.capture.tx() as db:
            self._own(db,player,sid)
            old=db.execute('SELECT length(jpeg) AS n FROM pano_frames WHERE station=? AND slot=?',(sid,slot)).fetchone()
            delta=len(jpeg)-(old['n'] if old else 0)
            total=db.execute('SELECT COALESCE(SUM(length(jpeg)),0) FROM pano_frames').fetchone()[0]+db.execute('SELECT COALESCE(SUM(length(preview)),0) FROM pano_stations').fetchone()[0]
            own=db.execute('SELECT COALESCE(SUM(length(f.jpeg)),0) FROM pano_frames f JOIN pano_stations s ON s.id=f.station WHERE s.owner=?',(player,)).fetchone()[0]+db.execute('SELECT COALESCE(SUM(length(preview)),0) FROM pano_stations WHERE owner=?',(player,)).fetchone()[0]
            if total+delta>GLOBAL_LIMIT or own+delta>OWNER_LIMIT:raise CaptureError('Panorama-Speichergrenze erreicht. Nicht benötigte Punkte löschen.',429)
            if db.execute('SELECT 1 FROM pano_frames WHERE station=? AND slot<>? AND sha=?',(sid,slot,sha)).fetchone():raise CaptureError('Identisches Foto bereits gespeichert. Zur nächsten Richtung drehen.',400)
            db.execute("""INSERT INTO pano_frames(station,slot,yaw,pitch,roll,source,sha,jpeg) VALUES(?,?,?,?,?,?,?,?)
              ON CONFLICT(station,slot) DO UPDATE SET yaw=excluded.yaw,pitch=excluded.pitch,roll=excluded.roll,source=excluded.source,sha=excluded.sha,jpeg=excluded.jpeg""",(sid,slot,yaw,pitch,roll,source,sha,jpeg))
            db.execute('UPDATE pano_stations SET revision=revision+1,preview=NULL,horizontal=NULL,sphere=NULL WHERE id=?',(sid,))
            return self._status(db,player)
    def remove(self,player,sid,slot):
        if type(slot) is not int or not 0<=slot<len(TARGETS):raise CaptureError('Ungültige Aufnahme',400)
        with self.capture.tx() as db:
            self._own(db,player,sid)
            if db.execute('DELETE FROM pano_frames WHERE station=? AND slot=?',(sid,slot)).rowcount:
                db.execute('UPDATE pano_stations SET revision=revision+1,preview=NULL,horizontal=NULL,sphere=NULL WHERE id=?',(sid,))
            return self._status(db,player)
    def build(self,player,sid,fov=75):
        if type(fov) is not int or fov not in (65,75,85):raise CaptureError('Ungültiger Bildwinkel',400)
        if not BUILD_LOCK.acquire(blocking=False):raise CaptureError('Ein anderes Panorama wird gerade berechnet. Bitte erneut versuchen.',409)
        try:
            with self.capture.tx(False) as db:
                station=self._own(db,player,sid);revision=station['revision']
                rows=[dict(r) for r in db.execute('SELECT slot,yaw,pitch,roll,jpeg FROM pano_frames WHERE station=? ORDER BY slot',(sid,))]
            if not set(range(12)).issubset({r['slot'] for r in rows}):raise CaptureError('Zuerst alle zwölf Richtungen auf Augenhöhe aufnehmen',400)
            jpg,horizontal,sphere=project_panorama(rows,fov)
            with self.capture.tx() as db:
                station=self._own(db,player,sid)
                if station['revision']!=revision:raise CaptureError('Aufnahmen wurden während der Berechnung verändert. Bitte erneut erstellen.')
                delta=len(jpg)-len(station['preview'] or b'')
                total=db.execute('SELECT COALESCE(SUM(length(jpeg)),0) FROM pano_frames').fetchone()[0]+db.execute('SELECT COALESCE(SUM(length(preview)),0) FROM pano_stations').fetchone()[0]
                own=db.execute('SELECT COALESCE(SUM(length(f.jpeg)),0) FROM pano_frames f JOIN pano_stations s ON s.id=f.station WHERE s.owner=?',(player,)).fetchone()[0]+db.execute('SELECT COALESCE(SUM(length(preview)),0) FROM pano_stations WHERE owner=?',(player,)).fetchone()[0]
                if total+delta>GLOBAL_LIMIT or own+delta>OWNER_LIMIT:raise CaptureError('Panorama-Speichergrenze erreicht',429)
                db.execute('UPDATE pano_stations SET preview=?,horizontal=?,sphere=?,fov=? WHERE id=?',(jpg,horizontal,sphere,fov,sid))
                return self._status(db,player)
        finally:BUILD_LOCK.release()
    def image(self,player,sid,slot=None):
        with self.capture.tx(False) as db:
            station=self._own(db,player,sid)
            if slot is None:raw=station['preview']
            else:
                if type(slot) is not int or not 0<=slot<len(TARGETS):raise CaptureError('Ungültige Aufnahme',400)
                row=db.execute('SELECT jpeg FROM pano_frames WHERE station=? AND slot=?',(sid,slot)).fetchone()
                raw=row['jpeg'] if row else None
            if not raw:raise CaptureError('Bild noch nicht verfügbar',404)
            return {'image':'data:image/jpeg;base64,'+base64.b64encode(raw).decode('ascii')}
    def delete(self,player,sid):
        with self.capture.tx() as db:
            self._own(db,player,sid);db.execute('DELETE FROM pano_stations WHERE id=?',(sid,))
            return self._status(db,player)
