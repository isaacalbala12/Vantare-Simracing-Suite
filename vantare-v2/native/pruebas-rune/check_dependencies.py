"""Reuse the Hub Rune dependency policy for the isolated measurement workspace."""
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hub_rune_dependency_policy', ROOT.parents[1]/'hub-rune/scripts/check_dependencies.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def main():
    metadata = json.loads(subprocess.check_output([
        'cargo', '+1.99.1', 'metadata', '--locked', '--format-version', '1',
        '--manifest-path', str(ROOT/'Cargo.toml')], text=True, encoding='utf-8'))
    local = {ROOT/crate/'Cargo.toml' for crate in ('hola', 'contador', 'relative', 'inicio')}
    local |= {ROOT/'fuentes-generadas/gpui/vantare-v2/native'/crate/'Cargo.toml'
              for crate in ('domain', 'ipc', 'profiling')}
    errors = policy.audit(metadata, first_party=local)
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f"PASS: {len(metadata['packages'])} packages; shared Hub Rune license policy")


if __name__ == '__main__':
    main()
