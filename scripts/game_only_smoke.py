import math
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


def room_model_fixture(change=None):
    """A real embedded, uncompressed GLB 2.0 triangle for private-room tests."""
    import struct
    vertices=struct.pack('<9f',0.,0.,0.,1.,0.,0.,0.,1.,0.)
    g={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(vertices)}],
       'bufferViews':[{'buffer':0,'byteLength':len(vertices)}],
       'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[0,0,0],'max':[1,1,0]}],
       'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],
       'nodes':[{'mesh':0}],'scenes':[{'nodes':[0]}],'scene':0}
    if change:change(g)
    js=json.dumps(g,separators=(',',':')).encode()
    js+=b' '*(-len(js)%4)
    return struct.pack('<IIIII',0x46546c67,2,28+len(js)+len(vertices),len(js),0x4e4f534a)+js+struct.pack('<II',len(vertices),0x004e4942)+vertices

class GameOnlyTest(unittest.TestCase):
    def test_account_cookie_survives_restart_and_reauth_preserves_room(self):
        import sqlite3
        from world_capture import digest
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);jar=http.cookiejar.CookieJar()
            opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            def launch(port=0):
                srv=create_server(port=port,data_dir=root,guest_game=True,world_capture=True)
                thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
                return srv,thread
            def stop(srv,thread):
                srv.shutdown();srv.server_close();thread.join(5)
            def req(base,path,data=None,client=opener):
                raw=None if data is None else json.dumps(data).encode()
                request=urllib.request.Request(base+path,data=raw,headers={'Content-Type':'application/json'})
                with client.open(request,timeout=5) as res:
                    self.assertEqual(res.headers['Cache-Control'],'no-store')
                    return json.load(res)
            def expect_session_required(base,path,data=None,client=opener):
                with self.assertRaises(urllib.error.HTTPError) as err:req(base,path,data,client)
                self.assertEqual(err.exception.code,401)
                self.assertEqual(json.load(err.exception)['code'],'session_required')
            srv,thread=launch();base='http://127.0.0.1:'+str(srv.server_port)
            try:
                login={'email':'restart@example.invalid','password':'Restart-password-123'}
                profile=req(base,'/api/account',{'action':'register','nickname':'Restart Guest',**login})
                self.assertEqual(req(base,'/api/account',{'action':'profile'}),profile)
                cookie=next(c for c in jar if c.name=='sl_account')
                self.assertTrue(cookie.has_nonstandard_attr('HttpOnly'))
                self.assertEqual(cookie.get_nonstandard_attr('SameSite'),'Strict')
                custom={**profile['avatar'],'model':1}
                saved=req(base,'/api/account',{'action':'avatar','avatar':custom,'expected_slot':profile['slot']})
                self.assertEqual(saved['avatar'],custom)
                expect_session_required(base,'/api/account',{'action':'avatar','avatar':profile['avatar'],'expected_slot':profile['slot']+1})
                self.assertEqual(req(base,'/api/account',{'action':'profile'}),saved)
                world=req(base,'/api/game',{'action':'toggle_light','id':'surface_switch'})
                before=req(base,'/api/game')
                self.assertEqual(world['lights_on'],before['lights_on'])
                expect_session_required(base,'/api/game',client=urllib.request.build_opener())
            finally:stop(srv,thread)
            # Start a fresh HTTP server against the same persistent volume.
            # Cookies are host scoped, not port scoped.
            srv,thread=launch();base='http://127.0.0.1:'+str(srv.server_port)
            try:
                self.assertEqual(req(base,'/api/account',{'action':'profile'}),saved)
                self.assertEqual(req(base,'/api/game'),before)
                with sqlite3.connect(root/'genesis.sqlite3') as db:
                    db.execute('UPDATE game_account_sessions SET expires=0 WHERE secret=?',(digest(cookie.value),))
                expect_session_required(base,'/api/account',{'action':'profile'})
                expect_session_required(base,'/api/account',{'action':'avatar','avatar':custom})
                expect_session_required(base,'/api/game')
                expect_session_required(base,'/api/game',{'action':'toggle_light','id':'surface_switch'})
                self.assertEqual(req(base,'/api/account',{'action':'login',**login}),saved)
                self.assertEqual(req(base,'/api/game'),before)
                self.assertEqual(req(base,'/api/account',{'action':'profile'}),saved)
                with self.assertRaises(urllib.error.HTTPError) as err:
                    req(base,'/api/account',{'action':'login',**login,'password':'wrong password'})
                self.assertEqual(err.exception.code,401)
                self.assertNotIn('code',json.load(err.exception))
            finally:stop(srv,thread)

    def test_webp_room_models_including_trellis_texture_sources(self):
        import base64, struct
        from room_models import validate_glb, image_size, RoomModelStore
        # Real 17x19 static fixtures, no Pillow or network required at runtime.
        rgb=base64.b64decode('UklGRjYAAABXRUJQVlA4ICoAAADwAgCdASoRABMAPm0ylkekIqIhKAgAgA2JaQAAQnjkAAD++1XfDyAAAAA=')
        rgba=base64.b64decode('UklGRloAAABXRUJQVlA4WAoAAAAQAAAAEAAAEgAAQUxQSAoAAAABB9C9iAhERP8DVlA4ICoAAADwAgCdASoRABMAPm0ylkekIqIhKAgAgA2JaQAAQnjkAAD++1XfDyAAAAA=')
        lossless=base64.b64decode('UklGRiIAAABXRUJQVlA4TBUAAAAvEIAEEAdAIGmLt/0VKEL34oiI/gcA')
        def fixture(image, change=None):
            old=room_model_fixture()
            n=struct.unpack_from('<I',old,12)[0];g=json.loads(old[20:20+n])
            binary=old[28+n:]
            # TRELLIS may count alignment padding as part of the image view.
            image+=b'\0'*(-len(image)%4)
            g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(image)})
            binary+=image;g['buffers'][0]['byteLength']=len(binary)
            g['images']=[{'bufferView':1,'mimeType':'image/webp'}]
            g['textures']=[{'extensions':{'EXT_texture_webp':{'source':0}}}]
            g['materials']=[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}]
            g['meshes'][0]['primitives'][0]['material']=0
            g['extensionsUsed']=['EXT_texture_webp'];g['extensionsRequired']=['EXT_texture_webp']
            if change:change(g)
            js=json.dumps(g,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
            return struct.pack('<IIIII',0x46546c67,2,28+len(js)+len(binary),len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
        for image in (rgb,rgba,lossless):
            self.assertEqual(image_size(image,'image/webp'),(17,19))
            self.assertEqual(validate_glb(fixture(image)),{'triangles':1,'pixels':323})
            for extra in (b'',b'\0',b'\0\0',b'\0\0\0'):
                self.assertEqual(image_size(image+extra,'image/webp'),(17,19))
        for invalid in (rgb[:-1],rgb+b'\x01',rgb+b'\0'*4,b'not-webp'):
            with self.assertRaises(ValueError):image_size(invalid,'image/webp')
        # Reject an oversized frame, animated extended container and
        # an extended canvas whose dimensions disagree with the frame.
        too_big=bytearray(rgb);struct.pack_into('<H',too_big,26,2049)
        animated=bytearray(rgba);animated[20]|=2
        mismatch=bytearray(rgba);mismatch[24]=40
        for image in (bytes(too_big),bytes(animated),bytes(mismatch)):
            with self.assertRaises(ValueError):validate_glb(fixture(image))
        for change in (
            lambda g:g['textures'][0]['extensions']['EXT_texture_webp'].update(source=99),
            lambda g:g['textures'][0]['extensions']['EXT_texture_webp'].update(source=True),
            lambda g:g['textures'][0].update(source=0),
            lambda g:g['textures'][0].update(extensions={'EXT_texture_webp':None}),
            lambda g:g.update(extensionsRequired=[]),
            lambda g:g.update(extensionsUsed=['KHR_draco_mesh_compression']),
            lambda g:g['images'][0].update(uri='https://example.invalid/texture.webp'),
        ):
            with self.assertRaises(ValueError):validate_glb(fixture(rgb,change))
        with tempfile.TemporaryDirectory() as tmp:
            store=RoomModelStore(tmp);blob=fixture(rgba)
            item=store.add('a','trellis.glb',blob)
            self.assertEqual(store.get('a',item['added']),blob)
            with self.assertRaises(CaptureError):store.get('b',item['added'])

    def test_imported_object_motion_damage_repair_and_migration(self):
        import sqlite3
        from room_models import RoomModelStore
        with tempfile.TemporaryDirectory() as tmp:
            # Simulate a pre-0.12.6 database, without the new columns.
            with sqlite3.connect(Path(tmp)/'room_models.sqlite3') as db:
                db.execute("""CREATE TABLE room_models(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,data BLOB NOT NULL,bytes INTEGER NOT NULL,x REAL NOT NULL DEFAULT 0,y REAL NOT NULL DEFAULT 0,z REAL NOT NULL DEFAULT 0,extent REAL NOT NULL DEFAULT .8,rotation REAL NOT NULL DEFAULT 0,solid INTEGER NOT NULL DEFAULT 0,placed INTEGER NOT NULL DEFAULT 0,created REAL NOT NULL)""")
                db.execute('INSERT INTO room_models(id,owner,name,data,bytes,created) VALUES (?,?,?,?,?,?)',('a'*32,'owner','chair.glb',room_model_fixture(),len(room_model_fixture()),0))
            store=RoomModelStore(tmp)
            row=store.list('owner')['models'][0];self.assertEqual(row['hp'],100);self.assertIsNone(row['pose'])
            ident=row['id']
            def act(op,**kwargs):return store.action('owner',{'action':op,'id':ident,**kwargs},GameStore.WEAPON_DAMAGE)['models'][0]
            placed=act('place',x=1,y=0,z=1,extent=.8,rotation=0,solid=True)
            p={'position':[1.2,.5,1.3],'quaternion':[0,0,0,1],'base_y':.1,'revision':placed['revision']}
            moved=act('motion',**p);self.assertEqual(moved['pose']['p'],p['position'])
            with self.assertRaises(CaptureError):act('motion',**p)
            with self.assertRaises(CaptureError):store.action('other',{'action':'repair','id':ident})
            for bad in ({'position':[99,.5,0]},{'quaternion':[0,0,0,0]},{'base_y':-1}):
                with self.assertRaises(ValueError):act('motion',**{**p,'revision':moved['revision'],**bad})
            first=act('hit',weapon='pistol',hp=0,damage=9999);self.assertEqual(first['hp'],75)
            for _ in range(3):last=act('hit',weapon='pistol')
            self.assertEqual(last['hp'],0)
            with self.assertRaises(ValueError):act('motion',**{**p,'revision':last['revision']})
            self.assertEqual(RoomModelStore(tmp).list('owner')['models'][0],last)
            self.assertEqual(store.get('owner',ident),room_model_fixture())
            repaired=act('repair');self.assertEqual(repaired['hp'],100);self.assertEqual(repaired['pose'],moved['pose'])
            hidden=act('hide');self.assertFalse(hidden['placed'])
            self.assertEqual(hidden['hp'],100)

    def test_wall_mount_persistence_release_and_validation(self):
        from room_models import RoomModelStore
        from wall_damage import WALLS, nearest
        with tempfile.TemporaryDirectory() as tmp:
            store=RoomModelStore(tmp)
            added=store.add('a','picture.glb',room_model_fixture())['added']
            row=store.action('a',{'action':'place','id':added,'x':1,'y':0,'z':1,'extent':.8,'rotation':0,'solid':True})['models'][0]
            data={'action':'mount','id':added,'revision':row['revision'],'wall':'surface_3','anchor':[-4.88,1.7,2],'size':[.8,.6,.1],'extent':.8,'solid':True}
            for bad in ({'wall':'surface_0'},{'anchor':[-5.12,1.7,2]},{'anchor':[-4.88,2.95,2]},{'size':[1.1,.6,.1]}):
                with self.assertRaises(ValueError):store.action('a',{**data,**bad},walls={})
            mounted=store.action('a',data,walls={})['models'][0]
            self.assertEqual(mounted['mount']['wall'],'surface_3')
            self.assertAlmostEqual(mounted['pose']['p'][0],-4.818)
            self.assertEqual(mounted['rotation'],90)
            self.assertEqual(RoomModelStore(tmp).list('a')['models'][0],mounted)
            with self.assertRaises(CaptureError):store.action('b',data,walls={})
            w=WALLS['surface_3'];c,r=nearest(w,2-w['p'][2],1.7-w['p'][1])
            store.release_unsupported('a',{'surface_3':[[c,r,3]]})
            self.assertIsNotNone(store.list('a')['models'][0]['mount'])
            store.release_unsupported('a',{'surface_3':[[c,r,4]]})
            loose=store.list('a')['models'][0]
            self.assertIsNone(loose['mount']);self.assertEqual(loose['pose'],mounted['pose'])
            with self.assertRaises(ValueError):store.action('a',{**data,'revision':loose['revision']},walls={'surface_3':[[c,r,4]]})
            again=store.action('a',{**data,'revision':loose['revision']},walls={})['models'][0]
            dropped=store.action('a',{'action':'motion','id':added,'revision':again['revision'],'position':[0,1,0],'quaternion':[0,0,0,1],'base_y':.7})['models'][0]
            self.assertIsNone(dropped['mount'])
            near_wall=store.action('a',{'action':'motion','id':added,'revision':dropped['revision'],'position':[-4.86,.05,2],'quaternion':[0,0,0,1],'base_y':0})['models'][0]
            self.assertEqual(near_wall['pose']['p'],[-4.86,.05,2])
            self.assertIsNone(near_wall['mount'])
            with self.assertRaises(ValueError):
                store.action('a',{'action':'motion','id':added,'revision':near_wall['revision'],'position':[-5.1,.05,2],'quaternion':[0,0,0,1],'base_y':0})
            self.assertEqual(store.get('a',added),room_model_fixture())

    def test_free_world_npc_hit_reactions_and_long_range_game_ray(self):
        from free_world import FreeWorld, L
        from village import NPC_WALK_SPEED
        now=[100.]
        profile={'slot':0,'nickname':'Guest','avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0]);world.enter('a',profile)
            row=world.players['a'];row.update(position=[0.,0.,0.],shield=0.)
            npc=world.village.npcs[0];world.village.npcs=[npc]
            npc.update(position=[80.,0.,0.],yaw=0.)
            def pulse(weapon,d):
                now[0]+=1.;row['weapon']=weapon
                length=math.sqrt(sum(x*x for x in d))
                return world.pulse('a',row,{'weapon':weapon,'direction':[x/length for x in d]},now[0])[1]
            with patch.object(world.village,'targets',return_value=[]):
                self.assertEqual(pulse('pistol',[1,0,0])['distance'],L['reach'])
                self.assertEqual(npc['hp'],100)
                row['position']=[38.,0.,0.]
                with patch.object(world.village,'solids',return_value=[]):
                    world.build('a',row,{'cell':[80,0,-1],'dims':[2,4,2]},now[0])
                block=next(iter(world.blocks.values()))
                row['position']=[0.,0.,0.]
                first=pulse('rifle',[1,0,0])
                self.assertAlmostEqual(first['distance'],40.)
                self.assertEqual(npc['hp'],100)
                self.assertEqual(block['hp'],10)
                self.assertEqual(len(world.impact_snapshot()),1)
                pulse('rifle',[1,0,0])
                self.assertEqual(block['hp'],0)
                self.assertEqual(world.impact_snapshot(),[])
                hit=pulse('rifle',[1,0,0])
                self.assertGreater(hit['distance'],79.)
                self.assertEqual(hit['npcHit']['zone'],'head')
                self.assertTrue(hit['npcHit']['defeated'])
                self.assertEqual(row['score'],1)
                self.assertEqual(world.village.corpses(now[0])[0]['hitZone'],'head')
                now[0]+=16
                world.tick_village(now[0])
                self.assertEqual(npc['hp'],100)
                self.assertEqual(npc['injured_legs'],[])
                npc.update(position=[80.,0.,0.],yaw=0.)
                row['position']=[79.88,0.,4.]
                hit=pulse('pistol',[0,.42-1.58,-4])
                self.assertEqual(hit['npcHit']['zone'],'left-leg')
                self.assertEqual(npc['hp'],75)
                snap=world.village.snapshot()[0]
                self.assertEqual(snap['injuredLegs'],['left-leg'])
                self.assertEqual(snap['hitSeq'],1)
                self.assertEqual(snap['hitZone'],'left-leg')
                self.assertEqual(snap['hitAge'],0.)
                npc.update(position=npc['home'][:],route=0,target=None)
                row['position']=[npc['home'][0]+10,npc['home'][1],npc['home'][2]]
                now[0]+=.1;world.tick_village(now[0])
                self.assertFalse(npc['moving'])
                now[0]+=.5;world.tick_village(now[0])
                self.assertTrue(npc['moving'])
                self.assertAlmostEqual(math.hypot(npc['velocity'][0],npc['velocity'][2]),NPC_WALK_SPEED*.65)

    def test_free_world_shared_impact_marks_persistence_and_repair(self):
        from free_world import FreeWorld
        now=[100.]
        profile={'slot':0,'nickname':'Builder','avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0]);world.enter('a',profile)
            row=world.players['a'];row.update(position=[0.,0.,.5],shield=0.,weapon='pistol')
            with patch.object(world.village,'solids',return_value=[]):
                world.build('a',row,{'cell':[8,0,0],'dims':[2,4,2]},now[0])
            block=next(iter(world.blocks.values()))
            now[0]+=1.
            with patch.object(world.village,'targets',return_value=[]):
                notice,shot=world.pulse('a',row,{'weapon':'pistol','direction':[1,0,0]},now[0])
            marks=world.impact_snapshot()
            self.assertEqual(len(marks),1)
            self.assertEqual(marks[0]['target'],'block:'+str(block['id']))
            self.assertEqual(marks[0]['object'],block['id'])
            self.assertEqual(marks[0]['distance'],4.)
            self.assertEqual(world.snapshot('a',row)['impacts'],marks)
            self.assertEqual(FreeWorld(tmp,lambda:now[0]).impact_snapshot(),marks)
            world.repair('a',row,{'id':block['id']},now[0]+1.)
            self.assertEqual(world.impact_snapshot(),[])
            row['position']=[0.,0.,0.]
            now[0]+=2.
            with patch.object(world.village,'targets',return_value=[]):
                _,ground=world.pulse('a',row,{'weapon':'pistol','direction':[0,-1,0]},now[0])
            self.assertTrue(ground['impact'])
            self.assertEqual(world.impact_snapshot()[0]['kind'],'terrain')
            # Budget limits persist in SQLite, even after restarting the world.
            for i in range(16):world.record_impact('terrain','terrain','terrain',ground,1)
            self.assertEqual(len(world.impact_snapshot()),12)
            for i in range(400):world.record_impact('fixture:'+str(i),'terrain','terrain',ground,1)
            self.assertEqual(len(world.impact_snapshot()),384)
            self.assertEqual(len(FreeWorld(tmp,lambda:now[0]).impact_snapshot()),384)

    def test_free_world_shared_build_pvp_and_persistence(self):
        from free_world import FreeWorld, grid_box, SPAWN, HALF
        from hotel_lobby import HotelLobby
        import base64
        now=[10.]
        profile=lambda slot:{'slot':slot,'nickname':'Guest '+str(slot),'avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0]);hall=HotelLobby(lambda:now[0])
            h=hall.request('a',{'action':'enter'},profile(0),[])
            with self.assertRaises(CaptureError):hall.take_free('a','wrong')
            # Move to the portal via the existing hall server's bounded updates.
            hall.players['a']['position']=[0,0,-64.5]
            hall.take_free('a',h['lease']);self.assertNotIn('a',hall.players)
            a=world.enter('a',profile(0));b=world.enter('b',profile(1))
            def req(who,session,op,**kw):
                return world.request(who,{'action':op,'lease':session['lease'],'life':session['life'],**kw})
            with self.assertRaises(CaptureError):req('a',b,'update',position=[0,0,146],yaw=0)
            with self.assertRaises(CaptureError):grid_box([-1,0,HALF-10],[2,2,2])
            with self.assertRaises(CaptureError):grid_box([HALF,0,0],[2,2,2])
            now[0]+=4
            self.assertEqual(SPAWN,[0,0,146]);self.assertEqual(HALF,300)
            self.assertEqual(grid_box([79,0,79],[2,2,2]),([79,0,79],[2,2,2]))
            self.assertEqual(grid_box([-2,0,58],[2,2,2]),([-2,0,58],[2,2,2]))
            with self.assertRaises(CaptureError):req('a',a,'update',position=[0,0,142],yaw=0,weapon='unknown')
            req('a',a,'update',position=[0,0,142],yaw=0,revision=1,weapon='pistol')
            req('b',b,'update',position=[2,0,142],yaw=0,revision=1)
            # Server stores canonical half-metre cells. Another guest sees the
            # same block but may not delete the builder's creation.
            jpeg=base64.b64decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgEhT//2Q==')
            tex=world.add_texture('a',a['lease'],'Testbild.jpg',jpeg)['added']
            self.assertEqual(world.texture('b',tex),jpeg)
            self.assertEqual(world.add_texture('a',a['lease'],'Same.jpg',jpeg)['added'],tex)
            with self.assertRaises(CaptureError):world.add_texture('b',a['lease'],'bad.jpg',jpeg)
            with self.assertRaises(CaptureError):world.add_texture('a',a['lease'],'bad.jpg',b'not jpeg')
            with self.assertRaises(CaptureError):req('b',b,'place',cell=[-2,0,278],dims=[2,2,2],texture=tex)
            built=req('a',a,'place',cell=[-2,0,278],dims=[2,2,2],texture=tex)
            with self.assertRaises(CaptureError):req('a',a,'texture_delete',id=tex)
            item=built['blocks'][0];self.assertNotIn('owner',item)
            self.assertEqual(req('b',b,'update',position=[2,0,142],yaw=0,revision=1)['blocks'],built['blocks'])
            with self.assertRaises(CaptureError):req('b',b,'remove',id=item['id'])
            now[0]+=.3
            with self.assertRaises(CaptureError):req('b',b,'place',cell=[-2,0,278],dims=[2,2,2],texture=None)
            # Shared construction survives a process restart.
            reopened=FreeWorld(tmp)
            self.assertEqual(len(reopened.blocks),1)
            self.assertEqual(reopened.own_textures('a')[0]['id'],tex)
            # Existing hotel damage profiles apply to the shared scene.
            with self.assertRaises(CaptureError):req('a',a,'pulse',direction=[1,0,0],weapon='unknown')
            with self.assertRaises(CaptureError):req('a',a,'pulse',direction=[1,0,0],weapon='m16')
            for weapon in ('pistol','rifle'):
                now[0]+=.6
                req('a',a,'update',position=[0,0,142],yaw=0,weapon=weapon)
                result=req('a',a,'pulse',direction=[1,0,0],weapon=weapon)
                self.assertTrue(result['shot']['impact'])
            self.assertTrue(0<=result['dayPhase']<1)
            self.assertEqual(result['score'],1)
            respawn=req('b',b,'update',position=[2,0,142],yaw=0,revision=result['revision'])
            self.assertEqual(respawn['life'],2);self.assertEqual(respawn['hp'],100)
            self.assertEqual(respawn['position'],[0,0,146])
            self.assertTrue(respawn['corrected'])
            now[0]+=.3
            req('a',a,'remove',id=item['id'])
            self.assertEqual(len(FreeWorld(tmp).blocks),0)
            req('a',a,'texture_delete',id=tex)
            self.assertEqual(world.own_textures('a'),[])
            req('a',a,'leave')
            returned=hall.return_free('a',profile(0),[])
            self.assertEqual(returned['position'],[0,0,-64.5])
            self.assertNotIn('a',world.players)
            with self.assertRaises(CaptureError):world.texture('a','missing')
            req('b',b,'abandon')
            self.assertEqual(world.players,{})

    def test_free_world_model_sharing_damage_repair_and_migration(self):
        from free_world import FreeWorld
        from room_models import RoomModelStore
        now=[10.]
        profile=lambda slot:{'slot':slot,'nickname':'Guest '+str(slot),'avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            library=RoomModelStore(tmp);blob=room_model_fixture()
            source=library.add('a','model.glb',blob)['added']
            world=FreeWorld(tmp,lambda:now[0],GameStore.WEAPON_DAMAGE,library)
            a=world.enter('a',profile(0));b=world.enter('b',profile(1))
            def req(who,session,op,**kw):
                return world.request(who,{'action':op,'lease':session['lease'],'life':session['life'],**kw})
            now[0]+=4
            req('a',a,'update',position=[0,0,142],yaw=0,weapon='pistol')
            req('b',b,'update',position=[4,0,142],yaw=0)
            with self.assertRaises(CaptureError):
                req('b',b,'place',cell=[-2,0,274],dims=[4,4,4],sourceModel=source)
            made=req('a',a,'place',cell=[-2,0,274],dims=[4,4,4],sourceModel=source)
            item=made['blocks'][0];self.assertEqual(item['hp'],100);self.assertEqual(item['modelBytes'],len(blob))
            self.assertEqual(world.model('b',item['model']),blob)
            with self.assertRaises(CaptureError):world.model('outside',item['model'])
            now[0]+=.6
            hit=req('a',a,'pulse',direction=[0,0,-1],weapon='pistol')
            self.assertEqual(hit['blocks'][0]['hp'],75)
            self.assertEqual(hit['blocks'][0]['cell'],[-2,0,273])
            self.assertTrue(hit['shot']['impact'])
            now[0]+=.6
            req('a',a,'update',position=[0,0,142],yaw=0,weapon='rifle')
            hit=req('a',a,'pulse',direction=[0,0,-1],weapon='rifle')
            self.assertEqual(hit['blocks'][0]['hp'],0)
            with self.assertRaises(CaptureError):req('b',b,'repair',id=item['id'])
            req('a',a,'repair',id=item['id'])
            restored=FreeWorld(tmp,model_library=library)
            self.assertEqual(restored.blocks[item['id']]['hp'],100)
            self.assertEqual(library.get('a',source),blob)
            req('a',a,'remove',id=item['id'])
            self.assertEqual(world.models,{})
            self.assertEqual(library.get('a',source),blob)

    def test_free_world_inventory_metric_model_relocation(self):
        from free_world import FreeWorld, block_bounds
        from room_models import RoomModelStore
        now=[10.]
        profile=lambda slot:{'slot':slot,'nickname':'Guest '+str(slot),'avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            library=RoomModelStore(tmp)
            source=library.add('a','model.glb',room_model_fixture())['added']
            world=FreeWorld(tmp,lambda:now[0],GameStore.WEAPON_DAMAGE,library)
            a=world.enter('a',profile(0));b=world.enter('b',profile(1))
            def req(who,session,op,**kw):
                return world.request(who,{'action':op,'lease':session['lease'],'life':session['life'],**kw})
            now[0]+=4
            req('a',a,'update',position=[0,0,142],yaw=0)
            req('b',b,'update',position=[4,0,142],yaw=0)
            first={'p':[0,0,139],'extent':.9,'rotation':90}
            made=req('a',a,'place',pose=first,sourceModel=source)
            item=made['blocks'][0]
            self.assertEqual(item['pose'],first)
            self.assertEqual(block_bounds(item)[1],[.9,.9,.9])
            self.assertEqual(item['version'],0)
            now[0]+=.6
            second={'p':[1,0,139],'extent':1.3,'rotation':180}
            with self.assertRaises(CaptureError):
                req('b',b,'relocate',id=item['id'],version=0,pose=second)
            moved=req('a',a,'relocate',id=item['id'],version=0,pose=second)
            self.assertEqual(len(moved['blocks']),1)
            self.assertEqual(moved['blocks'][0]['id'],item['id'])
            self.assertEqual(moved['blocks'][0]['model'],item['model'])
            self.assertEqual(moved['blocks'][0]['pose'],second)
            self.assertEqual(moved['blocks'][0]['version'],1)
            now[0]+=.6
            with self.assertRaises(CaptureError):
                req('a',a,'relocate',id=item['id'],version=0,pose=first)
            restored=FreeWorld(tmp,model_library=library)
            self.assertEqual(restored.blocks[item['id']]['pose'],second)
            self.assertEqual(restored.blocks[item['id']]['version'],1)
            self.assertEqual(len(restored.models),1)
            block=req('a',a,'place',cell=[-5,0,277],dims=[3,3,3])
            self.assertEqual(len(block['blocks']),2)
            other=next(r for r in block['blocks'] if r['id']!=item['id'])
            now[0]+=.6
            resized=req('a',a,'relocate',id=other['id'],version=0,cell=[-5,0,277],dims=[4,4,4])
            self.assertEqual(next(r for r in resized['blocks'] if r['id']==other['id'])['dims'],[4,4,4])

    def test_bundled_village_zip(self):
        import hashlib, io, json, zipfile
        from village_assets import VillageAssetStore, KEYS, BUNDLE_NAME, bundle_village_assets
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();dest=root/'bundled'
            self.assertEqual(bundle_village_assets(source,dest),[])
            self.assertEqual(json.loads((dest/'manifest.json').read_text()),[])
            models={k:room_model_fixture() for k in KEYS}
            out=io.BytesIO()
            with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
                for k,data in models.items():z.writestr(k+'.glb',data)
                z.writestr('LICENSE-Quaternius.txt','CC0')
                z.writestr('ASSET-REPORT.json','{}')
            blob=out.getvalue();archive=source/BUNDLE_NAME;archive.write_bytes(blob)
            with patch('village_assets.BUNDLE_SHA256',hashlib.sha256(blob).hexdigest()):
                self.assertEqual(bundle_village_assets(source,dest),list(KEYS))
                self.assertEqual(json.loads((dest/'manifest.json').read_text()),list(KEYS))
                self.assertEqual((dest/'LICENSE-Quaternius.txt').read_text(),'CC0')
                self.assertEqual((dest/'ASSET-REPORT.json').read_text(),'{}')
                store=VillageAssetStore(root,dest)
                self.assertEqual(store.manifest(),list(KEYS))
                for k,data in models.items():self.assertEqual(store.get(k),data)
                store.install(blob)
                archive.write_bytes(blob+b'corruption')
                with self.assertRaisesRegex(ValueError,'SHA256 mismatch'):
                    bundle_village_assets(source,dest)
                self.assertEqual(store.manifest(),list(KEYS))
                self.assertEqual((dest/'house-a.glb').read_bytes(),models['house-a'])
            archive.unlink()
            self.assertEqual(bundle_village_assets(source,dest),[])
            # An image without the bundle must never discard the persistent bank.
            self.assertEqual(VillageAssetStore(root,dest).manifest(),list(KEYS))
            (source/'house-a.glb').write_bytes(models['house-a'])
            self.assertEqual(bundle_village_assets(source,dest),['house-a'])
            self.assertEqual(json.loads((dest/'manifest.json').read_text()),['house-a'])

    def test_village_asset_store_atomic_install_and_persistence(self):
        from village_assets import VillageAssetStore, KEYS
        import io, zipfile
        def pack(names, bad=None):
            out=io.BytesIO()
            with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
                for name in names:z.writestr(name,b'bad' if name==bad else room_model_fixture())
            return out.getvalue()
        with tempfile.TemporaryDirectory() as tmp:
            store=VillageAssetStore(tmp,Path(tmp)/'bundled')
            self.assertEqual(store.manifest(),[])
            names=[k+'.glb' for k in KEYS]
            self.assertEqual(store.install(pack(names))['models'],list(KEYS))
            self.assertEqual(store.get('shop-a'),room_model_fixture())
            with self.assertRaises(CaptureError):store.install(pack(names,bad='shop-a.glb'))
            with self.assertRaises(CaptureError):store.install(pack(names+['../outside']))
            with self.assertRaises(CaptureError):store.install(pack(names[:-1]))
            reopened=VillageAssetStore(tmp,Path(tmp)/'bundled')
            self.assertEqual(reopened.manifest(),list(KEYS))
            self.assertEqual(reopened.get('shop-a'),room_model_fixture())
            with self.assertRaises(CaptureError):reopened.get('../outside')

    def test_village_tree_regrowth_persists_and_respects_builds(self):
        from village import Village, TREE_REGROW_SECONDS
        now=[100000.]
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'forest.sqlite3'
            village=Village(path,[],lambda:1.,lambda:now[0])
            tree=next(r for r in village.rows.values() if r['kind']=='tree')
            key=tree['id']
            village.damage_tree(tree,100)
            self.assertEqual(tree['hp'],0)
            self.assertEqual(village.regrow_at[key],now[0]+TREE_REGROW_SECONDS)
            now[0]+=TREE_REGROW_SECONDS-1
            village=Village(path,[],lambda:2.,lambda:now[0])
            self.assertFalse(village.regrow([]))
            self.assertEqual(village.rows[key]['hp'],0)
            now[0]+=1
            self.assertFalse(village.regrow([tree['bounds']]))
            now[0]+=1
            self.assertTrue(village.regrow([]))
            self.assertEqual(village.rows[key]['hp'],100)
            self.assertNotIn(key,village.regrow_at)
            again=Village(path,[],lambda:3.,lambda:now[0])
            self.assertEqual(again.rows[key]['hp'],100)
            self.assertNotIn(key,again.regrow_at)

    def test_village_structural_damage_repair_persistence(self):
        from free_world import FreeWorld
        from village_structure import parts_for, part_index, prism_overlap, prism_ray
        now=[100.]
        profile={'slot':0,'nickname':'Builder','avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0])
            session=world.enter('builder',profile);player=world.players['builder']
            row=world.village.rows['building-0-0']
            structure=world.village.structure
            self.assertEqual(len(list(parts_for(row))),269)
            self.assertEqual(len(structure.colliders[row['id']]),6)
            parts=list(parts_for(row))
            self.assertEqual(len({p['index'] for p in parts}),269)
            self.assertTrue(any(abs(a[0]-b[0])>.01 and abs(a[1]-b[1])>.01 for p in parts if p.get('poly') for a,b in zip(p['poly'],p['poly'][1:]+p['poly'][:1])))
            # Street-facing wall, at the lowest two accessible wall levels.
            part=structure.parts[row['id']+':'+str(part_index(7,1,1))]
            b,s=part['bounds'];z=b[2]+s[2]/2
            player.update(position=[b[0]+s[0]+2.,0.,z],weapon='pistol')
            now[0]+=4
            result=world.request('builder',{'action':'pulse','lease':session['lease'],'life':player['life'],'weapon':'pistol','direction':[-1,0,0]})
            self.assertTrue(result['shot']['impact'])
            # The eye is in the cell above the low wall cell, except in a 7.5m house.
            damaged=[p for p in structure.by_building[row['id']] if p['stage']]
            self.assertEqual(len(damaged),1)
            self.assertEqual(damaged[0]['stage'],1)
            part=damaged[0]
            structure.damage(part,4)
            part=structure.parts[part['id']]
            self.assertEqual(part['hp'],0)
            u,v,n=part['axes'];point=[0.,0.,0.]
            point[u],point[v]=part['site'];point[n]=part['bounds'][0][n]+part['bounds'][1][n]/2
            tiny=[x-.01 for x in point]
            self.assertTrue(prism_overlap(tiny,[.02]*3,part))
            self.assertFalse(any(prism_overlap(tiny,[.02]*3,p) for p in structure.colliders[row['id']]))
            again=FreeWorld(tmp,lambda:now[0])
            self.assertEqual(again.village.structure.parts[part['id']]['stage'],4)
            world.repair('builder',player,{'id':part['id']},now[0])
            self.assertEqual(structure.parts[part['id']]['stage'],0)
            structure.damage(structure.parts[part['id']],4)
            now[0]+=.2
            world.repair('builder',player,{'id':part['id'],'whole':True},now[0])
            self.assertEqual(row['damage'],{})

    def test_village_npc_patrol_no_obstacle_reversal(self):
        from village import Village, NPC_STEP
        now=[10.]
        with tempfile.TemporaryDirectory() as tmp:
            village=Village(Path(tmp)/'patrol.sqlite3',[],lambda:now[0])
            npc=village.npcs[0];x0,_,z0=npc['position']
            players={'observer':{'position':[x0+10,0,z0]}}
            blocked=lambda p: abs(p[0]-x0)<.2 and z0+1<=p[2]<=z0+1.2
            def tick(dt=NPC_STEP,solid=blocked):
                now[0]+=dt
                village.tick(now[0],players,solid,lambda *a:math.inf,lambda:[],lambda p:([0,0,0],[1,1,1]),[0,0,0])
            previous=z0
            for _ in range(80):
                tick();z=npc['position'][2]
                self.assertGreaterEqual(z+1e-9,previous)
                self.assertLessEqual(z,z0+1+1e-8)
                self.assertEqual(npc['route'],0)
                previous=z
            self.assertFalse(npc['moving'])
            self.assertGreater(previous,z0+.9)
            for _ in range(100):
                tick(solid=lambda p:False);z=npc['position'][2]
                if npc['route']==1:break
                self.assertGreaterEqual(z+1e-9,previous);previous=z
            self.assertEqual(npc['route'],1)
            self.assertAlmostEqual(z,z0+5,delta=.07)
            self.assertFalse(npc['moving'])
            for _ in range(7):
                tick(solid=lambda p:False)
                self.assertEqual(npc['position'][2],z)
                self.assertFalse(npc['moving'])
            for _ in range(8):tick(solid=lambda p:False)
            self.assertTrue(npc['moving'])
            self.assertLess(npc['position'][2],z)
            self.assertEqual(npc['route'],1)
            self.assertTrue(village.damage_npc(npc,'observer',100,now[0]))
            self.assertTrue(village.corpses(now[0])[0]['dead'])
            self.assertEqual(village.corpses(now[0]+10),[])
            tick(16.,solid=lambda p:False)
            self.assertEqual(npc['hp'],100)
            self.assertIsNone(npc['dead_at'])

    def test_village_initial_snapshot_after_server_idle(self):
        from free_world import FreeWorld
        now=[10.]
        profile={'slot':0,'nickname':'Guest','avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0])
            now[0]+=3600.
            session=world.enter('a',profile)
            self.assertEqual(len(session['npcs']),6)
            for npc in session['npcs']:
                self.assertEqual(npc['serverTime'],now[0])
                self.assertGreaterEqual(npc['motionTime'],now[0]-.06)
                self.assertTrue(npc['motionTrail'])
                self.assertAlmostEqual(npc['motionTrail'][-1][0],npc['motionTime'])
            row=world.players['a']
            npc=world.village.npcs[0]
            x,y,z=npc['position']
            row.update(position=[x+10,y,z])
            for _ in range(12):
                now[0]+=.25
                world.tick_village(now[0])
            fresh=next(n for n in world.village.snapshot() if n['slot']==npc['slot'])
            self.assertEqual(fresh['serverTime'],now[0])
            self.assertGreaterEqual(fresh['motionTime'],now[0]-.06)
            self.assertTrue(fresh['moving'])
            self.assertGreater(fresh['position'][2],z+2.)
            self.assertTrue(world.village.damage_npc(npc,'a',100,now[0]))
            now[0]+=16.
            world.tick_village(now[0])
            revived=next(n for n in world.village.snapshot() if n['slot']==npc['slot'])
            self.assertEqual(revived['life'],fresh['life']+1)
            self.assertGreaterEqual(revived['motionTime'],now[0]-.06)
            self.assertEqual(revived['serverTime'],now[0])
            self.assertTrue(revived['motionTrail'])

    def test_village_npc_motion_history_and_pace(self):
        from village import Village, NPC_WALK_SPEED, NPC_TRAIL_LENGTH
        now=[10.]
        with tempfile.TemporaryDirectory() as tmp:
            village=Village(Path(tmp)/'patrol-history.sqlite3',[],lambda:now[0])
            npc=village.npcs[0];x0,_,z0=npc['position']
            players={'observer':{'position':[x0+10,0,z0]}}
            for _ in range(10):
                now[0]+=.2
                village.tick(now[0],players,lambda p:False,lambda *a:math.inf,lambda:[],lambda p:([0,0,0],[1,1,1]),[0,0,0])
            row=next(r for r in village.snapshot() if r['slot']==npc['slot'])
            trail=row['motionTrail']
            self.assertEqual(len(trail),NPC_TRAIL_LENGTH)
            self.assertAlmostEqual(NPC_WALK_SPEED,1.35)
            for a,b in zip(trail,trail[1:]):
                self.assertAlmostEqual(b[0]-a[0],.05,places=6)
                self.assertAlmostEqual((b[3]-a[3])/(b[0]-a[0]),NPC_WALK_SPEED,places=6)
                self.assertAlmostEqual(b[5],NPC_WALK_SPEED,places=6)
            self.assertEqual(trail[-1][1:4],row['position'])
            self.assertAlmostEqual(trail[-1][0],row['motionTime'])
            self.assertTrue(row['moving'])

    def test_village_sidewalk_patrols_and_spawn_fallback(self):
        from village import Village, NPC_STEP, NPC_SIDEWALKS, NPC_PATROL_SEEDS, SIDEWALK_Y, sidewalk_height
        from village_structure import prism_overlap
        now=[100.]
        with tempfile.TemporaryDirectory() as tmp:
            village=Village(Path(tmp)/'sidewalk.sqlite3',[],lambda:now[0])
            self.assertEqual(len(village.npcs),6)
            players={'observer':{'position':[-65.,0.,-30.]}}
            def body(p):
                return [p[0]-.25,p[1]+.015,p[2]-.25],[.5,1.585,.5]
            def blocked(p):
                return any(prism_overlap(*body(p),o) for o in village.solids())
            for npc in village.npcs:npc['visit_after']=math.inf
            extremes={n['slot']:[n['position'][2],n['position'][2]] for n in village.npcs}
            for _ in range(800):
                now[0]+=NPC_STEP
                village.tick(now[0],players,blocked,lambda *a:math.inf,village.solids,body,[0,0,0])
                for j,npc in enumerate(village.npcs):
                    x,y,z=npc['position'];lane=NPC_SIDEWALKS[NPC_PATROL_SEEDS[j][0]]
                    self.assertAlmostEqual(x,lane['x'])
                    self.assertEqual(y,SIDEWALK_Y)
                    self.assertEqual(sidewalk_height(x,z),y)
                    self.assertLessEqual(abs(z-lane['z']),lane['d']/2-.25)
                    self.assertFalse(blocked(npc['position']))
                    lo,hi=extremes[npc['slot']];extremes[npc['slot']]=[min(lo,z),max(hi,z)]
            self.assertTrue(all(hi-lo>9.8 for lo,hi in extremes.values()))
        with tempfile.TemporaryDirectory() as tmp:
            x=NPC_SIDEWALKS[0]['x'];z=NPC_PATROL_SEEDS[0][1]
            village=Village(Path(tmp)/'blocked.sqlite3',[([x-.5,0,z-.4],[1,2,.8])],lambda:10.)
            self.assertEqual(len(village.npcs),6)
            self.assertEqual(village.npcs[0]['home'],[x,SIDEWALK_Y,z+1])

    def test_village_enterable_buildings_and_npc_visits(self):
        from village import Village,NPC_MODELS
        from village_structure import prism_overlap,prism_ray,DOOR_INDEX
        now=[100.]
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'visits.sqlite3'
            village=Village(path,[],lambda:now[0])
            self.assertEqual([n['avatar']['model'] for n in village.npcs],list(NPC_MODELS))
            self.assertEqual(len(village.npcs),6)
            self.assertEqual(sum(n['avatar']['model']>=13 for n in village.npcs),2)
            players={'observer':{'position':[-65.,0.,-30.]}}
            def body(p):return [p[0]-.25,p[1]+.015,p[2]-.25],[.5,1.585,.5]
            def blocked(p):return any(prism_overlap(*body(p),o) for o in village.solids())
            for row in village.structure.rows.values():
                d=row['door'];x,z,side=d['front'],d['z'],d['side'];floor=row['bounds'][1][1]*.025
                origin=[x+side*1.5,1.5,z];direction=[-side,0,0]
                self.assertTrue(blocked([x-side*.4,floor,z]))
                self.assertTrue(village.set_door(row,True,now[0],players,village.solids,body))
                self.assertFalse(blocked([x-side*.4,floor,z]))
                self.assertFalse(blocked([x-side*2,floor,z]))
                self.assertTrue(blocked([x-side*.4,floor,z+1]))
                self.assertFalse(any(prism_ray(origin,direction,p,3.)<3. for p in village.structure.targets(origin,3.)))
                players['observer']['position']=[x-side*.4,floor,z]
                self.assertFalse(village.set_door(row,False,now[0],players,village.solids,body))
                players['observer']['position']=[-65.,0.,-30.]
                self.assertTrue(village.set_door(row,False,now[0],players,village.solids,body))
            entered=set();returned=set();opened=set()
            for _ in range(2200):
                now[0]+=.05
                village.tick(now[0],players,blocked,lambda *a:math.inf,village.solids,body,[0,0,0])
                for npc in village.npcs:
                    row=village.structure.rows[npc['visit_building']];d=row['door'];x,y,z=npc['position']
                    self.assertFalse(blocked(npc['position']))
                    if (d['front']-x)*d['side']>1.2 and abs(z-d['z'])<3.:entered.add(npc['slot'])
                    elif npc['slot'] in entered and npc['visit_index']==-1:returned.add(npc['slot'])
                    if d['open']:opened.add(row['id'])
                if len(returned)==6 and len(opened)==6:break
            self.assertEqual(len(entered),6)
            self.assertEqual(len(returned),6)
            self.assertEqual(len(opened),6)
            row=village.structure.rows['building-0-0'];key=row['id']+':'+str(DOOR_INDEX)
            village.structure.damage(village.structure.parts[key],4)
            self.assertTrue(row['door']['open'])
            reopened=Village(path,[],lambda:now[0])
            self.assertTrue(reopened.structure.rows[row['id']]['door']['open'])
            self.assertEqual(reopened.structure.parts[key]['stage'],4)
            reopened.structure.repair(reopened.structure.parts[key])
            self.assertEqual(reopened.structure.parts[key]['hp'],100)

    def test_free_world_manual_door_interaction(self):
        from free_world import FreeWorld
        from world_capture import CaptureError
        now=[100.]
        profile={'slot':0,'nickname':'Guest','avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0]);session=world.enter('a',profile);p=world.players['a']
            building=world.village.structure.rows['building-0-0'];d=building['door'];x,z,side=d['front'],d['z'],d['side']
            with self.assertRaises(CaptureError):world.toggle_village_door(p,{'id':building['id']},now[0])
            p['position']=[x+side*2,0.,z]
            self.assertIn('geoeffnet',world.toggle_village_door(p,{'id':building['id']},now[0]))
            self.assertTrue(d['open'])
            p['position']=[x-side*.4,building['bounds'][1][1]*.025,z]
            with self.assertRaises(CaptureError):world.toggle_village_door(p,{'id':building['id']},now[0]+1.)
            p['position']=[x-side*2,building['bounds'][1][1]*.025,z]
            self.assertIn('geschlossen',world.toggle_village_door(p,{'id':building['id']},now[0]+2.))
            self.assertFalse(d['open'])

    def test_hidden_village_damage_retaliation_and_migration(self):
        from free_world import FreeWorld
        from village import Village, make_scenery
        now=[10.]
        profile={'slot':0,'nickname':'Guest','avatar':DEFAULT_AVATAR}
        with tempfile.TemporaryDirectory() as tmp:
            world=FreeWorld(tmp,lambda:now[0])
            session=world.enter('a',profile);row=world.players['a']
            trees=[r for r in session['scenery'] if r['kind']=='tree']
            self.assertGreater(len(trees),150)
            self.assertEqual(len([r for r in session['scenery'] if r['kind']!='tree']),6)
            self.assertEqual(len(session['npcs']),6)
            self.assertTrue(session['villageRoads'])
            tree=min(trees,key=lambda r:math.hypot(r['bounds'][0][0]-20,r['bounds'][0][2]-110))
            b,size=tree['bounds'];x=b[0]+size[0]/2;z=b[2]+size[2]/2
            self.assertTrue(world.blocked([x,0,z]))
            now[0]+=4
            row.update(position=[x+3,0,z],weapon='rifle',move_at=now[0])
            def pulse(direction):
                return world.request('a',{'action':'pulse','lease':session['lease'],'life':row['life'],'weapon':'rifle','direction':direction})
            first=pulse([-1,0,0]);self.assertTrue(first['shot']['impact'])
            self.assertEqual(world.village.rows[tree['id']]['hp'],10)
            now[0]+=.6;second=pulse([-1,0,0])
            self.assertTrue(second['shot']['impact'])
            self.assertEqual(world.village.rows[tree['id']]['hp'],0)
            self.assertFalse(world.blocked([x,0,z]))
            reopened=FreeWorld(tmp,lambda:now[0])
            self.assertEqual(reopened.village.rows[tree['id']]['hp'],0)
            npc=world.village.npcs[0];p=npc['position']
            row.update(position=[p[0],0,p[2]+3.5],move_at=now[0])
            self.assertTrue(all(n['target'] is None for n in world.village.npcs))
            now[0]+=.6;hit=pulse([0,0,-1])
            self.assertTrue(hit['shot']['impact'])
            self.assertEqual(npc['hp'],10);self.assertEqual(npc['target'],'a')
            self.assertTrue(all(n['target'] is None for n in world.village.npcs[1:]))
            now[0]+=1.1;world.tick_village(now[0])
            self.assertLess(row['hp'],100)
            self.assertGreater(npc['shot_seq'],0)
            self.assertTrue(world.village.damage_npc(npc,'a',100,now[0]))
            self.assertNotIn(npc['slot'],[n['slot'] for n in world.village.snapshot()])
            corpse=world.village.corpses(now[0])[0]
            self.assertEqual(corpse['slot'],npc['slot']);self.assertTrue(corpse['dead'])
            self.assertEqual(corpse['deadAge'],0.)
            self.assertEqual(world.village.corpses(now[0]+9.)[0]['deadAge'],9.)
            self.assertEqual(world.village.corpses(now[0]+10.),[])
            now[0]+=16;world.tick_village(now[0])
            self.assertEqual(npc['hp'],100);self.assertIsNone(npc['target'])
        with tempfile.TemporaryDirectory() as tmp:
            old=make_scenery()[0]
            village=Village(Path(tmp)/'test.sqlite3',[old['bounds']],lambda:10.)
            self.assertNotIn(old['id'],village.rows)
            again=Village(Path(tmp)/'test.sqlite3',[],lambda:10.)
            self.assertNotIn(old['id'],again.rows)

    def test_free_world_http_auth_and_transition(self):
        with tempfile.TemporaryDirectory() as tmp:
            srv=create_server(port=0,data_dir=Path(tmp),guest_game=True,world_capture=True)
            thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(srv.server_port)
            opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def req(path,data=None,client=opener):
                request=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
                with client.open(request,timeout=5) as res:return json.load(res)
            try:
                self.assertTrue(req('/api/health')['free_world'])
                with self.assertRaises(urllib.error.HTTPError) as err:req('/api/free-world',{'action':'enter','lease':'invalid'},urllib.request.build_opener())
                self.assertEqual(err.exception.code,401)
                profile=req('/api/account',{'action':'register','email':'free@example.invalid','password':'FreeWorld-password-123','nickname':'Builder'})
                with self.assertRaises(urllib.error.HTTPError) as err:req('/api/free-world',{'action':'enter','lease':'invalid'})
                self.assertEqual(err.exception.code,409)
                hall=req('/api/lobby',{'action':'enter'})
                self.assertEqual(profile['slot'],0)
                time.sleep(1)
                req('/api/lobby',{'action':'update','lease':hall['lease'],'position':[0,0,-64.5],'yaw':0})
                world=req('/api/free-world',{'action':'enter','lease':hall['lease']})
                self.assertEqual(world['position'],[0,0,146]);self.assertEqual(world['hp'],100)
                with self.assertRaises(urllib.error.HTTPError) as err:req('/api/lobby',{'action':'update','lease':hall['lease'],'position':[0,0,-64.5],'yaw':0})
                self.assertEqual(err.exception.code,409)
                back=req('/api/free-world',{'action':'leave','lease':world['lease']})
                self.assertEqual(back['position'],[0,0,-64.5])
                req('/api/lobby',{'action':'update','lease':back['lease'],'position':[0,0,-64.5],'yaw':0})
                with self.assertRaises(urllib.error.HTTPError) as err:req('/api/free-world',{'action':'update','lease':world['lease'],'life':1,'position':[0,0,146],'yaw':0})
                self.assertEqual(err.exception.code,409)
            finally:srv.shutdown();srv.server_close();thread.join(5)

    def test_private_room_model_validation_and_persistence(self):
        from room_models import RoomModelStore, validate_glb, MAX_MODELS
        blob=room_model_fixture()
        self.assertEqual(validate_glb(blob)['triangles'],1)
        for change in (
            lambda g:g['buffers'][0].update(uri='https://example.invalid/model.bin'),
            lambda g:g['nodes'][0].update(children=[0]),
            lambda g:g['accessors'][0].update(count=999999),
            lambda g:g.update(extensionsRequired=['KHR_draco_mesh_compression']),
            lambda g:g['bufferViews'][0].update(byteLength=99999),
            lambda g:g.update(animations=[{}]),
            lambda g:g.update(images=[{'bufferView':0,'mimeType':'image/svg+xml'}])):
            with self.assertRaises(ValueError):validate_glb(room_model_fixture(change))
        with self.assertRaises(ValueError):validate_glb(blob[:-1])
        with tempfile.TemporaryDirectory() as tmp:
            store=RoomModelStore(tmp)
            self.assertEqual(store.list('a')['models'],[])
            item=store.add('a','chair.glb',blob)
            identifier=item['added']
            self.assertFalse(item['models'][0]['placed'])
            data={'action':'place','id':identifier,'x':1.5,'y':0,'z':1.5,'extent':.8,'rotation':45,'solid':True}
            with self.assertRaises(CaptureError):store.action('b',data)
            with self.assertRaises(CaptureError):store.get('b',identifier)
            for bad in ({'x':4.7},{'extent':100},{'rotation':float('nan')},{'solid':'true'},{'y':2.8}):
                with self.assertRaises(ValueError):store.action('a',{**data,**bad})
            row=store.action('a',data)['models'][0]
            self.assertTrue(row['placed'] and row['solid'])
            self.assertEqual(row['rotation'],45)
            reopened=RoomModelStore(tmp)
            self.assertEqual(reopened.get('a',identifier),blob)
            self.assertEqual(reopened.list('a')['models'],[row])
            self.assertFalse(reopened.action('a',{'action':'hide','id':identifier})['models'][0]['placed'])
            for _ in range(MAX_MODELS-1):store.add('a','chair.glb',blob)
            with self.assertRaises(CaptureError):store.add('a','too-many.glb',blob)
            store.action('a',{'action':'delete','id':identifier})
            self.assertEqual(len(store.list('a')['models']),MAX_MODELS-1)

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
            self.assertGreaterEqual(q['yaw'],0)
            self.assertLessEqual(q['yaw'],2*math.pi)
            self.assertEqual(q['phase'],t)
        from hotel_lobby import NPC_TURN, LAYOUT
        turn=(2*(LAYOUT['halfLength']-2)-4)/NPC_SPEED
        self.assertFalse(npc_patrol(turn+NPC_TURN/2)['walking'])
        self.assertAlmostEqual(npc_patrol(turn+NPC_TURN/2)['position'][2],64)
        self.assertAlmostEqual(npc_patrol(turn+NPC_TURN/2)['yaw'],math.pi*1.5,places=3)
        self.assertTrue(npc_patrol(turn+NPC_TURN+.2)['walking'])
        self.assertLess(npc_patrol(turn+NPC_TURN+.2)['position'][2],64)
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
            older={k:v for k,v in avatar.items() if k!='model'}
            self.assertEqual(clean_avatar(older),avatar)
            self.assertEqual(accounts.save_avatar(legacy,older)['avatar'],avatar)
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
                # Real upload and fetch: neither bytes nor metadata cross account boundaries.
                blob=room_model_fixture()
                with self.assertRaises(urllib.error.HTTPError) as e:req('','/api/room-models')
                self.assertEqual(e.exception.code,401)
                def upload(cookie,origin=None):
                    headers={'Cookie':cookie,'Content-Type':'model/gltf-binary'}
                    if origin:headers['Origin']=origin
                    with urllib.request.urlopen(urllib.request.Request(base+'/api/room-models/upload?name=chair.glb',data=blob,headers=headers),timeout=8) as res:return json.load(res)
                with self.assertRaises(urllib.error.HTTPError) as e:upload(ca,'https://example.invalid')
                self.assertEqual(e.exception.code,403)
                model=upload(ca)['added'];self.assertEqual(req(cb,'/api/room-models')['models'],[])
                p={'action':'place','id':model,'x':1.5,'y':0,'z':1.5,'extent':.8,'rotation':90,'solid':False}
                self.assertTrue(req(ca,'/api/room-models',p)['models'][0]['placed'])
                with self.assertRaises(urllib.error.HTTPError) as e:req(cb,'/api/room-models',p)
                self.assertEqual(e.exception.code,404)
                with urllib.request.urlopen(urllib.request.Request(base+'/api/room-models/'+model,headers={'Cookie':ca}),timeout=8) as res:
                    self.assertEqual(res.read(),blob);self.assertEqual(res.headers.get_content_type(),'model/gltf-binary')
                    self.assertEqual(res.headers['Cache-Control'],'no-store')
                with self.assertRaises(urllib.error.HTTPError) as e:req(cb,'/api/room-models/'+model)
                self.assertEqual(e.exception.code,404)
                self.assertEqual(req(ca,'/api/room-models',{'action':'delete','id':model})['models'],[])
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


    def test_distinct_game_weapon_damage_and_legacy_compatibility(self):
        from wall_damage import WALLS, REMOVED, axes, site
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            results={}
            for weapon in ('pistol','m16','rifle'):
                folder=root/weapon
                folder.mkdir()
                game=GameStore(folder)
                wall='surface_6'
                w=WALLS[wall]
                u,v,b=axes(w)
                point=[0.,0.,0.];point[u],point[v]=site(w,3,4);point[b]=w['s'][b]/2
                normal=[0.,0.,0.];normal[b]=1
                mark={'point':point,'normal':normal}
                hit=game.action({'action':'damage_wall','id':wall,'mark':mark,'weapon':weapon,'damage':999},None)
                stage=hit['wall_result']['stage']
                if weapon=='rifle':self.assertEqual(stage,REMOVED)
                severity=hit['marks'][0]['severity']
                decor=game.action({'action':'damage_decor','id':'surface_picture','mark':{'point':[.1,.1,.1],'normal':[0,0,1]},'weapon':weapon},None)
                obj=game.action({'action':'hit','id':'table','weapon':weapon,'damage':999},None)
                results[weapon]=(stage,severity,decor['decor_result']['stage'],100-obj['objects']['table'])
                self.assertEqual(GameStore(folder).state()['walls'][wall],[[3,4,stage]])
                for _ in range(4):
                    game.action({'action':'damage_wall','id':wall,'mark':mark,'weapon':weapon},None)
                self.assertEqual(game.state()['walls'][wall],[[3,4,REMOVED]])
                game.action({'action':'repair_surface','id':wall},None)
                self.assertNotIn(wall,game.state()['walls'])
                before=game.state()
                for invalid in ('unknown',[],None):
                    with self.assertRaises(ValueError):
                        game.action({'action':'hit','id':'table','weapon':invalid},None)
                self.assertEqual(game.state(),before)
            for a,b in zip(results['pistol'],results['m16']):
                self.assertLess(a,b)
            for a,b in zip(results['m16'],results['rifle']):
                self.assertLess(a,b)
            folder=root/'legacy'
            folder.mkdir()
            legacy=GameStore(folder)
            self.assertEqual(legacy.action({'action':'hit','id':'table'},None)['objects']['table'],75)

    def test_avatar_assets_and_health_share_get_handler(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            web = root / 'web'
            assets = web / 'assets' / 'avatars' / 'data'
            assets.mkdir(parents=True)
            (assets / 'skin tone.json').write_bytes(b'{"skin":1}')
            (assets / 'literal%20name.json').write_bytes(b'{"skin":2}')
            (assets.parent / 'secret.json').write_bytes(b'private')
            (assets / 'outside.json').symlink_to(assets.parent / 'secret.json')
            with patch('server.WEB', web):
                srv = create_server(port=0, data_dir=root / 'state', guest_game=True, world_capture=True)
                thread = threading.Thread(target=srv.serve_forever, daemon=True)
                thread.start()
                base = f'http://127.0.0.1:{srv.server_port}'
                try:
                    with urllib.request.urlopen(base + '/api/health', timeout=5) as res:
                        self.assertEqual(res.status, 200)
                        self.assertTrue(json.load(res)['ok'])
                        self.assertNotIn("'unsafe-eval'", res.headers['Content-Security-Policy'])
                    for name, expected in [('skin%20tone.json', b'{"skin":1}'), ('literal%2520name.json', b'{"skin":2}')]:
                        with urllib.request.urlopen(base + '/assets/avatars/data/' + name, timeout=5) as res:
                            self.assertEqual(res.status, 200)
                            self.assertEqual(res.headers.get_content_type(), 'application/json')
                            self.assertEqual(res.read(), expected)
                    for name in ('missing.json', '%2e%2e/secret.json', '%2e%2e%2fsecret.json', 'outside.json', '%00.json', 'folder%5cfile.json'):
                        with self.assertRaises(urllib.error.HTTPError) as e:
                            urllib.request.urlopen(base + '/assets/avatars/data/' + name, timeout=5)
                        self.assertEqual(e.exception.code, 404, name)
                    with urllib.request.urlopen(base + '/api/health', timeout=5) as res:
                        self.assertTrue(json.load(res)['ok'])
                finally:
                    srv.shutdown()
                    srv.server_close()
                    thread.join(timeout=5)

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
