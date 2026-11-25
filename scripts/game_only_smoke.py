"""Game-only deployment regression: no capture APIs; existing home identity survives."""
import http.cookiejar
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from server import create_server, GameStore, HOTEL_LAYOUT
from world_capture import CaptureStore

class GameOnlyTest(unittest.TestCase):
    def test_curtains_persist_and_preserve_other_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            game=GameStore(root)
            # Simulate a pre-update database that has no curtain setting.
            import sqlite3
            with sqlite3.connect(game.path) as db:
                db.execute("DROP TABLE curtain_settings")
            game=GameStore(root)
            before=game.state()
            self.assertFalse(before['curtains_closed'])
            closed=game.action({'action':'toggle_curtains','id':'surface_curtain_l'},None)
            self.assertTrue(closed['curtains_closed'])
            self.assertEqual({k:v for k,v in closed.items() if k!='curtains_closed'},{k:v for k,v in before.items() if k!='curtains_closed'})
            self.assertTrue(GameStore(root).state()['curtains_closed'])
            with self.assertRaises(ValueError):
                game.action({'action':'toggle_curtains','id':'table'},None)
            self.assertFalse(game.action({'action':'toggle_curtains','id':'window'},None)['curtains_closed'])
            with sqlite3.connect(game.path) as db:
                db.execute("INSERT INTO decor_damage(target,stage) VALUES('surface_curtainrod',4)")
            with self.assertRaises(ValueError):
                game.action({'action':'toggle_curtains','id':'surface_curtain_r'},None)
            game.action({'action':'repair_surface','id':'surface_curtainrod'},None)
            self.assertTrue(game.action({'action':'toggle_curtains','id':'surface_curtain_r'},None)['curtains_closed'])

    def test_hotel_default_layout_is_placeable(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameStore(Path(tmp))
            for key, spec in HOTEL_LAYOUT.items():
                if 'max' not in spec or key=='window':
                    continue
                result=game.action({'action':'place_object','id':key,'position':spec['p'],'rotation':0},None)
                self.assertEqual(result['placements'][key],spec['p'])
            self.assertEqual(len(game.state()['placements']),7)
            game.action({'action':'hit','id':'crate'},None)
            hp=game.state()['objects']['crate']
            with self.assertRaises(ValueError):game.action({'action':'reset_hotel_layout'},None)
            result=game.action({'action':'reset_hotel_layout','confirm':True},None)
            self.assertFalse(result['placements']);self.assertFalse(result['rotations']);self.assertEqual(result['objects']['crate'],hp)


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
