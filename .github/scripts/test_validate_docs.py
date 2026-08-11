#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("validate_docs.py")
SPEC = importlib.util.spec_from_file_location("validate_docs", MODULE_PATH)
assert SPEC and SPEC.loader
VALIDATE_DOCS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATE_DOCS)


class ValidateDocsTest(unittest.TestCase):
    def write(self, root: Path, relative: str, content: str) -> Path:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def test_duplicate_adr_id_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            header = "# ADR 0001: test\n\n- Estado: aceptado\n- Fecha: 2026-08-11\n"
            self.write(root, "docs/adr/0001-one.md", header)
            self.write(root, "docs/adr/0001-two.md", header)

            errors = VALIDATE_DOCS.validate_adrs(root)

            self.assertTrue(any("duplicate ADR ID 0001" in error for error in errors))

    def test_plan_marker_must_be_on_first_screen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/superpowers/plans/example.md", "# Plan\n")

            errors = VALIDATE_DOCS.validate_plans(root)

            self.assertEqual(1, len(errors))
            self.assertIn("plan needs one", errors[0])

    def test_broken_live_link_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/README.md", "[missing](missing.md)\n")

            errors = VALIDATE_DOCS.validate_links(root)

            self.assertTrue(any("broken local link" in error for error in errors))

    def test_code_fence_link_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/README.md", "```md\n[example](missing.md)\n```\n")

            self.assertEqual([], VALIDATE_DOCS.validate_links(root))

    def test_live_handoff_line_limit_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            router = "\n".join(sorted(VALIDATE_DOCS.HANDOFFS))
            self.write(root, "docs/README.md", router)
            self.write(root, "docs/current-plan.md", "Estado retirado\n")
            headings = "\n".join(sorted(VALIDATE_DOCS.HANDOFF_HEADINGS))
            for name in VALIDATE_DOCS.HANDOFFS:
                body = headings
                if name == "telemetry-core.md":
                    body += "\n" + "\n".join("extra" for _ in range(151))
                self.write(root, f"docs/vantare-program/handoffs/{name}", body)

            errors = VALIDATE_DOCS.validate_live_docs(root)

            self.assertTrue(any("exceeds 150 lines" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
