import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
import urllib.request
import urllib.error
import threading
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.download_assets import Builder, API, TEXTURES, MODELS, HDRIS, QUALITIES, safe_rel, file_entry, MAPS, PHOTOS, SURFACE_HI, request_bytes
import server


class MockProvider:
    """Fixture only: no actual photos, no network. Same structure as /files."""
    def __init__(self): self.files = {}; self.metadata = {}
    def entry(self, name, data):
        url = 'https://dl.polyhaven.org/file/test/' + name
        self.files[url] = data
        return {'url': url, 'size': len(data), 'md5': hashlib.md5(data).hexdigest()}
    def __call__(self, url, limit):
        if url.startswith(API): return json.dumps(self.metadata[url[len(API):]]).encode()
        return self.files[url]
    def fill(self):
        for slug in TEXTURES:
            self.metadata[slug] = {key: {q: {'jpg': self.entry(f'{slug}-{q}-{key}.jpg', (slug+q+key).encode())} for q in QUALITIES} for key in ('Diffuse','nor_gl','Rough')}
        for slug in MODELS:
            self.metadata[slug] = {'gltf': {}}
            for q in QUALITIES:
                doc = {'asset': {'version': '2.0'}, 'buffers': [{'uri': 'mesh.bin', 'byteLength': 4}], 'images': [{'uri': 'textures/color.jpg'}]}
                main = self.entry(f'{slug}-{q}.gltf', json.dumps(doc).encode())
                main['include'] = {'mesh.bin': self.entry(slug+'-mesh.bin', b'mesh'), 'textures/color.jpg': self.entry(f'{slug}-{q}.jpg', b'image')}
                self.metadata[slug]['gltf'][q] = {'gltf': main}
        for slug in HDRIS:
            self.metadata[slug] = {'hdri': {'1k': {'hdr': self.entry(slug+'.hdr', b'fake-HDR-fixture')}}}
        for key,(url,fmt,_,__) in PHOTOS.items():
            self.files[url] = (b'\x89PNG\r\n\x1a\n'+b'x'*150) if fmt=='png' else (b'\xff\xd8\xff'+b'x'*150+b'\xff\xd9')
        return self


class AssetTests(unittest.TestCase):
    def test_all_profiles_and_dependencies(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill(); manifest=Builder(temp,p).build()
            self.assertEqual(set(manifest['profiles']),set(QUALITIES))
            self.assertEqual(len(manifest['files']),53)
            for q in QUALITIES:
                self.assertEqual(set(manifest['profiles'][q]['textures']),set(TEXTURES))
                self.assertEqual(set(manifest['profiles'][q]['models']),set(MODELS))
            self.assertEqual(set(manifest['lighting']),set(HDRIS))
            self.assertEqual(set(manifest['photos']),set(PHOTOS))
            for rec in manifest['files']:
                path=Path(temp)/rec['file'];self.assertTrue(path.is_file());self.assertEqual(hashlib.md5(path.read_bytes()).hexdigest(),rec['md5'])
            self.assertEqual(json.loads((Path(temp)/'manifest.json').read_text())['bytes'],manifest['bytes'])
    def test_real_api_key_casing_and_legacy_aliases(self):
        for color, normal, rough in [('Diffuse', 'nor_gl', 'Rough'), ('diff', 'nor_gl', 'rough'), ('DIFFUSE', 'NOR_GL', 'ROUGHNESS')]:
            with self.subTest(keys=(color, normal, rough)):
                p = MockProvider(); meta = {k: {'1K': {'JPG': p.entry(k+'.jpg', k.encode())}} for k in (color, normal, rough)}
                for name, expected in [('color', color), ('normal', normal), ('roughness', rough)]:
                    item, fmt = file_entry(meta, MAPS[name], '1k', ('jpg','png'), slug='wood_floor')
                    self.assertEqual(item, meta[expected]['1K']['JPG']); self.assertEqual(fmt,'jpg')
    def test_alternate_format_and_exact_preference(self):
        p=MockProvider(); a=p.entry('a.png', b'a'); b=p.entry('b.jpg', b'b')
        item, fmt = file_entry({'Diffuse': {'1k': {'png': a, 'jpg': b}}, 'diffuse': {'1k': {'jpg': a}}}, MAPS['color'], '1k', ('jpg','png'), slug='wood_floor')
        self.assertEqual((item,fmt),(b,'jpg'))
        self.assertEqual(file_entry({'Diffuse': {'1k': {'png': a}}}, MAPS['color'], '1k', ('jpg','png')), (a,'png'))
    def test_missing_map_diagnostics_and_normal_convention(self):
        p=MockProvider(); a=p.entry('dx.jpg',b'dx')
        with self.assertRaisesRegex(ValueError, 'Asset wood_floor:.*API-Schluessel: nor_dx'):
            file_entry({'nor_dx': {'1k': {'jpg': a}}}, MAPS['normal'], '1k', ('jpg','png'), slug='wood_floor')
        with self.assertRaisesRegex(ValueError, 'Asset wood_floor:.*Aufloesungen: Diffuse: 4k'):
            file_entry({'Diffuse': {'4k': {'jpg': a}}}, MAPS['color'], '1k', ('jpg','png'), slug='wood_floor')
    def test_high_res_and_ao(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill();slug='white_plaster_02';meta=p.metadata[slug]
            for key in ('Diffuse','nor_gl','Rough','AO'):
                meta.setdefault(key,{})['4k']={'jpg':p.entry(key+'4k.jpg',key.encode())}
                if key=='AO':meta[key]['2k']={'jpg':p.entry('ao2k.jpg',b'ao')}
            result=Builder(temp,p).texture(slug,meta,'2k')
            self.assertIn('ao',result)
            self.assertEqual((Path(temp)/'2k/textures/white_plaster_02/color.jpg').read_bytes(),b'Diffuse')
    def test_photo_invalid_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill();p.files[PHOTOS['pistol'][0]]=b'not an image'*20
            with self.assertRaisesRegex(ValueError,'Originalfoto'):Builder(temp,p).photo('pistol',PHOTOS['pistol'])
    def test_rate_limit_stops_only_optional_downloads(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill();calls=[]
            def limited(url,limit):
                calls.append(url)
                if url==PHOTOS['pistol'][0]:
                    raise urllib.error.HTTPError(url,429,'Too Many Requests',{'Retry-After':'600'},None)
                return p(url,limit)
            manifest=Builder(temp,limited).build()
            self.assertEqual(manifest['photos'],{})
            self.assertEqual(manifest['photo_status'],{'pistol':'rate_limited','rifle':'skipped_rate_limit'})
            self.assertNotIn(PHOTOS['rifle'][0],calls)
            self.assertEqual(len(manifest['files']),51)
            self.assertEqual(json.loads((Path(temp)/'manifest.json').read_text()),manifest)
            self.assertTrue(all((Path(temp)/r['file']).exists() for r in manifest['files']))
    def test_photo_request_429_no_retry(self):
        url=PHOTOS['pistol'][0]
        with patch('scripts.download_assets.urlopen',side_effect=urllib.error.HTTPError(url,429,'rate limit',{'Retry-After':'600'},None)) as opener, patch('scripts.download_assets.time.sleep') as sleep:
            with self.assertRaises(urllib.error.HTTPError):request_bytes(url,1024)
            self.assertEqual(opener.call_count,1);sleep.assert_not_called()
    def test_core_layer_and_local_photos_without_remote_requests(self):
        with tempfile.TemporaryDirectory() as temp, tempfile.TemporaryDirectory() as local:
            p=MockProvider().fill(); manifest=Builder(temp,p).build(core_only=True)
            core_files=list(manifest['files']);self.assertEqual(manifest['photos'],{})
            for key,(url,fmt,_,__) in PHOTOS.items():(Path(local)/f'{key}.{fmt}').write_bytes(p.files[url])
            def offline(url,limit):self.fail('unexpected network request: '+url)
            result=Builder(temp,offline).add_photos(manifest,local)
            self.assertEqual(result['photo_status'],{'pistol':'local','rifle':'local'})
            self.assertEqual(result['files'][:len(core_files)],core_files)
            self.assertEqual(len(result['files']),53)
            self.assertTrue(all(r['origin']=='local' for r in result['files'][-2:]))
    def test_invalid_optional_photo_does_not_block_other_photo(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill();p.files[PHOTOS['pistol'][0]]=b'not an image'*20
            result=Builder(temp,p).build()
            self.assertEqual(result['photo_status'],{'pistol':'unavailable','rifle':'downloaded'})
            self.assertEqual(set(result['photos']),{'rifle'})
    def test_required_asset_error_is_still_fatal(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill();entry=p.metadata[TEXTURES[0]]['Diffuse']['1k']['jpg'];p.files[entry['url']]=b'invalid'
            with self.assertRaisesRegex(ValueError,'Pruefsumme'):Builder(temp,p).build(core_only=True)
            self.assertFalse((Path(temp)/'manifest.json').exists())
    def test_bad_checksum_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider(); item=p.entry('bad.bin', b'good');p.files[item['url']]=b'evil'
            with self.assertRaisesRegex(ValueError,'Pruefsumme'):Builder(temp,p).save(item,'bad.bin')
            self.assertFalse((Path(temp)/'bad.bin').exists())
    def test_missing_gltf_dependency_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p=MockProvider().fill();slug=MODELS[0];meta=p.metadata[slug];del meta['gltf']['1k']['gltf']['include']['mesh.bin']
            with self.assertRaisesRegex(ValueError,'Fehlende glTF'):Builder(temp,p).model(slug,meta,'1k')
    def test_path_traversal_rejected(self):
        for value in ('../data/world.sqlite3','/etc/passwd','textures/../../secret','https://other.com/x','%2e%2e/secret','foo\\bar'):
            with self.subTest(value=value), self.assertRaises(ValueError): safe_rel(value)
    def test_legacy_world_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with sqlite3.connect(root/'world.sqlite3') as db:
                db.execute('CREATE TABLE objects(id TEXT PRIMARY KEY,hp INTEGER NOT NULL)');db.execute("INSERT INTO objects VALUES ('table',0)")
                db.execute('CREATE TABLE progress(id INTEGER PRIMARY KEY,unlocked INTEGER NOT NULL)');db.execute('INSERT INTO progress VALUES (1,1)')
            world=server.GameStore(root);s=world.state();self.assertEqual(s['objects']['table'],0);self.assertEqual(s['objects']['sofa'],150);self.assertTrue(s['unlocked'])
            for i in range(6):s=world.action({'action':'hit','id':'sofa'},None)
            self.assertEqual(server.GameStore(root).state()['objects']['sofa'],0)
            self.assertEqual(world.action({'action':'repair','id':'sofa'},None)['objects']['sofa'],150)
    def test_asset_http_and_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);web=root/'web';assets=web/'assets/polyhaven';assets.mkdir(parents=True)
            (assets/'manifest.json').write_text('{}');(assets/'model.gltf').write_text('{}');(assets/'mesh.bin').write_bytes(b'mesh');(assets/'light.hdr').write_bytes(b'hdr');(assets/'private.sqlite3').write_bytes(b'secret')
            (web/'outside.jpg').write_bytes(b'outside');(assets/'link.jpg').symlink_to(web/'outside.jpg')
            with patch.object(server,'WEB',web):
                srv=server.create_server(port=0,data_dir=root/'data',token='secret');thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start();url=f'http://127.0.0.1:{srv.server_port}'
                try:
                    for path,mime in [('manifest.json','application/json'),('model.gltf','model/gltf+json'),('mesh.bin','application/octet-stream'),('light.hdr','application/octet-stream')]:
                        with urllib.request.urlopen(url+'/assets/polyhaven/'+path) as r:self.assertEqual(r.headers.get_content_type(),mime)
                    for path in ['%2e%2e/%2e%2e/outside.jpg','link.jpg','private.sqlite3','missing.jpg']:
                        with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(url+'/assets/polyhaven/'+path)
                        self.assertEqual(e.exception.code,404)
                finally:srv.shutdown();srv.server_close();thread.join()


if __name__=='__main__':unittest.main()
