import tempfile
from pathlib import Path
import unittest
from server import GameStore

class RoomInteractions(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.room=GameStore(self.root)
    def act(self,op,id,**extra):return self.room.action({'action':op,'id':id,**extra},None)
    def test_light_persists_and_other_room_independent(self):
        self.assertTrue(self.room.state()['lights_on'])
        self.assertFalse(self.act('toggle_light','surface_switch')['lights_on'])
        self.assertFalse(GameStore(self.root).state()['lights_on'])
        other=self.root/'other';other.mkdir();self.assertTrue(GameStore(other).state()['lights_on'])
        self.assertTrue(self.act('toggle_light','surface_switch')['lights_on'])
    def test_light_switch_damage(self):
        with self.assertRaises(ValueError):self.act('toggle_light','bad')
        for _ in range(4):self.act('damage_decor','surface_switch',mark={'point':[0,0,0],'normal':[0,0,1]})
        with self.assertRaises(ValueError):self.act('toggle_light','surface_switch')
        self.act('repair_surface','surface_switch')
        self.assertFalse(self.act('toggle_light','surface_switch')['lights_on'])
    def test_place_and_reload(self):
        result=self.act('place_object','crate',position=[0,.45,-1.5]);self.assertEqual(result['placements']['crate'],[0,.45,-1.5])
        self.assertEqual(GameStore(self.root).state()['placements']['crate'],[0,.45,-1.5])
        self.assertEqual(self.act('hit','crate')['placements']['crate'],[0,.45,-1.5])
    def test_invalid_placement(self):
        for oid,p in [('window',[0,.45,-1.5]),('crate',[99,.45,0]),('crate',[0,2,0]),('crate',[0,-.9,0]),('crate',[2.25,.45,-1.7]),('crate',[3.4,.45,3.71]),('crate',[0,float('nan'),0]),('crate',[True,.45,0])]:
            with self.subTest(oid=oid,p=p):
                with self.assertRaises(ValueError):self.act('place_object',oid,position=p)
        for _ in range(3):self.act('hit','crate')
        with self.assertRaises(ValueError):self.act('place_object','crate',position=[0,.45,-1.5])
        self.assertEqual(self.room.state()['placements'],{})
    def test_additive_migration(self):
        import sqlite3
        with sqlite3.connect(self.room.path) as db:
            db.execute('DROP TABLE placements');db.execute('DROP TABLE room_settings');db.execute("UPDATE objects SET hp=35 WHERE id='crate'")
        s=GameStore(self.root).state();self.assertEqual(s['objects']['crate'],35);self.assertTrue(s['lights_on']);self.assertEqual(s['placements'],{})
