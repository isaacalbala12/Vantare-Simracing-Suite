"""A synthetic seed exercises the leak guard without reading any real key."""
import base64
import bz2
import contextlib
import gzip
import hashlib
import io
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import preflight_privado
from preflight_privado import CHUNK, PrivateMaterial, read_key, scan, signatures, verify_kit_zip

WINDOWS = sys.platform == "win32"


class PrivateMaterialTests(unittest.TestCase):
    def setUp(self):
        self.seed = bytes(range(32, 64))
        self.key = b"qa-a1b2c3d4" + self.seed
        self.patterns = signatures(self.key)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def test_private_file_renamed_in_package_is_rejected(self):
        package = self.root / "package"
        package.mkdir()
        (package / "datos.bin").write_bytes(self.key)
        with self.assertRaises(PrivateMaterial):
            scan(package, self.patterns)

    def test_measurement_zip_must_match_the_expected_hash(self):
        archive = self.root / "measurement.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
            output.writestr("manifiesto.json", '{"key_id":"qa-a1b2c3d4"}')
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        verify_kit_zip(archive, expected)
        with zipfile.ZipFile(archive, "a") as output:
            output.writestr("qa-license/example/random.txt", "innocent contents")
        with self.assertRaises(PrivateMaterial):
            verify_kit_zip(archive, expected)

    def test_container_signatures_reject_renamed_gzip_tar_7z_and_zip(self):
        tar = io.BytesIO()
        with tarfile.open(fileobj=tar, mode="w") as output:
            item = tarfile.TarInfo("payload")
            item.size = len(self.seed)
            output.addfile(item, io.BytesIO(self.seed))
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, "w") as output:
            output.writestr("payload", self.seed)
        outer = io.BytesIO()
        with zipfile.ZipFile(outer, "w") as output:
            output.writestr("renamed", inner.getvalue())
        for payload in (gzip.compress(self.seed), tar.getvalue(), b"7z\xbc\xaf\x27\x1c", outer.getvalue()):
            with self.subTest(magic=payload[:6]):
                renamed = self.root / "renamed.bin"
                renamed.write_bytes(payload)
                with self.assertRaisesRegex(PrivateMaterial, "Contenedor"):
                    scan(renamed, self.patterns)

    def test_uncompressed_reserved_folders_are_rejected(self):
        folder = self.root / "qa-license"
        folder.mkdir()
        (folder / "renamed.txt").write_text("not a key", encoding="ascii")
        with self.assertRaises(PrivateMaterial):
            scan(self.root, self.patterns)

    def test_base64_seed_at_each_offset_and_mime_break(self):
        log = self.root / "tanda.log"
        for offset in range(3):
            text = base64.b64encode(b"!" * (54 + offset) + self.seed + b"suffix")
            log.write_bytes(b"\r\n".join(text[index:index+76] for index in range(0, len(text), 76)))
            with self.subTest(offset=offset), self.assertRaises(PrivateMaterial):
                scan(log, self.patterns)

    def test_hex_separators_and_utf16(self):
        log = self.root / "tanda.log"
        values = [f"{byte:02x}" for byte in self.seed]
        for value in (" ".join(values), ",\n".join("0x" + byte for byte in values),
                      "\\x" + "\\x".join(values), self.seed.hex().upper()):
            for encoding in ("ascii", "utf-16-le"):
                log.write_bytes(value.encode(encoding))
                with self.subTest(encoding=encoding, prefix=value[:8]), self.assertRaises(PrivateMaterial):
                    scan(log, self.patterns)

    def test_clean_data_and_public_key_id_are_allowed(self):
        manifest = self.root / "manifiesto.json"
        manifest.write_text('{"key_id":"qa-a1b2c3d4","data":"foo 0x20\\\\x21"}', encoding="utf8")
        scan(self.root, self.patterns)

    def test_custody_read_rejects_evidence_and_trailing_newline(self):
        custody = self.root / "custodia" / "qa-license"
        custody.mkdir(parents=True)
        valid = custody / "qa-license.key"
        valid.write_bytes(self.key)
        evidence = self.root / "evidence"
        evidence.mkdir()
        outside = evidence / valid.name
        outside.write_bytes(self.key)
        with patch("preflight_privado.KEY_ROOT", custody):
            self.assertEqual(read_key(valid), self.key)
            with self.assertRaises(PrivateMaterial):
                read_key(outside)
            valid.write_bytes(self.key + b"\n")
            with self.assertRaises(PrivateMaterial):
                read_key(valid)

    def test_symbolic_link_is_rejected(self):
        target = self.root / "clean.txt"
        target.write_bytes(b"clean")
        alias = self.root / "alias.txt"
        try:
            alias.symlink_to(target)
        except OSError:
            self.skipTest("Symlink not available")
        with self.assertRaises(PrivateMaterial):
            scan(alias, self.patterns)

    def test_encoded_seed_crossing_read_boundary_in_log_is_rejected(self):
        log = self.root / "tanda.log"
        log.write_bytes(b" " * (CHUNK - 8) + base64.urlsafe_b64encode(self.seed).rstrip(b"="))
        with self.assertRaises(PrivateMaterial):
            scan(log, self.patterns)

    def test_file_that_grows_while_scanned_is_rejected(self):
        target = self.root / "datos.bin"
        target.write_bytes(b"contenido limpio " * 64)
        real_scan_stream = preflight_privado.scan_stream

        def grow_after_scan(stream, patterns):
            real_scan_stream(stream, patterns)
            with open(target, "ab") as extra:
                extra.write(b"x" * 32)

        with patch.object(preflight_privado, "scan_stream", grow_after_scan):
            with self.assertRaises(PrivateMaterial):
                scan(target, self.patterns)

    def test_zip_appended_between_hash_and_open_is_rejected(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        real_zip_file = zipfile.ZipFile

        def append_then_open(file, *args, **kwargs):
            # The same handle is reused, so only the before/after fstat can
            # detect that the verified bytes are no longer the consumed ones.
            with open(archive, "ab") as extra:
                extra.write(b"tampered after hashing")
            return real_zip_file(file, *args, **kwargs)

        with patch.object(preflight_privado.zipfile, "ZipFile", append_then_open):
            with self.assertRaisesRegex(PrivateMaterial, "cambió durante el preflight"):
                verify_kit_zip(archive, expected)

    def test_zip_replaced_in_place_between_hash_and_open_is_rejected(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, "w") as output:
            output.writestr("otro.bin", "otro contenido mucho mas largo " * 40)
        replacement = inner.getvalue()
        real_zip_file = zipfile.ZipFile

        def replace_then_open(file, *args, **kwargs):
            # Same path and same open handle, different valid ZIP inside.
            with open(archive, "r+b") as target:
                target.truncate(0)
                target.write(replacement)
            return real_zip_file(file, *args, **kwargs)

        with patch.object(preflight_privado.zipfile, "ZipFile", replace_then_open):
            with self.assertRaisesRegex(PrivateMaterial, "cambió durante el preflight"):
                verify_kit_zip(archive, expected)

    def test_scan_reverifies_the_approved_zip_before_skipping_it(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        approved = (archive.resolve(), expected)
        scan(archive, self.patterns, approved)
        with self.assertRaises(PrivateMaterial):
            scan(archive, self.patterns, (archive.resolve(), "0" * 64))

    def test_clean_file_without_alternate_streams_is_allowed(self):
        target = self.root / "datos.json"
        target.write_text('{"value":1}', encoding="utf8")
        scan(target, self.patterns)


class AlternateStreamTests(unittest.TestCase):
    """NTFS alternate data streams hide bytes from the regular scan."""

    def setUp(self):
        self.seed = bytes(range(32, 64))
        self.patterns = signatures(b"qa-a1b2c3d4" + self.seed)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def add_stream(self, path, name="oculto", payload="cualquier cosa que no es la clave"):
        try:
            with open(f"{path}:{name}", "w", encoding="ascii") as hidden:
                hidden.write(payload)
        except OSError as error:
            self.fail(f"El volumen temporal debe ser NTFS con soporte de ADS: {error}")

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_alternate_stream_in_staging_file_is_rejected(self):
        target = self.root / "datos.json"
        target.write_text('{"value":1}', encoding="utf8")
        self.add_stream(target)
        with self.assertRaises(PrivateMaterial):
            scan(target, self.patterns)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_alternate_stream_in_log_is_rejected(self):
        log = self.root / "tanda.log"
        log.write_text("linea limpia\n", encoding="utf8")
        self.add_stream(log, "evidencia")
        with self.assertRaises(PrivateMaterial):
            scan(log, self.patterns)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_alternate_stream_in_approved_zip_is_rejected(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.add_stream(archive)
        with self.assertRaises(PrivateMaterial):
            verify_kit_zip(archive, expected)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_alternate_stream_on_a_directory_is_rejected(self):
        folder = self.root / "evidencia"
        folder.mkdir()
        self.add_stream(folder)
        with self.assertRaises(PrivateMaterial):
            scan(folder, self.patterns)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_zone_identifier_on_the_approved_zip_is_allowed(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.add_stream(archive, "Zone.Identifier",
                        "[ZoneTransfer]\r\nZoneId=3\r\n" + "x" * 80)
        verify_kit_zip(archive, expected)
        scan(archive, self.patterns, (archive.resolve(), expected))

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_large_zone_identifier_on_the_approved_zip_is_rejected(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.add_stream(archive, "Zone.Identifier", "x" * 5000)
        with self.assertRaises(PrivateMaterial):
            verify_kit_zip(archive, expected)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_other_extra_stream_alongside_zone_identifier_is_rejected(self):
        archive = self.root / "kit.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
        expected = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.add_stream(archive, "Zone.Identifier", "[ZoneTransfer]\r\nZoneId=3\r\n")
        self.add_stream(archive, "oculto")
        with self.assertRaises(PrivateMaterial):
            verify_kit_zip(archive, expected)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_zone_identifier_on_a_staging_file_is_rejected(self):
        target = self.root / "datos.json"
        target.write_text('{"value":1}', encoding="utf8")
        self.add_stream(target, "Zone.Identifier", "[ZoneTransfer]\r\nZoneId=3\r\n")
        with self.assertRaises(PrivateMaterial):
            scan(target, self.patterns)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_tolerated_stream_enumeration_errors_do_not_block_the_scan(self):
        target = self.root / "datos.bin"
        target.write_bytes(b"limpio")
        invalid = preflight_privado._INVALID_HANDLE
        for code in (preflight_privado.ERROR_INVALID_FUNCTION,
                     preflight_privado.ERROR_FILE_NOT_FOUND,
                     preflight_privado.ERROR_PATH_NOT_FOUND,
                     preflight_privado.ERROR_HANDLE_EOF):
            with self.subTest(code=code), \
                    patch.object(preflight_privado, "_FIND_FIRST_STREAM", lambda *arguments: invalid), \
                    patch.object(preflight_privado.ctypes, "get_last_error", lambda: code):
                preflight_privado.reject_alternate_streams(target)

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_any_other_stream_enumeration_error_is_rejected(self):
        target = self.root / "datos.bin"
        target.write_bytes(b"limpio")
        invalid = preflight_privado._INVALID_HANDLE
        with patch.object(preflight_privado, "_FIND_FIRST_STREAM", lambda *arguments: invalid), \
                patch.object(preflight_privado.ctypes, "get_last_error", lambda: 5):
            with self.assertRaises(PrivateMaterial):
                preflight_privado.reject_alternate_streams(target)

    def test_plain_file_without_streams_passes(self):
        target = self.root / "datos.bin"
        target.write_bytes(b"limpio")
        scan(target, self.patterns)


class ShortSignatureTests(unittest.TestCase):
    """Short container signatures need a full header before rejecting a file."""

    def setUp(self):
        self.seed = bytes(range(32, 64))
        self.patterns = signatures(b"qa-a1b2c3d4" + self.seed)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def scan_bytes(self, payload):
        path = self.root / "renamed.bin"
        path.write_bytes(payload)
        scan(path, self.patterns)

    @staticmethod
    def newc_header(name=b"TRAILER!!!\0", size=0, upper=False):
        fields = (0, 0o100644, 0, 0, 1, 0, size, 0, 0, 0, 0, len(name), 0)
        digits = "08X" if upper else "08x"
        return (b"070701" + b"".join(f"{value:{digits}}".encode("ascii") for value in fields)
                + name)

    @staticmethod
    def cab_header():
        size = 36
        header = (b"MSCF" + b"\0" * 4 + size.to_bytes(4, "little") + b"\0" * 4
                  + size.to_bytes(4, "little"))
        return header + b"\0" * (size - len(header))

    def test_plain_text_starting_with_a_short_signature_is_allowed(self):
        for text in (b"BZh9: nota del operador\n", b"070701 encabezado no real\n",
                     b"MSCF nota de la tanda\n"):
            with self.subTest(prefix=text[:6]):
                self.scan_bytes(text)

    def test_plain_text_shorter_than_any_header_is_allowed(self):
        for text in (b"BZh", b"070701", b"MSCF"):
            with self.subTest(prefix=text):
                self.scan_bytes(text)

    def test_real_bzip2_cpio_and_cab_headers_are_rejected(self):
        payloads = {
            "bzip2": bz2.compress(b"payload" * 40),
            "cpio-newc": self.newc_header(),
            "cpio-newc-upper": self.newc_header(upper=True),
            "cab": self.cab_header(),
        }
        for name, payload in payloads.items():
            with self.subTest(container=name):
                with self.assertRaisesRegex(PrivateMaterial, "Contenedor"):
                    self.scan_bytes(payload)

    def test_uppercase_cpio_newc_header_is_recognized(self):
        header = self.newc_header(upper=True)
        self.assertTrue(preflight_privado.is_container(header, len(header)))

    def test_short_binary_without_a_valid_header_is_still_rejected(self):
        for payload in (b"BZh\x00\x02\x03", b"070701\x00\x01\x02", b"MSCF\x00\x01"):
            with self.subTest(prefix=payload[:6]):
                with self.assertRaises(PrivateMaterial):
                    self.scan_bytes(payload)

    def test_bzip2_with_an_invalid_level_is_not_a_container(self):
        self.scan_bytes(b"BZh0" + b"\x31\x41\x59\x26\x53\x59" + b"texto")


class ConsoleContractTests(unittest.TestCase):
    """The console only ever shows the verdict: no traceback, path or key bytes."""
    def setUp(self):
        self.seed = bytes(range(32, 64))
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        key_root = self.root / "custodia" / "qa-license"
        key_root.mkdir(parents=True)
        self.key_path = key_root / "qa-license.key"
        self.key_path.write_bytes(b"qa-a1b2c3d4" + self.seed)
        self.tree = self.root / "kit"
        self.tree.mkdir()
        (self.tree / "datos.json").write_text('{"value":1}', encoding="utf8")
        patcher = patch("preflight_privado.KEY_ROOT", key_root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def build_zip(self, path, contents="fake executable"):
        with zipfile.ZipFile(path, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", contents)
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def run_cli(self, zip_path, zip_hash):
        stdout, stderr = io.StringIO(), io.StringIO()
        arguments = ["preflight_privado.py", "--private-key", str(self.key_path),
                     "--kit-zip", str(zip_path), "--kit-zip-sha256", zip_hash, str(self.tree)]
        with patch.object(sys, "argv", arguments), contextlib.redirect_stdout(stdout), \
                contextlib.redirect_stderr(stderr):
            code = preflight_privado.main()
        return code, stdout.getvalue(), stderr.getvalue()

    def assert_failed_closed(self, code, stdout, stderr):
        self.assertEqual(code, 1)
        self.assertEqual(stderr.strip(), "QA_PRIVATE_PREFLIGHT_FAILED")
        self.assertNotIn("QA_PRIVATE_PREFLIGHT_OK", stdout)
        self.assertNotIn("Traceback", stderr)
        self.assertNotIn(str(self.root), stderr)

    def test_console_passes_with_the_approved_zip_and_tree(self):
        archive = self.root / "kit.zip"
        expected = self.build_zip(archive)
        code, stdout, stderr = self.run_cli(archive, expected)
        self.assertEqual(code, 0)
        self.assertIn("QA_PRIVATE_PREFLIGHT_OK", stdout)
        self.assertEqual(stderr, "")

    @unittest.skipUnless(WINDOWS, "NTFS alternate data streams need Windows")
    def test_console_fails_closed_on_an_alternate_stream_without_leaking_it(self):
        archive = self.root / "kit.zip"
        expected = self.build_zip(archive)
        log = self.tree / "tanda.log"
        log.write_text("linea limpia\n", encoding="utf8")
        try:
            with open(f"{log}:oculto", "w", encoding="ascii") as hidden:
                hidden.write("contenido oculto")
        except OSError as error:
            self.fail(f"El volumen temporal debe ser NTFS con soporte de ADS: {error}")
        code, stdout, stderr = self.run_cli(archive, expected)
        self.assert_failed_closed(code, stdout, stderr)
        self.assertNotIn("oculto", stderr)

    def test_console_fails_closed_without_a_usable_expected_hash(self):
        archive = self.root / "kit.zip"
        self.build_zip(archive)
        for value in ("", "0" * 64):
            with self.subTest(expected=value[:8]):
                self.assert_failed_closed(*self.run_cli(archive, value))

    def test_console_fails_closed_when_the_zip_is_replaced(self):
        archive = self.root / "kit.zip"
        expected = self.build_zip(archive)
        self.build_zip(archive, "another executable")
        self.assert_failed_closed(*self.run_cli(archive, expected))

    def test_missing_file_digest_on_old_python_reports_the_fixed_message(self):
        archive = self.root / "kit.zip"
        expected = self.build_zip(archive)
        error = AttributeError("module 'hashlib' has no attribute 'file_digest'")
        with patch("hashlib.file_digest", side_effect=error):
            code, stdout, stderr = self.run_cli(archive, expected)
        self.assert_failed_closed(code, stdout, stderr)
        self.assertNotIn("AttributeError", stderr)

    def test_unexpected_error_during_the_scan_reports_the_fixed_message(self):
        archive = self.root / "kit.zip"
        expected = self.build_zip(archive)
        with patch.object(preflight_privado, "signatures", side_effect=AttributeError("boom")):
            code, stdout, stderr = self.run_cli(archive, expected)
        self.assert_failed_closed(code, stdout, stderr)
        self.assertNotIn("boom", stderr)
