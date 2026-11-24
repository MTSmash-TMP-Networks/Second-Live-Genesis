#!/usr/bin/env python3
"""Host-only updater. Fixed trusted repository, immutable checkout, image rollback.
Run through start.sh. Never install Docker privileges inside the web container.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from updater_api import atomic_json, SHA

REPO = 'https://github.com/MTSmash-TMP-Networks/Second-Live-Genesis.git'
REF = 'refs/heads/main'
LABEL = 'org.opencontainers.image.revision'
BUSY = {'checking', 'downloading', 'building', 'switching', 'rollback'}
REQUIRED = ('Dockerfile', 'server.py', 'updater_api.py', 'web/index.html', 'scripts/host_updater.py', 'UPDATE_PROTOCOL')


class UpdateError(RuntimeError):
    pass


class HostUpdater:
    def __init__(self, root, project, runner=None):
        self.root = Path(root).resolve()
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', project):
            raise ValueError('Ungueltiger Compose-Projektname')
        self.project = project
        self.work = self.root / '.sl-update'
        self.status_file = self.work / 'status' / 'status.json'
        self.requests = self.work / 'requests'
        self.active = self.work / 'active.compose.json'
        self.transaction = self.work / 'transaction.json'
        self.previous = self.work / 'previous.compose.json'
        self.state = {'state': 'idle', 'message': 'Bereit. Auf Updates pruefen.', 'current': 'local', 'latest': None}
        self.lock = threading.RLock()
        self.run = runner or self._run
        self.work.mkdir(mode=0o700, exist_ok=True)
        (self.work / 'releases').mkdir(mode=0o700, exist_ok=True)
        (self.work / 'status').mkdir(mode=0o755, exist_ok=True)
        self.requests.mkdir(mode=0o777, exist_ok=True)

    def _run(self, args, *, timeout=90, stream=False):
        env = dict(os.environ)
        # .env is authoritative, and the explicit override owns build revision/image.
        for k in ('SECOND_LIVE_HOST','SECOND_LIVE_PORT','SECOND_LIVE_TOKEN','SECOND_LIVE_UPDATE_ADMIN_TOKEN','SECOND_LIVE_TLS_HOST','SECOND_LIVE_HTTPS','SECOND_LIVE_REVISION'):
            env.pop(k, None)
        env['GIT_TERMINAL_PROMPT'] = '0'
        # Do not load repository-provided Git hooks or initialize submodules.
        if stream:
            # Build logs stay on the trusted host, not in a web response.
            with (self.work / 'build.log').open('ab') as log:
                result = subprocess.run(args, cwd=self.root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        else:
            result = subprocess.run(args, cwd=self.root, env=env, capture_output=True, text=True, timeout=timeout)
        if result.returncode:
            raise UpdateError('Befehl fehlgeschlagen: ' + ' '.join(args[:3]) + ' (Exit ' + str(result.returncode) + ')')
        return '' if stream else result.stdout.strip()

    def compose(self, *args, override=None, timeout=90, stream=False):
        cmd = ['docker','compose','--project-directory',str(self.root),'--project-name',self.project,'--env-file',str(self.root/'.env'),'-f',str(self.root/'compose.yaml')]
        # Only the game service is updated. HTTPS proxy is not recreated.
        file = override if override is not None else self.active if self.active.exists() else None
        if file:
            cmd += ['-f',str(file)]
        return self.run(cmd+list(args), timeout=timeout, stream=stream)

    def publish(self, **updates):
        with self.lock:
            self.state.update(updates)
            self.state['heartbeat'] = time.time()
            atomic_json(self.status_file, self.state, 0o644)

    def container(self):
        cid = self.compose('ps','-q','second-live')
        if not re.fullmatch(r'[a-f0-9]{12,64}', cid):
            raise UpdateError('Spielcontainer nicht gefunden. start.sh ausfuehren.')
        return cid

    def revision(self):
        rev = self.run(['docker','inspect','--format','{{ index .Config.Labels "'+LABEL+'" }}',self.container()])
        return rev if SHA.fullmatch(rev) else 'local'

    def remote_head(self):
        output = self.run(['git','ls-remote','--exit-code',REPO,REF])
        fields = output.split()
        if len(fields) != 2 or not SHA.fullmatch(fields[0]) or fields[1] != REF:
            raise UpdateError('GitHub lieferte keinen eindeutigen main-Commit')
        return fields[0]

    def check(self):
        self.publish(state='checking', message='GitHub main wird geprueft...', latest=None)
        current = self.revision()
        latest = self.remote_head()
        self.publish(current=current, latest=latest, state='idle' if current==latest else 'available', message='Bereits auf aktuellem GitHub-Stand.' if current==latest else 'Neuer GitHub-Stand verfuegbar.')

    def checkout(self, sha):
        folder = self.work / 'releases' / sha
        if self.active.exists() and json.loads(self.active.read_text())['services']['second-live'].get('build',{}).get('context') == str(folder):
            raise UpdateError('Aktiver Quellcode darf nicht ersetzt werden')
        if folder.exists():
            # Never build from a mutable or preexisting checkout without verification.
            if folder.is_symlink(): raise UpdateError('Ungueltiger Release-Pfad')
            shutil.rmtree(folder)
        with tempfile.TemporaryDirectory(prefix='.download-', dir=self.work/'releases') as tmp:
            dest = Path(tmp)/'source'
            self.run(['git','-c','core.hooksPath=/dev/null','init','--quiet',str(dest)])
            self.run(['git','-C',str(dest),'-c','core.hooksPath=/dev/null','fetch','--depth=1','--no-tags',REPO,sha],timeout=300,stream=True)
            actual = self.run(['git','-C',str(dest),'rev-parse','FETCH_HEAD'])
            if actual != sha: raise UpdateError('Commit stimmt nicht mit der Update-Auswahl ueberein')
            self.run(['git','-C',str(dest),'-c','core.hooksPath=/dev/null','checkout','--detach','--quiet',sha],timeout=120,stream=True)
            if not all((dest/p).is_file() for p in REQUIRED) or (dest/'UPDATE_PROTOCOL').read_text().strip() != '1':
                raise UpdateError('GitHub-Stand enthaelt kein kompatibles komplettes Spielprojekt')
            # Credentials and player data must never be included in a build checkout.
            if (dest/'.env').exists() or (dest/'data').exists():
                raise UpdateError('Release enthaelt lokale Daten oder Konfiguration')
            shutil.rmtree(dest/'.git')
            # Preserve optional local art files without exposing them in GitHub.
            for name in ('pistol.png','rifle.jpg'):
                art = self.root/'optional-photos'/name
                if art.is_file() and not art.is_symlink() and art.stat().st_size <= 16*1024*1024:
                    (dest/'optional-photos').mkdir(exist_ok=True)
                    shutil.copyfile(art,dest/'optional-photos'/name)
            dest.rename(folder)
        return folder

    def override(self, name, image, revision=None, source=None):
        service = {'image': image}
        if source is not None:
            service['build'] = {'context':str(source),'args':{'SECOND_LIVE_REVISION':revision}}
        path = self.work / name
        atomic_json(path, {'services':{'second-live':service}})
        return path

    def install(self, sha):
        if self.transaction.exists():
            raise UpdateError('Vorheriger Wechsel muss auf dem Host wiederhergestellt werden')
        if not SHA.fullmatch(sha or '') or self.state.get('state') != 'available' or self.state.get('latest') != sha:
            raise UpdateError('Zuerst auf Updates pruefen')
        if self.remote_head() != sha:
            self.check()
            return
        current = self.revision()
        if current == sha:
            self.publish(state='idle',current=current,message='Bereits installiert.')
            return
        old_id = self.run(['docker','inspect','--format','{{.Image}}',self.container()])
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', old_id):
            raise UpdateError('Aktuelles Docker-Image nicht eindeutig ermittelbar')
        self.publish(state='downloading',current=current,message='GitHub-Commit wird geladen...')
        source = self.checkout(sha)
        image = 'second-live-update-' + self.project + ':' + sha
        candidate = self.override('candidate.compose.json', image, sha, source)
        self.publish(state='building', message='Neues Docker-Image wird gebaut. Altes Spiel bleibt online.')
        (self.work/'build.log').write_text('')
        self.compose('build','second-live',override=candidate,timeout=3600,stream=True)
        # Pin the old image before changing the running service.
        old_tag = 'second-live-update-' + self.project + ':rollback-' + old_id[-12:]
        self.run(['docker','image','tag',old_id,old_tag])
        rollback = self.override('rollback.compose.json', old_tag)
        if self.active.exists(): shutil.copyfile(self.active,self.previous)
        else: self.previous.unlink(missing_ok=True)
        atomic_json(self.transaction, {'project':self.project,'old':current,'new':sha})
        self.publish(state='switching',message='Neuer Spielcontainer startet; Verbindung kurz unterbrochen.')
        try:
            self.compose('up','-d','--no-build','--pull','never','--force-recreate','--no-deps','--wait','--wait-timeout','180','second-live',override=candidate,timeout=240,stream=True)
            # Healthcheck must have passed AND running image must be the selected commit.
            cid = self.compose('ps','-q','second-live',override=candidate)
            got = self.run(['docker','inspect','--format','{{ index .Config.Labels "'+LABEL+'" }}',cid])
            if got != sha: raise UpdateError('Gestartete Revision stimmt nicht ueberein')
            os.replace(candidate,self.active)
        except Exception as exc:
            self.publish(state='rollback',message='Neustart fehlgeschlagen. Vorheriges Image wird wiederhergestellt.')
            try:
                self.compose('up','-d','--no-build','--pull','never','--force-recreate','--no-deps','--wait','--wait-timeout','180','second-live',override=rollback,timeout=240,stream=True)
            except Exception:
                self.publish(state='error',message='Rollback fehlgeschlagen. Docker-Host pruefen (siehe .sl-update/build.log).')
                return
            self.restore_previous()
            self.publish(state='rolled_back',current=current,message='Update fehlgeschlagen; vorheriges Image wieder gestartet. Details im Host-Log.')
            return
        self.transaction.unlink(missing_ok=True)
        self.previous.unlink(missing_ok=True)
        self.publish(state='success',current=sha,latest=sha,message='Update erfolgreich installiert. Spiel neu laden.')

    def restore_previous(self):
        if self.previous.exists(): os.replace(self.previous,self.active)
        else: self.active.unlink(missing_ok=True)
        self.transaction.unlink(missing_ok=True)

    def recover(self):
        # Conservative crash recovery: keep previous image/data. A fresh check
        # can retry the interrupted update. Never rebuild during recovery.
        if not self.transaction.exists(): return
        journal=json.loads(self.transaction.read_text())
        if journal.get('project') != self.project: raise UpdateError('Update-Journal gehoert zu anderem Compose-Projekt')
        rollback=self.work/'rollback.compose.json'
        if not rollback.is_file(): raise UpdateError('Rollback-Konfiguration fehlt')
        self.publish(state='rollback',message='Unterbrochenes Update wird zurueckgerollt.')
        self.compose('up','-d','--no-build','--pull','never','--force-recreate','--no-deps','--wait','--wait-timeout','180','second-live',override=rollback,timeout=240,stream=True)
        self.restore_previous()
        self.publish(state='rolled_back',current=journal['old'],message='Vorherige Version wiederhergestellt.')

    def process(self):
        request = self.requests/'request.json'
        try:
            fd = os.open(request,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
        except FileNotFoundError:
            return
        except OSError:
            try: request.unlink(missing_ok=True)
            except OSError: pass
            return
        try:
            with os.fdopen(fd,'rb') as f:
                if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
                    raise ValueError('Dateityp')
                data = json.loads(f.read(4097))
            if not isinstance(data,dict) or set(data) != {'action','revision'}:
                raise ValueError('Auftrag')
            # Keep queue file until busy state is published to close the enqueue race.
            if data['action']=='check' and data['revision'] is None:
                self.check()
            elif data['action']=='install' and isinstance(data['revision'],str) and SHA.fullmatch(data['revision']):
                self.install(data['revision'])
            else:
                raise ValueError('Auftrag')
        except Exception as exc:
            print('Update fehlgeschlagen:', type(exc).__name__, str(exc),flush=True)
            self.publish(state='error',message='Update-Auftrag fehlgeschlagen. Details am Host in .sl-update/agent.log und build.log.')
        finally:
            try: request.unlink(missing_ok=True)
            except OSError: pass

    def serve(self):
        with (self.work/'agent.lock').open('a') as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: return
            try: self.state['current']=self.revision()
            except Exception: pass
            self.publish()
            def heartbeat():
                while True:
                    time.sleep(5)
                    self.publish()
            threading.Thread(target=heartbeat,daemon=True).start()
            while True:
                with (self.work/'operation.lock').open('a') as op:
                    try: fcntl.flock(op,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    except BlockingIOError: pass
                    else:
                        if self.transaction.exists():
                            try: self.recover()
                            except Exception as exc:
                                print('Wiederherstellung fehlgeschlagen:',exc,flush=True)
                                self.publish(state='error',message='Rollback nicht moeglich. Docker-Host pruefen.')
                                time.sleep(15)
                        else: self.process()
                time.sleep(2)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--project',required=True)
    a=p.parse_args();HostUpdater(a.root,a.project).serve()
