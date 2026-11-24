import json, sqlite3, tempfile, unittest
from pathlib import Path
from server import GameStore

class Scans:
    def list(self): return []

class MarksTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.path=Path(self.tmp.name); self.game=GameStore(self.path); self.scans=Scans()
        self.mark={'point':[.2,.4,.45],'normal':[0,0,1]}
    def tearDown(self): self.tmp.cleanup()
    def act(self, action, id, mark=None):
        return self.game.action(dict(action=action,id=id,**({'mark':mark} if mark is not None else {})),self.scans)
    def test_object_damage_survives_restart_and_repair(self):
        result=self.act('hit','crate',self.mark);self.assertEqual(result['objects']['crate'],35);self.assertTrue(result['mark_saved'])
        saved=GameStore(self.path).state()['marks'];self.assertEqual(saved[0]['target'],'crate');self.assertEqual(saved[0]['point'],self.mark['point'])
        self.act('hit','crate',self.mark);self.act('hit','crate',self.mark);self.assertEqual(self.game.state()['objects']['crate'],0)
        self.act('hit','crate',self.mark);self.assertEqual(len(self.game.state()['marks']),3)
        self.act('repair','crate');self.assertEqual(self.game.state()['marks'],[]);self.assertEqual(self.game.state()['objects']['crate'],60)

    def test_surface_hits_merge_into_damage_zone(self):
        self.act('mark_surface','surface_0',{'point':[.20,.40,.45],'normal':[0,0,1]})
        self.act('mark_surface','surface_0',{'point':[.23,.39,.45],'normal':[0,0,1]})
        marks=self.game.state()['marks']
        self.assertEqual(len(marks),1)
        self.assertEqual(marks[0]['target'],'surface_0')
        self.assertGreaterEqual(marks[0]['severity'],2)
        self.act('mark_surface','surface_0',{'point':[.24,.41,.45],'normal':[0,0,1]})
        self.assertGreaterEqual(self.game.state()['marks'][0]['severity'],3)

    def test_wall_and_furniture_surface_repair_independent(self):
        self.act('mark_surface','surface_0',self.mark);self.act('mark_surface','surface_bed',self.mark);self.act('hit','crate',self.mark)
        self.act('repair_surface','surface_0');self.assertEqual({m['target'] for m in self.game.state()['marks']},{'surface_bed','crate'})
        self.act('repair_surface','surface_bed');self.assertEqual(self.game.state()['objects']['crate'],35)
    def test_validation_atomic(self):
        for mark in ({'point':[0,1,2],'normal':[0,0,0]},{'point':[float('nan'),1,2],'normal':[0,0,1]},{'point':[0,1,100],'normal':[0,0,1]}, {'point':[True,0,1],'normal':[0,0,1]}, {'point':[10**999,0,0],'normal':[0,0,1]}):
            with self.assertRaises(ValueError): self.act('hit','crate',mark)
        with self.assertRaises(ValueError): self.act('mark_surface','anything',self.mark)
        self.assertEqual(self.game.state()['objects']['crate'],60);self.assertEqual(self.game.state()['marks'],[])
    def test_cap_preserves_old(self):
        self.game.MARK_LIMIT=2
        far1={'point':[.2,.4,.45],'normal':[0,0,1]}
        far2={'point':[.7,.4,.45],'normal':[0,0,1]}
        far3={'point':[-.6,.4,.45],'normal':[0,0,1]}
        self.act('mark_surface','surface_1',far1);self.act('mark_surface','surface_1',far2);old=self.game.state()['marks'];self.assertFalse(self.act('mark_surface','surface_1',far3)['mark_saved']);self.assertEqual(self.game.state()['marks'],old)
        self.game.TOTAL_MARK_LIMIT=2;self.assertFalse(self.act('mark_surface','surface_2',far3)['mark_saved'])
    def test_additive_migration_and_legacy_client(self):
        with sqlite3.connect(self.path/'world.sqlite3') as db:
            db.execute('DROP TABLE impact_marks');db.execute("UPDATE objects SET hp=35 WHERE id='crate'")
        self.game=GameStore(self.path);self.assertEqual(self.game.state()['objects']['crate'],35)
        self.act('hit','crate');self.assertEqual(self.game.state()['objects']['crate'],10);self.assertEqual(self.game.state()['marks'],[])
