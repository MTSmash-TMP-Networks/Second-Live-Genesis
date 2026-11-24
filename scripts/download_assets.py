#!/usr/bin/env python3
"""Fetch required CC0 room assets and optional inventory photos."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen

API = 'https://api.polyhaven.com/files/'
AGENT = 'SecondLive-WorldGenesis/0.6 (asset-build)'
TEXTURES = ('wooden_floor_01', 'white_plaster_02', 'oak_veneer_01', 'rough_linen')
MODELS = ('sofa_02', 'modern_coffee_table_01', 'modern_arm_chair_01', 'wooden_table_02')
HDRIS = ('lebombo', 'kiara_interior', 'brown_photostudio_04')
QUALITIES = ('1k', '2k')
MAPS = {'color': ('Diffuse', 'diff', 'albedo', 'base_color', 'basecolor', 'color'), 'normal': ('nor_gl', 'normal_gl'), 'roughness': ('Rough', 'roughness')}
HOSTS = {'api.polyhaven.com', 'dl.polyhaven.org', 'dl.polyhaven.com', 'cdn.polyhaven.com'}
PHOTOS = {
    'pistol': ('https://upload.wikimedia.org/wikipedia/commons/0/02/Kel-Tec_PF-9.png', 'png', 'Jchance', 'https://commons.wikimedia.org/wiki/File:Kel-Tec_PF-9.png'),
    'rifle': ('https://upload.wikimedia.org/wikipedia/commons/a/a8/Vahan2.JPG', 'jpg', 'Manasian (edited by Hohum)', 'https://commons.wikimedia.org/wiki/File:Vahan2.JPG'),
}
HOSTS.add('upload.wikimedia.org')
SURFACE_HI = {'wooden_floor_01', 'white_plaster_02'}
MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024


def checked_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None,443):
        raise ValueError(f'Nicht erlaubte Asset-URL: {url}')
    return url


def safe_rel(value):
    value = unquote(value)
    p = PurePosixPath(value)
    if not value or p.is_absolute() or any(x in ('..', '.') for x in value.split('/')) or not re.fullmatch(r'[A-Za-z0-9_./-]+', value):
        raise ValueError(f'Unsicherer Asset-Pfad: {value}')
    return p


def request_bytes(url, limit):
    checked_url(url)
    is_photo = urlsplit(url).hostname == 'upload.wikimedia.org'
    # Optional requests are attempted once; never retry a rate limit during a build.
    attempts = 1 if is_photo else 3
    contact = os.environ.get('SECOND_LIVE_WIKIMEDIA_CONTACT', '').strip()
    agent = f'{AGENT} ({contact})' if is_photo and contact else AGENT
    for attempt in range(attempts):
        try:
            with urlopen(Request(url, headers={'User-Agent': agent}), timeout=15 if is_photo else 90) as r:
                checked_url(r.geturl())
                data = r.read(limit + 1)
                if len(data) > limit:
                    raise ValueError(f'Datei zu gross: {url}')
                return data
        except HTTPError as e:
            if e.code == 429 or is_photo:
                raise
            if attempt == attempts - 1:
                raise RuntimeError(f'Download fehlgeschlagen: {url}: {e}') from e
            time.sleep(2 ** attempt)
        except (OSError, TimeoutError) as e:
            if attempt == attempts - 1:
                raise RuntimeError(f'Download fehlgeschlagen: {url}: {e}') from e
            time.sleep(2 ** attempt)


def matching_values(mapping, key):
    """Prefer the exact API key; also accept case variants at each level."""
    if not isinstance(mapping, dict):
        return
    if key in mapping:
        yield mapping[key]
    for name, value in mapping.items():
        if isinstance(name, str) and name != key and name.casefold() == key.casefold():
            yield value


def file_entry(meta, keys, quality, formats, *, slug='unbekannt'):
    available = []
    for key in keys:
        for component in matching_values(meta, key):
            if not isinstance(component, dict):
                continue
            available.append(f'{key}: {", ".join(str(k) for k in component)}')
            for resolution in matching_values(component, quality):
                for fmt in formats:
                    for item in matching_values(resolution, fmt):
                        if isinstance(item, dict) and isinstance(item.get('url'), str) and item['url']:
                            return item, fmt
    api_keys = ', '.join(str(k) for k in meta) if isinstance(meta, dict) else type(meta).__name__
    details = '; '.join(available) or 'keine passende Komponente'
    raise ValueError(f'Asset {slug}: Keine Datei fuer {keys}, {quality}, {formats}. '
                     f'API-Schluessel: {api_keys}. Aufloesungen: {details}')


class Builder:
    def __init__(self, root, fetch=request_bytes):
        self.root = Path(root)
        self.fetch = fetch
        self.records = []
        self.total = 0
        self.cache = {}

    def meta(self, slug):
        meta = json.loads(self.fetch(API + slug, 4 * 1024 * 1024))
        if not isinstance(meta, dict) or not meta:
            raise ValueError(f'Asset {slug}: unerwartete oder leere API-Antwort')
        return meta

    def save(self, entry, rel):
        rel = safe_rel(str(rel)); target = self.root / rel
        url = checked_url(entry['url'])
        size = int(entry['size']); md5 = str(entry['md5']).lower()
        if not 0 < size <= MAX_FILE or not re.fullmatch('[a-f0-9]{32}', md5) or self.total + size > MAX_TOTAL:
            raise ValueError(f'Ungueltige Dateimetadaten: {url}')
        target.parent.mkdir(parents=True, exist_ok=True)
        if (url, md5) in self.cache:
            shutil.copyfile(self.cache[(url, md5)], target)
        else:
            data = self.fetch(url, size)
            if len(data) != size or hashlib.md5(data).hexdigest() != md5:
                raise ValueError(f'Pruefsumme oder Dateigroesse falsch: {url}')
            target.write_bytes(data)
            self.cache[(url, md5)] = target
        self.total += size
        self.records.append({'file': str(rel), 'url': url, 'bytes': size, 'md5': md5, 'license': 'CC0-1.0'})
        return '/' + 'assets/polyhaven/' + str(rel)

    def texture(self, slug, meta, quality):
        result = {}
        resolutions = ('4k', quality) if quality == '2k' and slug in SURFACE_HI else (quality,)
        for name, keys in MAPS.items():
            choices = resolutions if name in ('color', 'normal') else (quality,)
            for res in choices:
                try: entry, fmt = file_entry(meta, keys, res, ('jpg', 'jpeg', 'png'), slug=slug)
                except ValueError:
                    if res == choices[-1]: raise
                else: break
            result[name] = self.save(entry, f'{quality}/textures/{slug}/{name}.{fmt}')
        # AO is optional for older assets, but use the original map when provided.
        for res in (quality,):
            try: entry, fmt = file_entry(meta, ('AO', 'ambient_occlusion'), res, ('jpg', 'jpeg', 'png'), slug=slug)
            except ValueError: continue
            result['ao'] = self.save(entry, f'{quality}/textures/{slug}/ao.{fmt}'); break
        return result

    def photo(self, key, source, local=None):
        url, fmt, author, page = source
        limit = 16 * 1024 * 1024
        if local is not None:
            with Path(local).open('rb') as f:
                data = f.read(limit + 1)
        else:
            data = self.fetch(checked_url(url), limit)
        if len(data) > limit:
            raise ValueError('Originalfoto zu gross: '+key)
        valid = data.startswith(b'\x89PNG\r\n\x1a\n') if fmt == 'png' else data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9')
        if not valid or len(data) < 128 or self.total + len(data) > MAX_TOTAL:
            raise ValueError('Ungueltiges Originalfoto: '+key)
        rel = f'photos/{key}.{fmt}'; target = self.root / rel; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        self.total += len(data)
        self.records.append({'file':rel,'url':url,'bytes':len(data),'md5':hashlib.md5(data).hexdigest(),'sha256':hashlib.sha256(data).hexdigest(),'license':'Public domain' if local is None else 'Local file: source/license not independently verified','author':author if local is None else None,'source':page,'origin':'download' if local is None else 'local'})
        return '/assets/polyhaven/'+rel

    def model(self, slug, meta, quality):
        entry, _ = file_entry(meta, ('gltf',), quality, ('gltf',), slug=slug)
        base = f'{quality}/models/{slug}'
        path = self.save(entry, f'{base}/model.gltf')
        includes = entry.get('include') or {}
        if not isinstance(includes, dict):
            raise ValueError(f'Ungueltige glTF-Abhaengigkeiten: {slug}')
        doc = json.loads((self.root / base / 'model.gltf').read_text('utf-8'))
        if doc.get('asset', {}).get('version') != '2.0':
            raise ValueError(f'glTF 2.0 erforderlich: {slug}')
        # Only download the actual local dependencies referenced by glTF.
        for uri in sorted({x['uri'] for k in ('buffers', 'images') for x in doc.get(k, []) if 'uri' in x and not x['uri'].startswith('data:')}):
            rel = str(safe_rel(uri))
            dep = includes.get(uri) or includes.get(rel)
            if not dep:
                raise ValueError(f'Fehlende glTF-Abhaengigkeit: {slug}: {uri}')
            if Path(rel).suffix.lower() not in ('.bin', '.jpg', '.jpeg', '.png', '.webp'):
                raise ValueError(f'Nicht unterstuetzte glTF-Datei: {uri}')
            self.save(dep, f'{base}/{rel}')
        unsupported = set(doc.get('extensionsRequired', [])) & {'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'}
        if unsupported:
            raise ValueError(f'Komprimiertes glTF braucht weitere Decoder: {unsupported}')
        return path

    def build(self, *, core_only=False):
        manifest = {'version': 1, 'provider': 'Poly Haven', 'license': 'CC0-1.0', 'profiles': {q: {'textures': {}, 'models': {}} for q in QUALITIES}, 'lighting': {}}
        for slug in TEXTURES:
            print('Material:', slug, flush=True)
            meta = self.meta(slug)
            for q in QUALITIES:
                manifest['profiles'][q]['textures'][slug] = self.texture(slug, meta, q)
        for slug in MODELS:
            print('Modell:', slug, flush=True)
            meta = self.meta(slug)
            for q in QUALITIES:
                manifest['profiles'][q]['models'][slug] = self.model(slug, meta, q)
        for slug in HDRIS:
            print('Licht:', slug, flush=True)
            entry, _ = file_entry(self.meta(slug), ('hdri',), '1k', ('hdr',), slug=slug)
            manifest['lighting'][slug] = self.save(entry, f'lighting/{slug}.hdr')
        manifest['photos'] = {}
        manifest['photo_status'] = {key: 'not_requested' for key in PHOTOS}
        self.write_manifest(manifest)
        return manifest if core_only else self.add_photos(manifest)

    def write_manifest(self, manifest):
        manifest['files'] = self.records
        manifest['bytes'] = self.total
        temp = self.root / '.manifest.tmp'
        temp.write_text(json.dumps(manifest, indent=2), 'utf-8')
        temp.replace(self.root / 'manifest.json')
        print(f'{len(self.records)} Dateien, {self.total / 1048576:.1f} MiB lokal gespeichert.', flush=True)

    def add_photos(self, manifest, local_dir=None):
        # Room assets are already complete and verified in a separate build layer.
        self.records = [r for r in manifest['files'] if not r['file'].startswith('photos/')]
        self.total = sum(r['bytes'] for r in self.records)
        manifest['photos'] = {}
        manifest['photo_status'] = {}
        rate_limited = False
        for key, source in PHOTOS.items():
            local = Path(local_dir) / f'{key}.{source[1]}' if local_dir else None
            if local is not None and not local.exists(): local = None
            if rate_limited and local is None:
                manifest['photo_status'][key] = 'skipped_rate_limit'
                print(f'WARNUNG: {key}: Wikimedia-Limit aktiv, keine weitere Anfrage. 3D-Ersatzmodell.', flush=True)
                continue
            print('Inventarfoto:', key, '(lokal)' if local is not None else '(optional)', flush=True)
            try:
                manifest['photos'][key] = self.photo(key, source, local)
                manifest['photo_status'][key] = 'local' if local is not None else 'downloaded'
            except (OSError, RuntimeError, ValueError) as exc:
                if isinstance(exc, HTTPError) and exc.code == 429:
                    rate_limited = True
                    retry = exc.headers.get('Retry-After') if exc.headers else None
                    if retry: print(f'Wikimedia Retry-After: {retry}; keine Wiederholung in diesem Build.', flush=True)
                    manifest['photo_status'][key] = 'rate_limited'
                else:
                    manifest['photo_status'][key] = 'unavailable'
                print(f'WARNUNG: Optionales Inventarfoto {key} fehlt: {exc}. 3D-Ersatzmodell bleibt aktiv.', flush=True)
        self.write_manifest(manifest)
        return manifest


def main():
    p = argparse.ArgumentParser(); p.add_argument('--output', type=Path, default=Path('web/assets/polyhaven'))
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--core-only', action='store_true')
    mode.add_argument('--photos-only', action='store_true')
    p.add_argument('--local-photos', type=Path)
    args = p.parse_args()
    output = args.output.resolve(); output.parent.mkdir(parents=True, exist_ok=True)
    if args.photos_only:
        manifest = json.loads((output / 'manifest.json').read_text('utf-8'))
        Builder(output).add_photos(manifest, args.local_photos)
        return
    # Publish only a complete set. Existing good assets survive failed downloads.
    with tempfile.TemporaryDirectory(prefix='.polyhaven-', dir=output.parent) as tmp:
        stage = Path(tmp) / 'assets'; stage.mkdir(); builder = Builder(stage)
        manifest = builder.build(core_only=True)
        if not args.core_only: builder.add_photos(manifest, args.local_photos)
        old = Path(tmp) / 'previous'
        if output.exists(): output.rename(old)
        try: stage.rename(output)
        except Exception:
            if old.exists(): old.rename(output)
            raise


if __name__ == '__main__':
    main()
