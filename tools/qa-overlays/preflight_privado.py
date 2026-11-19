"""Check transfers for the local QA private key without logging key material."""
import argparse
import base64
import ctypes
import hashlib
import os
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


CHUNK = 1024 * 1024
KEY_ROOT = Path("D:/VantareServer/custodia/qa-license")
PRIVATE_NAMES = {"qa-license", "qa-license-cred", "qa-license.key"}
ZIP_MAGIC = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
# Magics whose header needs no extra check before refusing the file.
CONTAINER_MAGIC = ZIP_MAGIC + (
    b"\x1f\x8b", b"7z\xbc\xaf\x27\x1c", b"Rar!\x1a\x07",
    b"\xfd7zXZ\x00", b"\x28\xb5\x2f\xfd", b"\x04\x22\x4d\x18",
    b"!<arch>\n", b"070707", b"\x1f\x9d",
)
# Short signatures also start ordinary text, so they need their real header:
# bzip2 block/end magic, cpio newc hex fields and the cabinet sizes.
BZIP2_BLOCK_MAGIC = b"\x31\x41\x59\x26\x53\x59"
BZIP2_END_MAGIC = b"\x17\x72\x45\x38\x50\x90"
CPIO_NEWC_MAGIC = (b"070701", b"070702")
CPIO_NEWC_HEADER = 110
CPIO_MIN_FIELDS = 8
CAB_HEADER = 36
SPACE = b" \t\r\n\v\f"

WINDOWS = sys.platform == "win32"
ERROR_INVALID_FUNCTION = 1
ERROR_FILE_NOT_FOUND = 2
ERROR_PATH_NOT_FOUND = 3
ERROR_HANDLE_EOF = 38
STREAM_INFO_STANDARD = 0
DEFAULT_STREAM = "::$data"
# Browser downloads on Windows add this mark to the downloaded file. It is
# tolerated only on the approved kit ZIP, as its only extra stream and small.
ZONE_IDENTIFIER_STREAM = ":zone.identifier:$data"
ZONE_IDENTIFIER_LIMIT = 1024


if WINDOWS:
    from ctypes import wintypes

    class _FindStreamData(ctypes.Structure):
        _fields_ = [("stream_size", ctypes.c_longlong),
                    ("stream_name", ctypes.c_wchar * (260 + 36))]

    _KERNEL32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _FIND_FIRST_STREAM = _KERNEL32.FindFirstStreamW
    _FIND_FIRST_STREAM.argtypes = (wintypes.LPCWSTR, ctypes.c_int,
                                   ctypes.c_void_p, wintypes.DWORD)
    _FIND_FIRST_STREAM.restype = wintypes.HANDLE
    _FIND_NEXT_STREAM = _KERNEL32.FindNextStreamW
    _FIND_NEXT_STREAM.argtypes = (wintypes.HANDLE, ctypes.c_void_p)
    _FIND_NEXT_STREAM.restype = wintypes.BOOL
    _FIND_CLOSE = _KERNEL32.FindClose
    _FIND_CLOSE.argtypes = (wintypes.HANDLE,)
    _FIND_CLOSE.restype = wintypes.BOOL
    _INVALID_HANDLE = ctypes.c_void_p(-1).value


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


def _api_path(path):
    absolute = os.path.abspath(str(path))
    if absolute.startswith("\\\\?\\"):
        return absolute
    if absolute.startswith("\\\\"):
        return "\\\\?\\UNC\\" + absolute[2:]
    return "\\\\?\\" + absolute


def reject_alternate_streams(path, allow_zone_identifier=False):
    """Any NTFS stream other than the default one hides data from the scan.

    The approved kit ZIP may carry the browser download mark
    (:Zone.Identifier) as its only extra stream and under 1 KiB; its size is
    read from the enumeration and its content is never opened. A volume that
    cannot store streams has nothing to hide, and a missing file fails on the
    later open.
    """
    if not WINDOWS:
        return
    data = _FindStreamData()
    handle = _FIND_FIRST_STREAM(_api_path(path), STREAM_INFO_STANDARD,
                                ctypes.byref(data), 0)
    if handle == _INVALID_HANDLE:
        error = ctypes.get_last_error()
        if error in (ERROR_INVALID_FUNCTION, ERROR_FILE_NOT_FOUND,
                     ERROR_PATH_NOT_FOUND, ERROR_HANDLE_EOF):
            return
        raise PrivateMaterial("No se pudieron enumerar los streams del preflight")
    zone_identifier = False
    try:
        while True:
            name = data.stream_name.casefold()
            if name == DEFAULT_STREAM:
                pass
            elif (allow_zone_identifier and name == ZONE_IDENTIFIER_STREAM
                  and not zone_identifier
                  and data.stream_size <= ZONE_IDENTIFIER_LIMIT):
                zone_identifier = True
            else:
                raise PrivateMaterial("Stream alternativo en el preflight")
            if not _FIND_NEXT_STREAM(handle, ctypes.byref(data)):
                if ctypes.get_last_error() == ERROR_HANDLE_EOF:
                    return
                raise PrivateMaterial("No se pudieron enumerar los streams del preflight")
    finally:
        _FIND_CLOSE(handle)


def open_checked(path):
    """Open once and check the regular type of that same handle.

    Linking itself is rejected beforehand by check_no_link; a swap through a
    link between that check and this open is a declared residual.
    """
    stream = path.open("rb")
    try:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise PrivateMaterial("Entrada no regular en el preflight")
    except Exception:
        stream.close()
        raise
    return stream


def _snapshot(stream):
    entry = os.fstat(stream.fileno())
    return entry.st_size, entry.st_mtime_ns


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


def _plain_text(header):
    return all(byte in b"\t\n\r\v\f" or 0x20 <= byte < 0x7F for byte in header)


def _short_signature(header, size):
    """True: valid container; False: plain text; None: no short signature.

    Anything invalid that is not plain printable text stays rejected: a
    corrupt or truncated container is still suspicious.
    """
    if header.startswith(b"BZh"):
        valid = (len(header) >= 10 and header[3:4] in b"123456789"
                 and header[4:10] in (BZIP2_BLOCK_MAGIC, BZIP2_END_MAGIC))
        return valid or not _plain_text(header)
    if header.startswith(CPIO_NEWC_MAGIC):
        body = header[6:min(len(header), CPIO_NEWC_HEADER)]
        complete = len(body) - len(body) % 8
        valid = (complete >= CPIO_MIN_FIELDS * 8
                 and all(re.fullmatch(rb"[0-9a-fA-F]{8}", body[start:start + 8])
                         for start in range(0, complete, 8)))
        return valid or not _plain_text(header)
    if header.startswith(b"MSCF"):
        valid = len(header) >= CAB_HEADER and header[4:8] == b"\0\0\0\0"
        if valid:
            cabinet = int.from_bytes(header[8:12], "little")
            files = int.from_bytes(header[16:20], "little")
            valid = (cabinet >= CAB_HEADER and CAB_HEADER <= files <= cabinet
                     and (size is None or cabinet == size))
        return valid or not _plain_text(header)
    return None


def is_container(header, size=None):
    if header.startswith(ZIP_MAGIC) or header[257:262] == b"ustar":
        return True
    verdict = _short_signature(header, size)
    if verdict is not None:
        return verdict
    if header.startswith(CONTAINER_MAGIC):
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
    reject_alternate_streams(path, allow_zone_identifier=True)
    # One handle for the whole verification: the bytes hashed and parsed as a
    # ZIP are the ones of this same file object.
    with open_checked(path) as stream:
        before = _snapshot(stream)
        if not stream.read(4).startswith(ZIP_MAGIC):
            raise PrivateMaterial("Paquete sin firma ZIP")
        stream.seek(0)
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
            raise PrivateMaterial("El ZIP no coincide con el SHA-256 aprobado")
        stream.seek(0)
        try:
            with zipfile.ZipFile(stream):
                pass
        except Exception as error:
            raise PrivateMaterial("Paquete sin firma ZIP") from error
        if _snapshot(stream) != before:
            raise PrivateMaterial("El paquete cambió durante el preflight")


def scan(path, patterns, approved_zip=None):
    """approved_zip is the (resolved path, sha256) of the approved kit ZIP."""
    check_no_link(path)
    check_name(path.name)
    if path.is_dir():
        reject_alternate_streams(path)
        for child in path.iterdir():
            scan(child, patterns, approved_zip)
    elif path.is_file():
        if approved_zip is not None and path.resolve() == approved_zip[0]:
            # Skipping the package only after checking it again keeps the
            # hash and size of the file on disk tied to the receipt.
            verify_kit_zip(path, approved_zip[1])
            return
        reject_alternate_streams(path)
        with open_checked(path) as stream:
            before = _snapshot(stream)
            if is_container(stream.read(512), before[0]):
                raise PrivateMaterial("Contenedor no permitido en el preflight")
            stream.seek(0)
            scan_stream(stream, patterns)
            if _snapshot(stream) != before:
                raise PrivateMaterial("El fichero cambió durante el preflight")
    else:
        raise PrivateMaterial("Entrada no regular en el preflight")


def read_key(path):
    absolute = Path(os.path.abspath(path))
    if not absolute.is_relative_to(KEY_ROOT) or absolute.name != "qa-license.key":
        raise PrivateMaterial("Clave QA fuera de su árbol reservado")
    for component in (absolute, *absolute.parents):
        check_no_link(component)
    with open_checked(absolute) as source:
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
        approved_zip = (args.kit_zip.resolve(), args.kit_zip_sha256)
        patterns = signatures(read_key(args.private_key))
        for path in args.paths:
            scan(path, patterns, approved_zip)
    except Exception:
        # Any failure, expected (ValueError/OSError) or not (for example
        # AttributeError when hashlib.file_digest needs Python 3.11), keeps the
        # fixed verdict: no exception text, path or matching bytes reach the
        # console or logs, and no traceback is printed.
        print("QA_PRIVATE_PREFLIGHT_FAILED", file=sys.stderr)
        return 1
    print("QA_PRIVATE_PREFLIGHT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
