import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("groups", Path(__file__).with_name("ci-groups.py"))
groups = importlib.util.module_from_spec(spec)
spec.loader.exec_module(groups)


class GroupsTest(unittest.TestCase):
    def test_real_workspace_is_partitioned(self):
        native = Path(__file__).resolve().parents[1]
        members = groups.workspace_members(native)
        groups.verify(members)
        covered = []
        for name in groups.GROUPS:
            covered.extend(groups.group_names(members, name))
        self.assertEqual(sorted(covered), sorted(package["name"] for package in members))
        self.assertEqual(len(covered), len(set(covered)))
        self.assertIn("vantare-runtime", groups.group_names(members, "core"))
        self.assertIn("vantare-ui", groups.group_names(members, "surface"))

    def test_group_filter_and_empty_group(self):
        members = [
            {"name": "vantare-ipc", "manifest_path": "D:/r/native/ipc/Cargo.toml"},
            {"name": "vantare-ui", "manifest_path": "D:/r/native/ui/Cargo.toml"},
        ]
        self.assertEqual(groups.group_names(members, "core"), ["vantare-ipc"])
        self.assertEqual(groups.group_names(members, "surface"), ["vantare-ui"])

    def test_cli_members_uses_group_flag(self):
        native = Path(__file__).resolve().parents[1]
        script = Path(__file__).with_name("ci-groups.py")
        core = subprocess.check_output(
            [sys.executable, str(script), "--group", "core", "--members"], cwd=native, text=True)
        self.assertIn("vantare-runtime", core)
        self.assertNotIn("vantare-ui", core)
        surface = subprocess.check_output(
            [sys.executable, str(script), "--group", "surface", "--members"], cwd=native, text=True)
        self.assertIn("vantare-ui", surface)
        self.assertNotIn("vantare-runtime", surface)

    def test_cli_members_without_group_lists_workspace(self):
        native = Path(__file__).resolve().parents[1]
        script = Path(__file__).with_name("ci-groups.py")
        listed = subprocess.check_output(
            [sys.executable, str(script), "--members"], cwd=native, text=True)
        self.assertIn("vantare-runtime", listed)
        self.assertIn("vantare-ui", listed)

    def test_unknown_member_fails_closed(self):
        members = [
            {"name": "vantare-ipc", "manifest_path": "D:/r/native/ipc/Cargo.toml"},
            {"name": "vantare-new", "manifest_path": "D:/r/native/new/Cargo.toml"},
        ]
        with self.assertRaisesRegex(ValueError, "faltan"):
            groups.verify(members)

    def test_duplicate_group_fails_closed(self):
        original = groups.GROUPS["surface"]
        try:
            groups.GROUPS["surface"] = original + ("ipc",)
            with self.assertRaisesRegex(ValueError, "grupos"):
                groups.verify([{"name": "vantare-ipc", "manifest_path": "D:/r/native/ipc/Cargo.toml"}])
        finally:
            groups.GROUPS["surface"] = original


if __name__ == "__main__":
    unittest.main()
