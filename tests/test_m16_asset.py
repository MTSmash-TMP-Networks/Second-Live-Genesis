import json,tempfile,unittest
from pathlib import Path
from scripts.download_m16 import install,validate
MESH=b'mtllib remote.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 2 4\nf 1 3 4\nf 2 3 4\n'
class M16AssetTest(unittest.TestCase):
    def test_validation(self):
        self.assertNotIn(b'mtllib',validate(MESH))
        for bad in (b'<html>not an obj</html>',MESH.replace(b'f 1 2 3',b'f 1 2 99'),MESH.replace(b'v 1 0 0',b'v nan 0 0')):
            with self.assertRaises(ValueError):validate(bad)
    def test_optional_failure_preserves_room(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);(root/'manifest.json').write_text(json.dumps({'files':[{'file':'room','bytes':20}],'profiles':{'1k':{}}}))
            m=install(root,lambda u,n:MESH);self.assertTrue(m['m16_obj']);self.assertEqual(m['profiles'],{'1k':{}});self.assertTrue((root/'props/m16.obj').exists())
            m=install(root,lambda u,n:b'error');self.assertNotIn('m16_obj',m);self.assertEqual(m['bytes'],20);self.assertFalse((root/'props/m16.obj').exists())
    def test_textured_archive_preferred(self):
        import io,zipfile,struct
        from scripts.download_m16 import TEXTURED_URL
        # Structurally valid header fixture (decoder validity tested in browser).
        png=b'\x89PNG\r\n\x1a\n'+struct.pack('>I',13)+b'IHDR'+struct.pack('>II',32,32)+b'\x08\x02\x00\x00\x00'+b'\0'*4
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('art/mesh.obj',MESH);z.writestr('art/diffuse.png',png);z.writestr('art/normal.png',png);z.writestr('../ignored.txt','ignore')
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);(root/'manifest.json').write_text('{"files":[]}')
            m=install(root,lambda u,n:buf.getvalue() if u==TEXTURED_URL else MESH)
            self.assertTrue(m['m16_color']);self.assertTrue(m['m16_normal']);self.assertIn('Osmic',m['m16_credit']);self.assertFalse((root/'ignored.txt').exists())
