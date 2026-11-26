"""Administrator-installed, shared village GLBs. Atomic bank in the existing data volume."""
import io
import sqlite3
import struct
import threading
import zipfile
from contextlib import closing
from pathlib import Path
from room_models import validate_glb, MAX_FILE
from world_capture import CaptureError

KEYS=('house-a','house-b','shop-a','shop-b')
NAMES={k+'.glb':k for k in KEYS}
EXTRAS={'LICENSE-Quaternius.txt','ASSET-REPORT.json'}
MAX_ZIP=24*1024*1024

class VillageAssetStore:
    def __init__(self,path,bundled):
        self.path=Path(path)/'village_assets.sqlite3'
        self.bundled=Path(bundled)
        self.upload_slots=threading.BoundedSemaphore(1)
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('CREATE TABLE IF NOT EXISTS assets (name TEXT PRIMARY KEY, data BLOB NOT NULL)')

    def manifest(self):
        with closing(sqlite3.connect(self.path)) as db:
            stored={r[0] for r in db.execute('SELECT name FROM assets')}
        return [k for k in KEYS if k in stored or (self.bundled/(k+'.glb')).is_file()]

    def get(self,key):
        if key not in KEYS:raise CaptureError('Dorfmodell nicht gefunden',404)
        with closing(sqlite3.connect(self.path)) as db:
            row=db.execute('SELECT data FROM assets WHERE name=?',(key,)).fetchone()
        if row:return row[0]
        path=self.bundled/(key+'.glb')
        if not path.is_file():raise CaptureError('Dorfmodell nicht gefunden',404)
        return path.read_bytes()

    def install(self,blob):
        if not 0<len(blob)<=MAX_ZIP:raise CaptureError('Modellpaket maximal 24 MiB',413)
        try:
            with zipfile.ZipFile(io.BytesIO(blob)) as z:
                entries=z.infolist()
                names=[i.filename for i in entries]
                if len(names)>6 or len(set(names))!=len(names) or set(names)-set(NAMES)-EXTRAS or not set(NAMES)<=set(names):
                    raise ValueError('Vier GLB-Dateien im ZIP-Hauptverzeichnis erwartet')
                models={}
                for info in entries:
                    if info.flag_bits&1 or info.is_dir():raise ValueError('Keine verschluesselten ZIP-Dateien oder Verzeichnisse')
                    if info.filename in EXTRAS:
                        if info.file_size>65536:raise ValueError('Metadaten zu gross')
                        continue
                    if not 0<info.file_size<=MAX_FILE:raise ValueError('GLB maximal 16 MiB')
                    with z.open(info) as f:data=f.read(MAX_FILE+1)
                    if len(data)!=info.file_size:raise ValueError('Unvollstaendiges GLB')
                    validate_glb(data)
                    models[NAMES[info.filename]]=data
        except (zipfile.BadZipFile,NotImplementedError,RuntimeError,ValueError,TypeError,KeyError,IndexError,struct.error,OverflowError,EOFError) as e:
            raise CaptureError('Ungueltiges Dorfmodellpaket: '+str(e)[:160],400) from None
        # All assets are validated before replacing any old model. Readers see one transaction.
        with closing(sqlite3.connect(self.path)) as db,db:
            db.execute('DELETE FROM assets')
            db.executemany('INSERT INTO assets(name,data) VALUES(?,?)',models.items())
        return {'models':list(KEYS),'bytes':sum(len(b) for b in models.values())}
