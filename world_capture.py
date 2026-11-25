"""Personal home identities and transactional capture registry (LAN evaluation)."""
from __future__ import annotations
import base64, binascii, hashlib, io, json, math, os, re, secrets, shutil, sqlite3, time, uuid
from contextlib import contextmanager
from pathlib import Path

HEX = re.compile(r'^[0-9a-f]{32}$')
TOKEN = re.compile(r'^[A-Za-z0-9_-]{43}$')
MAX_FRAMES = 60
MIN_FRAMES = 8
LIVE_MIN_FRAMES = 4
LIVE_BATCH_FRAMES = 3
LIVE_IDLE_SECONDS = 10
LEASE = 3600
MAX_PLAYERS = 200
MAX_SESSIONS = 200
MAX_STORAGE = 2 * 1024**3
ACTIVE = ('capturing','queued','processing','review')
GEO_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz'

class CaptureError(ValueError):
    def __init__(self, message, status=409):
        super().__init__(message); self.status=status

def region_for(location):
    """Coarse geohash, ~150m at equator; NOT a room ID or proof of presence."""
    if not isinstance(location,dict): raise CaptureError('GPS-Freigabe erforderlich',400)
    try: lat,lon,acc=(float(location[k]) for k in ('lat','lon','accuracy'))
    except (KeyError,TypeError,ValueError,OverflowError): raise CaptureError('Ungueltige Standortdaten',400)
    if not all(map(math.isfinite,(lat,lon,acc))) or not (-90<=lat<=90 and -180<=lon<=180 and 0<acc<=50):
        raise CaptureError('GPS noch zu ungenau (max. 50 m); privater Test ohne GPS moeglich',400)
    bounds=[[-180.,180.],[-90.,90.]]; values=[lon,lat]; bits=[]
    for i in range(35):
        k=i%2; mid=sum(bounds[k])/2; bit=int(values[k]>=mid); bits.append(bit); bounds[k][1-bit]=mid
    return ''.join(GEO_ALPHABET[sum(b<<(4-j) for j,b in enumerate(bits[i:i+5]))] for i in range(0,35,5))

def digest(token): return hashlib.sha256(token.encode()).hexdigest()

def clean_jpeg(encoded):
    """Decode, bound dimensions, re-encode without EXIF and hash normalized bytes."""
    from PIL import Image, ImageOps
    if not isinstance(encoded,str) or not encoded.startswith('data:image/jpeg;base64,') or len(encoded)>3_000_000:
        raise CaptureError('JPEG bis 2 MB erwartet',400)
    try:
        raw=base64.b64decode(encoded.split(',',1)[1],validate=True)
        if not 100<len(raw)<=2*1024**2: raise ValueError('size')
        with Image.open(io.BytesIO(raw)) as im:
            if im.format!='JPEG' or min(im.size)<160 or im.width*im.height>12_000_000: raise ValueError('format')
            im=ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((1600,1600))
            out=io.BytesIO(); im.save(out,'JPEG',quality=88,optimize=True); return out.getvalue()
    except (ValueError,OSError,binascii.Error,Image.DecompressionBombError) as exc:
        raise CaptureError('JPEG ungueltig oder zu gross',400) from exc

class CaptureStore:
    def __init__(self, root):
        self.root=Path(root); self.root.mkdir(parents=True,exist_ok=True)
        self.db=self.root/'genesis.sqlite3'; self.files=self.root/'capture'; self.files.mkdir(exist_ok=True)
        self.homes=self.root/'homes'; self.homes.mkdir(exist_ok=True)
        with self.tx() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, secret TEXT UNIQUE NOT NULL, region TEXT, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS player_sessions(secret TEXT PRIMARY KEY, player TEXT NOT NULL REFERENCES players(id), created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS pair_codes(secret TEXT PRIMARY KEY, player TEXT NOT NULL REFERENCES players(id), expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES players(id), target TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, expires REAL NOT NULL, evaluation INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', created REAL NOT NULL, updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS targets(id TEXT PRIMARY KEY, scan TEXT NOT NULL REFERENCES scans(id));
            CREATE TABLE IF NOT EXISTS frames(id TEXT PRIMARY KEY, scan TEXT NOT NULL REFERENCES scans(id), hash TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL, result TEXT, created REAL NOT NULL, UNIQUE(scan,hash));
            CREATE INDEX IF NOT EXISTS frames_scan ON frames(scan,created);
            CREATE INDEX IF NOT EXISTS scans_owner ON scans(owner,created);
            CREATE TABLE IF NOT EXISTS worker(id INTEGER PRIMARY KEY CHECK(id=1), heartbeat REAL, device TEXT);
            CREATE TABLE IF NOT EXISTS live_previews(
                scan TEXT PRIMARY KEY REFERENCES scans(id), token TEXT NOT NULL, state TEXT NOT NULL,
                attempted INTEGER NOT NULL DEFAULT 0, updated REAL NOT NULL, revision TEXT,
                registered INTEGER NOT NULL DEFAULT 0, source_count INTEGER NOT NULL DEFAULT 0,
                point_count INTEGER NOT NULL DEFAULT 0, result TEXT, message TEXT NOT NULL DEFAULT ''
            );
            ''')
            if 'scan_region' not in {row[1] for row in db.execute('PRAGMA table_info(players)')}:
                db.execute('ALTER TABLE players ADD COLUMN scan_region TEXT')
                db.execute('UPDATE players SET scan_region=region')
            db.execute('INSERT OR IGNORE INTO player_sessions SELECT secret,id,created FROM players')
    @contextmanager
    def tx(self, write=True):
        db=sqlite3.connect(self.db,timeout=20); db.row_factory=sqlite3.Row; db.execute('PRAGMA foreign_keys=ON')
        try:
            db.execute('BEGIN IMMEDIATE' if write else 'BEGIN'); yield db; db.commit()
        except BaseException: db.rollback(); raise
        finally: db.close()
    def identify(self, token):
        if not isinstance(token,str) or not TOKEN.fullmatch(token): return None
        with self.tx(False) as db:
            row=db.execute('SELECT player FROM player_sessions WHERE secret=?',(digest(token),)).fetchone(); return row['player'] if row else None
    def session(self, token=None):
        old=self.identify(token)
        if old: return old,None
        key=secrets.token_urlsafe(32); player=uuid.uuid4().hex
        with self.tx() as db:
            if db.execute('SELECT count(*) FROM players').fetchone()[0]>=MAX_PLAYERS: raise CaptureError('Lokales Testkontingent erreicht',429)
            db.execute('INSERT INTO players(id,secret,created) VALUES(?,?,?)',(player,digest(key),time.time()))
            db.execute('INSERT INTO player_sessions VALUES(?,?,?)',(digest(key),player,time.time()))
        return player,key
    def pair_code(self,player):
        code=secrets.token_urlsafe(32)
        with self.tx() as db:
            db.execute('DELETE FROM pair_codes WHERE player=? OR expires<?',(player,time.time()))
            db.execute('INSERT INTO pair_codes VALUES(?,?,?)',(digest(code),player,time.time()+300))
        return code
    def redeem(self,code):
        if not isinstance(code,str) or not TOKEN.fullmatch(code):raise CaptureError('Kopplungscode ungueltig',400)
        key=secrets.token_urlsafe(32)
        with self.tx() as db:
            row=db.execute('SELECT player FROM pair_codes WHERE secret=? AND expires>?',(digest(code),time.time())).fetchone()
            if not row:raise CaptureError('Kopplungscode abgelaufen oder bereits benutzt',403)
            player=row['player']; db.execute('DELETE FROM pair_codes WHERE secret=?',(digest(code),))
            if db.execute('SELECT count(*) FROM player_sessions WHERE player=?',(player,)).fetchone()[0]>=20:raise CaptureError('Geraetekontingent erreicht',429)
            db.execute('INSERT INTO player_sessions VALUES(?,?,?)',(digest(key),player,time.time()))
        return player,key
    def home_path(self, player):
        if not HEX.fullmatch(player): raise CaptureError('Ungueltiger Spieler',400)
        p=self.homes/player; p.mkdir(exist_ok=True); return p
    def profile(self, player):
        with self.tx(False) as db:
            row=db.execute('SELECT region,scan_region FROM players WHERE id=?',(player,)).fetchone()
        return {'id':player,'home':player,'region':row['region'],'scan_region':row['scan_region'],'legacy_preserved':(self.root/'world.sqlite3').exists()}
    def locate(self, player, location):
        cell=region_for(location)
        with self.tx() as db:
            db.execute('UPDATE players SET region=COALESCE(region,?),scan_region=? WHERE id=?',(cell,cell,player))
        return self.profile(player)
    def expire(self,db):
        now=time.time()
        expired=[row['id'] for row in db.execute("SELECT id FROM scans WHERE status='capturing' AND expires<?",(now,))]
        for sid in expired:
            db.execute('DELETE FROM live_previews WHERE scan=?',(sid,))
            shutil.rmtree(self.files/sid,ignore_errors=True);db.execute('DELETE FROM frames WHERE scan=?',(sid,))
        db.execute("UPDATE scans SET status='expired', message='Reservierung abgelaufen',updated=? WHERE status='capturing' AND expires<?",(now,now))
        db.execute("DELETE FROM targets WHERE scan IN (SELECT id FROM scans WHERE status IN ('expired','cancelled'))")
    def _target(self,db,player,scope):
        if scope=='private': return 'private:'+player
        if scope!='shared': raise CaptureError('Unbekannter Scanbereich',400)
        region=db.execute('SELECT scan_region FROM players WHERE id=?',(player,)).fetchone()['scan_region']
        if not region: raise CaptureError('Zuerst freiwillig GPS-Startgebiet setzen',400)
        return 'geo:'+region
    def _owned(self,db,player,scan):
        if not isinstance(scan,str) or not HEX.fullmatch(scan): raise CaptureError('Ungueltiger Scan',400)
        row=db.execute('SELECT * FROM scans WHERE id=? AND owner=?',(scan,player)).fetchone()
        if not row: raise CaptureError('Scan nicht gefunden',404)
        return row
    def _view(self,db,row,player):
        mine=row['owner']==player
        result={'scope':row['scope'],'status':row['status'],'mine':mine,'message':row['message'] if mine else '', 'expires':row['expires'] if row['status']=='capturing' else None}
        if mine:
            result['id']=row['id']; result['evaluation']=bool(row['evaluation'])
            result['frames']=[{'id':f['id'],'status':f['status'],'analysis':json.loads(f['result']) if f['result'] else None} for f in db.execute('SELECT id,status,result FROM frames WHERE scan=? ORDER BY created',(row['id'],))]
            if row['status']=='capturing':
                live=db.execute('SELECT state,attempted,revision,registered,source_count,point_count,message FROM live_previews WHERE scan=?',(row['id'],)).fetchone()
                result['live']=dict(live) if live else {'state':'waiting','attempted':0,'revision':None,'registered':0,'source_count':0,'point_count':0,'message':''}
        elif row['status']=='published': result['id']=row['id']
        result['preview']=row['status'] in ('review','published') and (mine or row['status']=='published')
        return result
    def status(self,player,scope='private'):
        with self.tx() as db:
            self.expire(db); target=self._target(db,player,scope)
            row=db.execute('SELECT s.* FROM targets t JOIN scans s ON s.id=t.scan WHERE t.id=?',(target,)).fetchone()
            worker=db.execute('SELECT * FROM worker WHERE id=1').fetchone()
            out=self._view(db,row,player) if row else {'scope':scope,'status':'unexplored','mine':False,'frames':[],'preview':False}
            out['worker']={'online':bool(worker and time.time()-worker['heartbeat']<90),'device':worker['device'] if worker else 'nicht gestartet'}
            return out
    def reserve(self,player,scope,location=None,evaluation=False):
        now=time.time()
        with self.tx() as db:
            self.expire(db); target=self._target(db,player,scope)
            if scope=='shared' and 'geo:'+region_for(location)!=target: raise CaptureError('Aktueller Standort passt nicht zum Startgebiet',403)
            row=db.execute('SELECT s.* FROM targets t JOIN scans s ON s.id=t.scan WHERE t.id=?',(target,)).fetchone()
            if row:
                if row['owner']==player and row['status']=='capturing':
                    db.execute('UPDATE scans SET expires=?,updated=? WHERE id=?',(now+LEASE,now,row['id'])); return self._view(db,db.execute('SELECT * FROM scans WHERE id=?',(row['id'],)).fetchone(),player)
                raise CaptureError('Gebiet bereits reserviert, in Verarbeitung oder erzeugt. Kamera bleibt gesperrt.')
            if db.execute('SELECT count(*) FROM scans').fetchone()[0]>=MAX_SESSIONS: raise CaptureError('Lokales Scan-Kontingent erreicht',429)
            if db.execute("SELECT count(*) FROM scans WHERE owner=? AND status IN ('capturing','queued','processing','review')",(player,)).fetchone()[0]>=2: raise CaptureError('Zu viele offene Auftraege',429)
            sid=uuid.uuid4().hex
            db.execute("INSERT INTO scans VALUES(?,?,?,?,?,?,?,?,?,?)",(sid,player,target,scope,'capturing',now+LEASE,int(evaluation is True),'Aufnahme freigegeben',now,now))
            db.execute('INSERT INTO targets VALUES(?,?)',(target,sid))
            (self.files/sid/'frames').mkdir(parents=True,exist_ok=True)
            return self._view(db,db.execute('SELECT * FROM scans WHERE id=?',(sid,)).fetchone(),player)
    def frame(self,player,scan,encoded):
        # Check authorization before any costly image decode; check again atomically.
        with self.tx() as db:
            self.expire(db); row=self._owned(db,player,scan)
            if row['status']!='capturing': raise CaptureError('Kamera fuer dieses Gebiet gesperrt')
        image=clean_jpeg(encoded); sha=hashlib.sha256(image).hexdigest(); fid=uuid.uuid4().hex
        with self.tx() as db:
            self.expire(db); row=self._owned(db,player,scan)
            if row['status']!='capturing': raise CaptureError('Kamera fuer dieses Gebiet gesperrt')
            existing=db.execute('SELECT id FROM frames WHERE scan=? AND hash=?',(scan,sha)).fetchone()
            if existing: return {'id':existing['id'],'duplicate':True}
            if db.execute('SELECT count(*) FROM frames WHERE scan=?',(scan,)).fetchone()[0]>=MAX_FRAMES: raise CaptureError('60 Aufnahmen erreicht; Scan abschliessen',429)
            if db.execute('SELECT COALESCE(sum(size),0) FROM frames').fetchone()[0]+len(image)>MAX_STORAGE: raise CaptureError('Test-Speicherkontingent erreicht',429)
            dest=self.files/scan/'frames'/f'{fid}.jpg'; dest.write_bytes(image)
            try:
                db.execute('INSERT INTO frames VALUES(?,?,?,?,?,?,?)',(fid,scan,sha,len(image),'pending',None,time.time()))
                db.execute('UPDATE scans SET expires=?,updated=? WHERE id=?',(time.time()+LEASE,time.time(),scan))
            except Exception: dest.unlink(missing_ok=True); raise
        return {'id':fid,'duplicate':False}
    def frame_image(self,player,scan,frame):
        if not isinstance(frame,str) or not HEX.fullmatch(frame):raise CaptureError('Foto nicht gefunden',404)
        with self.tx(False) as db:
            self._owned(db,player,scan)
            if not db.execute('SELECT 1 FROM frames WHERE scan=? AND id=?',(scan,frame)).fetchone():raise CaptureError('Foto nicht gefunden',404)
            path=self.files/scan/'frames'/(frame+'.jpg')
            if not path.is_file():raise CaptureError('Foto nicht gefunden',404)
            return path.read_bytes()
    def remove_frame(self,player,scan,frame):
        if not isinstance(frame,str) or not HEX.fullmatch(frame):raise CaptureError('Foto nicht gefunden',404)
        with self.tx() as db:
            self.expire(db);row=self._owned(db,player,scan)
            if row['status']!='capturing':raise CaptureError('Fotos nur waehrend Aufnahme bearbeiten')
            if not db.execute('DELETE FROM frames WHERE scan=? AND id=?',(scan,frame)).rowcount:raise CaptureError('Foto nicht gefunden',404)
            db.execute('DELETE FROM live_previews WHERE scan=?',(scan,)) # invalidate any in-flight snapshot
            (self.files/scan/'frames'/(frame+'.jpg')).unlink(missing_ok=True)
            return {'deleted':True}
    def transition(self,player,scan,action):
        with self.tx() as db:
            self.expire(db); row=self._owned(db,player,scan); old=row['status']; now=time.time()
            if action=='submit' and old=='capturing':
                if db.execute('SELECT count(*) FROM frames WHERE scan=?',(scan,)).fetchone()[0]<MIN_FRAMES: raise CaptureError('Mindestens 8 unterschiedliche Aufnahmen erforderlich (keine Qualitaetsgarantie)',400)
                state='queued'; msg='CPU-Auftrag in Warteschlange'
                db.execute('DELETE FROM live_previews WHERE scan=?',(scan,))
            elif action=='retry' and old=='failed': state='capturing'; msg='Weitere Perspektiven aufnehmen'; db.execute('UPDATE scans SET expires=? WHERE id=?',(now+LEASE,scan))
            elif action=='publish' and old=='review':
                # Never expose photos or RGB preview to other users. Geometry only.
                if not (self.files/scan/'preview.json').is_file(): raise CaptureError('Vorschau fehlt')
                state='published'; msg='Rekonstruktionsvorschau bestaetigt (keine begehbare Welt)'
            elif action=='cancel' and old in ('capturing','failed','review','expired','queued','published'):
                state='cancelled'; msg='Auftrag verworfen'; db.execute('DELETE FROM targets WHERE scan=?',(scan,))
                db.execute('DELETE FROM live_previews WHERE scan=?',(scan,))
                db.execute('DELETE FROM frames WHERE scan=?',(scan,))
                shutil.rmtree(self.files/scan,ignore_errors=True)
            else: raise CaptureError('Aktion in diesem Zustand nicht moeglich')
            db.execute('UPDATE scans SET status=?,message=?,updated=? WHERE id=?',(state,msg,now,scan))
            return self._view(db,db.execute('SELECT * FROM scans WHERE id=?',(scan,)).fetchone(),player)
    def preview(self,player,scan):
        if not isinstance(scan,str) or not HEX.fullmatch(scan): raise CaptureError('Nicht gefunden',404)
        with self.tx(False) as db:
            row=db.execute('SELECT * FROM scans WHERE id=?',(scan,)).fetchone()
            if not row or row['status'] not in ('review','published') or (row['owner']!=player and not (row['scope']=='shared' and row['status']=='published')): raise CaptureError('Nicht gefunden',404)
            mine=row['owner']==player
        path=self.files/scan/'preview.json'
        if not path.is_file(): raise CaptureError('Vorschau fehlt',404)
        data=json.loads(path.read_text());
        if not mine: data.pop('colors',None); data.pop('mesh_colors',None); data.pop('semantics',None); data.pop('warnings',None)
        return data
    def live_preview(self,player,scan):
        """Live geometry is private even for a reserved shared region."""
        with self.tx(False) as db:
            row=self._owned(db,player,scan)
            if row['status']!='capturing' or row['expires']<time.time():raise CaptureError('Live-Vorschau nicht verfuegbar',404)
            live=db.execute('SELECT result,revision FROM live_previews WHERE scan=?',(scan,)).fetchone()
            if not live or not live['result']:raise CaptureError('Noch keine Live-Rekonstruktion vorhanden',404)
            result=json.loads(live['result']);result['revision']=live['revision'];return result

    def claim_live(self):
        """Coalesce new images; only one live worker, final jobs have priority."""
        with self.tx() as db:
            self.expire(db)
            if db.execute("SELECT 1 FROM scans WHERE status IN ('queued','processing') LIMIT 1").fetchone():return None
            now=time.time()
            for row in db.execute("""SELECT s.id,l.state,l.attempted,l.updated,count(f.id) AS n
                FROM scans s JOIN frames f ON f.scan=s.id LEFT JOIN live_previews l ON l.scan=s.id
                WHERE s.status='capturing' GROUP BY s.id HAVING count(f.id)>=?
                ORDER BY COALESCE(l.updated,0),s.created""",(LIVE_MIN_FRAMES,)):
                if row['state']=='running':continue
                attempted=row['attempted'] or 0
                if row['n']<=attempted:continue
                if attempted and row['n']-attempted<LIVE_BATCH_FRAMES and now-(row['updated'] or 0)<LIVE_IDLE_SECONDS:continue
                sid=row['id'];token=uuid.uuid4().hex
                frames=[f['id'] for f in db.execute('SELECT id FROM frames WHERE scan=? ORDER BY created,id',(sid,))]
                db.execute("""INSERT INTO live_previews(scan,token,state,attempted,updated,message) VALUES (?,?,'running',?,?,'Fotos werden raeumlich verbunden')
                    ON CONFLICT(scan) DO UPDATE SET token=excluded.token,state=excluded.state,attempted=excluded.attempted,updated=excluded.updated,message=excluded.message""",(sid,token,len(frames),now))
                return {'scan':sid,'token':token,'frames':frames}
        return None

    def _live_valid(self,db,job):
        return bool(db.execute("""SELECT 1 FROM live_previews l JOIN scans s ON s.id=l.scan
            WHERE l.scan=? AND l.token=? AND l.state='running' AND s.status='capturing' AND s.expires>=?
            AND NOT EXISTS(SELECT 1 FROM scans WHERE status IN ('queued','processing'))""",(job['scan'],job['token'],time.time())).fetchone())

    def live_allowed(self,job):
        with self.tx(False) as db:return self._live_valid(db,job)

    def snapshot_live(self,job,dest):
        """Hardlink an immutable, ordered snapshot while frame deletion is locked."""
        with self.tx() as db:
            if not self._live_valid(db,job):return False
            source=self.files/job['scan']/'frames'
            for i,fid in enumerate(job['frames']):
                os.link(source/(fid+'.jpg'),dest/(f'{i:04d}_{fid}.jpg'))
            return True

    def finish_live(self,job,result=None,message='',interrupted=False):
        with self.tx() as db:
            row=db.execute("SELECT l.token,s.status FROM live_previews l JOIN scans s ON s.id=l.scan WHERE l.scan=?",(job['scan'],)).fetchone()
            if not row or row['token']!=job['token'] or row['status']!='capturing':return False
            if interrupted or not self._live_valid(db,job):
                db.execute("UPDATE live_previews SET state='waiting',attempted=0,updated=?,message='Live-Berechnung pausiert' WHERE scan=?",(time.time(),job['scan']))
                return False
            if result is None:
                db.execute("UPDATE live_previews SET state='insufficient',updated=?,message=? WHERE scan=?",(time.time(),message[:250],job['scan']))
            else:
                db.execute("""UPDATE live_previews SET state='ready',updated=?,revision=?,registered=?,source_count=?,point_count=?,result=?,message=? WHERE scan=?""",
                    (time.time(),job['token'],result['registered'],result['total_frames'],len(result['points']),json.dumps(result,allow_nan=False,separators=(',',':')),message[:250],job['scan']))
            return True

    def heartbeat(self,device):
        with self.tx() as db: db.execute('INSERT INTO worker VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat,device=excluded.device',(time.time(),device))
    def recover_worker(self):
        with self.tx() as db:
            db.execute("UPDATE frames SET status='pending' WHERE status='processing'")
            db.execute("UPDATE scans SET status='queued',message='Nach Neustart erneut eingereiht' WHERE status='processing'")
            db.execute("UPDATE live_previews SET state='waiting',attempted=0 WHERE state='running'")
    def claim(self):
        with self.tx() as db:
            self.expire(db)
            frame=db.execute("SELECT f.*,s.evaluation FROM frames f JOIN scans s ON s.id=f.scan WHERE f.status='pending' AND s.status IN ('capturing','queued') ORDER BY f.created LIMIT 1").fetchone()
            if frame:
                db.execute("UPDATE frames SET status='processing' WHERE id=?",(frame['id'],));return 'frame',dict(frame)
            row=db.execute("SELECT * FROM scans WHERE status='queued' AND NOT EXISTS(SELECT 1 FROM frames WHERE frames.scan=scans.id AND frames.status IN ('pending','processing')) ORDER BY created LIMIT 1").fetchone()
            if row:
                db.execute("UPDATE scans SET status='processing',message='Mehrbild-Rekonstruktion laeuft',updated=? WHERE id=?",(time.time(),row['id'])); return 'scan',dict(row)
        return None
    def finish_frame(self,frame,result):
        with self.tx() as db: db.execute("UPDATE frames SET status=?,result=? WHERE id=?",('error' if result.get('error') else 'done',json.dumps(result,ensure_ascii=False),frame))
    def finish_scan(self,scan,ok,message):
        with self.tx() as db: db.execute("UPDATE scans SET status=?,message=?,updated=? WHERE id=? AND status='processing'",('review' if ok else 'failed',message[:600],time.time(),scan))
    def frames_for(self,scan):
        with self.tx(False) as db: return [dict(f) for f in db.execute('SELECT * FROM frames WHERE scan=? ORDER BY created',(scan,))]
