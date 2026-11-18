"""Check transfers for the local QA private key without logging key material."""
import argparse
import base64
import hashlib
import os
import re
import stat
import sys
from pathlib import Path, PurePosixPath


CHUNK = 1024 * 1024
KEY_ROOT = Path("D:/VantareServer/custodia/qa-license")
PRIVATE_NAMES = {"qa-license", "qa-license-cred", "qa-license.key"}
ZIP_MAGIC = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
CONTAINER_MAGIC = ZIP_MAGIC + (
    b"\x1f\x8b", b"7z\xbc\xaf\x27\x1c", b"Rar!\x1a\x07", b"BZh",
    b"\xfd7zXZ\x00", b"\x28\xb5\x2f\xfd", b"\x04\x22\x4d\x18",
    b"MSCF", b"!<arch>\n", b"070701", b"070702", b"070707", b"\x1f\x9d",
)
SPACE = b" \t\r\n\v\f"


class PrivateMaterial(ValueError):
    pass


def signatures(raw):
    if len(raw) != 43 or not re.fullmatch(rb"qa-[0-9a-f]{8}", raw[:11]):
        raise PrivateMaterial("Formato de clave privada QA inválido")
    seed = raw[11:]
    windows = set()
    for material in (raw, seed):
        for offset in range(3):
            # Keep only complete triples consisting entirely of key bytes.
            first = 4 if offset else 0
            last = (len(material) + offset) // 3 * 4
            window = base64.b64encode(b"\0" * offset + material)[first:last]
            windows.update((window, window.replace(b"+", b"-").replace(b"/", b"_")))
    return (raw, seed), windows, (raw.hex().encode("ascii"), seed.hex().encode("ascii"))


def check_name(name):
    parts = PurePosixPath(name.replace("\\", "/")).parts
    if any(part.casefold() in PRIVATE_NAMES for part in parts):
        raise PrivateMaterial("Ruta reservada para material QA privado")


def check_no_link(path):
    entry = path.lstat()
    if stat.S_ISLNK(entry.st_mode) or getattr(entry, "st_file_attributes", 0) & 0x400:
        raise PrivateMaterial("Enlace o reparse point en el preflight")


def scan_stream(stream, patterns):
    raw_forms, base64_windows, hex_forms = patterns
    tail = b""
    while chunk := stream.read(CHUNK):
        data = tail + chunk
        text = data.translate(None, SPACE + b"\x00")
        hex_text = text.lower().replace(b"0x", b"").replace(b"\\x", b"").translate(None, b",:-[]")
        if (any(pattern in data for pattern in raw_forms)
                or any(pattern in text for pattern in base64_windows)
                or any(pattern in hex_text for pattern in hex_forms)):
            raise PrivateMaterial("Material de clave QA detectado")
        tail = data[-4096:]


def is_container(header):
    if header.startswith(CONTAINER_MAGIC) or header[257:262] == b"ustar":
        return True
    if len(header) < 512 or not header[:100].split(b"\0", 1)[0]:
        return False
    # Legacy TAR has a checksum but no ustar marker.
    checksum = header[148:156].strip(b"\0 ")
    if not re.fullmatch(rb"[0-7]{5,7}", checksum):
        return False
    return int(checksum, 8) == sum(header[:148]) + 8 * 32 + sum(header[156:512])


def verify_kit_zip(path, expected):
    check_no_link(path)
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise PrivateMaterial("Se requiere el SHA-256 previamente verificado del ZIP")
    with path.open("rb") as stream:
        if not stream.read(4).startswith(ZIP_MAGIC):
            raise PrivateMaterial("Paquete sin firma ZIP")
        stream.seek(0)
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
            raise PrivateMaterial("El ZIP no coincide con el SHA-256 aprobado")


def scan(path, patterns, approved_zip=None):
    check_no_link(path)
    check_name(path.name)
    if path.is_dir():
        for child in path.iterdir():
            scan(child, patterns, approved_zip)
    elif path.is_file():
        if approved_zip is not None and path.resolve() == approved_zip:
            return
        with path.open("rb") as stream:
            if is_container(stream.read(512)):
                raise PrivateMaterial("Contenedor no permitido en el preflight")
            stream.seek(0)
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
        raw = source.read(44)
    if len(raw) != 43 or not re.fullmatch(rb"qa-[0-9a-f]{8}", raw[:11]):
        raise PrivateMaterial("Formato de clave privada QA inválido")
    return raw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-key", type=Path, required=True)
    parser.add_argument("--kit-zip", type=Path, required=True)
    parser.add_argument("--kit-zip-sha256", required=True)
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    try:
        verify_kit_zip(args.kit_zip, args.kit_zip_sha256)
        approved_zip = args.kit_zip.resolve()
        patterns = signatures(read_key(args.private_key))
        for path in args.paths:
            scan(path, patterns, approved_zip)
    except (OSError, RuntimeError, ValueError):
        # No exception text, path or matching bytes reach the console or logs.
        print("QA_PRIVATE_PREFLIGHT_FAILED", file=sys.stderr)
        return 1
    print("QA_PRIVATE_PREFLIGHT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
