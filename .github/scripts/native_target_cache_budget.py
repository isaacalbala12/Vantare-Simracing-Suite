"""Bound one hosted compiler target cache; never cache QA data or test archives."""
import argparse
import json
import os
from pathlib import Path


LIMIT_BYTES = 2 * 1024 ** 3


def is_link(path):
    return path.is_symlink() or getattr(path, 'is_junction', lambda: False)()


def budget(target, limit=LIMIT_BYTES):
    target = Path(target)
    debug = target / 'debug'
    if is_link(target) or is_link(debug):
        return {'save': False, 'bytes': 0, 'limit': limit, 'reason': 'cache root is a link'}
    if not debug.is_dir() or not (debug / '.cargo-lock').is_file():
        return {'save': False, 'bytes': 0, 'limit': limit, 'reason': 'no Cargo debug cache'}
    total = 0
    for directory, dirs, files in os.walk(debug, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            if is_link(path):
                return {'save': False, 'bytes': total, 'limit': limit, 'reason': 'cache contains links'}
        for name in files:
            total += (Path(directory) / name).stat().st_size
    for name in ('.rustc_info.json', '.vantare-workspace', 'CACHEDIR.TAG'):
        path = target / name
        if is_link(path):
            return {'save': False, 'bytes': total, 'limit': limit, 'reason': 'cache marker is a link'}
        if path.is_file():
            total += path.stat().st_size
    return {'save': 0 < total <= limit, 'bytes': total, 'limit': limit, 'reason': 'bounded debug cache'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    result = budget(args.target)
    print(json.dumps(result))
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        output.write('save=' + str(result['save']).lower() + '\n')
