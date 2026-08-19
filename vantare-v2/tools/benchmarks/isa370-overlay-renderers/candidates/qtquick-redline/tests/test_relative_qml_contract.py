from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class RelativeQmlContractTest(unittest.TestCase):
    def source(self, relative_path: str) -> str:
        path = ROOT / relative_path
        self.assertTrue(path.is_file(), f"missing {relative_path}")
        return path.read_text(encoding="utf-8")

    def test_exactly_three_productive_variants_are_dispatched(self) -> None:
        source = self.source("qml/relative/RelativeRedline.qml")
        for variant in ("mirror", "proximity", "traffic"):
            self.assertIn(f'variant === "{variant}"', source)
        self.assertIn("MirrorRelative", source)
        self.assertIn("ProximityRelative", source)
        self.assertIn("TrafficRelative", source)

    def test_row_geometry_and_traffic_rail_match_productive_css(self) -> None:
        source = self.source("qml/relative/RelativeRow.qml")
        self.assertIn("property int positionColumnWidth: 22", source)
        self.assertIn("property int classColumnWidth: 46", source)
        self.assertIn("property int gapColumnWidth: root.variant === \"traffic\" ? 58 : 62", source)
        self.assertIn("property int classRailWidth: root.variant === \"traffic\" ? 4 : 0", source)
        self.assertIn("height: tokens.rowHeight", source)

    def test_motion_contract_is_explicit_and_reduced_motion_is_fail_closed(self) -> None:
        tokens = self.source("qml/relative/RelativeTokens.qml")
        expected = {
            "flipBaseMs": 280,
            "flipPerRowMs": 55,
            "flipMaxMs": 520,
            "enterMs": 380,
            "crossMs": 900,
            "crossStaggerMs": 45,
            "crossMaxConcurrent": 3,
            "ghostMs": 380,
            "approachEnterMs": 260,
            "approachTrackMs": 600,
        }
        for name, value in expected.items():
            self.assertIn(f"readonly property int {name}: {value}", tokens)
        self.assertIn('readonly property string flipEasing: "0.22,0.9,0.3,1"', tokens)
        row = self.source("qml/relative/RelativeRow.qml")
        self.assertIn("property bool reducedMotion: false", row)
        self.assertIn("duration: root.reducedMotion ? 0 :", row)
        approach = self.source("qml/relative/ApproachIndicator.qml")
        self.assertIn("duration: root.reducedMotion ? 0 : tokens.approachEnterMs", approach)
        self.assertIn("duration: root.reducedMotion ? 0 : tokens.approachTrackMs", approach)

    def test_missing_gap_is_not_coerced_to_side_by_side(self) -> None:
        approach = self.source("qml/relative/ApproachIndicator.qml")
        self.assertIn("property var gapSeconds: null", approach)
        self.assertIn("readonly property bool hasGap", approach)
        self.assertIn("readonly property bool imminent: hasGap", approach)
        row = self.source("qml/relative/RelativeRow.qml")
        self.assertIn("gapSeconds: root.rowData.gapSeconds", row)

    def test_motion_is_driven_by_real_model_transitions(self) -> None:
        for name in ("MirrorRelative.qml", "ProximityRelative.qml", "TrafficRelative.qml"):
            source = self.source(f"qml/relative/{name}")
            self.assertIn("ListView", source)
            self.assertIn("add: Transition", source)
            self.assertIn("move: Transition", source)
            self.assertIn("crossIndex:", source)
            self.assertIn("crossSlot", source)
            self.assertNotIn("index < 3", source)
        adapter = self.source("qml/relative/RelativeModelRow.qml")
        self.assertIn("ListView.delayRemove: removalAnimation.running", adapter)
        self.assertIn("ListView.onRemove", adapter)
        self.assertIn("!root.isPlayer", adapter)
        row = self.source("qml/relative/RelativeRow.qml")
        self.assertNotIn("Component.onCompleted: enterAnimation", row)
        root = self.source("qml/relative/RelativeRedline.qml")
        self.assertIn("property bool transitionsArmed: false", root)
        self.assertIn("readonly property bool motionReady: modelReady && transitionsArmed", root)
        self.assertIn("interval: 17", root)
        budget = self.source("qml/relative/CrossingBudget.qml")
        self.assertIn("reservations += 1", budget)
        self.assertIn("slot < tokens.crossMaxConcurrent", budget)

    def test_variant_semantics_are_not_collapsed_into_one_generic_list(self) -> None:
        mirror = self.source("qml/relative/MirrorRelative.qml")
        self.assertIn('label: "ADELANTE"', mirror)
        self.assertIn('label: "DETRÁS"', mirror)
        self.assertIn("showApproach: !mirrorDelegate.isPlayer", mirror)
        proximity = self.source("qml/relative/ProximityRelative.qml")
        self.assertIn("showProximityCell: !rowData.isPlayer", proximity)
        self.assertIn("showSeam", proximity)
        traffic = self.source("qml/relative/TrafficRelative.qml")
        self.assertIn("showClassRail: true", traffic)
        self.assertIn("TE DOBLA", traffic)

    def test_visual_materials_keep_redline_semantics(self) -> None:
        tokens = self.source("qml/relative/RelativeTokens.qml")
        self.assertIn('import "../theme" as Theme', tokens)
        self.assertIn("Theme.RedlineTokens", tokens)
        for alias in (
            "shared.panelTop",
            "shared.panelBottom",
            "shared.accent",
            "shared.accentDark",
            "shared.accentHot",
            "shared.positive",
        ):
            self.assertIn(alias, tokens)
        for color in ("#0f0f10", "#4b9fff", "#cfe4ff"):
            self.assertIn(color, tokens)
        row = self.source("qml/relative/RelativeRow.qml")
        self.assertIn("RadialGradient", row)
        self.assertIn('objectName: root.isPlayer ? "playerRadialMaterial"', row)
        axis = self.source("qml/relative/RelativeAxis.qml")
        self.assertIn('objectName: "relativeAxisGlow"', axis)
        proximity = self.source("qml/relative/ProximityRelative.qml")
        self.assertIn('objectName: "proximitySeamGlow"', proximity)
        approach = self.source("qml/relative/ApproachIndicator.qml")
        self.assertIn('objectName: "approachGlow"', approach)

    def test_root_reuses_canonical_panel_and_status(self) -> None:
        source = self.source("qml/relative/RelativeRedline.qml")
        self.assertIn('import "../common" as Common', source)
        self.assertIn("Common.Panel", source)
        self.assertIn("Common.Status", source)
        self.assertIn("rowsModel.statusMessage", source)
        self.assertNotIn("gradient: Gradient", source)


if __name__ == "__main__":
    unittest.main()
