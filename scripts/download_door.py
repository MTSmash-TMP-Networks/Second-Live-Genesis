#!/usr/bin/env python3
"""Optional pinned CC0 room asset; never block installation on unavailable media."""
import argparse, hashlib, json, struct
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
try:
    from .download_assets import Builder
except ImportError:
    from download_assets import Builder
SOURCE='https://tevy.dev/models/wooden-interior-door'
URLS={q:SOURCE+'/v1/'+lod+'.glb' for q,lod in [('1k','lod1'),('2k','lod0')]}
LIMIT=12*1024*1024

def download(url):
    with urlopen(Request(url,headers={'User-Agent':'SecondLive/0.7.4 (optional CC0 asset)'}),timeout=15) as response:
        p=urlsplit(response.geturl())
        if p.scheme!='https' or p.hostname not in ('tevy.dev','www.tevy.dev') or p.username or p.password:raise ValueError('Unexpected asset host')
        raw=response.read(LIMIT+1)
    return raw

def validate(raw):
    if len(raw)<24 or len(raw)>LIMIT:raise ValueError('GLB size')
    magic,version,total=struct.unpack_from('<4sII',raw)
    if magic!=b'glTF' or version!=2 or total!=len(raw):raise ValueError('GLB header')
    n,typ=struct.unpack_from('<I4s',raw,12)
    if typ!=b'JSON' or n<2 or 20+n>len(raw):raise ValueError('GLB JSON')
    data=json.loads(raw[20:20+n]);
    if not data.get('meshes') or not data.get('scenes'):raise ValueError('Empty asset')
    if any('uri' in item for key in ('buffers','images') for item in data.get(key,[])):raise ValueError('Only embedded resources allowed')
    if any(ext in data.get('extensionsRequired',[]) for ext in ('KHR_draco_mesh_compression',)):raise ValueError('Unsupported compressed asset')
    # Reject malformed chunks, including missing embedded binary buffer.
    offset=20+n;binary=0
    while offset<len(raw):
        if offset+8>len(raw):raise ValueError('Truncated chunk')
        size,kind=struct.unpack_from('<I4s',raw,offset);offset+=8
        if offset+size>len(raw):raise ValueError('Truncated data')
        if kind==b'BIN\x00':binary+=size
        offset+=size
    buffers=data.get('buffers',[]);
    if buffers and buffers[0].get('byteLength',0)>binary:raise ValueError('Missing binary data')
    for b in buffers[1:]:
        if b.get('extensions',{}).get('EXT_meshopt_compression',{}).get('fallback') is not True:raise ValueError('Unexpected additional buffer')
    return data

def extend(root,fetch=download):
    root=Path(root);manifest=json.loads((root/'manifest.json').read_text());status=manifest.setdefault('realism_status',{});manifest['door_models']={}
    b=Builder(root);b.records=[r for r in manifest['files'] if not r['file'].startswith('door/')];b.total=sum(r['bytes'] for r in b.records)
    for q,url in URLS.items():
        rel=f'door/{q}.glb';p=root/rel;p.parent.mkdir(exist_ok=True,parents=True);p.unlink(missing_ok=True)
        try:
            raw=fetch(url);validate(raw);p.write_bytes(raw)
            b.records.append({'file':rel,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'url':url,'md5':hashlib.md5(raw).hexdigest(),'license':'CC0-1.0','source':SOURCE});b.total+=len(raw)
            manifest['door_models'][q]='/assets/polyhaven/'+rel
        except Exception as e:print(f'Optional door {q}: {e}; using local model',flush=True)
    status['door']='downloaded' if manifest['door_models'] else 'local'
    b.write_manifest(manifest);return manifest

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);extend(ap.parse_args().output)
