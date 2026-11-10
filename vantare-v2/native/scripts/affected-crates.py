"""Select changed workspace crates and every reverse dependent; unknown scope is full."""
import argparse
import json
from pathlib import Path
import subprocess


def changed_crates(packages, paths):
    """None means global/unknown inputs; a set means known crate paths only."""
    roots = {
        Path(package['manifest_path']).parent.name: package['name']
        for package in packages
    }
    changed = set()
    for path in paths:
        parts = path.replace('\\', '/').split('/')
        if parts[:2] != ['vantare-v2', 'native']:
            # Workflow and build tooling outside native may change any gate.
            if path.startswith('vantare-v2/docs/') or path.endswith('.md'):
                continue
            return None
        if path.endswith(('Cargo.toml', 'Cargo.lock')) or parts[2:4] in [['hub', 'assets'], ['hub', 'reference']]:
            return None
        if len(parts) < 4 or parts[2] not in roots:
            return None
        changed.add(roots[parts[2]])
    return changed


def select(packages, paths, transitive=True, include_optional=True):
    names = {package['name'] for package in packages}
    changed = changed_crates(packages, paths)
    if changed is None:
        return sorted(names)
    while True:
        reverse = {
            package['name'] for package in packages
            if any(dep['name'] in changed and (include_optional or not dep.get('optional', False))
                   for dep in package['dependencies'])
        }
        # This test contract crosses a process boundary, so Cargo has no edge for it.
        if 'vantare-ui' in changed:
            reverse |= names & {'vantare-runtime'}
        if 'vantare-storage' in changed:
            reverse |= names & {'vantare-hub'}
        expanded = changed | reverse
        if expanded == changed or not transitive:
            return sorted(expanded)
        changed = expanded


def installation_affected(paths):
    # Release/installation controls run on every integration push. A PR changing
    # only leaf view code cannot change packaging, trust, installer or root launch.
    # Leaf Rust source changes use selected gates; full packaging remains on
    # every integration push and whenever installer/launch/build inputs change.
    leaves = {'strategy', 'engineer', 'storage'}
    for path in paths:
        if path.endswith('.md'):
            continue
        parts = path.replace('\\', '/').split('/')
        if len(parts) >= 5 and parts[:2] == ['vantare-v2', 'native']:
            if parts[2] in leaves and parts[3] in {'src', 'tests', 'benches'}:
                continue
        return True
    return False


def overlays_affected(paths):
    # These current leaf crates cannot change Runtime/UI. Manifests, new paths,
    # and every integration push remain conservative. The archive's actual scope
    # independently requires the UI artifact when Runtime was selected.
    independent = {'engineer', 'strategy', 'storage', 'hub', 'admin'}
    for path in paths:
        if path.endswith('.md'):
            continue
        parts = path.replace('\\', '/').split('/')
        if len(parts) >= 5 and parts[:2] == ['vantare-v2', 'native'] and parts[2] in independent and parts[3] in {'src', 'tests', 'benches'}:
            continue
        return True
    return False


LEGACY = {'vantare-hub', 'vantare-admin'}


def select_for_crate(packages, crate):
    names = {p['name'] for p in packages}
    if crate not in names:
        raise ValueError(f'Crate desconocido: {crate}')
    if crate in LEGACY:
        raise ValueError('Hub y Admin están fuera del camino rápido; usar su validación explícita.')
    package = next(p for p in packages if p['name'] == crate)
    directory = Path(package['manifest_path']).parent.name
    selected = select(packages, [f'vantare-v2/native/{directory}/src/lib.rs'],
                      transitive=False, include_optional=False)
    return sorted(set(selected) - LEGACY)


def select_for_ci(packages, paths, fast=False):
    selected = select(packages, paths)
    if changed_crates(packages, paths) is None:
        return selected
    legacy_changed = any(path.replace('\\', '/').startswith(
        ('vantare-v2/native/hub/', 'vantare-v2/native/admin/')) for path in paths)
    return sorted(set(selected) - LEGACY) if fast and not legacy_changed else selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base')
    parser.add_argument('--crate')
    parser.add_argument('--installation', action='store_true')
    parser.add_argument('--overlays', action='store_true')
    parser.add_argument('--fast', action='store_true', help='Exclude frozen Hub/Admin for non-legacy PRs')
    args = parser.parse_args()
    native = Path(__file__).resolve().parents[1]
    paths = []
    if args.base:
        paths = subprocess.check_output(
            ['git', 'diff', '--name-only', '--no-renames', '-z', args.base, 'HEAD'],
            cwd=native).decode('utf-8').strip('\0').split('\0')
        paths = [path for path in paths if path]
    elif not args.crate:
        parser.error('--base o --crate requerido')
    if args.installation or args.overlays:
        decision = overlays_affected(paths) if args.overlays else installation_affected(paths)
        print('true' if decision else 'false')
        return
    metadata = json.loads(subprocess.check_output(
        ['cargo', 'metadata', '--locked', '--offline', '--no-deps', '--format-version', '1'],
        cwd=native))
    members = [p for p in metadata['packages'] if p['id'] in metadata['workspace_members']]
    if args.crate:
        print(','.join(select_for_crate(members, args.crate)))
    else:
        print(','.join(select_for_ci(members, paths, args.fast)))


if __name__ == '__main__':
    main()
