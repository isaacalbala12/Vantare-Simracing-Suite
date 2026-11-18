"""A synthetic seed exercises the leak guard without reading any real key."""
import base64
import tempfile
import unittest
import zipfile
from pathlib import Path

from preflight_privado import CHUNK, PrivateMaterial, scan, signatures


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

    def test_measurement_zip_keeps_key_directory_out(self):
        archive = self.root / "measurement.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("bin/vantare-qa-license.exe", "fake executable")
            output.writestr("manifiesto.json", '{"key_id":"qa-a1b2c3d4"}')
        scan(archive, self.patterns)
        with zipfile.ZipFile(archive, "a") as output:
            output.writestr("qa-license/example/random.txt", "innocent contents")
        with self.assertRaises(PrivateMaterial):
            scan(archive, self.patterns)

    def test_encoded_seed_crossing_read_boundary_in_log_is_rejected(self):
        log = self.root / "tanda.log"
        log.write_bytes(b" " * (CHUNK - 8) + base64.urlsafe_b64encode(self.seed).rstrip(b"="))
        with self.assertRaises(PrivateMaterial):
            scan(log, self.patterns)
