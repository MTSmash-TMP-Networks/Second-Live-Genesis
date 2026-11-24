#!/usr/bin/env python3
"""Serialize a manual Docker start with the updater (Linux/macOS)."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
work = root/'.sl-update'
if work.is_symlink():
    sys.exit('Update-Verzeichnis darf kein symbolischer Link sein.')
work.mkdir(mode=0o700,exist_ok=True)
work.chmod(0o700)
with (work/'operation.lock').open('a') as lock:
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError: sys.exit('Ein Start oder Update laeuft bereits. Bitte Status im Spiel/Host pruefen.')
    journal=work/'transaction.json'
    if journal.exists():
        from host_updater import HostUpdater
        HostUpdater(root,json.loads(journal.read_text())['project']).recover()
    env = {**os.environ,'SECOND_LIVE_START_LOCK':'1'}
    sys.exit(subprocess.call(['bash',str(root/'start.sh'),*sys.argv[1:]],env=env,cwd=root))
