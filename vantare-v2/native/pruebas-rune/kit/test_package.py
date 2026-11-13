import tempfile
import unittest
from pathlib import Path

from package import contains_marker, relative_name


class PackageIntegrityTests(unittest.TestCase):
    def test_windows_aliases_and_zip_traversal_are_rejected(self):
        for name in (".", "../afuera", "/raiz", "C:/target", "bin\\app.exe", "bin//app.exe",
                     "bin/./app.exe", "bin/NUL.exe", "bin/COM1", "bin/final.", "bin/final "):
            with self.subTest(name=name), self.assertRaises(ValueError):
                relative_name(name)
        self.assertEqual(relative_name("bin/hub-electron/resources/app.asar"),
                         "bin/hub-electron/resources/app.asar")

    def test_provenance_is_found_across_read_boundaries_and_in_windows_resources(self):
        marker = "3633964e03eebbd72ffa2540bc325b9dad008002"
        with tempfile.TemporaryDirectory(prefix="vanta141-package-") as folder:
            path = Path(folder) / "synthetic.bin"
            path.write_bytes(b"x" * (1024 * 1024 - 13) + marker.encode("ascii") + b"tail")
            self.assertTrue(contains_marker(path, marker))
            self.assertFalse(contains_marker(path, "a" * 40))
            path.write_bytes(b"resource" + marker.encode("utf-16-le"))
            self.assertTrue(contains_marker(path, marker))


if __name__ == "__main__":
    unittest.main()
