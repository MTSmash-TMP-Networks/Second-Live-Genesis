import json, tempfile, threading, unittest, urllib.request, urllib.error
from server import create_server
class GuestGameTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=create_server(port=0,data_dir=self.tmp.name,token='test-private-token',guest_game=True);self.t=threading.Thread(target=self.s.serve_forever,daemon=True);self.t.start();self.base=f'http://127.0.0.1:{self.s.server_port}'
    def tearDown(self): self.s.shutdown();self.s.server_close();self.t.join();self.tmp.cleanup()
    def req(self,path,body=None,headers=None):
        h={'Content-Type':'application/json',**(headers or {})};return json.load(urllib.request.urlopen(urllib.request.Request(self.base+path,headers=h,data=json.dumps(body).encode() if body is not None else None)))
    def test_guest_access_and_persistence(self):
        self.assertFalse(self.req('/api/health')['requires_game_token']);self.assertTrue(self.req('/api/health')['requires_token']);self.assertEqual(self.req('/api/game')['objects']['crate'],60);self.assertEqual(self.req('/api/game',{'action':'hit','id':'crate'})['objects']['crate'],35);self.assertEqual(self.req('/api/game')['objects']['crate'],35)
    def test_guest_cannot_read_private_or_admin(self):
        for path in ('/api/scans','/api/world','/api/update/status','/media/'+'0'*32+'.jpg'):
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as e:self.req(path)
            self.assertEqual(e.exception.code,401)
        with self.assertRaises(urllib.error.HTTPError) as e:self.req('/api/update',{'action':'check'})
        self.assertEqual(e.exception.code,401)
    def test_cross_origin_mutation_rejected(self):
        for h in ({'Origin':'https://foreign.invalid'},{'Sec-Fetch-Site':'cross-site'}):
            with self.assertRaises(urllib.error.HTTPError) as e:self.req('/api/game',{'action':'hit','id':'crate'},h)
            self.assertEqual(e.exception.code,403)
        self.assertEqual(self.req('/api/game')['objects']['crate'],60)
        self.assertEqual(self.req('/api/game',{'action':'hit','id':'crate'},{'Origin':self.base})['objects']['crate'],35)
