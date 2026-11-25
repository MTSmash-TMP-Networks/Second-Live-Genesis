"""Game-only deployment regression: no capture APIs; existing home identity survives."""
import http.cookiejar
import json
import os
import time
from unittest.mock import patch
from updater_api import UpdateBridge, atomic_json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from server import create_server, GameStore, HOTEL_LAYOUT
from world_capture import CaptureStore

from hotel_lobby import HotelLobby, FacadeDirectory, CAPACITY, LEASE, spawn, npc_patrol, NPC_SPEED
from world_capture import CaptureError
from game_accounts import AccountStore, DEFAULT_AVATAR, OPTIONS, password_hash, clean_avatar

class GameOnlyTest(unittest.TestCase):
    def test_update_admin_reserved_and_local_activation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);capture=CaptureStore(root)
            email='owner@example.invalid';password='Owner-password-123'
            data={'nickname':'Owner','email':email,'password':password}
            accounts=AccountStore(capture,email)
            with self.assertRaises(CaptureError):accounts.register(data,None,'guest')
            self.assertFalse(accounts.admin_account_exists())
            profile,key=accounts.register(data,None,'host',provision_admin=True)
            player=accounts.identify(key)
            self.assertFalse(accounts.is_update_admin(player))
            with self.assertRaises(CaptureError):accounts.activate_update_admin('wrong-password')
            self.assertFalse(accounts.is_update_admin(player))
            self.assertEqual(accounts.activate_update_admin(password),profile)
            self.assertTrue(AccountStore(capture,email.upper()).is_update_admin(player))
            self.assertFalse(AccountStore(capture).is_update_admin(player))
            self.assertFalse(AccountStore(capture,'another@example.invalid').is_update_admin(player))

    def test_only_activated_account_can_use_update_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);capture=CaptureStore(root)
            email='owner@example.invalid';password='Owner-password-123'
            # Existing pre-update accounts retain their identities and sessions.
            old=AccountStore(capture)
            profile,key=old.register({'nickname':'Owner','email':email,'password':password},None,'owner')
            _,guest=old.register({'nickname':'Other','email':'other@example.invalid','password':'Other-password-123'},None,'other')
            work=root/'bridge';(work/'status').mkdir(parents=True);(work/'requests').mkdir()
            revision='a'*40
            def status(state='idle'):
                atomic_json(work/'status'/'status.json',{'state':state,'heartbeat':time.time(),'current':'b'*40,'latest':revision})
            status()
            bridge=UpdateBridge(work,'k'*64)
            with patch.dict(os.environ,{'SECOND_LIVE_UPDATE_ADMIN_EMAIL':email}):
                srv=create_server(port=0,data_dir=root,token='test-token',guest_game=False,world_capture=True,updater=bridge)
            thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{srv.server_port}'
            queue=work/'requests'/'request.json'
            def req(path,key=None,data=None,extra=None,game_token=True):
                headers={'Content-Type':'application/json'}
                if game_token:headers['X-SecondLive-Token']='test-token'
                if key:headers['Cookie']='sl_account='+key
                if extra:headers.update(extra)
                body=None if data is None else json.dumps(data).encode()
                with urllib.request.urlopen(urllib.request.Request(base+path,data=body,headers=headers),timeout=8) as res:
                    return res.status,json.load(res)
            def denied(code,path,key=None,data=None,extra=None,game_token=True):
                with self.assertRaises(urllib.error.HTTPError) as err:req(path,key,data,extra,game_token)
                self.assertEqual(err.exception.code,code)
                self.assertFalse(queue.exists())
            try:
                denied(401,'/api/update/status',extra={'X-SecondLive-Admin':'k'*64})
                denied(401,'/api/update',data={'action':'check'},extra={'X-SecondLive-Admin':'k'*64})
                denied(403,'/api/update/status',guest,extra={'X-SecondLive-Admin':'k'*64})
                denied(403,'/api/update',guest,{'action':'check','email':email,'admin':True})
                denied(403,'/api/update/status',key)
                # An existing email is not enough until the host activates it.
                accounts=AccountStore(capture,email)
                accounts.activate_update_admin(password)
                self.assertEqual(req('/api/update/status',key)[0],200)
                denied(401,'/api/update/status',key,game_token=False)
                denied(403,'/api/update',key,{'action':'check'},extra={'Origin':'https://evil.example.invalid','Sec-Fetch-Site':'cross-site'})
                denied(403,'/api/update',guest,{'action':'check'},extra={'X-SecondLive-Admin':'k'*64})
                self.assertEqual(req('/api/update',key,{'action':'check'})[0],202)
                self.assertEqual(json.loads(queue.read_text()),{'action':'check','revision':None})
                queue.unlink();status('available')
                denied(409,'/api/update',key,{'action':'install','revision':'c'*40})
                self.assertEqual(req('/api/update',key,{'action':'install','revision':revision})[0],202)
                self.assertEqual(json.loads(queue.read_text()),{'action':'install','revision':revision})
                queue.unlink()
                self.assertEqual(req('/api/account',key,{'action':'logout'})[0],200)
                denied(401,'/api/update/status',key)
                self.assertEqual(req('/api/account',guest,{'action':'profile'})[1]['nickname'],'Other')
                self.assertEqual(accounts.profile(old.identify(guest))['nickname'],'Other')
            finally:
                srv.shutdown();srv.server_close();thread.join(timeout=5)


    def test_npc_patrol_and_locomotion(self):
        now=[100.0];lobby=HotelLobby(lambda:now[0])
        profiles=[{'slot':i,'nickname':'Guest '+str(i),'avatar':DEFAULT_AVATAR} for i in range(2)]
        a=lobby.request('a',{'action':'enter'},profiles[0],[])
        b=lobby.request('b',{'action':'enter'},profiles[1],[])
        self.assertEqual(a['npc'],b['npc'])
        self.assertEqual(a['npc'],npc_patrol(0))
        self.assertEqual(a['npc']['position'],[.62,0,-60.0])
        now[0]+=.25
        p=list(a['position']);p[2]+=1.45
        result=lobby.request('a',{'action':'update','lease':a['lease'],'position':p,'yaw':0,'stance':'sprint'},profiles[0],[])
        observed=lobby.observe('b',profiles[1],[])
        self.assertEqual(observed['npc'],result['npc'])
        self.assertEqual(observed['peers'][0]['stance'],'sprint')
        self.assertAlmostEqual(result['npc']['position'][2]-a['npc']['position'][2],NPC_SPEED*.25,delta=.001)
        now[0]+=.25
        result=lobby.request('a',{'action':'update','lease':a['lease'],'position':p,'yaw':0,'stance':'crouch'},profiles[0],[])
        self.assertEqual(lobby.observe('b',profiles[1],[])['peers'][0]['stance'],'crouch')
        for invalid in ('flying',[],True):
            with self.assertRaises(CaptureError):
                lobby.request('a',{'action':'update','lease':a['lease'],'position':p,'yaw':0,'stance':invalid},profiles[0],[])
        for t in range(0,480):
            q=npc_patrol(t)
            self.assertLessEqual(abs(q['position'][2]),64)
            self.assertAlmostEqual(q['position'][0],.62)
            self.assertIn(q['yaw'],(0.0,3.1416))
        self.assertEqual(lobby.observe('b',profiles[1],[])['online'],2)

    def test_lobby_capacity_leases_and_privacy(self):
        now=[100.0];lobby=HotelLobby(lambda:now[0])
        profiles={str(i):{'slot':i,'nickname':'Guest '+str(i),'avatar':DEFAULT_AVATAR} for i in range(CAPACITY)}
        directory=[{'slot':p['slot'],'nickname':p['nickname']} for p in profiles.values()]
        def req(i,data):
            return lobby.request(str(i),data,profiles[str(i)],directory)
        a=req(0,{'action':'enter','slot':9});b=req(1,{'action':'enter'})
        self.assertEqual(a['slot'],0);self.assertEqual(b['slot'],1)
        self.assertEqual(b['peers'],[{'slot':0,'position':a['position'],'yaw':a['yaw'],'nickname':'Guest 0','avatar':DEFAULT_AVATAR,'stance':'walk'}])
        self.assertEqual(b['rooms'],directory)
        with self.assertRaises(CaptureError):req(1,{'action':'leave','lease':a['lease']})
        p=list(a['position']);p[2]+=.3;now[0]+=.25
        update=req(0,{'action':'update','lease':a['lease'],'position':p,'yaw':0,'nickname':'Spoof','avatar':{}})
        self.assertEqual(update['online'],2)
        self.assertEqual(lobby.players['0']['nickname'],'Guest 0')
        self.assertEqual(lobby.players['0']['avatar'],DEFAULT_AVATAR)
        for invalid in ([10,0,0],[0,2,0],[0,0,float('nan')]):
            with self.assertRaises(CaptureError):req(0,{'action':'update','lease':a['lease'],'position':invalid,'yaw':0})
        with self.assertRaises(CaptureError):req(0,{'action':'update','lease':a['lease'],'position':[0,0,20],'yaw':0})
        now[0]+=LEASE+.1
        with self.assertRaises(CaptureError):req(0,{'action':'leave','lease':a['lease']})
        self.assertFalse(lobby.players)
        for i in range(CAPACITY):req(i,{'action':'enter'})
        with self.assertRaises(CaptureError):
            lobby.request('other',{'action':'enter'},profiles['0'],directory)
        replacement=req(0,{'action':'enter'})
        self.assertEqual(replacement['online'],CAPACITY)
        self.assertEqual(replacement['slot'],0)
        self.assertEqual(req(0,{'action':'leave','lease':replacement['lease']}),{'left':True})
        self.assertEqual(req(0,{'action':'enter'})['slot'],0)
        lobby.disconnect('0');self.assertNotIn('0',lobby.players)

    def test_account_migration_hashes_sessions_and_avatar(self):
        with tempfile.TemporaryDirectory() as tmp:
            capture=CaptureStore(tmp);legacy,old_cookie=capture.session()
            home=GameStore(capture.home_path(legacy));home.action({'action':'toggle_light','id':'surface_switch'},None)
            before=home.state();accounts=AccountStore(capture)
            data={'email':'a@example.invalid','nickname':'Guest Alpha','password':'Test-password-123'}
            profile,key=accounts.register(data,old_cookie,'one')
            self.assertEqual(accounts.identify(key),legacy)
            self.assertIsNone(accounts.identify(old_cookie))
            self.assertEqual(profile['slot'],0);self.assertEqual(profile['avatar'],DEFAULT_AVATAR)
            self.assertEqual(GameStore(capture.home_path(legacy)).state(),before)
            with capture.tx(False) as db:
                row=db.execute('SELECT salt,password_hash FROM game_accounts WHERE player=?',(legacy,)).fetchone()
                self.assertEqual(len(row['salt']),16);self.assertEqual(len(row['password_hash']),32)
                self.assertEqual(row['password_hash'],password_hash(data['password'],row['salt']))
                self.assertNotEqual(row['password_hash'],data['password'].encode())
            with self.assertRaises(CaptureError):accounts.register({**data,'email':'A@example.invalid'},None,'one')
            with self.assertRaises(CaptureError):accounts.register({**data,'email':'new@example.invalid','nickname':'guest alpha'},None,'one')
            with self.assertRaises(CaptureError):accounts.login({**data,'password':'wrong-password'},'one')
            avatar={**DEFAULT_AVATAR,'hair':(DEFAULT_AVATAR['hair']+1)%len(OPTIONS['hair']['values'])}
            self.assertEqual(accounts.save_avatar(legacy,avatar)['avatar'],avatar)
            with self.assertRaises(CaptureError):accounts.save_avatar(legacy,{**avatar,'hair':999})
            restored=AccountStore(capture);p2,k2=restored.login({**data,'email':'A@EXAMPLE.INVALID'},'two')
            self.assertEqual(p2['slot'],0);self.assertEqual(p2['avatar'],avatar)
            self.assertEqual(restored.identify(k2),legacy)
            second,k3=restored.register({'email':'b@example.invalid','nickname':'Guest Beta','password':'Other-password-456'},old_cookie,'two')
            self.assertNotEqual(restored.identify(k3),legacy);self.assertEqual(second['slot'],1)
            self.assertEqual(restored.directory(),[{'slot':0,'nickname':'Guest Alpha'},{'slot':1,'nickname':'Guest Beta'}])
            restored.logout(k2);self.assertIsNone(restored.identify(k2));self.assertIsNotNone(restored.identify(key))

    def test_facade_directory_existing_openings_and_repairs(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp:
            capture=CaptureStore(Path(tmp));accounts=AccountStore(capture)
            a,ka=accounts.register({'nickname':'Alpha','email':'a@example.invalid','password':'Test-password-123'},None,'a')
            b,kb=accounts.register({'nickname':'Beta','email':'b@example.invalid','password':'Test-password-456'},None,'b')
            room=GameStore(capture.home_path(accounts.identify(ka)))
            GameStore(capture.home_path(accounts.identify(kb)))
            with sqlite3.connect(room.path) as db:
                db.executemany("INSERT INTO wall_cells VALUES (?,?,?,?)",[('surface_8',2,3,4),('surface_9',5,4,3),('surface_10',1,1,4),('surface_6',3,4,4)])
            now=[10.0];directory=FacadeDirectory(accounts,lambda:now[0])
            expected=[{'slot':a['slot'],'walls':{'surface_10':[[1,1,4]],'surface_8':[[2,3,4]]}}]
            self.assertEqual(directory.snapshot(),expected)
            room.action({'action':'repair_surface','id':'surface_8'},None)
            self.assertEqual(directory.snapshot(),expected)
            now[0]+=1.1
            self.assertEqual(directory.snapshot(),[{'slot':a['slot'],'walls':{'surface_10':[[1,1,4]]}}])
            room.action({'action':'repair_surface','id':'surface_10'},None)
            now[0]+=1.1
            self.assertEqual(directory.snapshot(),[])
            # The unrelated side-wall damage and partial damage are unchanged.
            self.assertEqual(room.state()['walls'],{'surface_6':[[3,4,4]],'surface_9':[[5,4,3]]})
            self.assertEqual(accounts.profile(accounts.identify(kb)),b)

    def test_two_players_meet_without_sharing_homes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);capture=CaptureStore(root)
            player_a,key_a=capture.session();player_b,key_b=capture.session()
            game_a=GameStore(capture.home_path(player_a));game_b=GameStore(capture.home_path(player_b))
            game_a.action({'action':'toggle_light','id':'surface_switch'},None)
            before_a,before_b=game_a.state(),game_b.state()
            self.assertNotEqual(before_a['lights_on'],before_b['lights_on'])
            srv=create_server(port=0,data_dir=root,token='test-token',guest_game=True,world_capture=True)
            thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{srv.server_port}'
            def req(cookie,path,data=None,with_cookie=False):
                headers={'Content-Type':'application/json','Cookie':cookie}
                body=None if data is None else json.dumps(data).encode()
                with urllib.request.urlopen(urllib.request.Request(base+path,data=body,headers=headers),timeout=8) as res:
                    value=json.load(res)
                    return (value,res.headers.get('Set-Cookie','').split(';',1)[0]) if with_cookie else value
            try:
                self.assertTrue(req('','/api/health')['accounts'])
                self.assertTrue(req('','/api/health')['hotel_lobby'])
                with self.assertRaises(urllib.error.HTTPError) as e:req('sl_player='+key_a,'/api/game')
                self.assertEqual(e.exception.code,401)
                with self.assertRaises(urllib.error.HTTPError) as e:req('','/api/lobby',{'action':'enter'})
                self.assertEqual(e.exception.code,401)
                pa,ca=req('sl_player='+key_a,'/api/account',{'action':'register','nickname':'Alpha','email':'a@example.invalid','password':'Test-password-123'},True)
                pb,cb=req('sl_player='+key_b,'/api/account',{'action':'register','nickname':'Beta','email':'b@example.invalid','password':'Test-password-456'},True)
                self.assertTrue(ca.startswith('sl_account='))
                self.assertEqual(set(pa),{'nickname','slot','avatar'});self.assertEqual(pa['slot'],0);self.assertEqual(pb['slot'],1)
                self.assertEqual(req(ca,'/api/account',{'action':'profile'}),pa)
                custom={**pb['avatar'],'topColor':(pb['avatar']['topColor']+1)%len(OPTIONS['topColor']['values'])}
                self.assertEqual(req(cb,'/api/account',{'action':'avatar','avatar':custom})['avatar'],custom)
                a=req(ca,'/api/lobby',{'action':'enter'});b=req(cb,'/api/lobby',{'action':'enter'})
                self.assertEqual(b['online'],2)
                self.assertEqual(b['peers'][0]['slot'],a['slot'])
                self.assertEqual(set(b['peers'][0]),{'slot','position','yaw','nickname','avatar','stance'})
                self.assertEqual(b['peers'][0]['nickname'],'Alpha')
                self.assertEqual(b['rooms'],[{'slot':0,'nickname':'Alpha'},{'slot':1,'nickname':'Beta'}])
                self.assertNotEqual(a['slot'],b['slot'])
                self.assertEqual(req(ca,'/api/game'),before_a);self.assertEqual(req(cb,'/api/game'),before_b)
                remaining=req(ca,'/api/lobby',{'action':'update','lease':a['lease'],'position':a['position'],'yaw':a['yaw']})
                self.assertEqual(remaining['peers'][0]['avatar'],custom)
                req(cb,'/api/account',{'action':'logout'})
                remaining=req(ca,'/api/lobby',{'action':'update','lease':a['lease'],'position':a['position'],'yaw':a['yaw']})
                self.assertEqual(remaining['online'],1);self.assertFalse(remaining['peers'])
                self.assertEqual(remaining['rooms'],b['rooms'])
                with self.assertRaises(urllib.error.HTTPError) as e:req(cb,'/api/game')
                self.assertEqual(e.exception.code,401)
                pb2,cb2=req('','/api/account',{'action':'login','email':'b@example.invalid','password':'Test-password-456'},True)
                self.assertEqual(pb2['slot'],pb['slot']);self.assertEqual(pb2['avatar'],custom)
                self.assertEqual(req(ca,'/api/game'),before_a);self.assertEqual(req(cb2,'/api/game'),before_b)
                # Read-only observation does not create a lobby lease.
                observed=req(cb2,'/api/hotel/view',{'action':'hall'})
                self.assertEqual(observed['online'],1)
                self.assertEqual(observed['peers'][0]['nickname'],'Alpha')
                self.assertNotIn('lease',observed)
                self.assertEqual(observed['facades'],[])
                self.assertEqual(a['facades'],[]);self.assertEqual(b['facades'],[])
                # Only a physical opening in the paired wall permits a snapshot.
                self.assertEqual(req(ca,'/api/hotel/view',{'action':'neighbor'}),{'room':None})
                import sqlite3
                with sqlite3.connect(game_a.path) as db:
                    db.execute("INSERT INTO wall_cells VALUES ('surface_6',4,3,3)")
                self.assertEqual(req(ca,'/api/hotel/view',{'action':'neighbor'}),{'room':None})
                with sqlite3.connect(game_a.path) as db:
                    db.execute("UPDATE wall_cells SET stage=4 WHERE target='surface_6'")
                game_b.action({'action':'place_object','id':'surface_rug','position':[2.95,.009,-2.0],'rotation':90},None)
                view=req(ca,'/api/hotel/view',{'action':'neighbor','slot':23,'player':'ignored'})['room']
                self.assertEqual(set(view),{'placements','rotations','objects','decor','lights_on','curtains_closed'})
                self.assertEqual(view['placements']['surface_rug'],[2.95,.009,-2.0])
                self.assertEqual(view['rotations']['surface_rug'],90)
                self.assertEqual(view['lights_on'],before_b['lights_on'])
                self.assertEqual(req(cb2,'/api/hotel/view',{'action':'neighbor'}),{'room':None})
                with self.assertRaises(urllib.error.HTTPError) as e:req('','/api/hotel/view',{'action':'neighbor'})
                self.assertEqual(e.exception.code,401)
                game_a.action({'action':'repair_surface','id':'surface_6'},None)
                self.assertEqual(req(ca,'/api/hotel/view',{'action':'neighbor'}),{'room':None})
                with sqlite3.connect(game_a.path) as db:
                    db.execute("INSERT INTO wall_cells VALUES ('surface_9',6,4,4)")
                time.sleep(1.1)
                opening=[{'slot':pa['slot'],'walls':{'surface_9':[[6,4,4]]}}]
                self.assertEqual(req(cb2,'/api/hotel/view',{'action':'hall'})['facades'],opening)
                self.assertEqual(req(ca,'/api/lobby',{'action':'update','lease':a['lease'],'position':a['position'],'yaw':a['yaw']})['facades'],opening)
                game_a.action({'action':'repair_surface','id':'surface_9'},None)
                time.sleep(1.1)
                self.assertEqual(req(cb2,'/api/hotel/view',{'action':'hall'})['facades'],[])
            finally:
                srv.shutdown();srv.server_close();thread.join(timeout=5)

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
            self.assertEqual(len(game.state()['placements']),8)
            # The rug can be placed underneath existing furniture, and turned.
            rug=[2.95,.009,-2.0]
            result=game.action({'action':'place_object','id':'surface_rug','position':rug,'rotation':90},None)
            self.assertEqual(result['placements']['surface_rug'],rug)
            self.assertEqual(GameStore(Path(tmp)).state()['rotations']['surface_rug'],90)
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
                    if path=='/api/account' and data and data.get('action')=='register':
                        headers['Cookie']=res.headers.get('Set-Cookie','').split(';',1)[0]
                    return json.load(res)
            try:
                health=req('/api/health')
                self.assertTrue(health['personal_world']);self.assertFalse(health['world_capture'])
                with self.assertRaises(urllib.error.HTTPError) as e:req('/api/session',{})
                self.assertEqual(e.exception.code,401)
                profile=req('/api/account',{'action':'register','nickname':'Legacy Guest','email':'legacy@example.invalid','password':'Legacy-password-123'})
                self.assertEqual(req('/api/session',{}),profile)
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
