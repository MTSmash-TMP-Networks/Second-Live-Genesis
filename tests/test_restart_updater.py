import fcntl
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from restart_updater import agent_processes


class RestartTests(unittest.TestCase):
    def test_only_exact_installation(self):
        root=Path('/tmp/second live')
        listing=f'23 python3 -u scripts/host_updater.py --root {root} --project genesis\n24 python3 -u scripts/host_updater.py --root {root}-other --project genesis\n25 sh -c python3 -u scripts/host_updater.py --root {root} --project genesis\n'
        self.assertEqual(agent_processes(root,listing),[(23,'genesis')])

    def test_busy_operation_prevents_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'scripts').mkdir();(root/'.sl-update').mkdir();(root/'.env').write_text('test\n')
            shutil.copy2(ROOT/'scripts/restart_updater.py',root/'scripts')
            with (root/'.sl-update/operation.lock').open('a') as op:
                fcntl.flock(op,fcntl.LOCK_EX|fcntl.LOCK_NB)
                out=subprocess.run([sys.executable,'scripts/restart_updater.py'],cwd=root,capture_output=True,text=True,timeout=10)
                self.assertNotEqual(out.returncode,0)
                self.assertIn('laeuft noch',out.stderr)

    def test_restart_actual_host_process_without_docker(self):
        # Dummy agent holds the same OS lock; test real TERM, release and restart.
        with tempfile.TemporaryDirectory(prefix='sl restart ') as tmp:
            root=Path(tmp);(root/'scripts').mkdir();work=root/'.sl-update';work.mkdir();(root/'.env').write_text('KEEP=yes\n')
            shutil.copy2(ROOT/'scripts/restart_updater.py',root/'scripts')
            (root/'scripts/host_updater.py').write_text('import fcntl,os,time\nfrom pathlib import Path\nwith open(".sl-update/agent.lock","a") as f:\n fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\n Path(".sl-update/test.pid").write_text(str(os.getpid()))\n while True: time.sleep(.1)\n')
            old=subprocess.Popen([sys.executable,'-u','scripts/host_updater.py','--root',str(root),'--project','genesis'],cwd=root)
            newpid=None
            try:
                for _ in range(100):
                    if (work/'test.pid').exists():break
                    time.sleep(.03)
                self.assertTrue((work/'test.pid').exists())
                out=subprocess.run([sys.executable,'scripts/restart_updater.py'],cwd=root,capture_output=True,text=True,timeout=22)
                self.assertEqual(out.returncode,0,out.stderr)
                newpid=int(re.search(r'PID (\d+)',out.stdout).group(1))
                self.assertNotEqual(newpid,old.pid)
                self.assertEqual(old.wait(timeout=3),-signal.SIGTERM)
                self.assertEqual((work/'test.pid').read_text(),str(newpid))
                self.assertEqual((root/'.env').read_text(),'KEEP=yes\n')
            finally:
                if newpid:
                    try: os.kill(newpid,signal.SIGTERM)
                    except ProcessLookupError:pass
                if old.poll() is None:old.terminate();old.wait(timeout=3)
