"""A synthetic seed exercises the leak guard without reading any real key."""
import base64
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
