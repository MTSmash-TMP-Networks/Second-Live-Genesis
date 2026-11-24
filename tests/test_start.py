"""Launcher tests: a fake Docker CLI; no Docker daemon or external network needed."""
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

DOCKER = r'''#!/bin/bash
printf '%s\n' "$*" >> "$DOCKER_TEST_LOG"
case "$*" in
  'compose version'|'info') exit 0 ;;
  'compose up --help') echo --wait-timeout; exit 0 ;;
  *' config --quiet') exit 0 ;;
  *' up -d --build --wait --wait-timeout 180') exit "${FAKE_UP_STATUS:-0}" ;;
  *' ps'|*' logs --tail 60') exit 0 ;;
  *' cp https:/data/caddy/pki/authorities/local/root.crt '*)
    printf '%s\n' '-----BEGIN CERTIFICATE-----' 'TEST DATA' '-----END CERTIFICATE-----' > "${@: -1}"; exit 0 ;;
  *) echo 'Unknown docker call' >&2; exit 1 ;;
esac
'''

class StartTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.project = self.root / 'project with spaces'
        self.project.mkdir()
        for name in ('start.sh', 'Dockerfile', 'compose.yaml', 'compose.https.yaml'):
            shutil.copy2(ROOT / name, self.project / name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for name, contents in {'docker': DOCKER, 'ip': '#!/bin/bash\necho "1.1.1.1 via 192.168.20.1 dev eth0 src 192.168.20.42"\n'}.items():
            path = self.bin / name
            path.write_text(contents)
            path.chmod(0o755)
        self.log = self.root / 'docker.log'
        self.env = os.environ.copy()
        self.env.update(PATH=str(self.bin) + os.pathsep + self.env['PATH'], DOCKER_TEST_LOG=str(self.log), SECOND_LIVE_NO_AGENT='1')
        self.envfile = self.project / '.env'

    def run_start(self, *args, **env):
        return subprocess.run(['bash', str(self.project / 'start.sh'), *args], cwd=self.root,
                              env=self.env | env, capture_output=True, text=True, timeout=15)

    def test_fresh_and_repeat(self):
        first = self.run_start()
        self.assertEqual(first.returncode, 0, first.stderr)
        saved = self.envfile.read_text()
        self.assertIn('SECOND_LIVE_HOST=0.0.0.0', saved)
        self.assertIn('SECOND_LIVE_PORT=8765', saved)
        self.assertRegex(saved, r'SECOND_LIVE_TOKEN=[0-9a-f]{64}\n')
        self.assertIn('SECOND_LIVE_HTTPS=0', saved)
        self.assertEqual(stat.S_IMODE(self.envfile.stat().st_mode), 0o600)
        self.assertIn('http://192.168.20.42:8765', first.stdout)
        token = re.search(r'SECOND_LIVE_TOKEN=(\w+)', saved).group(1)
        self.assertNotIn(token, first.stdout)
        second = self.run_start()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(saved, self.envfile.read_text())
        self.assertEqual(self.log.read_text().count('up -d --build --wait'), 2)
        self.assertNotIn('down', self.log.read_text())

    def test_preserve_existing_settings_and_opt_in_lan(self):
        self.envfile.write_text('# custom\nCOMPOSE_PROJECT_NAME=genesis\nSECOND_LIVE_HOST=127.0.0.1\nSECOND_LIVE_PORT=9765\nSECOND_LIVE_TOKEN="' + 'a'*48 + '" # keep\nCUSTOM=value\n')
        result = self.run_start()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Nur lokal erreichbar', result.stderr)
        self.assertIn('http://127.0.0.1:9765', result.stdout)
        result = self.run_start('--lan')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('http://192.168.20.42:9765', result.stdout)
        saved = self.envfile.read_text()
        self.assertIn('COMPOSE_PROJECT_NAME=genesis\n', saved)
        self.assertIn('CUSTOM=value\n', saved)
        self.assertIn('SECOND_LIVE_TOKEN="' + 'a'*48 + '" # keep\n', saved)
        self.assertIn('SECOND_LIVE_PORT=9765\n', saved)
        self.assertIn('SECOND_LIVE_HOST=0.0.0.0\n', saved)

    def test_placeholder_and_https_persistence(self):
        self.envfile.write_text('SECOND_LIVE_TOKEN=replace-with-a-long-random-secret\n')
        result = self.run_start('--https', '--lan-ip', '10.1.2.3')
        self.assertEqual(result.returncode, 0, result.stderr)
        saved = self.envfile.read_text()
        self.assertRegex(saved, r'SECOND_LIVE_TOKEN=[0-9a-f]{64}\n')
        self.assertIn('SECOND_LIVE_TLS_HOST=10.1.2.3\n', saved)
        self.assertIn('SECOND_LIVE_HTTPS=1\n', saved)
        self.assertIn('https://10.1.2.3:8443', result.stdout)
        self.assertTrue((self.project / 'second-live-ca.crt').exists())
        self.assertIn('-f compose.https.yaml up', self.log.read_text())
        result = self.run_start()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.envfile.read_text(), saved)
        self.assertIn('https://10.1.2.3:8443', result.stdout)

    def test_https_auto_detect(self):
        result = self.run_start('--https')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('SECOND_LIVE_TLS_HOST=192.168.20.42', self.envfile.read_text())

    def test_failed_start(self):
        result = self.run_start(FAKE_UP_STATUS='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Start fehlgeschlagen', result.stderr)
        self.assertNotIn('wurde gestartet', result.stdout)
        self.assertIn('logs --tail 60', self.log.read_text())
        self.assertTrue(self.envfile.exists())

    def test_invalid_port_and_help(self):
        self.envfile.write_text('SECOND_LIVE_PORT=99999\n')
        result = self.run_start()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Ungueltiger SECOND_LIVE_PORT', result.stderr)
        self.assertNotIn('up -d', self.log.read_text())
        result = self.run_start('--help')
        self.assertEqual(result.returncode, 0)
        self.assertIn('--https', result.stdout)

if __name__ == '__main__':
    unittest.main()
