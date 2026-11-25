#!/usr/bin/env python3
"""Optional licensed game-art models. Fetch only at image build time."""
import argparse
import hashlib
import io
import json
import math
import struct
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

URL='https://opengameart.org/sites/default/files/m16.obj'
TEXTURED_URL='https://opengameart.org/sites/default/files/m16.zip'
LIMIT=512*1024
ZIP_LIMIT=8*1024*1024
CREDIT='M16 rifle by Osmic, CC BY 3.0, https://opengameart.org/content/m16-rifle — adapted for Second Live (sanitized OBJ, display materials and scale). https://creativecommons.org/licenses/by/3.0/'


def validate(data):
    if not 0<len(data)<=LIMIT: raise ValueError('OBJ size invalid')
    text=data.decode('utf-8-sig'); counts={'v':0,'vt':0,'vn':0}; faces=0; clean=[]
    for line in text.splitlines():
        line=line.split('#',1)[0].strip()
        if not line: continue
        parts=line.split(); tag=parts[0]
        if tag in counts:
            vals=[float(x) for x in parts[1:]]
            lo,hi={'v':(3,7),'vt':(2,3),'vn':(3,3)}[tag]
            if not lo<=len(vals)<=hi or not all(math.isfinite(x) and abs(x)<1e6 for x in vals): raise ValueError('Invalid OBJ coordinate')
            counts[tag]+=1
            if counts[tag]>30000: raise ValueError('Oversized mesh')
            clean.append(' '.join(parts))
        elif tag=='f':
            if not 3<=len(parts)-1<=32: raise ValueError('Invalid face')
            for x in parts[1:]:
                idx=x.split('/')
                if not idx[0] or len(idx)>3: raise ValueError('Invalid face reference')
                for k,i in zip(('v','vt','vn'),idx):
                    if i:
                        a=int(i)
                        if a==0 or abs(a)>counts[k]: raise ValueError('Invalid OBJ index')
            faces+=len(parts)-3;clean.append(' '.join(parts))
        elif tag in ('o','g','s','usemtl'):
            clean.append(' '.join(parts))
        # No external material libraries or file references in the served OBJ.
    if not 4<=counts['v']<=20000 or not 4<=faces<=40000: raise ValueError('Empty or oversized mesh')
    return ('\n'.join(clean)+'\n').encode()


def read_png(data):
    if len(data)<33 or len(data)>ZIP_LIMIT or data[:8]!=b'\x89PNG\r\n\x1a\n' or data[12:16]!=b'IHDR': raise ValueError('Invalid PNG')
    w,h=struct.unpack('>II',data[16:24])
    if not (0<w<=2048 and 0<h<=2048): raise ValueError('Texture exceeds limit')
    return data


def unpack_textured(raw):
    if len(raw)>ZIP_LIMIT: raise ValueError('Archive too large')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        infos=[i for i in z.infolist() if not i.is_dir() and not i.filename.startswith('__MACOSX/') and not Path(i.filename).name.startswith('.')]
        if len(infos)>40 or sum(i.file_size for i in infos)>16*1024*1024: raise ValueError('Archive exceeds limits')
        objs=[i for i in infos if Path(i.filename).suffix.lower()=='.obj']
        if len(objs)!=1: raise ValueError('Expected one game-art OBJ')
        result={'m16.obj':validate(z.read(objs[0]))}
        pngs=[i for i in infos if Path(i.filename).suffix.lower()=='.png']
        normal=[i for i in pngs if any(k in Path(i.filename).stem.lower() for k in ('normal','norm','_nrm','_nmap')) or Path(i.filename).stem.lower().endswith('_n')]
        colors=[i for i in pngs if i not in normal and any(k in Path(i.filename).stem.lower() for k in ('diff','albedo','color','colour','base','texture'))]
        if not colors:
            other=[i for i in pngs if i not in normal]
            if len(other)==1: colors=other
        if len(colors)==1: result['m16_color.png']=read_png(z.read(colors[0]))
        if len(normal)==1: result['m16_normal.png']=read_png(z.read(normal[0]))
        if 'm16_color.png' not in result: raise ValueError('Color map not identified')
        return result


def download(url,limit):
    with urlopen(Request(url,headers={'User-Agent':'SecondLive-Genesis/0.6.9 (game asset)'}),timeout=12) as r:
        if urlsplit(r.geturl()).hostname!='opengameart.org': raise ValueError('Unexpected redirect')
        return r.read(limit)


def install(root,fetch=None):
    root=Path(root); path=root/'manifest.json'; m=json.loads(path.read_text());dest=root/'props';dest.mkdir(exist_ok=True)
    names=('m16.obj','m16_color.png','m16_normal.png')
    m['files']=[f for f in m.get('files',[]) if f['file'] not in {'props/'+n for n in names}]
    for k in ('m16_obj','m16_color','m16_normal','m16_credit'):m.pop(k,None)
    for n in names:(dest/n).unlink(missing_ok=True)
    fetch=fetch or download;assets={};url=TEXTURED_URL;license='CC-BY-3.0'
    try:
        assets=unpack_textured(fetch(TEXTURED_URL,ZIP_LIMIT+1));m['m16_credit']=CREDIT
    except (OSError,ValueError,RuntimeError,zipfile.BadZipFile,NotImplementedError) as e:
        print('Textured game prop unavailable; trying CC0:',e,flush=True)
        url=URL;license='CC0'
        try:assets={'m16.obj':validate(fetch(URL,LIMIT+1))};m['m16_credit']='Low Poly Weapon Pack by byzmod3d, CC0, https://opengameart.org/content/low-poly-weapon-pack'
        except (OSError,ValueError,RuntimeError) as exc:print('Optional game prop unavailable; local display model:',exc,flush=True)
    for n,data in assets.items():
        (dest/n).write_bytes(data);key={'m16.obj':'m16_obj','m16_color.png':'m16_color','m16_normal.png':'m16_normal'}[n];rel='props/'+n;m[key]='/assets/polyhaven/'+rel
        m['files'].append({'file':rel,'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'license':license})
    m['bytes']=sum(f['bytes'] for f in m['files']);tmp=root/'.m16-manifest.tmp';tmp.write_text(json.dumps(m,indent=2));tmp.replace(path);return m

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);install(p.parse_args().output)
