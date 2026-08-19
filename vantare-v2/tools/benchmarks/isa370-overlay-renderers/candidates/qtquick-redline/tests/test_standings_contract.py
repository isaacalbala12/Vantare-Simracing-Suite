import os
from pathlib import Path
import subprocess
import tempfile
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QT_QUICK_BACKEND", "software")

from PySide6.QtCore import QObject, QMetaObject, QSize, QUrl
from PySide6.QtGui import QColor, QGuiApplication
from PySide6.QtQuick import QQuickItem, QQuickView
from PySide6.QtQml import QQmlComponent, QQmlEngine, QJSValue
from PySide6.QtTest import QTest

CANDIDATE = Path(__file__).resolve().parents[1]
QML = CANDIDATE / "qml"
QMLLINT = Path(r"C:\tmp\isa370-tools\qt\sdk\6.10.2\msvc2022_64\bin\qmllint.exe")
QMAKE = QMLLINT.with_name("qmake.exe")
VCVARS = Path(r"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat")
MSVC_BIN = Path(r"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64")
NMAKE = MSVC_BIN / "nmake.exe"


def variant(value):
    return value.toVariant() if isinstance(value, QJSValue) else value


def lap_seconds(value):
    minutes, seconds = value.split(":", 1)
    return int(minutes) * 60 + float(seconds)


def visual_classes(rows):
    """Test-side mirror of StandingsModel.visualClasses' public projection."""
    valid_laps = [lap_seconds(row["bestLapText"]) for row in rows if ":" in row.get("bestLapText", "")]
    session_best = min(valid_laps) if valid_laps else None
    projected = []
    for row in rows:
        copy = dict(row)
        lap = lap_seconds(copy["bestLapText"]) if ":" in copy.get("bestLapText", "") else None
        copy["inPit"] = bool(copy.get("pitText", "").strip())
        copy["isClassLeader"] = bool(copy.get("isLeader", False))
        copy["isSessionBest"] = session_best is not None and lap == session_best
        projected.append(copy)
    return [{"vehicleClass": "HYPERCAR", "rows": projected}]


ROW_1 = {
    "id": "1", "driverNumber": "51", "driverName": "A. Driver",
    "bestLapText": "1:48.2", "gapText": "INT", "pitText": "", "isLeader": True,
}
ROW_2 = {
    "id": "2", "driverNumber": "6", "driverName": "B. Driver",
    "bestLapText": "1:49.1", "gapText": "+0.4", "isPlayer": True,
    "pitText": "PIT", "isLeader": False, "tireCompound": "M",
}
ROW_3 = {
    "id": "3", "driverNumber": "7", "driverName": "C. Driver",
    "bestLapText": "1:50.0", "gapText": "+1.2", "pitText": "", "isLeader": False,
}


class StandingsRedlineRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QGuiApplication.instance() or QGuiApplication([])

    def setUp(self):
        self.runtime = []

    def component(self, relative_path, initial=None):
        engine = QQmlEngine()
        component = QQmlComponent(engine, QUrl.fromLocalFile(str(QML / relative_path)))
        self.assertFalse(component.errors(), "\n".join(error.toString() for error in component.errors()))
        obj = component.createWithInitialProperties(initial or {})
        self.assertIsNotNone(obj, "\n".join(error.toString() for error in component.errors()))
        self.runtime.append((engine, component, obj))
        self.app.processEvents()
        return obj

    def apply_snapshot(self, root, classes):
        self.assertTrue(root.setProperty("incomingSnapshot", classes))
        self.assertTrue(QMetaObject.invokeMethod(root, "applyIncomingSnapshot"))
        self.app.processEvents()

    def child(self, root, name):
        child = root.findChild(QObject, name)
        if child is None and isinstance(root, QQuickItem):
            pending = list(root.childItems())
            while pending:
                candidate = pending.pop()
                if candidate.objectName() == name:
                    child = candidate
                    break
                pending.extend(candidate.childItems())
        self.assertIsNotNone(child, f"missing runtime object: {name}")
        return child

    def test_qmllint_6102_accepts_every_component_without_warnings(self):
        self.assertTrue(QMLLINT.is_file(), f"missing Qt 6.10.2 qmllint: {QMLLINT}")
        files = sorted(str(path) for path in QML.rglob("*.qml"))
        result = subprocess.run(
            [str(QMLLINT), "--max-warnings", "0", "-I", str(QML), *files],
            capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_exact_qt_6102_runtime_loads_quick_types_and_instantiates_tokens(self):
        self.assertTrue(QMAKE.is_file(), f"missing Qt 6.10.2 qmake: {QMAKE}")
        self.assertTrue(VCVARS.is_file(), f"missing MSVC environment: {VCVARS}")
        self.assertTrue(NMAKE.is_file(), f"missing MSVC nmake: {NMAKE}")
        project = Path(__file__).with_name("qt610_runtime_test.pro")
        environment_result = subprocess.run(
            f'call "{VCVARS}" >nul && set', shell=True,
            capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(0, environment_result.returncode, environment_result.stderr)
        build_environment = os.environ.copy()
        vc_environment = dict(
            line.split("=", 1) for line in environment_result.stdout.splitlines() if "=" in line
        )
        build_environment.update(vc_environment)
        vc_path = next(value for key, value in vc_environment.items() if key.lower() == "path")
        qt_root = QMAKE.parent.parent
        build_environment["PATH"] = os.pathsep.join((str(QMAKE.parent), str(MSVC_BIN), vc_path))
        build_environment.update(
            QT_QPA_PLATFORM="windows", QT_QUICK_BACKEND="software",
            QT_PLUGIN_PATH=str(qt_root / "plugins"), QML2_IMPORT_PATH=str(qt_root / "qml"),
            QT_QPA_PLATFORM_PLUGIN_PATH=str(qt_root / "plugins/platforms"),
        )
        with tempfile.TemporaryDirectory(prefix="isa370-qt610-") as build:
            configure = subprocess.run(
                [str(QMAKE), str(project)], cwd=build, env=build_environment,
                capture_output=True, text=True, timeout=30, check=False,
            )
            self.assertEqual(0, configure.returncode, configure.stdout + configure.stderr)
            compile_result = subprocess.run(
                [str(NMAKE), "/nologo"], cwd=build, env=build_environment,
                capture_output=True, text=True, timeout=90, check=False,
            )
            self.assertEqual(0, compile_result.returncode, compile_result.stdout + compile_result.stderr)
            try:
                result = subprocess.run(
                    [str(Path(build) / "release/qt610_runtime_test.exe"),
                     str(QML / "standings/StandingsRedline.qml"), str(QML / "theme/RedlineTokens.qml")],
                    cwd=build, env=build_environment, capture_output=True, text=True,
                    timeout=10, check=False,
                )
            except subprocess.TimeoutExpired as error:
                self.fail(f"Qt 6.10.2 runtime timeout: stdout={error.stdout!r} stderr={error.stderr!r}")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_geometry_matches_the_productive_420px_css_grid(self):
        panel = self.component("common/Panel.qml", {"width": 420, "height": 100})
        content = self.child(panel, "panelContent")
        self.assertEqual((8.0, 8.0, 404.0), (content.x(), content.y(), content.width()))
        self.assertEqual((10.0, 32, 0.8125), (
            panel.property("shadowVerticalOffset"), panel.property("shadowBlurMax"),
            panel.property("shadowBlur"),
        ))
        compact = self.component("common/Panel.qml", {
            "width": 200, "height": 60, "panelRadius": 6, "panelPadding": 7,
            "gradientMiddlePosition": 0.55, "shadowBlurRadius": 18,
            "shadowVerticalOffset": 6, "shadowOpacity": 0.3,
        })
        compact_content = self.child(compact, "panelContent")
        self.assertEqual((7.0, 7.0, 186.0), (
            compact_content.x(), compact_content.y(), compact_content.width(),
        ))
        self.assertEqual((6.0, 7.0, 0.55, 18.0, 6.0, 0.3), (
            compact.property("panelRadius"), compact.property("panelPadding"),
            compact.property("gradientMiddlePosition"), compact.property("shadowBlurRadius"),
            compact.property("shadowVerticalOffset"), compact.property("shadowOpacity"),
        ))
        inline_status = self.component("common/Status.qml", {"message": "Waiting", "card": False})
        self.assertFalse(self.child(inline_status, "statusBackground").isVisible())
        self.assertEqual((8.0, 6.0, 11), (
            inline_status.property("horizontalPadding"), inline_status.property("verticalPadding"),
            self.child(inline_status, "statusText").property("font").pixelSize(),
        ))
        self.assertLess(inline_status.height(), 34)

        row = self.component("standings/StandingsRow.qml", {"width": 404})
        self.assertEqual(30.0, row.height())
        expected = {
            "positionCell": (8.0, 24.0), "identityCell": (40.0, 156.0),
            "deltaCell": (204.0, 44.0), "bestCell": (256.0, 74.0),
            "gapCell": (338.0, 58.0),
        }
        for name, geometry in expected.items():
            cell = self.child(row, name)
            with self.subTest(name=name):
                self.assertEqual(geometry, (cell.x(), cell.width()))

        block = self.component("standings/ClassBlock.qml", {
            "width": 420, "showSessionHeader": True, "sessionLabel": "RACE",
            "remainingText": "04:59", "lapText": "88/120", "rowModel": [ROW_1],
        })
        session = self.child(block, "sessionSlot")
        lap = self.child(block, "lapSlot")
        self.assertEqual(session.y(), lap.y())
        self.assertEqual(22.0, lap.x() - session.x() - session.width())
        label = self.child(session, "slotLabel")
        value = self.child(session, "slotValue")
        self.assertEqual(8.0, value.x() - label.x() - label.width())
        self.assertEqual((9.5, 12.5, 1.33), (
            label.property("cssPixelSize"), value.property("cssPixelSize"),
            round(label.property("font").letterSpacing(), 2),
        ))
        self.assertEqual((6.0, 2.0), (self.child(block, "classChip").x(), self.child(block, "classChip").y()))

        self.assertEqual(13.5, self.child(row, "positionCell").property("cssPixelSize"))
        glyph = self.child(row, "residentFastestGlyph")
        self.assertEqual((10.0, 12.0), (glyph.width(), glyph.height()))

        row.setProperty("isPlayer", True)
        self.app.processEvents()
        self.assertTrue(self.child(row, "playerRadial").isVisible())

    def test_prev_to_next_derives_flip_overtake_retirement_tire_and_crown(self):
        root = self.component("standings/StandingsRedline.qml")
        self.assertEqual("StandingsModel.visualClasses", root.property("snapshotContract"))
        self.apply_snapshot(root, visual_classes([ROW_1, ROW_2, ROW_3]))
        next_rows = [
            {**ROW_2, "pitText": "", "tireCompound": "H", "bestLapText": "1:47.9", "isLeader": True},
            {**ROW_1, "isLeader": False, "gapText": "+0.4"},
            {"id": "4", "driverNumber": "8", "driverName": "D. Driver", "bestLapText": "1:51.0", "gapText": "+2.0", "pitText": "", "isLeader": False},
        ]
        self.apply_snapshot(root, visual_classes(next_rows))
        self.app.processEvents()

        self.assertEqual(("1", "2"), (root.property("crownFromRowId"), root.property("crownToRowId")))
        self.assertEqual(("2", "1"), (root.property("lastOvertakeGainer"), root.property("lastOvertakeLoser")))
        self.assertEqual(["3"], variant(root.property("retiredRowIds")))
        self.assertEqual(["4"], variant(root.property("enteredRowIds")))
        decorated = variant(root.property("classModel"))[0]["rows"]
        by_id = {row["id"]: row for row in decorated}
        self.assertEqual(30, by_id["2"]["flipOffset"])
        self.assertEqual(-30, by_id["1"]["flipOffset"])
        self.assertEqual("rise", by_id["2"]["overtakeDirection"])
        self.assertEqual("fall", by_id["1"]["overtakeDirection"])
        self.assertEqual("H", by_id["2"]["tireReveal"])
        self.assertTrue(by_id["2"]["isSessionBest"])
        self.assertFalse(by_id["1"]["isSessionBest"])
        self.assertTrue(self.child(root, "flyingCrown").property("flightActive"))
        self.assertEqual((12.0, 14.0), (
            self.child(root, "flyingCrown").width(), self.child(root, "flyingCrown").height(),
        ))
        self.assertEqual((77.0, 77.0), (
            root.property("lastCrownFromY"), root.property("lastCrownToY"),
        ))
        self.assertTrue(self.child(root, "retirementCleanup").property("running"))

    def test_battle_is_a_real_two_row_wrapper_and_reduced_motion_is_asymmetric(self):
        battle = self.component("standings/Battle.qml", {
            "width": 408, "aheadRow": ROW_1, "behindRow": ROW_2,
            "stage": "seam", "intervalSeconds": 0.4,
        })
        self.assertEqual((65.0, 3.0), (battle.property("layoutHeight"), self.child(battle, "battleSeam").height()))
        battle.setProperty("stage", "box")
        self.app.processEvents()
        self.assertEqual((84.0, 12.0), (battle.property("layoutHeight"), self.child(battle, "battleSeam").height()))
        self.child(battle, "battleAhead")
        self.child(battle, "battleBehind")

        row = self.component("standings/StandingsRow.qml", {
            "width": 404, "reducedMotion": True, "battleCharge": 0.5,
            "overtakeDirection": "rise", "retiring": True,
        })
        self.assertEqual(0, row.property("chargeAnimationMs"))
        self.assertEqual(1100, row.property("overtakeAnimationMs"))
        self.assertEqual(640, row.property("retirementAnimationMs"))

        causal = self.component("standings/StandingsRedline.qml", {"sessionLabel": "RACE"})
        self.apply_snapshot(causal, visual_classes([ROW_1, {**ROW_2, "pitText": ""}]))
        active = variant(causal.property("classModel"))[0]["battle"]
        self.assertEqual("seam", active["stage"])
        self.apply_snapshot(causal, visual_classes([ROW_1, {**ROW_2, "pitText": "", "gapText": "+1.2"}]))
        dissolving = variant(causal.property("classModel"))[0]["battle"]
        self.assertEqual("dissolve", dissolving["stage"])
        self.assertTrue(self.child(causal, "battleCleanup").property("running"))

        qualifying = self.component("standings/StandingsRedline.qml", {"sessionLabel": "QUALIFY"})
        self.apply_snapshot(qualifying, visual_classes([ROW_1, {**ROW_2, "pitText": ""}]))
        self.assertIsNone(variant(qualifying.property("classModel"))[0]["battle"])

    def test_exact_materials_and_tire_keyframe_contract(self):
        row = self.component("standings/StandingsRow.qml", {
            "width": 404, "hot": True, "battleCharge": 0.75, "tireCompound": "H",
        })
        hot = self.child(row, "hotWave")
        charge = self.child(row, "chargeFill")
        tire = self.child(row, "tireBadge")
        self.assertEqual(("#00000000", "#47b18cff", "#00000000"), (
            hot.property("gradientStart"), hot.property("gradientMiddle"), hot.property("gradientEnd"),
        ))
        self.assertEqual(("#ffc1121f", "#ffff4d5c", 12.0, "#8cff4d5c"), (
            charge.property("gradientStart"), charge.property("gradientEnd"),
            charge.property("glowRadius"), charge.property("glowColor"),
        ))
        self.assertEqual((1.15, 8.0, 0.55), (
            tire.property("enterOvershootScale"), tire.property("enterOvershootRotation"),
            tire.property("enterOvershootProgress"),
        ))

        battle = self.component("standings/Battle.qml", {
            "width": 408, "aheadRow": visual_classes([ROW_1])[0]["rows"][0],
            "behindRow": visual_classes([ROW_2])[0]["rows"][0], "stage": "box",
        })
        wrapper = self.child(battle, "battleWrapper")
        seam = self.child(battle, "seamLine")
        self.assertEqual((4.0, 16.0, "#80000000", 14.0, "#2ec1121f"), (
            wrapper.property("shadowVerticalOffset"), wrapper.property("shadowRadius"),
            wrapper.property("shadowColor"), wrapper.property("glowRadius"), wrapper.property("glowColor"),
        ))
        self.assertEqual(("#00000000", "#d9ff4d5c", "#00000000", 9.0, "#8cff4d5c"), (
            seam.property("gradientStart"), seam.property("gradientMiddle"), seam.property("gradientEnd"),
            seam.property("glowRadius"), seam.property("glowColor"),
        ))

    def test_offscreen_render_covers_key_visual_states(self):
        view = QQuickView()
        self.addCleanup(view.deleteLater)
        view.setColor(QColor(0, 0, 0, 0))
        view.setResizeMode(QQuickView.SizeRootObjectToView)
        view.setSource(QUrl.fromLocalFile(str(QML / "standings/StandingsRedline.qml")))
        self.assertEqual([], view.errors())
        view.resize(QSize(420, 260))
        root = view.rootObject()
        root.setProperty("remainingText", "04:59")
        root.setProperty("lapText", "88/120")
        root.setProperty("finalMinutes", True)
        self.apply_snapshot(root, visual_classes([ROW_1, ROW_2, ROW_3]))
        self.apply_snapshot(root, visual_classes([
            {**ROW_2, "pitText": "", "tireCompound": "H", "gapText": "INT", "bestLapText": "1:47.9", "isLeader": True},
            {**ROW_1, "gapText": "+0.4", "isLeader": False},
            {**ROW_3, "pitText": "PIT"},
        ]))
        view.show()
        QTest.qWait(80)
        self.assertTrue(self.child(root, "flyingCrown").property("flightActive"))
        tire_row = self.child(root, "battleAhead")
        self.assertEqual("2", tire_row.property("rowId"))
        tire = self.child(tire_row, "tireBadge")
        self.assertGreater(tire.opacity(), 0)
        image = view.grabWindow()
        self.assertFalse(image.isNull())
        self.assertEqual((420, 260), (image.width(), image.height()))
        opaque_samples = sum(
            image.pixelColor(x, y).alpha() > 0
            for x in range(0, image.width(), 10)
            for y in range(0, image.height(), 10)
        )
        self.assertGreater(opaque_samples, 80)


if __name__ == "__main__":
    unittest.main()
