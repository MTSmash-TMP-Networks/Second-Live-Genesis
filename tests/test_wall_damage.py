import sqlite3, tempfile, unittest
from pathlib import Path
from server import GameStore
from wall_damage import WALLS, REMOVED

class Scans:
    def list(self): return []

class WallTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name);self.game=GameStore(self.path)
        self.target='surface_6';self.wall=WALLS[self.target]
        self.mark={'point':[-.1,.12,.10],'normal':[-1,0,0]}
    def tearDown(self): self.tmp.cleanup()
    def hit(self,mark=None):
        return self.game.action({'action':'damage_wall','id':self.target,'mark':mark or self.mark},Scans())
    def test_progress_restart_repair(self):
        for stage in range(1,REMOVED+1):
            r=self.hit();self.assertEqual(r['wall_result']['stage'],stage)
        old=self.game.state();self.assertEqual(old['walls'][self.target][0][2],REMOVED)
        self.assertEqual(GameStore(self.path).state(),old)
        self.assertFalse(self.hit()['wall_result']['changed']);self.assertEqual(self.game.state(),old)
        self.game.action({'action':'repair_surface','id':self.target},Scans())
        self.assertEqual(self.game.state()['walls'],{});self.assertEqual(self.game.state()['marks'],[])
    def test_adjacent_independent(self):
        self.hit();self.hit({'point':[-.1,.12,1.3],'normal':[-1,0,0]})
        cells=self.game.state()['walls'][self.target];self.assertEqual(len(cells),2);self.assertEqual([c[2] for c in cells],[1,1])
    def test_mark_cap_does_not_stop_geometry(self):
        self.game.MARK_LIMIT=0
        for _ in range(REMOVED):self.hit()
        self.assertEqual(self.game.state()['marks'],[]);self.assertEqual(self.game.state()['walls'][self.target][0][2],REMOVED)
    def test_invalid_atomic(self):
        for mark in ({'point':[-.1,0,99],'normal':[-1,0,0]}, {'point':[0,.123,.1],'normal':[-1,0,0]}, {'point':[0,.123,.1],'normal':[0,1,0]}):
            with self.assertRaises(ValueError):self.hit(mark)
        self.assertEqual(self.game.state()['walls'],{});self.assertEqual(self.game.state()['marks'],[])
    def test_exposed_edge_and_hidden_edge(self):
        w=self.wall;step=w['s'][2]/w['cols'];col=5;row=3;z=-w['s'][2]/2+(col+1)*step;y=-w['s'][1]/2+(row+.5)*w['s'][1]/w['rows']
        edge={'point':[0,y,z],'normal':[0,0,1]}
        with self.assertRaises(ValueError):self.hit(edge)
        other={'point':[-.1,y,z+step/2],'normal':[-1,0,0]}
        for _ in range(REMOVED):self.hit(other)
        self.assertEqual(self.hit(edge)['wall_result']['col'],col)
    def test_additive_migration_preserves_legacy(self):
        with sqlite3.connect(self.path/'world.sqlite3') as db:
            db.execute('DROP TABLE wall_cells');db.execute('DROP TABLE impact_marks');db.execute('CREATE TABLE impact_marks (id INTEGER PRIMARY KEY AUTOINCREMENT,target TEXT NOT NULL,point TEXT NOT NULL,normal TEXT NOT NULL)');db.execute('INSERT INTO impact_marks(target,point,normal) VALUES (?,?,?)',(self.target,'[-0.1,0.12,0.1]','[-1,0,0]'));db.execute("UPDATE objects SET hp=35 WHERE id='crate'")
        g=GameStore(self.path);self.assertEqual(g.state()['objects']['crate'],35);self.assertEqual(g.state()['marks'][0]['severity'],1);self.assertEqual(g.state()['walls'],{})
        # Legacy INSERT (rollback image) still works with the additive column.
        with sqlite3.connect(self.path/'world.sqlite3') as db:db.execute('INSERT INTO impact_marks(target,point,normal) VALUES (?,?,?)',(self.target,'[-0.1,0.12,0.2]','[-1,0,0]'))
        self.assertEqual(len(g.state()['marks']),2)
