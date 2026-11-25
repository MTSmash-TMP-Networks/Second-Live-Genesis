"""Fetch exact prebuilt Microsoft Rocketbox GLBs (MIT) during Docker build."""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import struct
import time
import urllib.request

def validate_glb(data, name):
    if len(data) < 20 or struct.unpack_from('<III', data) != (0x46546c67, 2, len(data)):
        raise ValueError(f'{name}: invalid GLB header')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4e4f534a or 20 + length > len(data):
        raise ValueError(f'{name}: invalid GLB JSON chunk')
    g = json.loads(data[20:20+length])
    if not all(g.get(k) for k in ('skins', 'meshes', 'images', 'materials')):
        raise ValueError(f'{name}: missing rig, geometry or textures')
    clips = {a.get('name', '').lower() for a in g.get('animations', [])}
    if not {'idle', 'walk'}.issubset(clips):
        raise ValueError(f'{name}: missing native idle/walk')
    names = {n.get('name', '') for n in g.get('nodes', [])}
    for part in ('Outfit_original', 'Top_shirt', 'Top_tee', 'Trousers', 'Shoes'):
        if not any(n == part or n.startswith(part + '_') or n.startswith(part + '.') for n in names):
            raise ValueError(f'{name}: missing outfit part {part}')
    for item in g.get('images', []) + g.get('buffers', []):
        if item.get('uri') and not item['uri'].startswith('data:'):
            raise ValueError(f'{name}: nonembedded resource')
    return len(g['animations'])

def download(base, entry, out):
    dest = out / entry['file']
    if pathlib.Path(entry['file']).name != entry['file']:
        raise ValueError('Invalid asset filename')
    def check(data):
        digest = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if len(data) != entry['size'] or digest != entry['sha']:
            raise ValueError(f"{entry['file']}: upstream integrity mismatch")
        if dest.suffix == '.glb':
            clips = validate_glb(data, dest.name)
            print(f'{dest.name}: rig, textures, outfits, {clips} clips verified', flush=True)
        elif not data.startswith((b'#?RADIANCE', b'#?RGBE')):
            raise ValueError('Invalid studio HDR')
    # Hash the exact Git blob (including the canonical header).
    for attempt in range(4):
        try:
            req = urllib.request.Request(base + entry['path'], headers={'User-Agent':'SecondLive-asset-builder/1.0'})
            with urllib.request.urlopen(req, timeout=60) as res:
                data = res.read(entry['size'] + 1)
            check(data)
            tmp = dest.with_suffix(dest.suffix + '.part')
            tmp.write_bytes(data)
            tmp.replace(dest)
            return
        except Exception as e:
            if attempt == 3:
                raise
            print(f"{dest.name}: retry {attempt+1}: {e}", flush=True)
            time.sleep(2 ** attempt)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True, type=pathlib.Path)
    p.add_argument('--output', required=True, type=pathlib.Path)
    a = p.parse_args()
    m = json.loads(a.manifest.read_text())
    assert len(m['models']) == 20
    a.output.mkdir(parents=True, exist_ok=True)
    base = f"https://raw.githubusercontent.com/{m['repository']}/{m['revision']}/"
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(lambda e: download(base, e, a.output), m['models'] + [m['lighting']]):
            pass
    print('All 20 pinned Rocketbox models and studio HDR verified.', flush=True)

if __name__ == '__main__':
    main()
