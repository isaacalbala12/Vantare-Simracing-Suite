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

    def write_live_fixture(self, root: Path) -> None:
        router = "\n".join(sorted(VALIDATE_DOCS.HANDOFFS))
        self.write(root, "docs/README.md", router)
        self.write(root, "docs/current-plan.md", "Estado retirado\n")
        headings = "\n".join(
            [
                "## Resultado y fronteras",
                "## Autoridad técnica",
                "## Estado técnico actual",
                "## Decisiones cerradas",
                "## Riesgos y bloqueos",
                "## Recomendación técnica",
                "## Evidencia",
                "## Historial",
            ]
        )
        for name in VALIDATE_DOCS.HANDOFFS:
            self.write(root, f"docs/vantare-program/handoffs/{name}", headings)

    def test_duplicate_adr_id_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            header = "# ADR 0001: test\n\n- Estado: aceptado\n- Fecha: 2026-08-11\n"
            self.write(root, "docs/adr/0001-one.md", header)
            self.write(root, "docs/adr/0001-two.md", header)

            errors = VALIDATE_DOCS.validate_adrs(root)

            self.assertTrue(any("duplicate ADR ID 0001" in error for error in errors))

    def test_adr_missing_from_index_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/adr/README.md", "# Index\n")
            self.write(
                root,
                "docs/adr/0001-one.md",
                "# ADR 0001: test\n\n- Estado: aceptado\n- Fecha: 2026-08-11\n",
            )

            errors = VALIDATE_DOCS.validate_adrs(root)

            self.assertTrue(any("missing from docs/adr/README.md" in error for error in errors))

    def test_plan_marker_must_be_on_first_screen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/superpowers/plans/example.md", "# Plan\n")

            errors = VALIDATE_DOCS.validate_plans(root)

            self.assertTrue(any("plan needs one" in error for error in errors))

    def test_plan_cannot_hide_active_marker_below_first_screen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lines = [
                "> **Plan status: conditional**",
                *["context" for _ in range(12)],
                "> **Plan status: active**",
            ]
            self.write(root, "docs/superpowers/plans/example.md", "\n".join(lines))

            errors = VALIDATE_DOCS.validate_plans(root)

            self.assertTrue(any("active status" in error for error in errors))

    def test_nested_plan_requires_marker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/superpowers/plans/nested/example.md", "# Plan\n")

            errors = VALIDATE_DOCS.validate_plans(root)

            self.assertTrue(any("nested" in error for error in errors))

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

    def test_broken_image_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/README.md", "![](missing.png)\n")

            errors = VALIDATE_DOCS.validate_links(root)

            self.assertTrue(any("broken local link" in error for error in errors))

    def test_inline_code_link_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/README.md", "`[example](missing.md)`\n")

            self.assertEqual([], VALIDATE_DOCS.validate_links(root))

    def test_nested_routed_contract_is_validated(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/README.md", "[core](telemetry-core/)\n")
            self.write(root, "docs/telemetry-core/README.md", "[bad](missing.md)\n")

            errors = VALIDATE_DOCS.validate_links(root)

            self.assertTrue(any("missing.md" in error for error in errors))

    def test_missing_anchor_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write(root, "docs/README.md", "[section](target.md#missing)\n")
            self.write(root, "docs/target.md", "# Existing\n")

            errors = VALIDATE_DOCS.validate_links(root)

            self.assertTrue(any("broken local anchor" in error for error in errors))

    def test_live_handoff_line_limit_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_live_fixture(root)
            path = root / "docs/vantare-program/handoffs/telemetry-core.md"
            path.write_text(
                path.read_text(encoding="utf-8")
                + "\n"
                + "\n".join("extra" for _ in range(151)),
                encoding="utf-8",
            )

            errors = VALIDATE_DOCS.validate_live_docs(root)

            self.assertTrue(any("exceeds 150 lines" in error for error in errors))

    def test_live_handoff_requires_closed_decisions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_live_fixture(root)
            path = root / "docs/vantare-program/handoffs/telemetry-core.md"
            path.write_text(
                path.read_text(encoding="utf-8").replace("## Decisiones cerradas\n", ""),
                encoding="utf-8",
            )

            errors = VALIDATE_DOCS.validate_live_docs(root)

            self.assertTrue(any("Decisiones cerradas" in error for error in errors))

    def test_archived_handoff_requires_authority_banner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_live_fixture(root)
            self.write(
                root,
                "docs/archive/2026-08/handoffs/core-through-2026-08-10.md",
                "# Snapshot without banner\n",
            )

            errors = VALIDATE_DOCS.validate_live_docs(root)

            self.assertTrue(any("lacks authority banner" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
