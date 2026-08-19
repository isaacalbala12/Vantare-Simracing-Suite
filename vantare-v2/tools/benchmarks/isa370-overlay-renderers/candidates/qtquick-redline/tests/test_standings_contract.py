from pathlib import Path
import re
import unittest


CANDIDATE = Path(__file__).resolve().parents[1]


class StandingsRedlineContractTest(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        path = CANDIDATE / relative_path
        self.assertTrue(path.is_file(), f"missing QML contract: {relative_path}")
        return path.read_text(encoding="utf-8")

    def test_component_surface_is_complete(self) -> None:
        expected = (
            "qml/theme/RedlineTokens.qml",
            "qml/common/Panel.qml",
            "qml/common/Status.qml",
            "qml/standings/FastestGlyph.qml",
            "qml/standings/StandingsRow.qml",
            "qml/standings/Battle.qml",
            "qml/standings/ClassBlock.qml",
            "qml/standings/StandingsRedline.qml",
        )
        for relative_path in expected:
            with self.subTest(relative_path=relative_path):
                self.read(relative_path)

    def test_tokens_match_the_productive_redline_contract(self) -> None:
        source = self.read("qml/theme/RedlineTokens.qml")
        assignments = {
            key: int(value)
            for key, value in re.findall(
                r"readonly property int\s+(\w+):\s*(\d+)", source
            )
        }
        self.assertEqual(
            {
                "panelWidth": 420,
                "rowHeight": 30,
                "rowStride": 30,
                "flipBaseMs": 320,
                "flipPerRowMs": 60,
                "flipMaxMs": 560,
                "enterMs": 420,
                "retirementMs": 640,
                "overtakeMs": 1100,
                "overtakeStaggerMs": 40,
                "deltaStepMs": 140,
                "deltaChipMs": 220,
                "fastestMs": 620,
                "fastestHotMs": 1400,
                "tireMs": 4200,
                "tireExitMs": 420,
                "battleMs": 2500,
                "battleDissolveMs": 360,
                "finalMinutesMs": 2400,
            },
            {key: assignments.get(key) for key in (
                "panelWidth", "rowHeight", "rowStride", "flipBaseMs",
                "flipPerRowMs", "flipMaxMs", "enterMs", "retirementMs",
                "overtakeMs", "overtakeStaggerMs", "deltaStepMs",
                "deltaChipMs", "fastestMs", "fastestHotMs", "tireMs",
                "tireExitMs", "battleMs", "battleDissolveMs",
                "finalMinutesMs",
            )},
        )
        self.assertRegex(source, r"readonly property string\s+flipEasing:\s*\"0\.22,0\.9,0\.3,1\"")

    def test_rows_expose_visual_state_without_transport_dependencies(self) -> None:
        source = self.read("qml/standings/StandingsRow.qml")
        for property_name in (
            "isPlayer", "isClassLeader", "inPit", "isSessionBest",
            "tireCompound", "battleCharge", "positionDelta", "flipOffset",
            "overtakeDirection", "retiring",
        ):
            with self.subTest(property_name=property_name):
                self.assertRegex(source, rf"property\s+\w+\s+{property_name}\b")

        all_qml = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (CANDIDATE / "qml").rglob("*.qml")
        )
        for forbidden in ("Telemetry", "VTRB", "Wails", "SSE", "HWND"):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, all_qml)

    def test_every_motion_token_is_consumed_by_a_visual_component(self) -> None:
        all_qml = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (CANDIDATE / "qml").rglob("*.qml")
            if path.name != "RedlineTokens.qml"
        )
        for token in (
            "flipBaseMs", "flipPerRowMs", "flipMaxMs", "enterMs",
            "retirementMs", "overtakeMs", "overtakeStaggerMs",
            "deltaStepMs", "deltaChipMs", "fastestMs", "fastestHotMs",
            "tireMs", "tireExitMs", "battleMs", "battleDissolveMs",
            "finalMinutesMs", "flipBezier",
        ):
            with self.subTest(token=token):
                self.assertIn(f"tokens.{token}", all_qml)

    def test_root_accepts_prepared_class_models_and_status(self) -> None:
        source = self.read("qml/standings/StandingsRedline.qml")
        self.assertIn("width: tokens.panelWidth", source)
        for contract in (
            r"property\s+var\s+classModel\b",
            r"property\s+string\s+statusMessage\b",
            r"property\s+bool\s+showSessionHeader\b",
            r"property\s+bool\s+finalMinutes\b",
        ):
            self.assertRegex(source, contract)


if __name__ == "__main__":
    unittest.main()
