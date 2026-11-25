import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from host_cleanup import cleanup_images, project_containers

CID='1'*64; CADDY='2'*64; OTHER='3'*64
REPO='second-live-update-genesis'
ACTIVE=REPO+':'+'a'*40; ROLLBACK=REPO+':rollback-'+'b'*12
ROLLBACK_ALIAS=REPO+':'+'b'*40; OLD=REPO+':'+'c'*40; FAILED=REPO+':'+'d'*40; INUSE=REPO+':'+'e'*40

def iid(c):return 'sha256:'+c*64

class Docker:
    def __init__(self,root):
        self.root=root;self.calls=[];self.image_map={ACTIVE:iid('a'),ROLLBACK:iid('b'),ROLLBACK_ALIAS:iid('b'),OLD:iid('c'),FAILED:iid('d'),INUSE:iid('e'),'other-repo:latest':iid('f'),REPO+':manual':iid('1')};self.foreign=False;self.changed=False;self.empty=False
    def __call__(self,args):
        self.calls.append(args)
        if args[:5]==['docker','ps','-aq','--no-trunc','--filter']:
            return '' if self.empty else CID+'\n'+CADDY
        if args==['docker','ps','-aq','--no-trunc']:return CID+'\n'+CADDY+'\n'+OTHER
        if args[:4]==['docker','inspect','--type','container']:
            if args[5]=='{{.Image}}':return '\n'.join([iid('a'),iid('f'),iid('e')])
            return '\n'.join('\t'.join(json.dumps(x) for x in [cid,{'com.docker.compose.project':'genesis','com.docker.compose.project.working_dir':str(self.root/'other' if self.foreign else self.root),'com.docker.compose.service':svc},running]) for cid,svc,running in [(CID,'second-live',True),(CADDY,'https',False)])
        if args[:3]==['docker','image','ls']:
            return '\n'.join('\t'.join([ref.rsplit(':',1)[0],ref.rsplit(':',1)[1],ident]) for ref,ident in self.image_map.items())
        if args[:3]==['docker','image','inspect']:
            return iid('9') if self.changed and args[-1]==OLD else self.image_map[args[-1]]
        if args[:3]==['docker','image','rm']:
            assert args==['docker','image','rm','--no-prune',args[-1]]
            del self.image_map[args[-1]];return ''
        raise AssertionError(args)

class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.work=self.root/'.sl-update';self.work.mkdir();self.docker=Docker(self.root)
        for name,ref in [('active',ACTIVE),('rollback',ROLLBACK)]:
            (self.work/(name+'.compose.json')).write_text(json.dumps({'services':{'second-live':{'image':ref}}}))
    def test_only_obsolete_project_tags_removed(self):
        removed,warnings=cleanup_images(self.root,'genesis',self.docker)
        self.assertEqual(set(removed),{OLD,FAILED});self.assertFalse(warnings)
        self.assertEqual(set(self.docker.image_map),{ACTIVE,ROLLBACK,ROLLBACK_ALIAS,INUSE,'other-repo:latest',REPO+':manual'})
        self.assertEqual(cleanup_images(self.root,'genesis',self.docker)[0],[])
    def test_open_transaction_disables_cleanup(self):
        (self.work/'transaction.json').write_text('{}')
        self.assertEqual(cleanup_images(self.root,'genesis',self.docker)[0],[]);self.assertFalse(self.docker.calls)
    def test_other_project_directory_refused(self):
        self.docker.foreign=True
        with self.assertRaises(RuntimeError):cleanup_images(self.root,'genesis',self.docker)
        self.assertFalse(any(c[:3]==['docker','image','rm'] for c in self.docker.calls))
    def test_unverified_installation_no_cleanup(self):
        self.docker.empty=True
        self.assertEqual(cleanup_images(self.root,'genesis',self.docker)[0],[])
    def test_changed_image_tag_skipped(self):
        self.docker.changed=True
        removed,warnings=cleanup_images(self.root,'genesis',self.docker)
        self.assertEqual(removed,[FAILED]);self.assertTrue(warnings);self.assertIn(OLD,self.docker.image_map)
    def test_malformed_active_config_no_removal(self):
        (self.work/'active.compose.json').write_text('{}')
        with self.assertRaises(KeyError):cleanup_images(self.root,'genesis',self.docker)
        self.assertFalse(any(c[:3]==['docker','image','rm'] for c in self.docker.calls))

FAKE_CLI='''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:];root=Path.cwd();work=root/'.sl-update';cid='1'*64;https='2'*64
with (work/'docker.calls').open('a') as f: f.write(json.dumps(args)+'\\n')
if args[0]=='compose' and args[-3:]==['config','--format','json']:
 print(json.dumps({'name':'genesis'}))
elif args[:4]==['ps','-aq','--no-trunc','--filter']:
 print(cid);print(https)
elif args[:3]==['inspect','--type','container']:
 for ident,service in [(cid,'second-live'),(https,'https')]:
  print('\\t'.join(json.dumps(x) for x in [ident,{'com.docker.compose.project':'genesis','com.docker.compose.project.working_dir':str(root),'com.docker.compose.service':service},not (work/'stopped').exists()]))
elif args[:3]==['stop','--time','30']:
 assert args[3:]==[cid,https];(work/'stopped').touch()
else: sys.exit('unexpected Docker command '+str(args))
'''

class StopTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='sl stop ');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.work=self.root/'.sl-update';self.work.mkdir();(self.work/'status').mkdir();(self.work/'requests').mkdir();(self.root/'scripts').mkdir();(self.root/'.env').write_text('KEEP=yes\n');(self.root/'compose.yaml').write_text('services: {}\n');(self.root/'data').mkdir();(self.root/'data/save').write_text('keep');(self.root/'second-live-ca.crt').write_text('keep');(self.work/'requests/request.json').write_text('{}')
        for name in ('stop.sh','updater_api.py','scripts/stop_host.py','scripts/host_cleanup.py','scripts/restart_updater.py'):shutil.copy2(ROOT/name,self.root/name)
        b=self.root/'bin';b.mkdir();d=b/'docker';d.write_text(FAKE_CLI);d.chmod(0o755);self.env={**os.environ,'PATH':str(b)+os.pathsep+os.environ['PATH']}
    def run_stop(self):return subprocess.run(['bash',str(self.root/'stop.sh'),'--keep-images'],cwd=self.root,env=self.env,capture_output=True,text=True,timeout=25)
    def test_busy_lock_does_not_stop(self):
        with (self.work/'operation.lock').open('a') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);r=self.run_stop()
            self.assertNotEqual(r.returncode,0);self.assertIn('laeuft noch',r.stderr);self.assertFalse((self.work/'docker.calls').exists())
    def test_stops_services_and_is_idempotent(self):
        r=self.run_stop();self.assertEqual(r.returncode,0,r.stderr)
        self.assertTrue((self.work/'stopped').exists());self.assertFalse((self.work/'requests/request.json').exists());self.assertEqual(json.loads((self.work/'status/status.json').read_text())['state'],'offline')
        r=self.run_stop();self.assertEqual(r.returncode,0,r.stderr)
        calls=[json.loads(l) for l in (self.work/'docker.calls').read_text().splitlines()];self.assertEqual(sum(c[0]=='stop' for c in calls),1)
        for p,v in [('.env','KEEP=yes\n'),('data/save','keep'),('second-live-ca.crt','keep')]:self.assertEqual((self.root/p).read_text(),v)
    def test_terminates_only_own_idle_agent(self):
        (self.root/'scripts/host_updater.py').write_text('import fcntl,time\nfrom pathlib import Path\nwith open(".sl-update/agent.lock","a") as f:\n fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\n Path(".sl-update/ready").touch()\n while True: time.sleep(.1)\n')
        proc=subprocess.Popen([sys.executable,'-u','scripts/host_updater.py','--root',str(self.root),'--project','genesis'],cwd=self.root)
        try:
            for _ in range(100):
                if (self.work/'ready').exists():break
                time.sleep(.03)
            self.assertTrue((self.work/'ready').exists())
            r=self.run_stop();self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(proc.wait(timeout=3),-signal.SIGTERM)
        finally:
            if proc.poll() is None:proc.terminate();proc.wait(timeout=3)
