import tempfile
import unittest
from pathlib import Path
import hashlib
import json
from scripts.download_assets import Builder, API
from scripts.download_decor import extend, DECOR
from test_assets import MockProvider


class DecorTests(unittest.TestCase):
    def fixture(self):
        provider = MockProvider().fill()
        for slug in DECOR.values():
            doc = {'asset': {'version': '2.0'}, 'buffers': [{'uri': 'mesh.bin'}]}
            entry = provider.entry(slug+'.gltf', json.dumps(doc).encode())
            entry['include'] = {'mesh.bin': provider.entry(slug+'.bin', b'geometry')}
            provider.metadata[slug] = {'gltf': {'1k': {'gltf': entry}}}
        return provider

    def test_optional_decor_install_and_repeat(self):
        with tempfile.TemporaryDirectory() as d:
            provider = self.fixture()
            base = Builder(d, provider).build(core_only=True)
            result = extend(d, provider)
            self.assertEqual(set(result['decor_models']), set(DECOR))
            self.assertEqual(len(result['files']), len(base['files']) + 4)
            self.assertEqual(extend(d, provider)['files'], result['files'])
            for rec in result['files']:
                self.assertEqual(hashlib.md5((Path(d)/rec['file']).read_bytes()).hexdigest(), rec['md5'])

    def test_failed_bed_leaves_core_and_nightstand_available(self):
        with tempfile.TemporaryDirectory() as d:
            provider = self.fixture()
            base = Builder(d, provider).build(core_only=True)
            # A failure after the main glTF is already written must roll back the optional files.
            slug = DECOR['bed']
            provider.metadata[slug]['gltf']['1k']['gltf']['include'] = {}
            result = extend(d, provider)
            self.assertEqual(result['realism_status']['bed'], 'unavailable')
            self.assertEqual(set(result['decor_models']), {'nightstand'})
            self.assertEqual(len(result['files']), len(base['files']) + 2)
            self.assertFalse((Path(d)/'1k'/'models'/slug).exists())
            self.assertEqual(result['profiles'], base['profiles'])
