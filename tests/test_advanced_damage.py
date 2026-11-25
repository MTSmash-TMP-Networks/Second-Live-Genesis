import json, math, subprocess, tempfile, unittest
from pathlib import Path
from server import GameStore
from wall_damage import WALLS, REMOVED, axes, site, nearest
class Scans:
    def list(self):return []
class AdvancedTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name);self.game=GameStore(self.path)
    def tearDown(self):self.tmp.cleanup()
    def act(self,op,target,mark=None):return self.game.action(dict(action=op,id=target,**({'mark':mark} if mark is not None else {})),Scans())
    def hit(self,id,c,r):
        w=WALLS[id];u,v,b=axes(w);p=[0.,0.,0.];p[u],p[v]=site(w,c,r);p[b]=w['s'][b]/2;n=[0.,0.,0.];n[b]=1
        return self.act('damage_wall',id,{'point':p,'normal':n})
    def test_floor_ceiling_repair_restart(self):
        for id in ('surface_0','surface_1'):
            for stage in range(1,REMOVED+1):self.assertEqual(self.hit(id,8,9)['wall_result']['stage'],stage)
        saved=GameStore(self.path).state();self.assertEqual(saved['walls']['surface_0'],[[8,9,4]]);self.assertEqual(saved['walls']['surface_1'],[[8,9,4]])
        self.act('repair_surface','surface_0');self.assertNotIn('surface_0',self.game.state()['walls']);self.assertIn('surface_1',self.game.state()['walls'])
    def test_static_furniture_and_details(self):
        m={'point':[.1,.1,.1],'normal':[0,0,1]}
        for id in ('surface_bed','surface_picture','surface_curtain_l','surface_radiator'):
            for n in range(1,5):self.assertEqual(self.act('damage_decor',id,m)['decor_result']['stage'],n)
            self.assertEqual(GameStore(self.path).state()['decor'][id],4)
        self.act('repair_surface','surface_bed');self.assertNotIn('surface_bed',self.game.state()['decor']);self.assertIn('surface_picture',self.game.state()['decor'])
        with self.assertRaises(ValueError):self.act('damage_decor','surface_0',m)
    def test_client_server_sites_match(self):
        root=Path(__file__).resolve().parents[1]
        script="import {WALLS,site} from './web/engine/wall_layout.js';console.log(JSON.stringify(Object.fromEntries(Object.entries(WALLS).map(([id,w])=>[id,Array.from({length:w.rows*w.cols},(_,i)=>site(w,i%w.cols,Math.floor(i/w.cols)))]))));"
        try: raw=subprocess.check_output(['node','--input-type=module','-e',script],cwd=root,text=True)
        except FileNotFoundError:self.skipTest('Node unavailable')
        for id,sites in json.loads(raw).items():
            w=WALLS[id]
            for i,p in enumerate(sites):
                c,r=i%w['cols'],i//w['cols'];q=site(w,c,r)
                self.assertTrue(all(abs(x-y)<1e-12 for x,y in zip(p,q)))
                if i%31==0:self.assertEqual(nearest(w,*p),(c,r))
