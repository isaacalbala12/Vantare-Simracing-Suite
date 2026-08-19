import os
from pathlib import Path
import subprocess
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


def variant(value):
    return value.toVariant() if isinstance(value, QJSValue) else value


def snapshot(rows):
    return [{"vehicleClass": "HYPERCAR", "rows": rows}]


ROW_1 = {
    "id": "1", "driverNumber": "51", "driverName": "A. Driver",
    "bestLapText": "1:48.2", "gapText": "INT", "isSessionBest": True,
}
ROW_2 = {
    "id": "2", "driverNumber": "6", "driverName": "B. Driver",
    "bestLapText": "1:49.1", "gapText": "+0.4", "isPlayer": True,
    "inPit": True, "tireCompound": "M",
}
ROW_3 = {
    "id": "3", "driverNumber": "7", "driverName": "C. Driver",
    "bestLapText": "1:50.0", "gapText": "+1.2",
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

    def test_geometry_matches_the_productive_420px_css_grid(self):
        panel = self.component("common/Panel.qml", {"width": 420, "height": 100})
        content = self.child(panel, "panelContent")
        self.assertEqual((8.0, 8.0, 404.0), (content.x(), content.y(), content.width()))
        self.assertEqual((10.0, 32, 0.8125), (
            panel.property("shadowVerticalOffset"), panel.property("shadowBlurMax"),
            panel.property("shadowBlur"),
        ))

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
        self.assertEqual((6.0, 2.0), (self.child(block, "classChip").x(), self.child(block, "classChip").y()))

        row.setProperty("isPlayer", True)
        self.app.processEvents()
        self.assertTrue(self.child(row, "playerRadial").isVisible())

    def test_prev_to_next_derives_flip_overtake_retirement_tire_and_crown(self):
        root = self.component("standings/StandingsRedline.qml")
        self.apply_snapshot(root, snapshot([ROW_1, ROW_2, ROW_3]))
        next_rows = [
            {**ROW_2, "inPit": False, "tireCompound": "H", "bestLapText": "1:47.9", "isSessionBest": True},
            {**ROW_1, "isSessionBest": False, "gapText": "+0.4"},
            {"id": "4", "driverNumber": "8", "driverName": "D. Driver", "bestLapText": "1:51.0", "gapText": "+2.0"},
        ]
        self.apply_snapshot(root, snapshot(next_rows))
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
        self.assertTrue(self.child(root, "flyingCrown").property("flightActive"))
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

        causal = self.component("standings/StandingsRedline.qml")
        self.apply_snapshot(causal, snapshot([ROW_1, {**ROW_2, "inPit": False}]))
        active = variant(causal.property("classModel"))[0]["battle"]
        self.assertEqual("seam", active["stage"])
        self.apply_snapshot(causal, snapshot([ROW_1, {**ROW_2, "inPit": False, "gapText": "+1.2"}]))
        dissolving = variant(causal.property("classModel"))[0]["battle"]
        self.assertEqual("dissolve", dissolving["stage"])
        self.assertTrue(self.child(causal, "battleCleanup").property("running"))

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
        self.apply_snapshot(root, snapshot([ROW_1, ROW_2, ROW_3]))
        self.apply_snapshot(root, snapshot([
            {**ROW_2, "inPit": False, "tireCompound": "H", "gapText": "INT", "bestLapText": "1:47.9", "isSessionBest": True},
            {**ROW_1, "gapText": "+0.4", "isSessionBest": False},
            {**ROW_3, "inPit": True},
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
