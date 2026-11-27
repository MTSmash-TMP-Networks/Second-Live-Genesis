#!/usr/bin/env python3
"""Optional CC0 landscape imagery; never fetch the huge source tree geometry."""
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from download_assets import Builder, file_entry, checked_url, safe_rel, MAPS, AGENT

LIMIT=5*1024*1024
TEXTURES={'grass':'leafy_grass','forest':'forrest_ground_01','rock':'mossy_rock','path':'rock_path','bark':'bark_brown_01'}
TREES={'leaf':'tree_small_02','pine':'fir_tree_01'}

def fetch(url,limit):
    checked_url(url)
    if not 0<limit<=LIMIT:raise ValueError('Nature asset exceeds size budget')
    with urlopen(Request(url,headers={'User-Agent':AGENT}),timeout=15) as response:
        checked_url(response.geturl())
        data=response.read(limit+1)
    if len(data)>limit:raise ValueError('Nature asset exceeds size budget')
    return data

def checked_data(entry):
    data=fetch(entry['url'],int(entry['size']))
    if len(data)!=int(entry['size']) or hashlib.md5(data).hexdigest()!=str(entry['md5']).lower():
        raise ValueError('Nature asset checksum mismatch')
    return data

def foliage(builder,slug,kind):
    meta=builder.meta(slug)
    entry,_=file_entry(meta,('gltf',),'1k',('gltf',),slug=slug)
    doc=json.loads(checked_data(entry))
    includes=entry.get('include') or {}
    for mat in doc.get('materials',[]):
        if mat.get('alphaMode') not in ('MASK','BLEND'):continue
        idx=mat.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')
        if idx is None:continue
        image=doc['images'][doc['textures'][idx]['source']]
        uri=image.get('uri','')
        if not uri or Path(uri).suffix.lower()!='.png':continue
        dep=includes.get(uri) or includes.get(str(safe_rel(uri)))
        if not dep:continue
        data=checked_data(dep)
        if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data)<33:continue
        if data[25] not in (4,6) and b'tRNS' not in data:continue
        # Use only the verified alpha-bearing color image, not the model or BIN.
        rel=f'nature/{kind}.png';target=builder.root/rel
        target.write_bytes(data)
        builder.records.append({'file':rel,'url':dep['url'],'bytes':len(data),'md5':hashlib.md5(data).hexdigest(),'license':'CC0-1.0'})
        builder.total+=len(data)
        return '/assets/polyhaven/'+rel
    raise ValueError('No usable alpha foliage image in source model')

def main(root):
    root=Path(root);folder=root/'nature';folder.mkdir(parents=True,exist_ok=True)
    b=Builder(root,fetch=fetch)
    manifest={'license':'CC0-1.0','textures':{},'foliage':{},'sources':{},'files':b.records}
    for key,slug in TEXTURES.items():
        try:
            meta=b.meta(slug)
            entry,fmt=file_entry(meta,MAPS['color'],'1k',('jpg','jpeg','png'),slug=slug)
            manifest['textures'][key]={'color':b.save(entry,f'nature/{key}.{fmt}')}
            manifest['sources'][key]='https://polyhaven.com/a/'+slug
            if key=='bark':
                try:
                    e,f=file_entry(meta,MAPS['normal'],'1k',('jpg','jpeg','png'),slug=slug)
                    manifest['textures'][key]['normal']=b.save(e,f'nature/bark_normal.{f}')
                except Exception as exc:print('Optional bark normal unavailable:',exc,flush=True)
        except Exception as exc:print('Optional nature texture unavailable:',slug,exc,flush=True)
    for key,slug in TREES.items():
        try:
            manifest['foliage'][key]=foliage(b,slug,key)
            manifest['sources'][key]='https://polyhaven.com/a/'+slug
        except Exception as exc:print('Optional foliage unavailable:',slug,exc,flush=True)
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2),'utf8')
    print(f'Nature imagery: {len(b.records)} verified files; procedural fallbacks remain available.',flush=True)

if __name__=='__main__':main(sys.argv[1])
