import os
from pathlib import Path
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QSG_RHI_BACKEND", "software")

from PySide6.QtCore import QAbstractListModel, QModelIndex, Qt, QUrl
from PySide6.QtGui import QGuiApplication
from PySide6.QtQuick import QQuickItem, QQuickView
from PySide6.QtTest import QTest


ROOT = Path(__file__).resolve().parents[1]
QML = ROOT / "qml" / "relative" / "RelativeRedline.qml"
APP = QGuiApplication.instance() or QGuiApplication([])


def find_visual(root, object_name):
    pending = [root]
    while pending:
        current = pending.pop()
        if current.objectName() == object_name:
            return current
        if isinstance(current, QQuickItem):
            pending.extend(current.childItems())
        else:
            pending.extend(current.children())
    return None


def wait_for_visual(root, object_name, timeout_ms=250):
    for _ in range(max(1, timeout_ms // 10)):
        item = find_visual(root, object_name)
        if item is not None:
            return item
        QTest.qWait(10)
    return None


class RowsModel(QAbstractListModel):
    ROLE_NAMES = (
        "rowId",
        "position",
        "driverNumber",
        "driverName",
        "vehicleClass",
        "gapText",
        "isPlayer",
        "side",
        "tone",
        "gapSeconds",
    )

    def __init__(self, rows):
        super().__init__()
        self.rows = rows
        self.roles = {
            Qt.UserRole + offset + 1: name.encode("ascii")
            for offset, name in enumerate(self.ROLE_NAMES)
        }

    def roleNames(self):
        return self.roles

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.rows)

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid() or not 0 <= index.row() < len(self.rows):
            return None
        name = bytes(self.roles.get(role, b"")).decode("ascii")
        if name == "rowId":
            name = "id"
        return self.rows[index.row()].get(name, "" if name != "gapSeconds" else None)


ROWS = [
    {
        "id": "rival-ahead",
        "position": 7,
        "driverNumber": "12",
        "driverName": "Alex Martin",
        "vehicleClass": "GT3",
        "gapSeconds": 0.4,
        "gapText": "+0.4",
        "side": "ahead",
        "isPlayer": False,
        "visualIndex": 0,
        "flipOffset": 52,
        "crossDirection": "lost",
        "crossIndex": 0,
    },
    {
        "id": "player",
        "position": 8,
        "driverNumber": "17",
        "driverName": "Isaac Driver",
        "vehicleClass": "GT3",
        "gapSeconds": 0.0,
        "gapText": "0.0",
        "side": "player",
        "isPlayer": True,
        "visualIndex": 1,
    },
    {
        "id": "lapping-threat",
        "position": 9,
        "driverNumber": "6",
        "driverName": "Maya Chen",
        "vehicleClass": "HYPERCAR",
        "gapSeconds": -0.6,
        "gapText": "-0.6",
        "side": "behind",
        "isPlayer": False,
        "visualIndex": 2,
    },
]


class RelativeQmlRuntimeTest(unittest.TestCase):
    def render_variant(self, variant: str):
        view = QQuickView()
        rows_model = RowsModel(ROWS)
        view._rows_model = rows_model
        view.setResizeMode(QQuickView.SizeRootObjectToView)
        view.resize(420, 320)
        view.setInitialProperties(
            {"reducedMotion": True, "rowsModel": rows_model, "variant": variant}
        )
        view.setSource(QUrl.fromLocalFile(str(QML)))
        self.assertEqual(view.status(), QQuickView.Ready, view.errors())
        root = view.rootObject()
        self.assertIsNotNone(root)
        root.setProperty("rowsModel", rows_model)
        view.show()
        QTest.qWait(40)
        return view, root

    def test_each_variant_instantiates_its_distinct_semantic_surface(self) -> None:
        expected = {
            "mirror": "mirrorRelative",
            "proximity": "proximityRelative",
            "traffic": "trafficRelative",
        }
        for variant, object_name in expected.items():
            with self.subTest(variant=variant):
                view, root = self.render_variant(variant)
                try:
                    self.assertIsNotNone(find_visual(root, object_name))
                    image = view.grabWindow()
                    self.assertFalse(image.isNull())
                    self.assertEqual((image.width(), image.height()), (420, 320))
                    self.assertTrue(
                        any(
                            image.pixelColor(x, y).alpha() > 0
                            for y in range(0, image.height(), 16)
                            for x in range(0, image.width(), 16)
                        ),
                        "offscreen render is fully transparent",
                    )
                finally:
                    view.close()
                    view.deleteLater()
                    QGuiApplication.processEvents()

    def test_mirror_proximity_and_traffic_state_is_causal(self) -> None:
        mirror_view, mirror = self.render_variant("mirror")
        try:
            row = find_visual(mirror, "relativeRow-rival-ahead-mirror")
            self.assertIsNotNone(row)
            approach = find_visual(row, "approachIndicator")
            self.assertIsNotNone(approach)
            self.assertTrue(
                approach.property("visible"),
                (
                    approach.property("gapSeconds"),
                    approach.property("imminent"),
                    approach.property("active"),
                    row.property("showApproach"),
                    row.property("visible"),
                ),
            )
            row.setProperty("flipOffset", 52.0)
            QGuiApplication.processEvents()
            self.assertEqual(row.property("flipOffset"), 52.0)
            self.assertTrue(row.property("reducedMotion"))
        finally:
            mirror_view.close()

        proximity_view, proximity = self.render_variant("proximity")
        try:
            self.assertIsNotNone(find_visual(proximity, "proximitySeam"))
        finally:
            proximity_view.close()

        traffic_view, traffic = self.render_variant("traffic")
        try:
            lap_note = wait_for_visual(traffic, "lapNote")
            class_rail = wait_for_visual(traffic, "classRail")
            traffic_surface = find_visual(traffic, "trafficRelative")
            self.assertIsNotNone(
                lap_note,
                (
                    traffic.property("playerClass"),
                    traffic_surface.property("playerClass"),
                    traffic_surface.property("threatId"),
                    traffic_surface.property("threatCandidates"),
                ),
            )
            self.assertTrue(lap_note.property("visible"))
            self.assertIsNotNone(class_rail)
            self.assertTrue(class_rail.property("visible"))
        finally:
            traffic_view.close()


if __name__ == "__main__":
    unittest.main()
