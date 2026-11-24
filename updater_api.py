"""Small, privilege-separated game-to-host bridge. No Docker access here."""
import json
import os
from pathlib import Path
import re
import secrets
import time
import uuid

SHA = re.compile(r'^[0-9a-f]{40}$')


def atomic_json(path, value, mode=0o600):
    path = Path(path)
    tmp = path.parent / ('.tmp-' + uuid.uuid4().hex)
    try:
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode), 'w', encoding='utf-8') as f:
            os.fchmod(f.fileno(), mode)
            json.dump(value, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


class UpdateBridge:
    def __init__(self, root, admin_token):
        self.root = Path(root) if root else None
        self.token = admin_token or ''

    def authorized(self, supplied):
        # No development/localhost bypass for host administration.
        return len(self.token) >= 32 and secrets.compare_digest(self.token.encode(), supplied.encode())

    def status(self):
        if not self.root:
            return {'state': 'disabled', 'message': 'Host-Updater nicht konfiguriert.'}
        try:
            with (self.root / 'status' / 'status.json').open(encoding='utf-8') as f:
                data = json.loads(f.read(32769))
            if not isinstance(data, dict):
                raise ValueError('status')
            if time.time() - float(data['heartbeat']) > 45:
                return {**data, 'state': 'offline', 'message': 'Host-Updater nicht erreichbar. start.sh auf dem Host ausfuehren.'}
            if (self.root / 'requests' / 'request.json').exists() and data.get('state') not in ('checking', 'downloading', 'building', 'switching', 'rollback'):
                return {**data, 'state': 'queued', 'message': 'Auftrag wartet auf Host-Updater.'}
            return data
        except (OSError, ValueError, TypeError, KeyError):
            return {'state': 'offline', 'message': 'Host-Updater noch nicht aktiv. start.sh auf dem Host ausfuehren.'}

    def submit(self, data):
        if not isinstance(data, dict) or set(data) - {'action', 'revision'}:
            raise ValueError('Ungueltiger Update-Auftrag')
        action = data.get('action')
        revision = data.get('revision')
        if action not in ('check', 'install') or (action == 'check' and revision is not None) or (action == 'install' and (not isinstance(revision, str) or not SHA.fullmatch(revision))):
            raise ValueError('Ungueltiger Update-Auftrag')
        state = self.status()
        if state.get('state') in ('disabled', 'offline'):
            raise RuntimeError('Host-Updater nicht aktiv')
        if state.get('state') in ('checking', 'queued', 'downloading', 'building', 'switching', 'rollback'):
            raise RuntimeError('Ein Update-Auftrag laeuft bereits')
        if action == 'install' and (state.get('state') != 'available' or state.get('latest') != revision):
            raise RuntimeError('Bitte zuerst erneut auf Updates pruefen')
        folder = self.root / 'requests'
        tmp = folder / ('.request-' + uuid.uuid4().hex)
        try:
            atomic_json(tmp, {'action': action, 'revision': revision}, 0o644)
            # Atomic no-overwrite enqueue; simultaneous requests cannot replace each other.
            os.link(tmp, folder / 'request.json')
        except FileExistsError as exc:
            raise RuntimeError('Ein Update-Auftrag laeuft bereits') from exc
        finally:
            tmp.unlink(missing_ok=True)
        return {'state': 'queued'}
