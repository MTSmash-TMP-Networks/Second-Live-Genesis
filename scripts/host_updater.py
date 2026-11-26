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
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from updater_api import atomic_json, SHA
from host_cleanup import cleanup_images

REPO = 'https://github.com/MTSmash-TMP-Networks/Second-Live-Genesis.git'
REF = 'refs/heads/main'
LABEL = 'org.opencontainers.image.revision'
BUSY = {'checking', 'downloading', 'building', 'switching', 'rollback'}
AGENT_VERSION = '0.7.4'
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
        self.state = {'state': 'idle', 'message': 'Bereit. Auf Updates pruefen.', 'current': 'local', 'latest': None, 'agent_version': AGENT_VERSION}
        self.lock = threading.RLock()
        self.run = runner or self._run
        self.work.mkdir(mode=0o700, exist_ok=True)
        (self.work / 'releases').mkdir(mode=0o700, exist_ok=True)
        (self.work / 'status').mkdir(mode=0o755, exist_ok=True)
        self.requests.mkdir(mode=0o777, exist_ok=True)

    def _run(self, args, *, timeout=90, stream=False):
        env = dict(os.environ)
        for k in ('SECOND_LIVE_HOST','SECOND_LIVE_PORT','SECOND_LIVE_TOKEN','SECOND_LIVE_UPDATE_ADMIN_TOKEN','SECOND_LIVE_UPDATE_ADMIN_EMAIL','SECOND_LIVE_TLS_HOST','SECOND_LIVE_HTTPS','SECOND_LIVE_REVISION'):
            env.pop(k, None)
        env['GIT_TERMINAL_PROMPT'] = '0'
        logpath = self.work / 'build.log'
        command = ' '.join(args[:2])
        try:
            if stream:
                with logpath.open('ab') as log:
                    log.write(('\n--- '+command+' ---\n').encode()); log.flush()
                    result = subprocess.run(args, cwd=self.root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
            else:
                result = subprocess.run(args, cwd=self.root, env=env, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            with logpath.open('a') as log: log.write('\nZeitlimit: '+command+'\n')
            raise UpdateError('Zeitlimit bei '+command) from exc
        if result.returncode:
            with logpath.open('a') as log:
                log.write('\nFehler: '+command+' (Exit '+str(result.returncode)+')\n')
                if not stream: log.write((result.stderr or '')[-16000:]+'\n')
            raise UpdateError('Befehl fehlgeschlagen: '+command+' (Exit '+str(result.returncode)+')')
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

    def container(self, override=None, include_stopped=False):
        args = ['ps'] + (['-a'] if include_stopped else []) + ['-q','second-live']
        cid = self.compose(*args, override=override)
        if not re.fullmatch(r'[a-f0-9]{12,64}', cid):
            raise UpdateError('Spielcontainer nicht eindeutig gefunden')
        return cid

    def revision(self):
        rev = self.run(['docker','inspect','--format','{{ index .Config.Labels "'+LABEL+'" }}',self.container()])
        return rev if SHA.fullmatch(rev) else 'local'

    def image_info(self, image):
        raw = self.run(['docker','image','inspect','--format','{{json .Id}}\t{{json .Config.Labels}}',image])
        try:
            iid, labels = raw.split('\t',1)
            iid, labels = json.loads(iid), json.loads(labels) or {}
        except (TypeError, ValueError) as exc:
            raise UpdateError('Docker-Image-Metadaten ungueltig') from exc
        if not isinstance(iid,str) or not re.fullmatch(r'sha256:[a-f0-9]{64}',iid) or not isinstance(labels,dict):
            raise UpdateError('Docker-Image-ID nicht eindeutig')
        rev = labels.get(LABEL,'')
        return iid, rev if isinstance(rev,str) and SHA.fullmatch(rev) else 'local'

    def preflight(self, iid, sha):
        # No host bind mounts, production volumes, tokens, or published ports.
        # Use a fresh temporary data directory inside the candidate container.
        probe = 'sl-probe-'+self.project+'-'+uuid.uuid4().hex[:10]
        code = """import json, subprocess, sys, time, urllib.request
p = subprocess.Popen([sys.executable, 'server.py'])
try:
    until = time.monotonic()+25
    while time.monotonic() < until:
        if p.poll() is not None: raise RuntimeError('Server beendet: '+str(p.returncode))
        try:
            with urllib.request.urlopen('http://127.0.0.1:8765/api/health',timeout=2) as r: h=json.load(r)
        except (OSError, ValueError):
            time.sleep(.5); continue
        if h.get('ok') is True and h.get('graphics_assets') is True and h.get('revision') == sys.argv[1]:
            print('Preflight: Server, Assets und Revision OK',flush=True); break
        raise RuntimeError('Preflight: Healthcheck oder Revision ungueltig')
    else: raise RuntimeError('Preflight: Server nicht erreichbar')
finally:
    if p.poll() is None:
        p.terminate()
        try: p.wait(timeout=3)
        except subprocess.TimeoutExpired: p.kill(); p.wait()
"""
        try:
            self.run(['docker','run','--rm','--name',probe,'--pull','never','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges:true','-e','SECOND_LIVE_BIND=127.0.0.1','-e','SECOND_LIVE_DATA_DIR=/tmp/second-live-preflight','--entrypoint','python',iid,'-c',code,sha],timeout=65,stream=True)
        except Exception as exc:
            # If the client timed out, Docker may have left its probe running.
            try: self.run(['docker','rm','-f','-v',probe],timeout=20)
            except Exception: pass
            raise UpdateError('Isolierter Starttest fehlgeschlagen; altes Spiel bleibt aktiv') from exc

    def start_and_verify(self, override, expected_id, expected_revision):
        # Decouple Compose's CLI wait from application verification. Inspect the
        # exact container even if it exited; do not equate a running PID to health.
        self.compose('up','-d','--no-build','--pull','never','--force-recreate','--no-deps','second-live',override=override,timeout=120,stream=True)
        self.wait_healthy(override,expected_id,expected_revision)

    def wait_healthy(self, override, expected_id, expected_revision, timeout=180):
        deadline = time.monotonic()+timeout
        last = 'Containerstatus nicht verfuegbar'
        while time.monotonic() < deadline:
            cid = self.container(override,include_stopped=True)
            iid = self.run(['docker','inspect','--format','{{.Image}}',cid])
            if iid != expected_id: raise UpdateError('Falsches Docker-Image gestartet')
            rev = self.run(['docker','inspect','--format','{{ index .Config.Labels "'+LABEL+'" }}',cid])
            rev = rev if SHA.fullmatch(rev) else 'local'
            if rev != expected_revision: raise UpdateError('Gestartete Revision stimmt nicht ueberein')
            raw = self.run(['docker','inspect','--format','{{json .State}}',cid])
            try: state = json.loads(raw)
            except ValueError as exc: raise UpdateError('Docker-Status ungueltig') from exc
            status = state.get('Status','unknown')
            health = (state.get('Health') or {}).get('Status','missing')
            last = 'Container: '+str(status)+' / Healthcheck: '+str(health)
            if status == 'running' and health == 'healthy': return
            if status in ('exited','dead','restarting','removing'):
                raise UpdateError('Spielcontainer '+status+' (Exit '+str(state.get('ExitCode','?'))+')')
            if health in ('unhealthy','missing'): raise UpdateError(last)
            time.sleep(2)
        raise UpdateError('Zeitlimit beim Containerstart. '+last)

    def diagnose(self, override, phase, exc, inspect_container=True):
        # Collect diagnostics before the candidate container is removed. These
        # stay on the host; only fixed/sanitized summaries go to the web UI.
        lines = ['\n--- '+phase+' ---',type(exc).__name__+': '+str(exc)]
        try:
            if not inspect_container:
                lines.append('Kein Containerwechsel erfolgt; Details in build.log.')
            else:
                self.collect_container_diagnostics(override,lines)
        except Exception as error: lines.append('Containerdiagnose: '+str(error))
        try:
            with (self.work/'diagnostics.log').open('a') as f: f.write('\n'.join(lines)+'\n')
        except OSError: pass  # Diagnostic failure must never prevent rollback.
        print('Updater '+phase+': '+str(exc),flush=True)

    def collect_container_diagnostics(self,override,lines):
        cid = self.container(override,include_stopped=True)
        lines.append('Container: '+cid)
        for title,args in [('Docker-State',['docker','inspect','--format','{{json .State}}',cid]),('Docker-Logs',['docker','logs','--tail','100',cid])]:
            try:
                if title == 'Docker-Logs':
                    self.run(args,timeout=20,stream=True)
                else: lines.append(title+': '+self.run(args,timeout=20))
            except Exception as error: lines.append(title+': '+str(error))

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
            # Preserve explicitly named, locally installed village models (CC0/custom).
            for name in ('house-a.glb','house-b.glb','shop-a.glb','shop-b.glb'):
                art = self.root/'optional-village'/name
                if art.is_file() and not art.is_symlink() and 0 < art.stat().st_size <= 32*1024*1024:
                    (dest/'optional-village').mkdir(exist_ok=True)
                    shutil.copyfile(art,dest/'optional-village'/name)
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
            self.check(); return
        current = self.revision()
        if current == sha:
            self.publish(state='idle',current=current,message='Bereits installiert.'); return
        old_id = self.run(['docker','inspect','--format','{{.Image}}',self.container()])
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', old_id):
            raise UpdateError('Aktuelles Docker-Image nicht eindeutig ermittelbar')
        for name in ('build','diagnostics'):
            path=self.work/(name+'.log')
            if path.is_file(): shutil.copyfile(path,self.work/(name+'.previous.log'))
            path.write_text('')
        self.publish(state='downloading',current=current,message='GitHub-Commit wird geladen...')
        source = self.checkout(sha)
        image = 'second-live-update-' + self.project + ':' + sha
        candidate = self.override('candidate.compose.json', image, sha, source)
        self.publish(state='building', message='Neues Docker-Image wird gebaut. Altes Spiel bleibt online.')
        try:
            self.compose('build','second-live',override=candidate,timeout=3600,stream=True)
            new_id, new_revision = self.image_info(image)
            if new_revision != sha: raise UpdateError('Gebautes Image hat nicht die erwartete GitHub-Revision')
            self.publish(message='Isolierter Starttest des neuen Images. Altes Spiel bleibt online.')
            self.preflight(new_id,sha)
        except Exception as exc:
            self.diagnose(candidate,'Build/Starttest vor Wechsel',exc,inspect_container=False)
            self.publish(state='error',message=str(exc)+'; bisheriges Spiel bleibt aktiv. Details in .sl-update/build.log und diagnostics.log.')
            return
        old_tag = 'second-live-update-' + self.project + ':rollback-' + old_id[-12:]
        self.run(['docker','image','tag',old_id,old_tag])
        rollback = self.override('rollback.compose.json', old_tag)
        if self.active.exists(): shutil.copyfile(self.active,self.previous)
        else: self.previous.unlink(missing_ok=True)
        atomic_json(self.transaction, {'project':self.project,'old':current,'old_id':old_id,'new':sha})
        self.publish(state='switching',message='Neuer Spielcontainer startet; Verbindung kurz unterbrochen.')
        try:
            self.start_and_verify(candidate,new_id,sha)
            os.replace(candidate,self.active)
        except Exception as exc:
            self.diagnose(candidate,'Containerwechsel',exc)
            reason = str(exc) if isinstance(exc,UpdateError) else type(exc).__name__
            self.publish(state='rollback',message='Neustart fehlgeschlagen: '+reason+'. Vorheriges Image wird wiederhergestellt.')
            try:
                self.start_and_verify(rollback,old_id,current)
            except Exception as rollback_error:
                self.diagnose(rollback,'Rollback',rollback_error)
                self.publish(state='error',message='Rollback fehlgeschlagen: '+str(rollback_error)+'. Docker-Host pruefen (diagnostics.log / build.log).')
                return
            self.restore_previous()
            self.publish(state='rolled_back',current=current,message='Update fehlgeschlagen: '+reason+'. Vorheriges Image wieder gestartet. Details in .sl-update/diagnostics.log und build.log.')
            return
        self.transaction.unlink(missing_ok=True)
        self.previous.unlink(missing_ok=True)
        self.publish(state='success',current=sha,latest=sha,message='Update erfolgreich installiert. Spiel neu laden.')
        # The new and rollback images are committed. Cleanup is best-effort and
        # cannot turn an otherwise successful update into a rollback.
        try:
            removed,warnings=cleanup_images(self.root,self.project,self.run)
            print(f'Image-Bereinigung: {len(removed)} alte Tags entfernt',flush=True)
            for warning in warnings: print('Image-Bereinigung:',warning,flush=True)
        except Exception as exc:
            print('Image-Bereinigung uebersprungen:',exc,flush=True)

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
        config=json.loads(rollback.read_text())['services']['second-live']
        old_id, old_revision=self.image_info(config['image'])
        if old_revision != journal['old'] or (journal.get('old_id') and old_id != journal['old_id']):
            raise UpdateError('Rollback-Image stimmt nicht mit Wechsel-Journal ueberein')
        self.publish(state='rollback',message='Unterbrochenes Update wird zurueckgerollt.')
        try:
            # A prior restore may have started the correct image before the agent
            # stopped. Do not repeatedly recreate an already healthy old server.
            try: self.wait_healthy(rollback,old_id,old_revision,timeout=8)
            except Exception: self.start_and_verify(rollback,old_id,old_revision)
        except Exception as exc:
            self.diagnose(rollback,'Wiederherstellung',exc); raise
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
            self.publish(state='error',message='Update-Auftrag fehlgeschlagen: '+(str(exc) if isinstance(exc,UpdateError) else type(exc).__name__)+'. Details in .sl-update/agent.log und build.log.')
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
