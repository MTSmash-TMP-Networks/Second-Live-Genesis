#!/usr/bin/env python3
"""Run an ordinary, revision-checked update from the Docker host, without HTTP."""
import argparse
import os
from pathlib import Path
import re
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from updater_api import UpdateBridge, SHA

BUSY={'queued','checking','downloading','building','switching','rollback'}
KEY='SECOND_LIVE_UPDATE_ADMIN_EMAIL'
EMAIL=re.compile(r'[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+')

def configure_email(path,email):
    email=email.strip().lower()
    if len(email)>254 or not EMAIL.fullmatch(email):
        raise ValueError('Ungueltige Admin-E-Mail')
    if path.is_symlink() or not path.is_file():
        raise RuntimeError('.env muss im bisherigen Installationsordner vorhanden sein')
    # Preserve all other settings and comments; never print or source secrets.
    old=path.read_text('utf8')
    pattern=re.compile(r'^\s*(?:export\s+)?'+KEY+r'\s*=')
    lines=[];written=False
    for line in old.splitlines():
        if pattern.match(line):
            if not written:lines.append(KEY+'='+email);written=True
        else:lines.append(line)
    if not written:lines.append(KEY+'='+email)
    fd,tmp=tempfile.mkstemp(prefix='.env.admin-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf8') as f:
            f.write('\n'.join(lines)+'\n');f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        Path(tmp).unlink(missing_ok=True)

def wait(bridge,seconds):
    end=time.monotonic()+seconds
    previous=None
    while time.monotonic()<end:
        result=bridge.status()
        state=result.get('state')
        summary=(state,result.get('message',''))
        if summary!=previous:
            print(str(state)+': '+str(summary[1]),flush=True);previous=summary
        if state not in BUSY:
            if state in ('offline','disabled','error','rolled_back'):
                raise RuntimeError('Host-Update nicht erfolgreich; .sl-update/build.log und agent.log pruefen')
            return result
        time.sleep(2)
    raise RuntimeError('Zeitlimit der Statusabfrage; ein laufender Host-Auftrag wurde nicht abgebrochen')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--admin-email',required=True,help='E-Mail des lokalen Update-Administrators')
    args=p.parse_args()
    try:
        root=ROOT
        if not (root/'compose.yaml').is_file() or 'SECOND_LIVE_UPDATE_ADMIN_EMAIL:' not in (root/'compose.yaml').read_text('utf8'):
            raise RuntimeError('Zuerst die aktuellen Projektdateien von GitHub main holen')
        if (root/'.sl-update').is_symlink():raise RuntimeError('Ungueltiges Update-Verzeichnis')
        bridge=UpdateBridge(root/'.sl-update','')
        status=bridge.status()
        if status.get('state') in ('offline','disabled'):
            raise RuntimeError('Host-Updater nicht aktiv. Im Installationsordner ./start.sh ausfuehren und erneut versuchen.')
        if status.get('state') in BUSY:raise RuntimeError('Ein Update laeuft bereits')
        configure_email(root/'.env',args.admin_email)
        print('Admin-E-Mail lokal konfiguriert; keine Kontodaten an GitHub gesendet.',flush=True)
        bridge.submit({'action':'check','revision':None})
        result=wait(bridge,180)
        if result.get('state')=='available':
            revision=result.get('latest')
            if not isinstance(revision,str) or not SHA.fullmatch(revision):raise RuntimeError('Ungueltige GitHub-Revision')
            bridge.submit({'action':'install','revision':revision})
            result=wait(bridge,4500)
            if result.get('state')!='success' or result.get('current')!=revision:
                raise RuntimeError('Revision wurde nicht installiert; Status auf dem Host pruefen')
        elif result.get('current')!=result.get('latest'):
            raise RuntimeError('Update-Status nicht eindeutig')
        else:
            print('Revision bereits aktuell. Falls die .env gerade geaendert wurde, ./start.sh ausfuehren, damit der Container die Konfiguration erhaelt.')
        print('Jetzt einmalig das Admin-Konto mit dem folgenden Befehl freischalten:')
        print('docker compose --env-file .env -f compose.yaml exec second-live python -m game_accounts --activate-update-admin')
    except (ValueError,RuntimeError,OSError,KeyboardInterrupt) as exc:
        p.exit(1,'Manuelles Update: '+str(exc)+'\n')

if __name__=='__main__':
    main()
