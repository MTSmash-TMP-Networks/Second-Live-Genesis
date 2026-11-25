"""Private, bounded static GLB furnishings. No external resources or server-side rendering."""
import json
import math
import sqlite3
import struct
import threading
import time
import uuid
from contextlib import closing
from pathlib import Path
from world_capture import CaptureError

MAX_FILE = 16 * 1024 * 1024
MAX_MODELS = 8
MAX_OWNER = 64 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
MAX_TRIANGLES = 200_000
MAX_PIXELS = 12 * 1024 * 1024
SAFE_EXT = frozenset(('KHR_texture_transform', 'KHR_materials_unlit', 'KHR_materials_clearcoat',
                      'KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_emissive_strength',
                      'KHR_materials_sheen', 'EXT_texture_webp'))
COMPONENTS = {5120: ('b',1), 5121: ('B',1), 5122: ('h',2), 5123: ('H',2), 5125: ('I',4), 5126: ('f',4)}
WIDTH = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}

def need(condition, reason):
    if not condition:
        raise ValueError(reason)

def integer(v, low, high):
    need(type(v) is int and low <= v <= high, 'Ungueltiger GLB-Index oder Umfang')
    return v

def number(v, low, high):
    need(type(v) in (int,float) and low <= v <= high and math.isfinite(v), 'Ungueltige Modellposition oder Groesse')
    return float(v)

def webp_size(data):
    """Read dimensions from static WebP headers without decoding pixel data."""
    need(len(data)>=20 and data[:4]==b'RIFF' and data[8:12]==b'WEBP','Ungueltiger WebP-Container')
    # Some GLB exporters include alignment padding in an image bufferView.
    limit=8+struct.unpack_from('<I',data,4)[0]
    need(20<=limit<=len(data) and len(data)-limit<=3 and not any(data[limit:]),'Ungueltige WebP-Containerlaenge')
    data=data[:limit]
    i=12;canvas=None;frame=None;chunks=0
    while i<len(data):
        need(i+8<=len(data),'Ungueltiger WebP-Block')
        tag=data[i:i+4];n=struct.unpack_from('<I',data,i+4)[0];start=i+8;end=start+n
        chunks+=1
        need(chunks<=128 and end+(n%2)<=len(data),'Ungueltiger WebP-Block')
        if tag==b'VP8X':
            need(i==12 and n==10 and not(data[start]&0xc1) and data[start+1:start+4]==b'\0\0\0','Ungueltiger WebP-Header')
            need(not(data[start]&2),'Animierte WebP-Texturen sind nicht erlaubt')
            canvas=(1+int.from_bytes(data[start+4:start+7],'little'),1+int.from_bytes(data[start+7:start+10],'little'))
        elif tag==b'VP8 ':
            need(frame is None and n>=10 and not(data[start]&1) and data[start+3:start+6]==b'\x9d\x01\x2a','Ungueltiger WebP-Bildheader')
            w,h=struct.unpack_from('<HH',data,start+6);frame=(w&0x3fff,h&0x3fff)
        elif tag==b'VP8L':
            need(frame is None and n>=5 and data[start]==0x2f,'Ungueltiger WebP-Lossless-Header')
            bits=struct.unpack_from('<I',data,start+1)[0]
            need(bits>>29==0,'Ungueltige WebP-Version')
            frame=(1+(bits&0x3fff),1+((bits>>14)&0x3fff))
        else:
            need(tag not in (b'ANIM',b'ANMF'),'Animierte WebP-Texturen sind nicht erlaubt')
        i=end+(n%2)
    need(frame is not None and min(frame)>0 and (canvas is None or canvas==frame),'Ungueltige WebP-Abmessungen')
    return frame

def image_size(data, mime):
    if mime == 'image/webp':
        return webp_size(data)
    if mime == 'image/png':
        need(len(data)>=33 and data[:8]==b'\x89PNG\r\n\x1a\n' and data[8:16]==b'\0\0\0\rIHDR', 'Ungueltige PNG-Textur')
        return struct.unpack_from('>II',data,16)
    if mime == 'image/jpeg':
        need(data[:2]==b'\xff\xd8', 'Ungueltige JPEG-Textur')
        i=2
        while i+4<=len(data):
            need(data[i]==255, 'Ungueltige JPEG-Textur')
            while i<len(data) and data[i]==255:i+=1
            need(i+3<=len(data), 'Ungueltige JPEG-Textur')
            marker=data[i];i+=1
            need(marker not in (0,0xda,0xd9), 'JPEG-Groesse fehlt')
            n=struct.unpack_from('>H',data,i)[0]
            need(n>=2 and i+n<=len(data), 'Ungueltige JPEG-Textur')
            if marker in (0xc0,0xc1,0xc2):
                need(n>=8, 'Ungueltige JPEG-Groesse')
                h,w=struct.unpack_from('>HH',data,i+3)
                return w,h
            i+=n
        raise ValueError('JPEG-Groesse fehlt')
    raise ValueError('Nur eingebettete PNG-, JPEG- oder statische WebP-Texturen werden unterstuetzt')

def validate_glb(blob):
    """Check the binary envelope, graph, buffer bounds, complexity and image dimensions."""
    need(28<=len(blob)<=MAX_FILE, 'GLB-Datei zu gross oder unvollstaendig')
    need(struct.unpack_from('<III',blob)==(0x46546c67,2,len(blob)), 'GLB 2.0 erwartet')
    n,tag=struct.unpack_from('<II',blob,12)
    need(tag==0x4e4f534a and 0<n<=1024*1024 and n%4==0 and 28+n<=len(blob), 'Ungueltiger GLB-JSON-Block')
    try:g=json.loads(blob[20:20+n].decode('utf-8'))
    except (ValueError,UnicodeError,RecursionError):raise ValueError('Ungueltiger GLB-JSON-Block') from None
    b,tag=struct.unpack_from('<II',blob,20+n)
    need(tag==0x004e4942 and b%4==0 and 28+n+b==len(blob), 'GLB benoetigt genau einen eingebetteten Binaerblock')
    binary=memoryview(blob)[28+n:]
    need(isinstance(g,dict) and isinstance(g.get('asset'),dict) and g['asset'].get('version')=='2.0', 'GLB 2.0 erwartet')
    stack=[(g,0)]
    while stack:
        v,depth=stack.pop()
        need(depth<=32,'GLB-Struktur zu tief')
        if isinstance(v,dict):
            need('uri' not in v, 'Externe oder eingebettete URI-Dateien sind nicht erlaubt')
            if 'extensions' in v:
                ext=v['extensions'];need(isinstance(ext,dict),'Ungueltige GLB-Erweiterung')
                unsupported=set(ext)-SAFE_EXT
                need(not unsupported,'Nicht unterstuetzte GLB-Erweiterung: '+', '.join(sorted(unsupported))[:150]+'; ohne Mesh-Kompression exportieren')
            stack.extend((x,depth+1) for x in v.values())
        elif isinstance(v,list):stack.extend((x,depth+1) for x in v)
        elif type(v) in (int,float):need(-1e12<=v<=1e12 and math.isfinite(v),'Ungueltiger GLB-Zahlenwert')
    for key in ('extensionsUsed','extensionsRequired'):
        ext=g.get(key,[]);need(isinstance(ext,list) and all(isinstance(x,str) for x in ext),'Ungueltige GLB-Erweiterungsliste')
        unsupported=set(ext)-SAFE_EXT
        need(not unsupported,'Nicht unterstuetzte GLB-Erweiterung: '+', '.join(sorted(unsupported))[:150]+'; ohne Mesh-Kompression exportieren')
    for key in ('animations','skins','cameras'):
        need(not g.get(key),'Nur statische Einrichtungsmodelle, keine Animationen oder Kameras')
    def arr(key,limit,minimum=0):
        v=g.get(key,[]);need(isinstance(v,list) and minimum<=len(v)<=limit and all(isinstance(x,dict) for x in v),'Ungueltige GLB-Liste: '+key)
        return v
    buffers=arr('buffers',1,1)
    length=integer(buffers[0].get('byteLength'),1,b)
    need(b-length<=3,'Ungueltige Binaerblocklaenge')
    views=arr('bufferViews',512,1);view_data=[]
    for v in views:
        need(type(v.get('buffer')) is int and v['buffer']==0,'Nur ein eingebetteter Puffer')
        start=integer(v.get('byteOffset',0),0,length)
        count=integer(v.get('byteLength'),1,length)
        stride=integer(v.get('byteStride',0),0,252)
        need(start+count<=length and (not stride or stride>=4 and stride%4==0),'Pufferbereich ungueltig')
        view_data.append((start,count,stride))
    access=arr('accessors',512,1);access_data=[]
    for a in access:
        need('sparse' not in a,'Sparse-Accessor nicht unterstuetzt')
        vi=integer(a.get('bufferView'),0,len(views)-1)
        comp=a.get('componentType');kind=a.get('type')
        need(type(comp) is int and comp in COMPONENTS and isinstance(kind,str) and kind in WIDTH,'Accessor-Typ nicht unterstuetzt')
        fmt,unit=COMPONENTS[comp];width=WIDTH[kind]
        count=integer(a.get('count'),1,MAX_TRIANGLES*3)
        offset=integer(a.get('byteOffset',0),0,length)
        start,n,stride=view_data[vi];stride=stride or unit*width
        need(stride>=unit*width and stride%unit==0 and (start+offset)%unit==0 and offset+(count-1)*stride+unit*width<=n,'Accessor ausserhalb des Puffers')
        access_data.append((comp,kind,count,start+offset,stride,'<'+fmt*width))
    def values(i):
        comp,kind,count,start,stride,fmt=access_data[i]
        read=struct.Struct(fmt).unpack_from
        return (read(binary,start+j*stride) for j in range(count))
    meshes=arr('meshes',128,1);materials=arr('materials',128)
    triangles=[];primitives=0;checked_positions=set();checked_indices={}
    for m in meshes:
        ps=m.get('primitives');need(isinstance(ps,list) and 0<len(ps)<=128 and not m.get('weights'),'Ungueltiges statisches Mesh')
        total=0
        for p in ps:
            primitives+=1;need(primitives<=128 and isinstance(p,dict) and p.get('mode',4)==4 and not p.get('targets'),'Nur statische Dreiecksmeshes')
            attrs=p.get('attributes');need(isinstance(attrs,dict) and 'POSITION' in attrs and len(attrs)<=12,'Mesh ohne Positionen')
            pos=integer(attrs['POSITION'],0,len(access)-1)
            comp,kind,count,*_=access_data[pos]
            need(comp==5126 and kind=='VEC3' and count<=MAX_TRIANGLES*3,'Ungueltige Vertexpositionen')
            if pos not in checked_positions:
                need(sum(access_data[i][2] for i in checked_positions)+count<=600_000,'Zu viele Vertices')
                need(all(all(math.isfinite(x) and abs(x)<=1e6 for x in v) for v in values(pos)),'Ungueltige Vertexkoordinaten')
                checked_positions.add(pos)
            for key,idx in attrs.items():
                need(key in ('POSITION','NORMAL','TANGENT','TEXCOORD_0','TEXCOORD_1','COLOR_0'),'Nicht unterstuetztes Vertexattribut')
                idx=integer(idx,0,len(access)-1);need(access_data[idx][2]==count,'Vertexattribute passen nicht zusammen')
            n=count
            if 'indices' in p:
                idx=integer(p['indices'],0,len(access)-1);comp,kind,n,*_=access_data[idx]
                need(comp in (5121,5123,5125) and kind=='SCALAR','Ungueltige Dreiecksindizes')
                if idx not in checked_indices:checked_indices[idx]=max(v[0] for v in values(idx))
                need(checked_indices[idx]<count,'Dreiecksindex ausserhalb des Meshs')
            need(n%3==0,'Unvollstaendige Dreiecke')
            if 'material' in p:integer(p['material'],0,len(materials)-1)
            total+=n//3
        triangles.append(total)
    nodes=arr('nodes',128,1);scenes=arr('scenes',4,1)
    integer(g.get('scene',0),0,len(scenes)-1)
    edges=[];parents={};total=0
    for i,node in enumerate(nodes):
        need(not any(k in node for k in ('skin','camera','weights')),'Nur statische Mesh-Knoten')
        for key,n in (('matrix',16),('translation',3),('rotation',4),('scale',3)):
            if key in node:
                v=node[key];need(isinstance(v,list) and len(v)==n,'Ungueltige Knotentransformation')
                for x in v:number(x,-1e6,1e6)
        if 'mesh' in node:total+=triangles[integer(node['mesh'],0,len(meshes)-1)]
        children=node.get('children',[]);need(isinstance(children,list) and len(children)<=128,'Ungueltige Knotenhierarchie')
        for child in children:
            integer(child,0,len(nodes)-1);need(child not in parents,'Knoten mehrfach verknuepft');parents[child]=i
        edges.append(children)
    need(0<total<=MAX_TRIANGLES,'Zu viele Dreiecke (max. 200.000) oder leeres Modell')
    for i in range(len(nodes)):
        seen=set();j=i
        while j in parents:
            need(j not in seen and len(seen)<24,'Zyklische oder zu tiefe Knotenhierarchie')
            seen.add(j);j=parents[j]
    for scene in scenes:
        roots=scene.get('nodes',[]);need(isinstance(roots,list) and 0<len(roots)<=128,'Leere Szene')
        for idx in roots:integer(idx,0,len(nodes)-1);need(idx not in parents,'Ungueltige Szenenwurzel')
        need(len(set(roots))==len(roots),'Doppelte Szenenwurzel')
    images=arr('images',16);textures=arr('textures',32);samplers=arr('samplers',32)
    pixels=0
    for img in images:
        vi=integer(img.get('bufferView'),0,len(views)-1);start,n,_=view_data[vi]
        w,h=image_size(binary[start:start+n].tobytes(),img.get('mimeType'))
        need(1<=w<=2048 and 1<=h<=2048,'Texturen maximal 2048 x 2048 Pixel')
        pixels+=w*h
    need(pixels<=MAX_PIXELS,'Texturen insgesamt zu gross')
    for t in textures:
        # EXT_texture_webp uses its own source index, not texture.source.
        # A core fallback, if present, must still be an ordinary PNG/JPEG.
        ext=t.get('extensions',{}).get('EXT_texture_webp')
        if 'source' in t:
            src=integer(t['source'],0,len(images)-1)
            need(images[src].get('mimeType') in ('image/png','image/jpeg'),'GLB-Basistextur muss PNG oder JPEG sein')
        if 'EXT_texture_webp' in t.get('extensions',{}):
            need(isinstance(ext,dict) and 'EXT_texture_webp' in g.get('extensionsUsed',[]),'Ungueltige WebP-Texturerweiterung')
            src=integer(ext.get('source'),0,len(images)-1)
            need(images[src].get('mimeType')=='image/webp','WebP-Texturquelle hat falschen Dateityp')
            need('source' in t or 'EXT_texture_webp' in g.get('extensionsRequired',[]),'WebP ohne Ersatztextur muss als erforderlich markiert sein')
        else:
            need('source' in t,'GLB-Texturquelle fehlt')
        if 'sampler' in t:integer(t['sampler'],0,len(samplers)-1)
    return {'triangles':total,'pixels':pixels}

def placement(data):
    size=number(data.get('extent'),.1,2.4)
    x=number(data.get('x'),-4.7,4.7);z=number(data.get('z'),-4.7,4.7)
    y=number(data.get('y'),0,2.75);rotation=number(data.get('rotation'),0,360)%360
    solid=data.get('solid',False);need(type(solid) is bool,'Ungueltige Kollisionseinstellung')
    margin=size*math.sqrt(2)/2
    need(abs(x)+margin<=4.72 and abs(z)+margin<=4.72 and y+size<=2.9,'Modell muss vollstaendig ins Hotelzimmer passen')
    need(not (solid and z-margin<-3.65 and abs(x)<.85+margin),'Zugang zur Zimmertuer muss frei bleiben')
    return (x,y,z,size,rotation,int(solid))

class RoomModelStore:
    def __init__(self, path):
        self.path=Path(path)/'room_models.sqlite3'
        self.upload_slots=threading.BoundedSemaphore(2)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('''CREATE TABLE IF NOT EXISTS room_models(
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL,
                bytes INTEGER NOT NULL, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0,
                z REAL NOT NULL DEFAULT 0, extent REAL NOT NULL DEFAULT .8, rotation REAL NOT NULL DEFAULT 0,
                solid INTEGER NOT NULL DEFAULT 0, placed INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL)''')
            db.execute('CREATE INDEX IF NOT EXISTS room_models_owner ON room_models(owner)')
    def list(self, owner):
        with closing(sqlite3.connect(self.path)) as db:
            db.row_factory=sqlite3.Row
            rows=[dict(r) for r in db.execute('SELECT id,name,bytes,x,y,z,extent,rotation,solid,placed FROM room_models WHERE owner=? ORDER BY created,id',(owner,))]
        for r in rows:r['solid']=bool(r['solid']);r['placed']=bool(r['placed'])
        return {'models':rows,'max_file':MAX_FILE,'max_models':MAX_MODELS,'max_owner':MAX_OWNER}
    def add(self, owner, name, blob):
        need(isinstance(name,str) and name.lower().endswith('.glb'),'GLB-Datei erwartet')
        name=''.join(c for c in name.replace('\\','/').split('/')[-1] if c.isprintable())[:100].strip()
        need(bool(name),'Dateiname fehlt')
        validate_glb(blob)
        identifier=uuid.uuid4().hex
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('BEGIN IMMEDIATE')
            count,used=db.execute('SELECT COUNT(*),COALESCE(SUM(bytes),0) FROM room_models WHERE owner=?',(owner,)).fetchone()
            total=db.execute('SELECT COALESCE(SUM(bytes),0) FROM room_models').fetchone()[0]
            if count>=MAX_MODELS or used+len(blob)>MAX_OWNER:raise CaptureError('Dein Modellspeicher ist voll',413)
            if total+len(blob)>MAX_TOTAL:raise CaptureError('Server-Modellspeicher ist voll',503)
            db.execute('INSERT INTO room_models(id,owner,name,data,bytes,created) VALUES (?,?,?,?,?,?)',(identifier,owner,name,blob,len(blob),time.time()))
        return {**self.list(owner),'added':identifier}
    def get(self,owner,identifier):
        with closing(sqlite3.connect(self.path)) as db:
            row=db.execute('SELECT data FROM room_models WHERE owner=? AND id=?',(owner,identifier)).fetchone()
        if row is None:raise CaptureError('Modell nicht gefunden',404)
        return row[0]
    def action(self,owner,data):
        identifier=data.get('id');op=data.get('action')
        need(isinstance(identifier,str) and len(identifier)==32 and all(c in '0123456789abcdef' for c in identifier),'Ungueltige Modell-ID')
        with closing(sqlite3.connect(self.path)) as db, db:
            if op=='place':
                row=db.execute('UPDATE room_models SET x=?,y=?,z=?,extent=?,rotation=?,solid=?,placed=1 WHERE owner=? AND id=?',(*placement(data),owner,identifier))
            elif op=='hide':row=db.execute('UPDATE room_models SET placed=0 WHERE owner=? AND id=?',(owner,identifier))
            elif op=='delete':row=db.execute('DELETE FROM room_models WHERE owner=? AND id=?',(owner,identifier))
            else:raise ValueError('Unbekannte Modellaktion')
            if row.rowcount!=1:raise CaptureError('Modell nicht gefunden',404)
        return self.list(owner)
