#!/usr/bin/env python3
"""Optional visual upgrades. Core room assets remain mandatory and separate."""
import argparse
import json
import shutil
from pathlib import Path
from download_assets import Builder, QUALITIES, file_entry

PROPS = {'pistol': 'service_pistol', 'rifle': 'bolt_action_rifle_7_62'}
OUTSIDE = 'residential_garden'

def extend(root, fetch=None):
    root = Path(root)
    manifest = json.loads((root / 'manifest.json').read_text('utf-8'))
    builder = Builder(root, fetch) if fetch else Builder(root)
    builder.records = list(manifest['files'])
    builder.total = sum(r['bytes'] for r in builder.records)
    manifest['outside'] = None
    manifest['prop_models'] = {q: {} for q in QUALITIES}
    manifest['realism_status'] = {}
    def attempt(key, folder, fn):
        old_count, old_bytes = len(builder.records), builder.total
        try:
            result = fn()
            manifest['realism_status'][key] = 'downloaded'
            return result
        except Exception as exc:
            # Optional media must never make the base game unbuildable.
            # Remove all partial outputs and any cache references into them.
            shutil.rmtree(root / folder, ignore_errors=True)
            builder.records = builder.records[:old_count]
            builder.total = old_bytes
            builder.cache = {k:v for k,v in builder.cache.items() if v.is_file()}
            manifest['realism_status'][key] = 'unavailable'
            print(f'WARNUNG: Optionales Asset {key}: {exc}', flush=True)
            return None
    def outside():
        entry, _ = file_entry(builder.meta(OUTSIDE), ('hdri',), '2k', ('hdr',), slug=OUTSIDE)
        return builder.save(entry, 'outside/residential_garden.hdr')
    manifest['outside'] = attempt('outside', 'outside', outside)
    for id, slug in PROPS.items():
        # Use one verified 1K model on both profiles to limit VR memory consumption.
        def model():
            return builder.model(slug, builder.meta(slug), '1k')
        path = attempt(id, f'1k/models/{slug}', model)
        if path:
            for q in QUALITIES: manifest['prop_models'][q][id] = path
    builder.write_manifest(manifest)
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    extend(parser.parse_args().output)
