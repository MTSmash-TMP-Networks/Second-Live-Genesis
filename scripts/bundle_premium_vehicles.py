#!/usr/bin/env python3
"""Install the exact user-supplied, CC BY 4.0 vehicle pack without network IO."""
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path

PACK = 'Second-Live-Premium-Vehicles.zip'
SOURCE = 'https://vinish.dev/free-3d-models/realistic-cars'
PINS = {
    'boxy-off-roader-lod0.glb': ('e05c64f1b8f131c1a1d88d55c506afc008bbd5378a8523123dc006c5812aba7e', 5009344, 176380),
    'boxy-off-roader-lod1.glb': ('a46f86ab7afd98a2667d85f37f60d1cb10b87c422d90387518297e6715d0c0be', 2627676, 100219),
    'grand-tourer-lod0.glb': ('7998bce260ca45c5f0a5a9eea5ceb06c76c0f61399e1e2394c4dcaca0383c9c4', 3935804, 130382),
    'grand-tourer-lod1.glb': ('8fe939e62eaddcf6eed8da22ba7e058c996ccc6460d53d56daac004b43ed4a63', 2068532, 69943),
    'luxury-suv-lod0.glb': ('40990c9f7c06e5407d8f52186ec2a393322e339acfaf88cd8a50e382daa5f8b8', 4459420, 157159),
    'luxury-suv-lod1.glb': ('0039fdb1251cda733caae2985d6724fda57359f7303f2f3c94285a650a0f2332', 2307748, 86318),
    'mid-engine-supercar-lod0.glb': ('153bb0ff391dbcd816acb2f22cec30e212f65fffd6477ed903a20783cfbc2e3a', 4001228, 129311),
    'mid-engine-supercar-lod1.glb': ('0e1f36869f995a0e3039a7bd09d4c0cff2c413b1800cdd38f347752900e8dd11', 2102728, 70618),
    'muscle-coupe-lod0.glb': ('f3fc9864f2850c3cd62e9655f8529ce2a0641f1b863b9a9c1196dc4a9c9fc890', 4087004, 140620),
    'muscle-coupe-lod1.glb': ('0c1e7c82920f9bee4fda23b9e221d6b6804ba86fa03a0d030f8efefcbc8be573', 2052516, 71314),
}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def inspect_glb(data):
    require(len(data) >= 32 and struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data)), 'Invalid GLB header')
    size, tag = struct.unpack_from('<I4s', data, 12)
    require(tag == b'JSON' and size % 4 == 0 and size + 28 <= len(data), 'Invalid JSON chunk')
    doc = json.loads(data[20:20+size]); n, tag = struct.unpack_from('<I4s', data, 20+size)
    require(tag == b'BIN\0' and n + size + 28 == len(data), 'Invalid embedded BIN')
    require(doc.get('asset', {}).get('version') == '2.0', 'Invalid glTF version')
    extras = doc['asset'].get('extras', {})
    require(extras.get('author') == 'vinish.dev' and extras.get('license') == 'CC BY 4.0', 'Missing source credit')
    require(not doc.get('extensionsRequired'), 'Unexpected required extension')
    require(len(doc['buffers']) == 1 and doc['buffers'][0]['byteLength'] <= n, 'Invalid buffers')
    require(not any('uri' in x for k in ('images', 'buffers') for x in doc.get(k, [])), 'External resources not allowed')
    require(all(im.get('mimeType') in ('image/png', 'image/jpeg') and 'bufferView' in im for im in doc['images']), 'Unsupported image')
    for view in doc['bufferViews']:
        require(view['buffer'] == 0 and 0 <= view.get('byteOffset', 0) <= n and 0 < view['byteLength'] <= n-view.get('byteOffset', 0), 'Invalid buffer view')
    names = {node.get('name', '').lower() for node in doc['nodes']}
    require({'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'steering_wheel'} <= names, 'Missing wheel or steering pivots')
    def count(i, active=()):
        require(i not in active, 'Cyclic scene')
        node = doc['nodes'][i]
        tris = 0
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                require(primitive.get('mode', 4) == 4 and 'indices' in primitive, 'Unsupported primitive')
                tris += doc['accessors'][primitive['indices']]['count']//3
        return tris+sum(count(child, active+(i,)) for child in node.get('children', []))
    triangles = sum(count(i) for i in doc['scenes'][doc.get('scene', 0)]['nodes'])
    require(0 < triangles <= 180000, 'Vehicle exceeds triangle budget')
    return extras['title'], triangles

def bundle(source, target):
    source, target = Path(source), Path(target)
    target.mkdir(parents=True, exist_ok=True)
    # Never publish an incomplete or stale manifest after a failed verification.
    manifest_path = target/'manifest.json'
    manifest = {'format': 'second-live-premium-vehicles-v1', 'provider': 'vinish.dev', 'license': 'CC BY 4.0', 'files': [], 'ready': 0}
    archive = source/PACK
    if not archive.is_file():
        manifest_path.write_text(json.dumps(manifest, indent=2), 'utf8')
        print('Premium vehicles: no local pack; previous vehicle models remain active.', flush=True)
        return manifest
    records = []
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist(); allowed = set(PINS)|{'manifest.json', 'LICENSE.txt'}
        require(len(infos) == len(allowed) and {i.filename for i in infos} == allowed, 'Unexpected or duplicate archive entries')
        # Check every pinned byte sequence before writing anything to the target.
        license_text = z.getinfo('LICENSE.txt'); require(0 < license_text.file_size <= 16384, 'Invalid license file')
        manifest_info = z.getinfo('manifest.json'); require(0 < manifest_info.file_size <= 32768, 'Invalid archive manifest')
        credit = z.read(license_text).decode('utf8'); require('vinish.dev' in credit and 'CC BY 4.0' in credit, 'Missing credit')
        for name, (digest, size, expected_tris) in PINS.items():
            info = z.getinfo(name); require(info.file_size == size and not info.is_dir(), 'Wrong size: '+name)
            raw = z.read(info); require(hashlib.sha256(raw).hexdigest() == digest, 'Checksum mismatch: '+name)
            title, tris = inspect_glb(raw); require(tris == expected_tris, 'Triangle count mismatch: '+name)
            model, lod = name[:-4].rsplit('-lod', 1)
            records.append({'file': name, 'model': model, 'lod': int(lod), 'title': title, 'sha256': digest, 'bytes': size, 'triangles': tris, 'source': SOURCE, 'author': 'vinish.dev', 'license': 'CC BY 4.0'})
        for record in records:
            name = record['file']; tmp = target/(name+'.tmp'); tmp.write_bytes(z.read(name)); tmp.replace(target/name)
        (target/'LICENSE.txt').write_text(credit, 'utf8')
    manifest['files'] = records; manifest['ready'] = len(records)
    tmp = target/'manifest.json.tmp'; tmp.write_text(json.dumps(manifest, indent=2), 'utf8'); tmp.replace(manifest_path)
    print(f'Premium vehicles: {len(records)}/10 local assets verified and installed.', flush=True)
    return manifest

if __name__ == '__main__':
    bundle(sys.argv[1], sys.argv[2])
