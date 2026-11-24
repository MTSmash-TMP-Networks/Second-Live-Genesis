import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT/'scripts')]
from updater_api import UpdateBridge, atomic_json
from host_updater import HostUpdater, UpdateError, REQUIRED
from server import create_server

OLD='a'*40; NEW='b'*40; CID='c'*64; IMG='sha256:'+'d'*64; ADMIN='e'*64

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.bridge=UpdateBridge(self.root, ADMIN)
        for d in ('requests','status','data'): (self.root/d).mkdir()
        self.status('idle')
        self.srv=create_server(port=0,data_dir=self.root/'data',token='player-token',updater=self.bridge)
        self.thread=threading.Thread(target=self.srv.serve_forever,daemon=True); self.thread.start()
        self.addCleanup(self.srv.server_close); self.addCleanup(self.srv.shutdown)
        self.url='http://127.0.0.1:'+str(self.srv.server_port)
    def status(self,state,**other):
        atomic_json(self.root/'status'/'status.json', {'state':state,'heartbeat':time.time(),'latest':NEW,**other},0o644)
    def req(self,path,body=None,key=ADMIN):
        req=Request(self.url+path, data=None if body is None else json.dumps(body).encode(), headers={'X-SecondLive-Admin':key,'X-SecondLive-Token':'player-token','Content-Type':'application/json'})
        with urlopen(req) as r: return r.status,json.load(r)
    def test_admin_only(self):
        for path,body in [('/api/update/status',None),('/api/update',{'action':'check'})]:
            with self.assertRaises(HTTPError) as ex:self.req(path,body,'player-token')
            self.assertEqual(ex.exception.code,401)
        self.assertEqual(self.req('/api/update/status')[0],200)
    def test_no_empty_admin_bypass(self):
        self.assertFalse(UpdateBridge(None,'').authorized(''))
    def test_check_queue_and_duplicate(self):
        self.assertEqual(self.req('/api/update',{'action':'check'})[0],202)
        self.assertEqual(json.loads((self.root/'requests/request.json').read_text()),{'action':'check','revision':None})
        self.assertEqual(self.req('/api/update/status')[1]['state'],'queued')
        with self.assertRaises(HTTPError) as ex:self.req('/api/update',{'action':'check'})
        self.assertEqual(ex.exception.code,409)
    def test_install_requires_exact_checked_revision(self):
        for body in [{'action':'install','revision':'../../evil'},{'action':'check','url':'https://example.com'},{'action':'install','revision':OLD}]:
            self.status('available')
            with self.assertRaises(HTTPError) as ex:self.req('/api/update',body)
            self.assertIn(ex.exception.code,(400,409))
        self.assertEqual(self.req('/api/update',{'action':'install','revision':NEW})[0],202)
    def test_offline_and_busy(self):
        self.status('idle',heartbeat=time.time()-100)
        self.assertEqual(self.req('/api/update/status')[1]['state'],'offline')
        with self.assertRaises(HTTPError): self.req('/api/update',{'action':'check'})
        self.status('building')
        with self.assertRaises(HTTPError): self.req('/api/update',{'action':'check'})

class FakeDocker:
    def __init__(self):self.calls=[];self.revision=OLD;self.head=NEW;self.fail_build=False;self.fail_start=False;self.fail_rollback=False
    def __call__(self,args,**kw):
        self.calls.append(args)
        if args[:2]==['git','ls-remote']:return self.head+'\trefs/heads/main'
        if args[:2]==['docker','inspect']:return IMG if args[3]=='{{.Image}}' else self.revision
        if args[:3]==['docker','image','tag']:return ''
        if args[-3:]==['ps','-q','second-live']:return CID
        if args[-2:]==['build','second-live']:
            if self.fail_build:raise UpdateError('build')
            return ''
        if 'up' in args:
            override=Path(args[args.index('up')-1]).name
            if override=='rollback.compose.json':
                if self.fail_rollback:raise UpdateError('rollback')
                self.revision=OLD
            else:
                if self.fail_start:raise UpdateError('start')
                self.revision=NEW
            return ''
        raise AssertionError(args)

class HostTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.fake=FakeDocker()
        (self.root/'.env').write_text('PRIVATE=keep\n')
        self.agent=HostUpdater(self.root,'genesis',self.fake)
        self.source=self.agent.work/'releases'/NEW;self.source.mkdir()
        self.agent.checkout=lambda sha:self.source
        self.agent.check()
    def test_success_pins_sha_preserves_data(self):
        self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'success')
        self.assertEqual(self.agent.state['current'],NEW)
        self.assertEqual((self.root/'.env').read_text(),'PRIVATE=keep\n')
        cfg=json.loads(self.agent.active.read_text())['services']['second-live']
        self.assertEqual(cfg['build']['args']['SECOND_LIVE_REVISION'],NEW)
        self.assertEqual(cfg['build']['context'],str(self.source))
        cmds=[' '.join(x) for x in self.fake.calls]
        build=next(i for i,x in enumerate(cmds) if x.endswith('build second-live'))
        start=next(i for i,x in enumerate(cmds) if ' up -d ' in x)
        self.assertLess(build,start);self.assertNotIn(' down ', ' '.join(cmds))
        self.assertIn('--no-build --pull never --force-recreate --no-deps --wait',cmds[start])
        self.assertFalse(self.agent.transaction.exists())
    def test_build_failure_keeps_running_version(self):
        self.fake.fail_build=True
        with self.assertRaises(UpdateError):self.agent.install(NEW)
        self.assertEqual(self.fake.revision,OLD)
        self.assertFalse(any('up' in x for x in self.fake.calls))
    def test_rollback(self):
        self.fake.fail_start=True
        self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'rolled_back')
        self.assertEqual(self.fake.revision,OLD)
        self.assertFalse(self.agent.active.exists())
        self.assertFalse(self.agent.transaction.exists())
    def test_interrupted_switch_recover(self):
        self.fake.fail_start=True;self.fake.fail_rollback=True
        self.agent.install(NEW)
        self.assertTrue(self.agent.transaction.exists())
        self.fake.fail_rollback=False
        self.agent.recover()
        self.assertFalse(self.agent.transaction.exists())
        self.assertEqual(self.agent.state['state'],'rolled_back')
    def test_head_moved_requires_check_again(self):
        self.fake.head='f'*40
        self.agent.install(NEW)
        self.assertEqual(self.agent.state['latest'],'f'*40)
        self.assertFalse(any('build' in x for x in self.fake.calls))
    def test_reject_symlink_queue(self):
        target=self.root/'keep';target.write_text('secret')
        (self.agent.requests/'request.json').symlink_to(target)
        self.agent.process();self.assertEqual(target.read_text(),'secret')
        self.assertFalse((self.agent.requests/'request.json').exists())

class GitCheckoutTest(unittest.TestCase):
    def test_actual_local_git_checkout_and_protocol(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);repo=root/'repo';repo.mkdir();install=root/'install';install.mkdir()
            def git(*args):return subprocess.check_output(['git','-C',str(repo),*args],text=True,stderr=subprocess.STDOUT).strip()
            git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','Test')
            for rel in REQUIRED:
                p=repo/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('1\n' if rel=='UPDATE_PROTOCOL' else 'test\n')
            git('add','.');git('commit','-m','fixture');sha=git('rev-parse','HEAD')
            with patch('host_updater.REPO',str(repo)):
                agent=HostUpdater(install,'genesis')
                self.assertEqual(agent.remote_head(),sha)
                out=agent.checkout(sha);self.assertEqual((out/'UPDATE_PROTOCOL').read_text(),'1\n');self.assertFalse((out/'.git').exists())
                (repo/'UPDATE_PROTOCOL').write_text('2\n');git('add','.');git('commit','-m','incompatible');bad=git('rev-parse','HEAD')
                with self.assertRaises(UpdateError):agent.checkout(bad)

if __name__=='__main__':unittest.main()
