import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

from scripts.runtime_permissions import MODULES, REQUIRED_WEB, normalize

ROOT = Path(__file__).resolve().parents[1]


class TestRuntimePermissions(unittest.TestCase):
    def make_tree(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for name in MODULES:
            p = root / name
            source = ROOT / ('scripts/runtime_permissions.py' if name == 'runtime_permissions.py' else name)
            shutil.copyfile(source, p)
            p.chmod(0o600)
        for name in REQUIRED_WEB:
            p = root / 'web' / name
            p.parent.mkdir(parents=True, exist_ok=True)
            if (ROOT/'web'/name).is_file():
                shutil.copyfile(ROOT/'web'/name, p)
            else:
                p.write_bytes(b'test')
            p.chmod(0o600)
        for p in (root/'web').rglob('*'):
            if p.is_dir():
                p.chmod(0o700)
        (root/'web').chmod(0o700)
        (root/'data').mkdir(mode=0o700)
        (root/'data'/'world.db').write_bytes(b'world data')
        (root/'data'/'world.db').chmod(0o600)
        return root

    def test_normalize_only_code_and_assets(self):
        root = self.make_tree()
        normalize(root)
        self.assertEqual(stat.S_IMODE((root/'server.py').stat().st_mode), 0o644)
        self.assertEqual(stat.S_IMODE((root/'web'/'engine').stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE((root/'web'/'engine'/'renderer.bundle.js').stat().st_mode), 0o644)
        self.assertEqual(stat.S_IMODE((root/'data').stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((root/'data'/'world.db').stat().st_mode), 0o600)
        self.assertEqual((root/'data'/'world.db').read_bytes(), b'world data')

    @unittest.skipUnless(os.geteuid() == 0, 'UID-drop integration test requires root')
    def test_real_unprivileged_read_and_import_after_restricted_checkout(self):
        root = self.make_tree()
        root.chmod(0o755)
        os.chown(root/'data', 65534, 65534)
        opts = dict(cwd=root, user=65534, group=65534, extra_groups=[], capture_output=True, text=True)
        denied = subprocess.run([sys.executable, 'server.py'], **opts, timeout=10)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn('Permission denied', denied.stderr)
        normalize(root)
        passed = subprocess.run([sys.executable, 'runtime_permissions.py', '--check', str(root)], **opts, timeout=15)
        self.assertEqual(passed.returncode, 0, passed.stderr)
        passed = subprocess.run([sys.executable, '-c', 'import server,capture_compute'], **opts, timeout=15)
        self.assertEqual(passed.returncode, 0, passed.stderr)
        # A writable program file is a regression, even when it can be read.
        (root/'server.py').chmod(0o666)
        unsafe = subprocess.run([sys.executable, 'runtime_permissions.py', '--check', str(root)], **opts, timeout=15)
        self.assertNotEqual(unsafe.returncode, 0)
        self.assertIn('must not be writable', unsafe.stderr)
