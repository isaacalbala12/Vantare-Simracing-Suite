import copy
from pathlib import Path
import unittest

from check_dependencies import ROOT, audit, permissive


class LicensesTest(unittest.TestCase):
    def test_permissive_choices_and_obligations(self):
        for expression in ("MIT", "MIT/Apache-2.0", "(MIT OR Apache-2.0) AND Unicode-3.0",
                           "Apache-2.0 WITH LLVM-exception", "MIT OR LGPL-2.1-or-later"):
            with self.subTest(expression=expression):
                self.assertTrue(permissive(expression))

    def test_copyleft_unknown_and_invalid_fail_closed(self):
        for expression in (None, "", "MPL-2.0", "MIT OR MPL-2.0", "GPL-3.0-only",
                           "MIT AND LGPL-2.1-or-later", "Unknown", "MIT WITH Unknown",
                           "MIT AND", "(MIT", "MIT )", "MIT;GPL", "MIT OR"):
            with self.subTest(expression=expression):
                self.assertFalse(permissive(expression))

    def test_audit_rejects_external_missing_license_and_runtime(self):
        package = {"name": "external", "version": "1", "license": None,
                   "source": "registry", "manifest_path": str(Path('/external/Cargo.toml'))}
        metadata = {"packages": [package], "resolve": {"nodes": []}}
        self.assertTrue(audit(metadata))
        package.update(name="vantare-runtime", license="MIT")
        self.assertTrue(audit(metadata))

    def test_first_party_exemption_is_limited_to_exact_paths(self):
        package = {"name": "vantare-hub-host", "version": "1", "license": None,
                   "source": None, "manifest_path": str(ROOT.parent / 'native/hub-host/Cargo.toml')}
        metadata = {"packages": [package], "resolve": {"nodes": []}}
        self.assertFalse(audit(metadata))
        external = copy.deepcopy(metadata)
        external["packages"][0]["source"] = "registry"
        self.assertTrue(audit(external))
        package["manifest_path"] = str(ROOT / 'unknown/Cargo.toml')
        self.assertTrue(audit(metadata))

    def test_audio_reactivation_is_rejected(self):
        metadata = {"packages": [], "resolve": {"nodes": [
            {"id": "git+https://github.com/anomalyco/rune?rev=abc#rune@0.0.1", "features": ["ogg-audio"]}
        ]}}
        self.assertTrue(audit(metadata))


if __name__ == "__main__":
    unittest.main()
