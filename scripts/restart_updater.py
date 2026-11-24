#!/usr/bin/env python3
"""Restart exactly this installation's host agent, without rebuilding the game.
Linux/macOS. Never interrupt an update holding the operation lock.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def agent_processes(root, listing):
    result = []
    pattern = (r'^(?:\S*/)?[Pp]ython(?:3(?:\.\d+)?)? -u (?:scripts/host_updater\.py|'
               + re.escape(str(root/'scripts/host_updater.py')) + r') --root '
               + re.escape(str(root)) + r' --project ([a-z0-9][a-z0-9_-]*)$')
    for line in listing.splitlines():
        fields = line.strip().split(None,1)
        if len(fields)!=2 or not fields[0].isdigit(): continue
        match = re.fullmatch(pattern,fields[1])
        if match: result.append((int(fields[0]),match.group(1)))
    return result


def lock_available(file):
    try: fcntl.flock(file,fcntl.LOCK_EX|fcntl.LOCK_NB); return True
    except BlockingIOError: return False


def project_name(root, work):
    args=['docker','compose','--project-directory',str(root),'--env-file',str(root/'.env'),'-f',str(root/'compose.yaml')]
    if (work/'active.compose.json').exists(): args += ['-f',str(work/'active.compose.json')]
    env=dict(os.environ)
    for key in ('SECOND_LIVE_HOST','SECOND_LIVE_PORT','SECOND_LIVE_TOKEN','SECOND_LIVE_UPDATE_ADMIN_TOKEN','SECOND_LIVE_TLS_HOST','SECOND_LIVE_HTTPS','SECOND_LIVE_REVISION'): env.pop(key,None)
    raw=subprocess.check_output(args+['config','--format','json'],cwd=root,env=env,text=True,stderr=subprocess.DEVNULL,timeout=30)
    name=json.loads(raw)['name']
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*',name): raise RuntimeError('Ungueltiger Compose-Projektname')
    return name


def main():
    root=ROOT;work=root/'.sl-update'
    if not (root/'.env').is_file() or not work.is_dir() or work.is_symlink():
        raise RuntimeError('Bestehende Second-Live-Installation mit .env und .sl-update erforderlich')
    with (work/'operation.lock').open('a') as op:
        if not lock_available(op):
            raise RuntimeError('Start, Update oder Rollback laeuft noch. Nicht unterbrechen; nach Abschluss erneut ausfuehren.')
        with (work/'agent.lock').open('a') as agent:
            if lock_available(agent):
                project=project_name(root,work)
            else:
                listing=subprocess.check_output(['ps','-axww','-o','pid=,command='],text=True,timeout=10)
                matches=agent_processes(root,listing)
                if len(matches)!=1: raise RuntimeError('Aktiver Updater-Prozess nicht eindeutig identifizierbar. Kein Prozess beendet.')
                pid,project=matches[0]
                if int(subprocess.check_output(['ps','-p',str(pid),'-o','uid='],text=True).strip())!=os.getuid():
                    raise RuntimeError('Updater gehoert einem anderen Benutzer. Kein Prozess beendet.')
                # Validate again immediately before sending TERM.
                current=subprocess.check_output(['ps','-ww','-p',str(pid),'-o','pid=,command='],text=True,timeout=10)
                if agent_processes(root,current)!=[(pid,project)]: raise RuntimeError('Updater-Prozess hat sich geaendert')
                os.kill(pid,signal.SIGTERM)
                deadline=time.monotonic()+15
                while not lock_available(agent):
                    if time.monotonic()>=deadline: raise RuntimeError('Updater beendet sich nicht; kein erzwungener Abbruch')
                    time.sleep(.2)
            journal=work/'transaction.json'
            if journal.exists() and json.loads(journal.read_text())['project']!=project:
                raise RuntimeError('Wechsel-Journal gehoert zu einem anderen Compose-Projekt')
        # Agent lock released, operation lock still prevents work until return.
        with (work/'agent.log').open('ab') as log:
            log.write(b'\n--- Manueller Neustart des Host-Updaters ---\n');log.flush()
            proc=subprocess.Popen([sys.executable,'-u','scripts/host_updater.py','--root',str(root),'--project',project],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        time.sleep(.6)
        if proc.poll() is not None: raise RuntimeError('Neuer Host-Updater beendet sich. agent.log pruefen.')
        print('Host-Updater neu gestartet (PID '+str(proc.pid)+'). Spielcontainer und Daten wurden nicht veraendert.')
        if journal.exists(): print('Offenes Wechsel-Journal bleibt erhalten; Agent versucht die Wiederherstellung.')
        print('Im Spiel erneut auf Updates pruefen.')


if __name__=='__main__':
    try: main()
    except (OSError,ValueError,KeyError,RuntimeError,subprocess.SubprocessError) as exc:
        sys.exit('FEHLER: '+str(exc))
