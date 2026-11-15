import unittest

from overlays_rune_scope import needs_rune


class RuneScopeTests(unittest.TestCase):
    def test_workspace_shared_dependencies_and_build_inputs_run(self):
        for directory in ("overlays-rune", "domain", "ipc", "profiling"):
            for filename in ("Cargo.toml", "src/deleted.rs"):
                with self.subTest(directory=directory, filename=filename):
                    self.assertTrue(needs_rune([f"vantare-v2/native/{directory}/{filename}"]))
        for path in ("vantare-v2/native/Cargo.toml", "vantare-v2/native/.cargo/config.toml",
                     ".github/workflows/overlays-rune.yml"):
            self.assertTrue(needs_rune([path]))

    def test_unrelated_work_does_not_build_rune(self):
        self.assertFalse(needs_rune(["vantare-v2/hub-web/src/app.tsx", "AGENTS.md",
                                    "vantare-v2/native/ui/src/lib.rs"]))

    def test_empty_or_ambiguous_diff_runs(self):
        for paths in ([], [""], ["../outside"], ["C:/outside"], ["a", "A"], ["a\\b"]):
            self.assertTrue(needs_rune(paths))


if __name__ == "__main__":
    unittest.main()
