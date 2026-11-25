#!/usr/bin/env python3
"""Stop only this Second Live installation and retain its data and rollback."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from restart_updater import agent_processes, lock_available, project_name
from host_cleanup import cleanup_images, project_containers
from updater_api import atomic_json


def command(args, timeout=90):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(' '.join(args[:3]) + ': ' + result.stderr.strip()[-2000:])
    return result.stdout.strip()


def stop(keep_images=False):
    work = ROOT / '.sl-update'
    if not (ROOT / '.env').is_file() or not (ROOT / 'compose.yaml').is_file():
        raise RuntimeError('Bestehende Installation mit .env und compose.yaml erforderlich')
    if work.is_symlink():
        raise RuntimeError('Update-Verzeichnis darf kein symbolischer Link sein')
    work.mkdir(mode=0o700, exist_ok=True)
    with (work / 'operation.lock').open('a') as op:
        if not lock_available(op):
            raise RuntimeError('Start, Build, Update oder Rollback laeuft noch. Nicht unterbrechen; danach stop.sh erneut ausfuehren.')
        with (work / 'agent.lock').open('a') as agent:
            pid = None
            if lock_available(agent):
                project = project_name(ROOT, work)
            else:
                matches = agent_processes(ROOT, command(['ps','-axww','-o','pid=,command='],10))
                if len(matches) != 1:
                    raise RuntimeError('Updater-Prozess nicht eindeutig; nichts beendet')
                pid, project = matches[0]
                if int(command(['ps','-p',str(pid),'-o','uid='],10)) != os.getuid():
                    raise RuntimeError('Updater gehoert anderem Benutzer. stop.sh mit dem gleichen Benutzer wie start.sh ausfuehren.')
            containers = project_containers(ROOT, project, command)
            journal = work / 'transaction.json'
            if journal.exists() and json.loads(journal.read_text())['project'] != project:
                raise RuntimeError('Wechsel-Journal gehoert zu einem anderen Compose-Projekt')
            if pid is not None:
                current = command(['ps','-ww','-p',str(pid),'-o','pid=,command='],10)
                if agent_processes(ROOT,current) != [(pid,project)]:
                    raise RuntimeError('Updater-Prozess hat sich geaendert')
                os.kill(pid,signal.SIGTERM)
                deadline=time.monotonic()+15
                while not lock_available(agent):
                    if time.monotonic()>=deadline:
                        raise RuntimeError('Updater beendet sich nicht; kein erzwungener Abbruch')
                    time.sleep(.2)
            # Mark the bridge offline before stopping the game, so new browser
            # requests cannot enqueue work while the agent is already stopped.
            status = work / 'status' / 'status.json'
            if status.parent.is_dir():
                atomic_json(status, {'state':'offline','heartbeat':0,'message':'Second Live wurde am Host gestoppt.'},0o644)
            print('Host-Updater beendet bzw. bereits offline.',flush=True)
            running = [cid for cid, active in containers if active]
            if running:
                command(['docker','stop','--time','30',*running], max(90, 35*len(running)))
            print('Spiel- und HTTPS-Container gestoppt (oder bereits aus).',flush=True)
            # No process can consume this request while operation/agent locks are held.
            (work/'requests'/'request.json').unlink(missing_ok=True)
            if not keep_images:
                try:
                    removed, warnings=cleanup_images(ROOT,project,command)
                    print(f'{len(removed)} alte Second-Live-Image-Tags entfernt.',flush=True)
                    for warning in warnings: print('HINWEIS: '+warning,file=sys.stderr)
                except Exception as exc:
                    print('HINWEIS: Image-Bereinigung uebersprungen: '+str(exc),file=sys.stderr)
            print('Spielstaende, Fotos, Zertifikate, .env, aktives Image und Rollback bleiben erhalten.')
            if journal.exists(): print('Offenes Update-Journal bleibt erhalten; naechster Start prueft den Rollback.')
            print('Neustart mit ./start.sh (ohne erneuten Build, wenn das Image vorhanden ist).')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keep-images',action='store_true',help='Nur stoppen; keine Image-Tags entfernen')
    args=parser.parse_args()
    try: stop(args.keep_images)
    except (OSError,ValueError,KeyError,RuntimeError,subprocess.SubprocessError) as exc:
        sys.exit('FEHLER: '+str(exc))
