#!/usr/bin/env python3
"""Optional CC0 bedroom assets, independent of required assets and existing layers."""
import argparse
import json
import shutil
from pathlib import Path
try:
    from .download_assets import Builder
except ImportError:
    from download_assets import Builder

DECOR = {'bed': 'vintage_day_bed', 'nightstand': 'painted_wooden_nightstand'}


def extend(root, fetch=None):
    root = Path(root)
    manifest = json.loads((root / 'manifest.json').read_text('utf-8'))
    b = Builder(root, fetch) if fetch else Builder(root)
    prefixes = [f'1k/models/{slug}/' for slug in DECOR.values()]
    b.records = [r for r in manifest['files'] if not any(r['file'].startswith(p) for p in prefixes)]
    b.total = sum(r['bytes'] for r in b.records)
    manifest['decor_models'] = {}
    status = manifest.setdefault('realism_status', {})
    for key, slug in DECOR.items():
        folder = root / '1k' / 'models' / slug
        shutil.rmtree(folder, ignore_errors=True)
        old_count, old_total = len(b.records), b.total
        try:
            manifest['decor_models'][key] = b.model(slug, b.meta(slug), '1k')
            status[key] = 'downloaded'
        except Exception as e:
            shutil.rmtree(folder, ignore_errors=True)
            b.records = b.records[:old_count]
            b.total = old_total
            b.cache = {k:v for k,v in b.cache.items() if v.is_file()}
            status[key] = 'unavailable'
            print(f'Optionales Schlafzimmer-Asset {key}: {e}; lokale Geometrie bleibt aktiv.', flush=True)
    b.write_manifest(manifest)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    extend(parser.parse_args().output)
