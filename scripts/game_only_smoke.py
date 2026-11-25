"""Game-only deployment regression: no capture APIs; existing home identity survives."""
import http.cookiejar
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from server import create_server, GameStore
from world_capture import CaptureStore

class GameOnlyTest(unittest.TestCase):
    def test_preserve_home_and_disable_capture(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=CaptureStore(root)
            player,key=old.session()
            home=old.home_path(player)
            game=GameStore(home)
            game.action({'action':'toggle_light','id':'surface_switch'},None)
            before=game.state()
            sid=old.reserve(player,'private')['id']
            original=old.files/sid/'frames'/'original.jpg'
            original.write_bytes(b'legacy-photo-must-not-be-deleted')
            srv=create_server(port=0,data_dir=root,token='test-token',guest_game=True,world_capture=True)
            thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{srv.server_port}'
            headers={'Cookie':'sl_player='+key,'X-SecondLive-Token':'test-token'}
            def req(path,data=None,method=None):
                h=dict(headers)
                body=None if data is None else json.dumps(data).encode()
                if body is not None:h['Content-Type']='application/json'
                with urllib.request.urlopen(urllib.request.Request(base+path,data=body,headers=h,method=method),timeout=5) as res:
                    return json.load(res)
            try:
                health=req('/api/health')
                self.assertTrue(health['personal_world']);self.assertFalse(health['world_capture'])
                self.assertEqual(req('/api/session',{})['home'],player)
                self.assertEqual(req('/api/game'),before)
                for path in ('/scanner.html','/panorama.html','/app.js','/capture.js','/panorama.js','/api/scans','/api/world','/api/capture/photo/'+sid+'/original','/media/'+sid+'.jpg'):
                    with self.assertRaises(urllib.error.HTTPError) as e:req(path)
                    self.assertEqual(e.exception.code,404,path)
                for path in ('/api/session/pair','/api/capture','/api/capture/locate','/api/scans'):
                    with self.assertRaises(urllib.error.HTTPError) as e:req(path,{})
                    self.assertEqual(e.exception.code,404,path)
                with self.assertRaises(urllib.error.HTTPError) as e:req('/api/scans/'+sid,method='DELETE')
                self.assertEqual(e.exception.code,404)
                with self.assertRaises(urllib.error.HTTPError) as e:req('/api/game',{'action':'unlock'})
                self.assertEqual(e.exception.code,409)
                self.assertEqual(req('/api/game',{'action':'toggle_light','id':'surface_switch'})['lights_on'],not before['lights_on'])
                self.assertEqual(original.read_bytes(),b'legacy-photo-must-not-be-deleted')
                with old.tx(False) as db:
                    self.assertEqual(db.execute('SELECT status FROM scans WHERE id=?',(sid,)).fetchone()['status'],'capturing')
            finally:
                srv.shutdown();srv.server_close();thread.join(timeout=5)

if __name__=='__main__':unittest.main()
