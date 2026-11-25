import json, tempfile, unittest
from pathlib import Path
from scripts.download_hands import install,validate,FILES
class HandsTest(unittest.TestCase):
    def test_bad_source_cannot_break_room_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);local=root/'local';local.mkdir();(local/'LICENSE.txt').write_text('fixture')
            (root/'manifest.json').write_text(json.dumps({'profiles':{'1k':{}},'files':[{'file':'room','bytes':123}]}));(local/'left.glb').write_bytes(b'fake')
            result=install(root,local,lambda u,l:b'bad')
            self.assertEqual(result['hands'],{});self.assertEqual(result['hand_status'],{'left':'unavailable','right':'unavailable'});self.assertEqual(result['bytes'],123);self.assertIn('1k',result['profiles']);self.assertFalse((root/'hands/left.glb').exists())
    def test_wrong_bytes_rejected(self):
        for side,(_,size) in FILES.items():
            with self.assertRaises(ValueError):validate(b'\0'*size,side)
