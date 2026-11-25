#!/usr/bin/env python3
"""Pinned MIT WebXR generic-hand GLBs. No remote requests from browsers."""
import argparse, hashlib, json, struct
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

REV='f4992299601614adbfefd398dc8e281556bb7444'
BASE='https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/'+REV+'/packages/assets/profiles/generic-hand/'
FILES={'left':('670ec9bed67d3e509859641d2194a9cab7d9fc29',94572),'right':('215f50d70fb7a5a884025b508cf5c58230913371',94004)}

def validate(data,side):
    sha,size=FILES[side]
    if len(data)!=size or hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()!=sha: raise ValueError('Handmodell-Pruefsumme falsch')
    magic,version,length,n,kind=struct.unpack_from('<4sIII4s',data)
    if magic!=b'glTF' or version!=2 or length!=len(data) or kind!=b'JSON' or n>len(data)-20: raise ValueError('Ungueltiges GLB')
    doc=json.loads(data[20:20+n]);names={o.get('name') for o in doc.get('nodes',[])}
    if len(doc.get('skins',[]))!=1 or not {'wrist','thumb-tip','index-finger-tip','middle-finger-tip','ring-finger-tip','pinky-finger-tip'}<=names: raise ValueError('Unvollstaendiges Handskelett')
    if any('uri' in x and not x['uri'].startswith('data:') for k in ('buffers','images') for x in doc.get(k,[])): raise ValueError('Externe GLB-Abhaengigkeiten')
    return data

def install(root,local,fetch=None):
    root,local=Path(root),Path(local);manifest=json.loads((root/'manifest.json').read_text());manifest['files']=[f for f in manifest.get('files',[]) if not f['file'].startswith('hands/')];manifest['hands']={};manifest['hand_status']={};dest=root/'hands';dest.mkdir(exist_ok=True)
    for side,(sha,size) in FILES.items():
        try:
            f=local/(side+'.glb')
            if f.is_file():
                with f.open('rb') as r: data=r.read(size+1)
            elif fetch: data=fetch(BASE+side+'.glb',size+1)
            else:
                with urlopen(Request(BASE+side+'.glb',headers={'User-Agent':'SecondLive-Genesis/0.6.8'}),timeout=15) as r:
                    if urlsplit(r.geturl()).hostname!='raw.githubusercontent.com': raise ValueError('Unerwartete Download-Adresse')
                    data=r.read(size+1)
            validate(data,side);(dest/(side+'.glb')).write_bytes(data);manifest['hands'][side]='/assets/polyhaven/hands/'+side+'.glb';manifest['hand_status'][side]='verified';manifest.setdefault('files',[]).append({'file':'hands/'+side+'.glb','url':BASE+side+'.glb','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'license':'MIT'})
            print('WebXR-Handmodell:',side,'verifiziert',flush=True)
        except (OSError,ValueError,RuntimeError) as exc:
            (dest/(side+'.glb')).unlink(missing_ok=True);manifest['hand_status'][side]='unavailable';print('WARNUNG: Handmodell',side,exc,flush=True)
    (dest/'LICENSE.txt').write_bytes((local/'LICENSE.txt').read_bytes())
    manifest['bytes']=sum(f['bytes'] for f in manifest['files']);manifest['hand_source']={'revision':REV,'license':'MIT','url':'https://github.com/immersive-web/webxr-input-profiles/tree/'+REV+'/packages/assets/profiles/generic-hand'}
    tmp=root/'.hands-manifest.tmp';tmp.write_text(json.dumps(manifest,indent=2));tmp.replace(root/'manifest.json')
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--local',type=Path,required=True);a=p.parse_args();install(a.output,a.local)
