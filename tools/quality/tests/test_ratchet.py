#!/usr/bin/env python3
"""Tests unitarios de la logica de identidad/ratchet (sin ejecutar analizadores).

Estilo coherente con .github/scripts/test_*.py (unittest). Ejecutar:
    python3 -B tools/quality/tests/test_ratchet.py
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vantare_quality import (  # noqa: E402
    Finding,
    classify_findings,
    content_hash,
    msg_norm,
    norm_path,
    REPO_ROOT,
)


def F(analyzer, rule, path, msg_norm="", symbol="", content_hash=""):
    return Finding(
        analyzer=analyzer, rule=rule, path=path,
        msg_norm=msg_norm, symbol=symbol, content_hash=content_hash,
    )


class NormTests(unittest.TestCase):
    def test_msg_norm_lowercases_and_preserves_digits(self):
        # F7: NO elimina digitos; a veces distinguen simbolos distintos.
        self.assertEqual(msg_norm("Error X has 42 items, line 7"), "error x has 42 items, line 7")

    def test_msg_norm_collapses_whitespace(self):
        self.assertEqual(msg_norm("a   b\t\nc"), "a b c")

    def test_msg_norm_empty(self):
        self.assertEqual(msg_norm(""), "")

    def test_content_hash_collapses_whitespace_and_trims(self):
        h1 = content_hash("  a   b  \n c ")
        h2 = content_hash("a b c")
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

    def test_norm_path_relative_posix(self):
        self.assertEqual(norm_path("vantare-v2/frontend/src/main.tsx", REPO_ROOT),
                         "vantare-v2/frontend/src/main.tsx")

    def test_norm_path_absolute(self):
        p = str(REPO_ROOT / "vantare-v2" / "foo.go")
        self.assertEqual(norm_path(p, REPO_ROOT), "vantare-v2/foo.go")


class IdentityTests(unittest.TestCase):
    def test_staticcheck_identity_ignores_line(self):
        # Mismo code+path+msg_norm aunque la linea/columna difieran (no entran en identidad).
        a = F("staticcheck", "SA1019", "a.go", msg_norm="foo deprecated")
        b = F("staticcheck", "SA1019", "a.go", msg_norm="foo deprecated")
        self.assertEqual(a.identity(), b.identity())

    def test_staticcheck_identity_differs_by_msg(self):
        a = F("staticcheck", "SA1019", "a.go", msg_norm="foo deprecated")
        b = F("staticcheck", "SA1019", "a.go", msg_norm="bar deprecated")
        self.assertNotEqual(a.identity(), b.identity())

    def test_govet_identity_rule_is_vet(self):
        f = F("govet", "whatever", "a.go", msg_norm="x")
        self.assertEqual(f.identity(), ("govet", "vet", "a.go", "x"))

    def test_deadcode_identity_uses_symbol(self):
        a = F("deadcode", "deadcode", "a.go", symbol="Foo")
        b = F("deadcode", "deadcode", "a.go", symbol="Foo")
        self.assertEqual(a.identity(), b.identity())
        c = F("deadcode", "deadcode", "a.go", symbol="Bar")
        self.assertNotEqual(a.identity(), c.identity())

    def test_knip_identity_uses_symbol(self):
        a = F("knip", "unused", "a.ts", symbol="x")
        b = F("knip", "unused", "a.ts", symbol="x")
        self.assertEqual(a.identity(), b.identity())

    def test_jscpd_identity_uses_content_hash(self):
        a = F("jscpd", "duplication", "a.ts", content_hash="h1")
        b = F("jscpd", "duplication", "a.ts", content_hash="h1")
        self.assertEqual(a.identity(), b.identity())
        c = F("jscpd", "duplication", "a.ts", content_hash="h2")
        self.assertNotEqual(a.identity(), c.identity())


class ClassifyTests(unittest.TestCase):
    def test_new_resolved_basic(self):
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        actual = [F("staticcheck", "SA1019", "b.go", msg_norm="y")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(len(c.resolved), 1)
        self.assertEqual(len(c.moved), 0)

    def test_no_change_passes(self):
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        actual = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 0)
        self.assertEqual(len(c.resolved), 0)
        self.assertEqual(len(c.moved), 0)

    def test_moved_reclassifies_new_as_moved(self):
        # Mismo rule + msg_norm, distinto path -> MOVED, no NEW.
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="deprecated foo")]
        actual = [F("staticcheck", "SA1019", "b.go", msg_norm="deprecated foo")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 0)
        self.assertEqual(len(c.moved), 1)
        self.assertEqual(len(c.resolved), 1)

    def test_moved_by_symbol(self):
        base = [F("deadcode", "deadcode", "a.go", symbol="Foo")]
        actual = [F("deadcode", "deadcode", "b.go", symbol="Foo")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 0)
        self.assertEqual(len(c.moved), 1)

    def test_moved_still_listed_not_silenced(self):
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        actual = [F("staticcheck", "SA1019", "b.go", msg_norm="x")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.moved), 1)
        self.assertEqual(c.moved[0].path, "b.go")

    def test_eliminate_old_introduce_new_still_fails(self):
        # Eliminar A e introducir B (misma regla, distinto path, distinto msg) -> NEW bloqueante.
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="foo")]
        actual = [F("staticcheck", "SA1019", "b.go", msg_norm="bar")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(len(c.new_blocking), 1)
        self.assertEqual(len(c.resolved), 1)
        self.assertEqual(len(c.moved), 0)

    def test_total_count_unchanged_still_fails(self):
        # Recuento identico (1 vs 1) pero identidad distinta -> NEW bloqueante.
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="foo")]
        actual = [F("staticcheck", "SA1019", "a.go", msg_norm="bar")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(len(c.new_blocking), 1)

    def test_jscpd_third_copy_is_new(self):
        # Una duplicacion conocida (par A,B) gana una TERCERA copia C -> C es NEW.
        ch = content_hash("duplicated block")
        base = [
            F("jscpd", "duplication", "a.ts", content_hash=ch),
            F("jscpd", "duplication", "b.ts", content_hash=ch),
        ]
        actual = [
            F("jscpd", "duplication", "a.ts", content_hash=ch),
            F("jscpd", "duplication", "b.ts", content_hash=ch),
            F("jscpd", "duplication", "c.ts", content_hash=ch),
        ]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(c.new[0].path, "c.ts")
        self.assertEqual(len(c.resolved), 0)
        self.assertEqual(len(c.moved), 0)

    def test_jscpd_pair_unchanged_no_new(self):
        ch = content_hash("duplicated block")
        base = [
            F("jscpd", "duplication", "a.ts", content_hash=ch),
            F("jscpd", "duplication", "b.ts", content_hash=ch),
        ]
        actual = list(base)
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 0)

    def test_new_blocking_filters_informative(self):
        # deadcode es informativo: un NEW de deadcode no es bloqueante.
        base = []
        actual = [F("deadcode", "deadcode", "a.go", symbol="Foo")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(len(c.new_blocking), 0)

    def test_empty_baseline_all_new(self):
        base = []
        actual = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1)
        self.assertEqual(len(c.new_blocking), 1)

    def test_empty_actual_all_resolved(self):
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        actual = []
        c = classify_findings(base, actual)
        self.assertEqual(len(c.resolved), 1)
        self.assertEqual(len(c.new), 0)

    def test_moved_requires_different_path(self):
        # Mismo path no es MOVED (es la misma identidad -> no new).
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        actual = [F("staticcheck", "SA1019", "a.go", msg_norm="x")]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.moved), 0)
        self.assertEqual(len(c.new), 0)

    def test_go_mod_tidy_identity_by_module(self):
        a = F("go-mod-tidy", "tidy-diff", "vantare-v2", msg_norm="diff")
        b = F("go-mod-tidy", "tidy-diff", "vantare-v2", msg_norm="diff")
        self.assertEqual(a.identity(), b.identity())
        c = F("go-mod-tidy", "tidy-diff", "vantare-v2/tools/vantare-telemetry-reader", msg_norm="diff")
        self.assertNotEqual(a.identity(), c.identity())


class MultisetTests(unittest.TestCase):
    """F7: semantica de MULTICONJUNTO. Una segunda aparicion de la misma
    identidad en el mismo archivo es NEW, no se absorbe."""

    def test_second_copy_same_file_same_identity_is_new(self):
        # jscpd: dos copias del mismo fragmento en a.ts. Baseline tiene 1, actual 2.
        ch = content_hash("duplicated block")
        base = [F("jscpd", "duplication", "a.ts", content_hash=ch)]
        actual = [
            F("jscpd", "duplication", "a.ts", content_hash=ch),
            F("jscpd", "duplication", "a.ts", content_hash=ch),
        ]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1, "la segunda aparicion en el mismo archivo debe ser NEW")
        self.assertEqual(c.new[0].path, "a.ts")
        self.assertEqual(len(c.resolved), 0)
        self.assertEqual(len(c.moved), 0)

    def test_second_staticcheck_same_file_same_rule_is_new(self):
        # staticcheck: otra aparicion del mismo code+msg en el mismo archivo.
        base = [F("staticcheck", "SA1019", "a.go", msg_norm="foo deprecated")]
        actual = [
            F("staticcheck", "SA1019", "a.go", msg_norm="foo deprecated"),
            F("staticcheck", "SA1019", "a.go", msg_norm="foo deprecated"),
        ]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.new), 1, "la segunda aparicion debe ser NEW por multiconjunto")
        self.assertEqual(len(c.new_blocking), 1)

    def test_count_decrease_is_resolved(self):
        # 3 copias en baseline, 1 en actual -> 2 RESOLVED.
        ch = content_hash("block")
        base = [F("jscpd", "duplication", "a.ts", content_hash=ch) for _ in range(3)]
        actual = [F("jscpd", "duplication", "a.ts", content_hash=ch)]
        c = classify_findings(base, actual)
        self.assertEqual(len(c.resolved), 2)
        self.assertEqual(len(c.new), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
