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
    # hub-web (Electron) no es producto nativo, pero hub-host compila y prueba su
    # contrato generado, sus fixtures y los tokens de diseño: un cambio ahí sí
    # activa hub-host y sus dependientes. El resto de hub-web no toca Rust.
    hub_web_prefix = 'vantare-v2/hub-web/'
    hub_web_host_inputs = (
        'vantare-v2/hub-web/src/contract/',
        'vantare-v2/hub-web/fixtures/',
        'vantare-v2/hub-web/design/tokens.json',
        'vantare-v2/hub-web/scripts/contract-index.ts',
    )
    hub_web_host = next(
        (package['name'] for package in packages if package['name'] == 'vantare-hub-host'), None)
    changed = set()
    for path in paths:
        normalized = path.replace('\\', '/')
        if normalized.startswith(hub_web_prefix):
            if not normalized.startswith(hub_web_host_inputs):
                continue
            if hub_web_host is None:
                return None
            changed.add(hub_web_host)
            continue
        parts = normalized.split('/')
        if parts[:2] != ['vantare-v2', 'native']:
            # Workflow and build tooling outside native may change any gate.
            if normalized.startswith('vantare-v2/docs/') or normalized.endswith('.md'):
                continue
            return None
        if normalized.endswith(('Cargo.toml', 'Cargo.lock')) or parts[2:4] in [['hub', 'assets'], ['hub', 'reference']]:
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
    # Hub también lee fixtures de hub-web en sus tests: si cambian, no puede
    # perder sus tests por el filtro rápido de legacy.
    legacy_changed = any(path.replace('\\', '/').startswith(
        ('vantare-v2/native/hub/', 'vantare-v2/native/admin/',
         'vantare-v2/hub-web/fixtures/')) for path in paths)
    return sorted(set(selected) - LEGACY) if fast and not legacy_changed else selected


def select_legacy_checks(packages, paths):
    """Typecheck legacy consumers omitted from fast tests, including bridges."""
    full = set(select(packages, paths))
    fast = set(select_for_ci(packages, paths, fast=True))
    return sorted((full - fast) & LEGACY)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base')
    parser.add_argument('--crate')
    parser.add_argument('--installation', action='store_true')
    parser.add_argument('--overlays', action='store_true')
    parser.add_argument('--fast', action='store_true', help='Exclude frozen Hub/Admin for non-legacy PRs')
    parser.add_argument('--legacy-check', action='store_true', help='Legacy consumers requiring check, without tests')
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
    if args.legacy_check:
        if not args.base:
            parser.error('--legacy-check exige --base')
        print(','.join(select_legacy_checks(members, paths)))
    elif args.crate:
        print(','.join(select_for_crate(members, args.crate)))
    else:
        print(','.join(select_for_ci(members, paths, args.fast)))


if __name__ == '__main__':
    main()
