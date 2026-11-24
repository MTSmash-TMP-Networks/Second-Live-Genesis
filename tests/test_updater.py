import json
import os
from pathlib import Path
import subprocess
import shutil
import socket
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

OLD='a'*40; NEW='b'*40; CID='c'*64; IMG='sha256:'+'d'*64; NEW_IMG='sha256:'+'f'*64; ADMIN='e'*64

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
    def __init__(self):
        self.calls=[]; self.revision=OLD; self.head=NEW; self.image=IMG
        self.fail_build=False; self.fail_start=False; self.fail_rollback=False
        self.fail_preflight=False; self.bad_build_revision=False; self.bad_start_image=False
        self.bad_health=False; self.exit_after_start=False; self.health_starting=False
        self.rolled=False
    def __call__(self,args,**kw):
        self.calls.append(args)
        if args[:2]==['git','ls-remote']:return self.head+'\trefs/heads/main'
        if args[:3]==['docker','image','inspect']:
            old=':rollback-' in args[-1]
            rev=OLD if old else ('local' if self.bad_build_revision else NEW)
            return json.dumps(IMG if old else NEW_IMG)+'\t'+json.dumps({'org.opencontainers.image.revision':rev})
        if args[:2]==['docker','inspect']:
            if args[3]=='{{.Image}}': return self.image
            if args[3]=='{{json .State}}':
                if self.revision==NEW and self.exit_after_start: return json.dumps({'Status':'exited','ExitCode':1})
                if self.revision==NEW and self.bad_health: return json.dumps({'Status':'running','Health':{'Status':'unhealthy'}})
                if self.revision==NEW and self.health_starting:
                    self.health_starting=False;return json.dumps({'Status':'running','Health':{'Status':'starting'}})
                return json.dumps({'Status':'running','Health':{'Status':'healthy'}})
            return self.revision
        if args[:3]==['docker','image','tag']:return ''
        if args[:2]==['docker','run']:
            if self.fail_preflight: raise UpdateError('probe')
            return ''
        if args[:2] in (['docker','rm'],['docker','logs']):return ''
        if args[-3:]==['ps','-q','second-live'] or args[-4:]==['ps','-a','-q','second-live']:return CID
        if args[-2:]==['build','second-live']:
            if self.fail_build:raise UpdateError('build')
            return ''
        if 'up' in args:
            override=Path(args[args.index('up')-1]).name
            if override=='rollback.compose.json':
                if self.fail_rollback:raise UpdateError('rollback')
                self.revision=OLD;self.image=IMG;self.rolled=True
            else:
                if self.fail_start:raise UpdateError('start')
                self.revision=NEW;self.image=IMG if self.bad_start_image else NEW_IMG
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
        self.assertIn('--no-build --pull never --force-recreate --no-deps',cmds[start])
        probe=next(i for i,x in enumerate(cmds) if x.startswith('docker run --rm '))
        self.assertLess(build,probe);self.assertLess(probe,start)
        self.assertIn('--network none',cmds[probe])
        self.assertNotIn('--volume',cmds[probe]);self.assertNotIn('PRIVATE=keep',cmds[probe])
        self.assertFalse(self.agent.transaction.exists())
    def test_build_failure_keeps_running_version(self):
        self.fake.fail_build=True
        self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'error')
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
    def test_preflight_failure_does_not_replace_game(self):
        self.fake.fail_preflight=True;self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'error')
        self.assertIn('Isolierter Starttest',self.agent.state['message'])
        self.assertFalse(any('up' in x for x in self.fake.calls))
        self.assertFalse(self.agent.transaction.exists())
    def test_wrong_build_label_does_not_switch(self):
        self.fake.bad_build_revision=True;self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'error')
        self.assertIn('Revision',self.agent.state['message'])
        self.assertFalse(any('up' in x for x in self.fake.calls))
    def test_wrong_running_image_rolls_back(self):
        self.fake.bad_start_image=True;self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'rolled_back')
        self.assertIn('Falsches Docker-Image',self.agent.state['message'])
        self.assertTrue(self.fake.rolled)
    def test_unhealthy_candidate_diagnosed_before_rollback(self):
        self.fake.bad_health=True;self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'rolled_back')
        self.assertIn('unhealthy',self.agent.state['message'])
        self.assertIn('unhealthy',(self.agent.work/'diagnostics.log').read_text())
        log_i=next(i for i,x in enumerate(self.fake.calls) if x[:2]==['docker','logs'])
        rollback_i=next(i for i,x in enumerate(self.fake.calls) if 'up' in x and any('rollback.compose.json' in p for p in x))
        self.assertLess(log_i,rollback_i)
    def test_exited_candidate_reports_exit_code(self):
        self.fake.exit_after_start=True;self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'rolled_back')
        self.assertIn('Exit 1',self.agent.state['message'])
    def test_starting_health_is_not_yet_success(self):
        self.fake.health_starting=True
        with patch('host_updater.time.sleep'): self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'success')
    def test_local_build_is_valid_rollback(self):
        self.fake.revision='local';self.agent.check()
        self.agent.install(NEW)
        self.assertEqual(self.agent.state['state'],'success')
    def test_recovery_does_not_recreate_healthy_previous_image(self):
        rollback=self.agent.override('rollback.compose.json','second-live-update-genesis:rollback-'+IMG[-12:])
        atomic_json(self.agent.transaction,{'project':'genesis','old':OLD,'new':NEW,'old_id':IMG})
        self.agent.recover()
        self.assertEqual(self.agent.state['state'],'rolled_back')
        self.assertFalse(any('up' in x for x in self.fake.calls))
        self.assertFalse(self.agent.transaction.exists())
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

class ProbeTest(unittest.TestCase):
    def test_real_python_health_endpoint_from_probe(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); fixture=root/'app'; fixture.mkdir(); install=root/'install';install.mkdir()
            for name in ('server.py','updater_api.py'):shutil.copy2(ROOT/name,fixture/name)
            for rel in ('web/assets/polyhaven/manifest.json','web/engine/renderer.bundle.js'):
                path=fixture/rel;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('{}')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            def runner(args,**kw):
                if args[:2]==['docker','rm']:return ''
                self.assertEqual(args[:2],['docker','run'])
                self.assertIn('--network',args);self.assertIn('none',args)
                env={**os.environ,'SECOND_LIVE_BIND':'127.0.0.1','SECOND_LIVE_PORT':str(port),'SECOND_LIVE_REVISION':NEW,'SECOND_LIVE_DATA_DIR':str(fixture/'data'),'SECOND_LIVE_TOKEN':''}
                # Only the fixture uses an ephemeral local port, rather than the
                # container's fixed loopback port. The real health logic runs.
                code=args[-2].replace('127.0.0.1:8765','127.0.0.1:'+str(port))
                proc=subprocess.run([sys.executable,'-c',code,args[-1]],cwd=fixture,env=env,capture_output=True,text=True,timeout=12)
                if proc.returncode:raise UpdateError(proc.stderr)
                self.assertIn('Preflight: Server, Assets und Revision OK',proc.stdout)
                return ''
            agent=HostUpdater(install,'genesis',runner)
            agent.preflight(NEW_IMG,NEW)
            (fixture/'web/engine/renderer.bundle.js').unlink()
            with self.assertRaisesRegex(UpdateError,'Isolierter Starttest'):agent.preflight(NEW_IMG,NEW)
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
