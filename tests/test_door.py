import json,struct,tempfile,unittest
from pathlib import Path
from scripts.download_door import extend,validate,URLS

def glb(external=False):
    data={'asset':{'version':'2.0'},'meshes':[{}],'scenes':[{}],'buffers':[{'byteLength':4}]}
    if external:data['images']=[{'uri':'https://invalid/image.png'}]
    j=json.dumps(data).encode();j+=b' '*(-len(j)%4)
    content=struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',4,b'BIN\0')+b'1234'
    return struct.pack('<4sII',b'glTF',2,12+len(content))+content
class TestDoor(unittest.TestCase):
    def test_validation(self):
        self.assertTrue(validate(glb())['meshes'])
        for invalid in (b'bad',glb(True),glb()[:-1]):
            with self.assertRaises(ValueError):validate(invalid)
    def test_optional_download(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);(p/'manifest.json').write_text(json.dumps({'files':[],'bytes':0}))
            def fetch(url):
                if url==URLS['2k']:raise OSError('offline')
                return glb()
            d=extend(p,fetch);self.assertEqual(set(d['door_models']),{'1k'});self.assertTrue((p/'door/1k.glb').is_file());self.assertEqual(len(d['files']),1)
            def fail(url):raise OSError('offline')
            d=extend(p,fail);self.assertEqual(d['door_models'],{});self.assertEqual(d['realism_status']['door'],'local');self.assertFalse((p/'door/1k.glb').exists())
