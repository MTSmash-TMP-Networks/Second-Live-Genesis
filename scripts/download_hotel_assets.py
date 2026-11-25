#!/usr/bin/env python3
"""Optional licensed furniture, isolated from required assets. Fail open."""
import hashlib,json,struct,sys
from pathlib import Path
from urllib.request import Request,urlopen

REVISION='e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea'
URL='https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/'+REVISION+'/Models/SheenChair/glTF-Binary/SheenChair.glb'
MAX=12*1024*1024

def validate(data):
    if len(data)<32 or len(data)>MAX or data[:4]!=b'glTF' or struct.unpack_from('<II',data,4)!=(2,len(data)):
        raise ValueError('invalid GLB')
    size,kind=struct.unpack_from('<I4s',data,12)
    if kind!=b'JSON' or size>1_000_000 or 20+size>len(data):
        raise ValueError('invalid GLB JSON')
    doc=json.loads(data[20:20+size])
    if any('uri' in x for key in ('images','buffers') for x in doc.get(key,[])):
        raise ValueError('external GLB resources')
    if not set(doc.get('extensionsRequired',[]))<= {'KHR_texture_transform','KHR_materials_sheen','KHR_materials_variants'}:
        raise ValueError('unsupported extension')
    if not doc.get('meshes') or not doc.get('materials'):
        raise ValueError('missing meshes/materials')

def main(root):
    root=Path(root);manifest_path=root/'manifest.json'
    manifest=json.loads(manifest_path.read_text('utf8'));rel='hotel_assets/sheen_chair.glb'
    manifest['hotel_models']={};manifest['files']=[x for x in manifest['files'] if x['file']!=rel]
    target=root/rel
    try:
        with urlopen(Request(URL,headers={'User-Agent':'SecondLive/0.9.3 (asset build)'}),timeout=15) as r:data=r.read(MAX+1)
        validate(data)
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        manifest['files'].append({'file':rel,'url':URL,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'md5':hashlib.md5(data).hexdigest(),'license':'CC0 1.0','author':'Wayfair, LLC / Eric Chadwick','source':'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/'+REVISION+'/Models/SheenChair','origin':'download'})
        manifest['hotel_models']['chair']='/assets/polyhaven/'+rel
        print('Optional high-detail chair ready',flush=True)
    except Exception as exc:
        target.unlink(missing_ok=True)
        print('Optional chair unavailable; local upholstered model remains:',str(exc)[:200],flush=True)
    manifest['bytes']=sum(x['bytes'] for x in manifest['files'])
    temp=root/'.hotel-manifest.tmp';temp.write_text(json.dumps(manifest,indent=2),'utf8');temp.replace(manifest_path)

if __name__=='__main__':main(sys.argv[1])
