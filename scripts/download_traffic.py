#!/usr/bin/env python3
"""Optional, pinned CC0 vehicle downloads. No external browser requests."""
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,struct,sys
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlsplit

BASE='https://tevy.dev/models/'
SLUGS={'sedan':'family-sedan','hatchback':'hatchback','suv':'suv','taxi':'yellow-taxi'}
MAX=12*1024*1024
WHEELS={'wheel_fl','wheel_fr','wheel_rl','wheel_rr'}
ALLOWED={'tevy.dev','www.tevy.dev'}

def fetch(url,limit):
    def valid(u):
        p=urlsplit(u)
        return p.scheme=='https' and p.hostname in ALLOWED and not p.username and not p.password and p.port in (None,443)
    if not valid(url):raise ValueError('Invalid vehicle URL')
    with urlopen(Request(url,headers={'User-Agent':'SecondLive/0.15.24 asset-build'}),timeout=15) as res:
        if not valid(res.geturl()):raise ValueError('Unexpected download host')
        data=res.read(limit+1)
    if len(data)>limit:raise ValueError('Vehicle asset too large')
    return data

def validate(data):
    if len(data)<32 or struct.unpack_from('<4sII',data)!=(b'glTF',2,len(data)):raise ValueError('Not GLB 2.0')
    n,kind=struct.unpack_from('<I4s',data,12)
    if kind!=b'JSON' or n>len(data)-20:raise ValueError('Invalid GLB JSON')
    doc=json.loads(data[20:20+n])
    if doc.get('asset',{}).get('version')!='2.0':raise ValueError('Invalid glTF version')
    if any('uri' in item for k in ('images','buffers') for item in doc.get(k,[])):raise ValueError('External resource URI')
    # Tevy ships meshopt geometry and KTX2/Basis images by design.
    # The existing offline Basis converter produces PNG; the renderer uses
    # Three's bundled MeshoptDecoder. Draco is not supported.
    if 'KHR_draco_mesh_compression' in doc.get('extensionsRequired',[]):raise ValueError('Unsupported Draco glTF')
    if not doc.get('meshes') or not doc.get('scenes'):raise ValueError('Empty model')
    offset=20+n;binary=0
    while offset<len(data):
        if offset+8>len(data):raise ValueError('Truncated GLB chunk')
        size,tag=struct.unpack_from('<I4s',data,offset);offset+=8
        if size%4 or offset+size>len(data):raise ValueError('Invalid GLB chunk')
        if tag==b'BIN\x00':binary+=size
        offset+=size
    buffers=doc.get('buffers',[])
    if not buffers or buffers[0].get('byteLength',0)>binary:raise ValueError('Missing embedded BIN')
    for b in buffers[1:]:
        if b.get('extensions',{}).get('EXT_meshopt_compression',{}).get('fallback') is not True:raise ValueError('Unexpected additional buffer')
    for v in doc.get('bufferViews',[]):
        e=v.get('extensions',{}).get('EXT_meshopt_compression')
        if e:
            if e.get('buffer')!=0 or not 0<=e.get('byteOffset',0)<=binary or not 0<e.get('byteLength',0)<=binary-e.get('byteOffset',0):raise ValueError('Invalid meshopt view')
            if not 0<e.get('count',0)*e.get('byteStride',0)<=48*1024*1024:raise ValueError('Meshopt view exceeds budget')
    names={str(n.get('name','')).lower() for n in doc.get('nodes',[])}
    if not WHEELS<=names:raise ValueError('Missing animated wheel nodes')
    tris=0
    for m in doc.get('meshes',[]):
        for p in m.get('primitives',[]):
            if p.get('mode',4)!=4:continue
            i=p.get('indices',p.get('attributes',{}).get('POSITION'))
            if i is not None:tris+=doc['accessors'][i]['count']//3
    if not 1<=tris<=180000:raise ValueError('Vehicle geometry outside budget')
    return tris

def item(root,kind,slug,lod):
    url=BASE+slug+'/v1/lod'+str(lod)+'.glb'
    try:
        data=fetch(url,MAX);triangles=validate(data)
        name=kind+'-lod'+str(lod)+'.glb'
        target=root/name;tmp=root/(name+'.tmp');tmp.write_bytes(data);tmp.replace(target)
        print('Traffic asset:',name,triangles,'triangles',flush=True)
        return {'file':name,'source':url,'license':'CC0-1.0','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':triangles}
    except Exception as exc:
        print('Optional vehicle unavailable:',url,exc,'; fallback remains active',flush=True)
        return None

def main(root):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs=[pool.submit(item,root,k,s,l) for k,s in SLUGS.items() for l in (0,1,2)]
        records=[x for j in jobs if (x:=j.result()) is not None]
    (root/'manifest.json').write_text(json.dumps({'provider':'Tevy','license':'CC0-1.0','files':records},indent=2),'utf8')
    print(f'Traffic downloads: {len(records)}/12 source files',flush=True)

if __name__=='__main__':main(sys.argv[1])
