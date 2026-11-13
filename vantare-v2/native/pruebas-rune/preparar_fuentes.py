"""Materializa fuentes fijadas y aplica parches solo dentro del banco de medición."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import stat

BENCH = Path(__file__).resolve().parent
REPO = BENCH.parents[2]


def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)


def check_destination(destination):
    allowed = BENCH.resolve()/'fuentes-generadas'
    if not destination.resolve().is_relative_to(allowed):
        raise ValueError('Los parches solo se aplican dentro de fuentes-generadas')
    for path in (BENCH/'fuentes-generadas', destination):
        if path.exists() and (path.is_symlink() or getattr(path.lstat(), 'st_file_attributes', 0)
                              & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            raise ValueError('La copia de medición no admite enlaces o junctions')


def verify(destination, recipe):
    tree = git('ls-tree', '-rz', recipe['source'], '--', *recipe['archive_paths'])
    for record in tree.split(b'\0'):
        if not record:
            continue
        info, name = record.split(b'\t', 1)
        if name.startswith(b'vantare-v2/native/pruebas-rune/'):
            continue
        mode, kind, expected = info.split()
        if kind != b'blob' or mode not in (b'100644', b'100755'):
            raise ValueError('Las fuentes deben ser archivos normales')
        path = destination/name.decode('utf-8')
        if path.is_symlink() or not path.resolve().is_relative_to(destination.resolve()) or not path.is_file():
            raise ValueError('Falta un archivo de la fuente fijada: '+str(path))
        digest = hashlib.sha1(b'blob '+str(path.stat().st_size).encode()+b'\0')
        with path.open('rb') as stream:
            while chunk := stream.read(1024*1024):
                digest.update(chunk)
        if digest.hexdigest().encode() != expected:
            raise ValueError('Se modificó la copia de medición: '+str(path))


def prepare(variant):
    recipes = json.loads((BENCH/'fuentes-medicion.json').read_text(encoding='utf-8'))
    recipe = recipes['variants'][variant]
    destination = BENCH/'fuentes-generadas'/variant
    check_destination(destination)
    marker = destination/'FUENTE.json'
    patch = BENCH/recipe['patch']
    if hashlib.sha256(patch.read_bytes()).hexdigest() != recipe['patch_sha256']:
        raise ValueError('Cambió el parche; actualizar su procedencia antes de aplicarlo')
    if destination.exists():
        if not marker.is_file() or json.loads(marker.read_text(encoding='utf-8')) != recipe:
            raise ValueError('Conservar fuentes anteriores; el destino no coincide o quedó incompleto')
        verify(destination, recipe)
        return destination/'vantare-v2'
    paths = recipe['archive_paths']
    tracked = git('ls-tree', '-r', '--name-only', recipe['base'], '--', *paths).decode().splitlines()
    if any(PurePosixPath(path).name.startswith('.env') for path in tracked):
        raise ValueError('El archivo de fuentes contendría .env: no se lee ni copia')
    archive = git('archive', '--format=tar', recipe['base'], '--', *paths,
                  ':(exclude)vantare-v2/native/pruebas-rune')
    destination.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        if any(member.issym() or member.islnk() for member in source.getmembers()):
            raise ValueError('El archivo de fuentes no admite enlaces')
        source.extractall(destination, filter='data')
    prefix = destination.relative_to(REPO).as_posix()
    for options in (['--check'], []):
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', *options, '--directory='+prefix, str(patch)],
                       cwd=REPO, check=True)
    verify(destination, recipe)
    marker.write_text(json.dumps(recipe, indent=2)+'\n', encoding='utf-8')
    return destination/'vantare-v2'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('variant', choices=('gpui', 'gpui-fast', 'hub-fast', 'electron'))
    print(prepare(parser.parse_args().variant))
