"""Conservative project-local image cleanup, called only under operation.lock."""
import json
from pathlib import Path
import re

IMAGE_ID = re.compile(r'sha256:[0-9a-f]{64}')
CONTAINER_ID = re.compile(r'[0-9a-f]{64}')
TAG = re.compile(r'(?:[0-9a-f]{40}|rollback-[0-9a-f]{12})')
PROJECT = re.compile(r'[a-z0-9][a-z0-9_-]*')


def project_containers(root, project, run):
    """Verify the Compose project belongs to this host directory before acting."""
    if not PROJECT.fullmatch(project):
        raise ValueError('Ungueltiger Compose-Projektname')
    ids = run(['docker', 'ps', '-aq', '--no-trunc', '--filter',
               'label=com.docker.compose.project=' + project]).splitlines()
    if not ids:
        return []
    if not all(CONTAINER_ID.fullmatch(cid) for cid in ids):
        raise RuntimeError('Container-IDs nicht eindeutig')
    fmt = '{{json .Id}}\t{{json .Config.Labels}}\t{{json .State.Running}}'
    rows = run(['docker', 'inspect', '--type', 'container', '--format', fmt, *ids]).splitlines()
    found = []
    seen = set()
    for row in rows:
        cid, labels, running = (json.loads(v) for v in row.split('\t'))
        if cid not in ids or cid in seen or not isinstance(labels, dict) or not isinstance(running, bool):
            raise RuntimeError('Container-Metadaten nicht eindeutig')
        seen.add(cid)
        if (labels.get('com.docker.compose.project') != project or
                not labels.get('com.docker.compose.project.working_dir') or
                Path(labels['com.docker.compose.project.working_dir']).resolve() != Path(root).resolve()):
            raise RuntimeError('Compose-Projekt gehoert zu anderem Installationsordner; kein Eingriff')
        if labels.get('com.docker.compose.service') in ('second-live', 'https'):
            found.append((cid, running))
    if seen != set(ids):
        raise RuntimeError('Containerliste hat sich geaendert; erneut versuchen')
    return found


def cleanup_images(root, project, run):
    """Remove only obsolete tags owned by this updater, never force or global prune."""
    work = Path(root) / '.sl-update'
    if work.is_symlink() or (work / 'transaction.json').exists():
        return [], ['Offenes Wechsel-Journal / ungueltiges Update-Verzeichnis; Images bleiben erhalten.']
    if not PROJECT.fullmatch(project):
        raise ValueError('Ungueltiger Compose-Projektname')
    if not project_containers(root, project, run):
        return [], ['Keine Container dieser Installation zur Zuordnung gefunden; Images bleiben erhalten.']
    repo = 'second-live-update-' + project
    protected_refs = set()
    for name in ('active.compose.json', 'rollback.compose.json', 'previous.compose.json'):
        p = work / name
        if p.is_symlink():
            raise RuntimeError('Ungueltige Update-Konfiguration; keine Bereinigung')
        if p.exists():
            image = json.loads(p.read_text())['services']['second-live']['image']
            if not isinstance(image, str) or not image:
                raise RuntimeError('Ungueltige Image-Referenz; keine Bereinigung')
            protected_refs.add(image)
    # Include ALL containers, even stopped and in other projects.
    ids = run(['docker', 'ps', '-aq', '--no-trunc']).splitlines()
    if not all(CONTAINER_ID.fullmatch(cid) for cid in ids):
        raise RuntimeError('Container-IDs nicht eindeutig; keine Bereinigung')
    protected_ids = set()
    if ids:
        image_ids = run(['docker', 'inspect', '--type', 'container', '--format', '{{.Image}}', *ids]).splitlines()
        if len(image_ids) != len(ids) or not all(IMAGE_ID.fullmatch(i) for i in image_ids):
            raise RuntimeError('Container-Image-IDs nicht eindeutig; keine Bereinigung')
        protected_ids.update(image_ids)
    rows = run(['docker', 'image', 'ls', '--no-trunc', '--format', '{{.Repository}}\t{{.Tag}}\t{{.ID}}', repo]).splitlines()
    candidates = {}
    for row in rows:
        name, tag, iid = row.split('\t')
        if name != repo or not TAG.fullmatch(tag):
            continue
        if not IMAGE_ID.fullmatch(iid):
            raise RuntimeError('Image-ID nicht eindeutig; keine Bereinigung')
        ref = name + ':' + tag
        if ref in candidates and candidates[ref] != iid:
            raise RuntimeError('Image-Tag nicht eindeutig; keine Bereinigung')
        candidates[ref] = iid
    # Also preserve aliases of active/rollback images. Their exact refs are needed
    # by Compose even when there is currently no game container.
    for ref in protected_refs:
        if ref in candidates:
            protected_ids.add(candidates[ref])
    removed, warnings = [], []
    for ref, iid in sorted(candidates.items()):
        if ref in protected_refs or iid in protected_ids:
            continue
        try:
            # Re-check tag identity; Docker itself guards container references.
            if run(['docker', 'image', 'inspect', '--format', '{{.Id}}', ref]) != iid:
                warnings.append('Tag geaendert: ' + ref)
                continue
            run(['docker', 'image', 'rm', '--no-prune', ref])
            removed.append(ref)
        except Exception as exc:
            warnings.append(ref + ': ' + str(exc))
    return removed, warnings
