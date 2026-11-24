import sys, tempfile, unittest, threading, urllib.request, urllib.error, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import create_server, GameStore
class GameTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.srv=create_server(port=0,data_dir=self.tmp.name,token='test-secret'); self.thread=threading.Thread(target=self.srv.serve_forever,daemon=True); self.thread.start(); self.url=f'http://127.0.0.1:{self.srv.server_port}'
    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); self.thread.join(); self.tmp.cleanup()
    def req(self,path,data=None,auth=True):
        headers={'Content-Type':'application/json'}
        if auth: headers['X-SecondLive-Token']='test-secret'
        with urllib.request.urlopen(urllib.request.Request(self.url+path,headers=headers,data=json.dumps(data).encode() if data is not None else None)) as r: return json.load(r)
    def test_access(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.req('/api/game',auth=False)
        self.assertEqual(e.exception.code,401)
    def test_damage_and_repair(self):
        for _ in range(3): result=self.req('/api/game',{'action':'hit','id':'crate'})
        self.assertEqual(result['objects']['crate'],0)
        self.assertEqual(GameStore(Path(self.tmp.name)).state()['objects']['crate'],0)
        self.assertEqual(self.req('/api/game',{'action':'repair','id':'crate'})['objects']['crate'],60)
    def test_unlock(self):
        with self.assertRaises(urllib.error.HTTPError):self.req('/api/game',{'action':'unlock'})
        import base64
        # JPEG-shaped fixture tests storage and gating, not image decoding.
        photo='data:image/jpeg;base64,'+base64.b64encode(b'\xff\xd8\xff'+b'x'*20+b'\xff\xd9').decode()
        for i in range(3):self.req('/api/scans',{'photo':photo,'title':str(i)})
        self.assertTrue(self.req('/api/game',{'action':'unlock'})['unlocked'])
        self.assertTrue(GameStore(Path(self.tmp.name)).state()['unlocked'])
    def test_game_assets(self):
        for path in ('/', '/game.js', '/game.css', '/scanner.html', '/assets/wood.jpg', '/assets/wall.jpg', '/assets/fabric.jpg'):
            with urllib.request.urlopen(self.url+path) as r:
                self.assertEqual(r.status,200)
                body=r.read()
                if path.endswith('.jpg'): self.assertTrue(body.startswith(b'\xff\xd8'))
                if path=='/': self.assertIn(b'id="stick"',body)
    def test_invalid(self):
        for data in [{'action':'hit','id':'invalid'},{'action':'unknown'},[]]:
            with self.assertRaises(urllib.error.HTTPError) as e:self.req('/api/game',data)
            self.assertEqual(e.exception.code,400)
if __name__=='__main__':unittest.main()
