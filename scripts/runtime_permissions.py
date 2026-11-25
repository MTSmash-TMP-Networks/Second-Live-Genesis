"""Make image code readable but not writable by the unprivileged runtime user."""
import os
import sys
import tempfile
from pathlib import Path

MODULES = ('server.py', 'updater_api.py', 'wall_damage.py', 'world_capture.py', 'hotel_lobby.py',
           'runtime_permissions.py')
REQUIRED_WEB = ('index.html', 'game.js', 'audio.js', 'updater.js',
                'engine/renderer.bundle.js', 'engine/wall_layout.json', 'engine/hotel_layout.json', 'engine/lobby_layout.json',
                'assets/polyhaven/manifest.json')


def app_paths(root):
    yield root
    for name in MODULES:
        p = root / name
        if p.is_symlink() or not p.is_file():
            raise RuntimeError(f'Missing or invalid module: {p}')
        yield p
    web = root / 'web'
    if web.is_symlink() or not web.is_dir():
        raise RuntimeError(f'Missing or invalid web directory: {web}')
    yield web
    # Explicit directory traversal: permission errors must never be hidden.
    pending = [web]
    while pending:
        for p in pending.pop().iterdir():
            if p.is_symlink() or not (p.is_file() or p.is_dir()):
                raise RuntimeError(f'Unexpected runtime asset: {p}')
            yield p
            if p.is_dir():
                pending.append(p)


def normalize(root):
    for p in app_paths(root):
        p.chmod(0o755 if p.is_dir() else 0o644)


def check(root):
    if os.geteuid() == 0:
        raise RuntimeError('Runtime check must run as non-root')
    for p in app_paths(root):
        if os.access(p, os.W_OK):
            raise PermissionError(f'Runtime code must not be writable: {p}')
        if p.is_dir():
            if not os.access(p, os.R_OK | os.X_OK):
                raise PermissionError(f'Runtime directory inaccessible: {p}')
        else:
            with p.open('rb') as f:
                f.read(1)
    for name in REQUIRED_WEB:
        if not (root / 'web' / name).is_file():
            raise RuntimeError(f'Missing runtime asset: {name}')
    with tempfile.TemporaryFile(dir=root / 'data') as f:
        f.write(b'permissions-ok')
    print('Runtime permissions OK (non-root; code read-only; data writable)', flush=True)


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('--normalize', '--check'):
        raise SystemExit('Usage: runtime_permissions.py --normalize|--check APP_ROOT')
    (normalize if sys.argv[1] == '--normalize' else check)(Path(sys.argv[2]))
