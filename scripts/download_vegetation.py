#!/usr/bin/env python3
"""Optional vegetation, downloaded once at image build time, never by the browser."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import html
import io
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys
from urllib.parse import urljoin, urlsplit, unquote
from urllib.request import Request, HTTPRedirectHandler, build_opener
import zipfile

from download_assets import Builder, file_entry, MAPS
from download_nature import fetch as poly_fetch

PAGE='https://vinish.dev/free-3d-models/'
HOSTS={'vinish.dev','www.vinish.dev','models.vinish.dev'}
PICKS={
 'grass-and-ground-cover': {'grass':'grass-tuft','tall':'tall-grass','meadow':'meadow-patch','reeds':'reeds','cattails':'cattails'},
 'bushes-and-hedges': {'bush':'berry-bush','juniper':'juniper','hedge':'boxwood-ball'},
 'flowers': {'daisies':'daisies','poppies':'poppies','lily':'water-lily'}
}
# Independent CC0 source for distant foliage cards if Vinish changes its URLs.
POLY={'grass':'grass_medium_01','bush':'shrub_04','fern':'fern_02','daisies':'celandine_01'}
MAX_FILE=4*1024*1024
MAX_ZIP=24*1024*1024
MAX_PAGE=4*1024*1024

def checked(url):
    p=urlsplit(url)
    if p.scheme!='https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None,443):
        raise ValueError('Unapproved vegetation host')
    return url

class Redirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req,fp,code,msg,headers,checked(newurl))

def fetch(url, limit):
    with build_opener(Redirect()).open(Request(checked(url),headers={'User-Agent':'SecondLive/0.15.26 asset-build','Referer':PAGE}),timeout=12) as response:
        checked(response.geturl())
        data=response.read(limit+1)
    if len(data)>limit:raise ValueError('Vegetation download exceeds budget')
    return data

def urls(page,source,extensions):
    # Extract literal URLs from official HTML attributes and serialized model
    # metadata. Never execute remote JavaScript or follow arbitrary hosts.
    s=html.unescape(page).replace(r'\/','/').replace(r'\u002F','/').replace(r'\u002f','/').replace(r'\u0026','&')
    pattern=r'(?:https?://|//|/|\.\.?/)?[A-Za-z0-9_~%./-]+\.(?:'+extensions+r')(?:\?[A-Za-z0-9_%&=+./-]+)?'
    out=set()
    for m in re.finditer(pattern,s,re.I):
        raw=m.group(0)
        try:out.add(checked(urljoin(source,raw)))
        except ValueError:pass
        # Some catalogues store the asset host separately from relative paths.
        if 'models.vinish.dev' in s and not raw.startswith(('http:','https:','//')) and '/' in raw:
            try:out.add(checked(urljoin('https://models.vinish.dev/',raw)))
            except ValueError:pass
    return sorted(out,key=lambda u:(urlsplit(u).hostname!='models.vinish.dev',u))

def slug(name):
    return re.sub(r'[^a-z0-9]+','-',PurePosixPath(unquote(name)).stem.lower()).strip('-')

def wanted(name,picks):
    n=slug(name)
    # ZIP entries and URLs may have a short pack prefix or version suffix.
    for kind,s in picks.items():
        if n==s or n.endswith('-'+s) or n.startswith(s+'-v') or n.endswith('-'+s+'-glb'):
            return kind
    return None

def inspect(raw):
    if len(raw)<32 or len(raw)>MAX_FILE or struct.unpack_from('<4sII',raw)!=(b'glTF',2,len(raw)):
        raise ValueError('Not a bounded GLB 2.0 file')
    size,tag=struct.unpack_from('<I4s',raw,12)
    if tag!=b'JSON' or size%4 or size+28>len(raw):raise ValueError('Invalid GLB JSON')
    doc=json.loads(raw[20:20+size]);n,tag=struct.unpack_from('<I4s',raw,20+size)
    if tag!=b'BIN\0' or n+size+28!=len(raw):raise ValueError('Invalid embedded BIN')
    a=doc.get('asset',{})
    credit=json.dumps(a,ensure_ascii=False).lower()
    if a.get('version')!='2.0' or 'vinish.dev' not in credit or not re.search(r'cc.by.4\.0|creativecommons\.org/licenses/by/4\.0',credit):
        raise ValueError('Missing Vinish CC BY 4.0 credit')
    if doc.get('extensionsRequired'):raise ValueError('Unsupported required GLB extension')
    buffers=doc.get('buffers',[])
    if len(buffers)!=1 or not 0<buffers[0].get('byteLength',0)<=n:raise ValueError('Invalid embedded buffer')
    if any('uri' in b for k in ('buffers','images') for b in doc.get(k,[])):raise ValueError('External GLB URI')
    if any(i.get('mimeType') not in ('image/png','image/jpeg') or 'bufferView' not in i for i in doc.get('images',[])):raise ValueError('Unsupported image')
    for b in doc.get('bufferViews',[]):
        if b.get('buffer')!=0 or not 0<=b.get('byteOffset',0)<=n or not 0<b['byteLength']<=n-b.get('byteOffset',0):raise ValueError('Invalid buffer view')
    nodes=doc.get('nodes',[]);meshes=doc.get('meshes',[]);accessors=doc.get('accessors',[]);seen=set()
    if len(nodes)>10000:raise ValueError('Excessive node count')
    def count(idx,parents=()):
        if idx in seen or len(parents)>64 or not isinstance(idx,int) or not 0<=idx<len(nodes):raise ValueError('Invalid GLB scene graph')
        seen.add(idx);node=nodes[idx];tris=0
        if 'mesh' in node:
            for p in meshes[node['mesh']]['primitives']:
                if p.get('mode',4)!=4:raise ValueError('Non-triangle primitive')
                tris+=accessors[p.get('indices',p['attributes']['POSITION'])]['count']//3
        return tris+sum(count(child,parents+(idx,)) for child in node.get('children',[]))
    triangles=sum(count(i) for i in doc['scenes'][doc.get('scene',0)]['nodes'])
    if not 0<triangles<=70000:raise ValueError('Vegetation triangle budget exceeded')
    return triangles

def extract_pack(data,picks):
    out={}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if len(z.infolist())>100:raise ValueError('Unexpected archive entry count')
        for i in z.infolist():
            if i.is_dir() or not i.filename.lower().endswith('.glb'):continue
            key=wanted(i.filename,picks)
            if key is None or key in out or not 0<i.file_size<=MAX_FILE:continue
            try:
                raw=z.read(i);inspect(raw);out[key]=raw
            except Exception as e:print('Skipped vegetation ZIP entry:',i.filename,str(e),flush=True)
    return out

def category(category,picks):
    page=PAGE+category;out={}
    try:
        contents=fetch(page,MAX_PAGE).decode('utf8','replace')
        candidates=urls(contents,page,'glb|zip')
        packs=[u for u in candidates if urlsplit(u).path.lower().endswith('.zip')]
        packs.sort(key=lambda u:(category not in u,u))
        for u in packs[:2]:
            try:
                for key,raw in extract_pack(fetch(u,MAX_ZIP),picks).items():out[key]=(raw,u)
                if len(out)==len(picks):return out
            except Exception as e:print('Vegetation pack unavailable:',u,str(e),flush=True)
        # Prefer literal individual GLB links where the pack has no ZIP link.
        for u in candidates:
            if not urlsplit(u).path.lower().endswith('.glb'):continue
            key=wanted(urlsplit(u).path,picks)
            if key is None or key in out:continue
            try:
                raw=fetch(u,MAX_FILE);inspect(raw);out[key]=(raw,u)
            except Exception as e:print('Vegetation model unavailable:',u,str(e),flush=True)
    except Exception as e:print('Vegetation catalogue unavailable:',page,str(e),flush=True)
    return out

def poly_cards(root):
    b=Builder(root,fetch=poly_fetch);records={}
    for kind,asset in POLY.items():
        try:
            meta=b.meta(asset)
            c,fmt=file_entry(meta,MAPS['color'],'1k',('png','jpg','jpeg'),slug=asset)
            a,afmt=file_entry(meta,('Alpha','alpha','opacity','mask'),'1k',('png','jpg','jpeg'),slug=asset)
            records[kind]={'color':b.save(c,f'vegetation/{kind}-color.{fmt}'),
                           'alpha':b.save(a,f'vegetation/{kind}-alpha.{afmt}'),
                           'source':'https://polyhaven.com/a/'+asset,'license':'CC0-1.0'}
        except Exception as e:print('Optional foliage imagery unavailable:',asset,str(e),flush=True)
    return records,b.records

def main(root):
    root=Path(root);folder=root/'vegetation';folder.mkdir(parents=True,exist_ok=True)
    manifest={'version':1,'models':{},'cards':{},'files':[]}
    with ThreadPoolExecutor(max_workers=4) as pool:
        card_job=pool.submit(poly_cards,root)
        jobs=[pool.submit(category,c,p) for c,p in PICKS.items()]
        for job in jobs:
            for kind,(raw,url) in job.result().items():
                name=kind+'.glb';target=folder/name
                tmp=folder/(name+'.tmp');tmp.write_bytes(raw);tmp.replace(target)
                manifest['models'][kind]='/assets/polyhaven/vegetation/'+name
                manifest['files'].append({'file':name,'source':url,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
                                          'triangles':inspect(raw),'author':'vinish.dev','license':'CC BY 4.0'})
        manifest['cards'],card_records=card_job.result()
        manifest['files'].extend(card_records)
    (folder/'LICENSE.txt').write_text('Plant models: vinish.dev (https://vinish.dev/free-3d-models/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). In-game changes: instancing, scale and wind animation.\nFoliage textures: Poly Haven (https://polyhaven.com/), CC0 1.0.\n','utf8')
    tmp=folder/'manifest.json.tmp';tmp.write_text(json.dumps(manifest,indent=2),'utf8');tmp.replace(folder/'manifest.json')
    print(f'Vegetation: {len(manifest["models"])} downloaded models; {len(manifest["cards"])} CC0 texture pairs; local fallbacks available.',flush=True)

def self_test():
    page='<a href="https://models.vinish.dev/assets/grass-tuft.glb">Download</a><a href="https://untrusted.example/grass-tuft.glb">bad</a>'
    assert 'https://models.vinish.dev/assets/grass-tuft.glb' in urls(page,PAGE+'grass-and-ground-cover','glb|zip')
    assert all(urlsplit(u).hostname in HOSTS for u in urls(page,PAGE+'grass-and-ground-cover','glb|zip'))
    assert wanted('nested/grass-tuft.glb',PICKS['grass-and-ground-cover'])=='grass'
    doc={'asset':{'version':'2.0','copyright':'vinish.dev CC BY 4.0'},'buffers':[{'byteLength':36}],
         'bufferViews':[{'buffer':0,'byteLength':36}],'accessors':[{'count':3,'componentType':5126,'type':'VEC3','bufferView':0}],
         'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],'nodes':[{'mesh':0}],'scenes':[{'nodes':[0]}]}
    j=json.dumps(doc).encode();j+=b' '*(-len(j)%4)
    raw=struct.pack('<4sII',b'glTF',2,28+len(j)+36)+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',36,b'BIN\0')+bytes(36)
    assert inspect(raw)==1
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:z.writestr('nested/grass-tuft.glb',raw)
    assert extract_pack(stream.getvalue(),PICKS['grass-and-ground-cover'])=={'grass':raw}
    try:inspect(raw[:-1])
    except ValueError:pass
    else:raise AssertionError('Truncated model accepted')
    print('Vegetation URL allowlist, GLB inspection and ZIP selection verified',flush=True)

if __name__=='__main__':
    if sys.argv[1]=='--self-test':self_test()
    else:main(sys.argv[1])
