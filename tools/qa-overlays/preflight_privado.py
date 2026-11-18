"""Check transfers for the local QA private key without logging key material."""
import argparse
import base64
import os
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


CHUNK = 1024 * 1024
KEY_ROOT = Path("D:/VantareServer/evidence/overlays-rune/qa-license")
PRIVATE_NAMES = {"qa-license", "qa-license-cred", "qa-license.key"}


class PrivateMaterial(ValueError):
    pass


def signatures(raw):
    if len(raw) != 43 or not re.fullmatch(rb"qa-[0-9a-f]{8}", raw[:11]):
        raise PrivateMaterial("Formato de clave privada QA inválido")
    seed = raw[11:]
    forms = {raw, seed}
    for material in (raw, seed):
        hex_value = material.hex().encode("ascii")
        forms.update((hex_value, hex_value.upper(), base64.b64encode(material).rstrip(b"="),
                      base64.urlsafe_b64encode(material).rstrip(b"=")))
    return forms | {form.decode("ascii").encode("utf-16-le") for form in forms - {raw, seed}}


def check_name(name):
    parts = PurePosixPath(name.replace("\\", "/")).parts
    if any(part.casefold() in PRIVATE_NAMES for part in parts):
        raise PrivateMaterial("Ruta reservada para material QA privado")


def check_no_link(path):
    entry = path.lstat()
    if stat.S_ISLNK(entry.st_mode) or getattr(entry, "st_file_attributes", 0) & 0x400:
        raise PrivateMaterial("Enlace o reparse point en el preflight")


def scan_stream(stream, patterns):
    overlap = max(map(len, patterns)) - 1
    tail = b""
    while chunk := stream.read(CHUNK):
        data = tail + chunk
        if any(pattern in data for pattern in patterns):
            raise PrivateMaterial("Material de clave QA detectado")
        tail = data[-overlap:]


def scan(path, patterns):
    check_no_link(path)
    check_name(path.name)
    if path.is_dir():
        for child in path.iterdir():
            scan(child, patterns)
    elif path.is_file():
        with path.open("rb") as stream:
            scan_stream(stream, patterns)
        if path.suffix.casefold() == ".zip":
            with zipfile.ZipFile(path) as archive:
                for entry in archive.infolist():
                    check_name(entry.filename)
                    if stat.S_ISLNK(entry.external_attr >> 16):
                        raise PrivateMaterial("Enlace en el ZIP")
                    if not entry.is_dir():
                        with archive.open(entry) as stream:
                            scan_stream(stream, patterns)
    else:
        raise PrivateMaterial("Entrada no regular en el preflight")


def read_key(path):
    absolute = Path(os.path.abspath(path))
    if not absolute.is_relative_to(KEY_ROOT) or absolute.name != "qa-license.key":
        raise PrivateMaterial("Clave QA fuera de su árbol reservado")
    for component in (absolute, *absolute.parents):
        check_no_link(component)
    with absolute.open("rb") as source:
        return source.read(44)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-key", type=Path, required=True)
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    try:
        patterns = signatures(read_key(args.private_key))
        for path in args.paths:
            scan(path, patterns)
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile):
        # No exception text, path or matching bytes reach the console or logs.
        print("QA_PRIVATE_PREFLIGHT_FAILED", file=sys.stderr)
        return 1
    print("QA_PRIVATE_PREFLIGHT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
