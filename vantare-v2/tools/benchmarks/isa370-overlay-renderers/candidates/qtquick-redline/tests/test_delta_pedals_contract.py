import os
import sys
import unittest
from pathlib import Path


os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

try:
    from PySide6.QtCore import QUrl
    from PySide6.QtGui import QGuiApplication
    from PySide6.QtQml import QQmlComponent, QQmlEngine
    from PySide6.QtQuick import QQuickView
except ImportError as exc:  # pragma: no cover - environment diagnosis
    raise SystemExit(f"PySide6 is required for the Qt visual contract: {exc}")


ROOT = Path(__file__).resolve().parents[1]


class QmlContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QGuiApplication.instance() or QGuiApplication(sys.argv)
        cls.engine = QQmlEngine()

    def load(self, relative_path: str):
        path = ROOT / relative_path
        self.assertTrue(path.is_file(), f"missing QML component: {path}")
        component = QQmlComponent(self.engine)
        component.loadUrl(path.as_uri())
        self.assertFalse(component.isError(), "\n".join(error.toString() for error in component.errors()))
        instance = component.create()
        self.assertIsNotNone(instance, "\n".join(error.toString() for error in component.errors()))
        QQmlEngine.setObjectOwnership(instance, QQmlEngine.CppOwnership)
        instance.setParent(self.engine)
        self.addCleanup(instance.deleteLater)
        return instance

    def settle(self):
        self.app.processEvents()

    def render(self, relative_path: str):
        view = QQuickView()
        self.addCleanup(view.deleteLater)
        view.setColor("transparent")
        view.setSource(QUrl.fromLocalFile(str(ROOT / relative_path)))
        self.assertEqual(view.status(), QQuickView.Ready, "\n".join(error.toString() for error in view.errors()))
        view.show()
        for _ in range(5):
            self.app.processEvents()
            view.requestUpdate()
        image = view.grabWindow()
        self.assertFalse(image.isNull())
        return image

    def test_delta_geometry_fill_and_motion_tokens(self):
        delta = self.load("qml/delta/DeltaRedline.qml")
        self.assertEqual(delta.property("width"), 280)
        self.assertEqual(delta.property("height"), 96)
        self.assertEqual(delta.property("barHeight"), 46)
        self.assertEqual(delta.property("fillDuration"), 220)
        self.assertEqual(delta.property("crossDuration"), 700)
        self.assertEqual(delta.property("bestDuration"), 1100)

        delta.setProperty("progress", -0.27)
        self.settle()
        self.assertEqual(delta.property("fillDirection"), "gain")
        self.assertAlmostEqual(delta.property("fillPercent"), 13.5)

        delta.setProperty("progress", 4.0)
        self.settle()
        self.assertEqual(delta.property("fillDirection"), "loss")
        self.assertEqual(delta.property("fillPercent"), 50.0)

        delta.setProperty("progress", 0.0)
        self.settle()
        self.assertEqual(delta.property("fillDirection"), "neutral")
        self.assertEqual(delta.property("fillPercent"), 0.0)

    def test_delta_crosses_only_between_opposite_non_neutral_sides(self):
        delta = self.load("qml/delta/DeltaRedline.qml")
        delta.setProperty("progress", -0.2)
        self.settle()
        delta.setProperty("progress", 0.2)
        self.settle()
        self.assertTrue(delta.property("crossPulseRunning"))

        delta.setProperty("reducedMotion", True)
        delta.setProperty("progress", -0.2)
        self.settle()
        self.assertFalse(delta.property("crossPulseRunning"))
        self.assertEqual(delta.property("fillDuration"), 0)

        neutral_path = self.load("qml/delta/DeltaRedline.qml")
        neutral_path.setProperty("progress", -0.2)
        self.settle()
        neutral_path.setProperty("progress", 0.0)
        self.settle()
        neutral_path.setProperty("progress", 0.2)
        self.settle()
        self.assertFalse(neutral_path.property("crossPulseRunning"))

    def test_delta_new_best_sweep_and_reference_copy(self):
        delta = self.load("qml/delta/DeltaRedline.qml")
        delta.setProperty("deltaText", "-0.245")
        delta.setProperty("bestLapText", "1:37.990")
        self.settle()
        self.assertEqual(delta.property("deltaText"), "-0.245")
        self.assertEqual(delta.property("referenceLabel"), "BEST")
        self.assertTrue(delta.property("bestSweepRunning"))

        delta.setProperty("reducedMotion", True)
        delta.setProperty("bestLapText", "1:37.750")
        self.settle()
        self.assertFalse(delta.property("bestSweepRunning"))

    def test_pedals_geometry_order_values_and_configurable_colours(self):
        pedals = self.load("qml/pedals/PedalsRedline.qml")
        self.assertEqual(pedals.property("width"), 120)
        self.assertEqual(pedals.property("height"), 160)
        self.assertEqual(pedals.property("railCount"), 3)
        self.assertEqual(pedals.property("railOrder"), "clutch,brake,throttle")
        self.assertEqual(pedals.property("fillDuration"), 90)
        self.assertEqual(pedals.property("haloDuration"), 160)
        self.assertEqual(pedals.property("peakPositionDuration"), 120)
        self.assertEqual(pedals.property("peakOpacityDuration"), 220)

        pedals.setProperty("clutch", 0.01)
        pedals.setProperty("brake", 0.5)
        pedals.setProperty("throttle", 1.0)
        pedals.setProperty("clutchColor", "#123456")
        pedals.setProperty("brakeColor", "#abcdef")
        pedals.setProperty("throttleColor", "#ff00ff")
        self.settle()
        self.assertFalse(pedals.property("clutchEngaged"))
        self.assertTrue(pedals.property("brakeEngaged"))
        self.assertTrue(pedals.property("throttleSaturated"))
        self.assertEqual(pedals.property("clutchColor").name(), "#123456")
        self.assertEqual(pedals.property("brakeColor").name(), "#abcdef")
        self.assertEqual(pedals.property("throttleColor").name(), "#ff00ff")

    def test_brake_peak_is_scoped_to_one_braking_event(self):
        pedals = self.load("qml/pedals/PedalsRedline.qml")
        pedals.setProperty("brake", 0.9)
        self.settle()
        self.assertFalse(pedals.property("brakePeakVisible"))
        self.assertAlmostEqual(pedals.property("brakePeak"), 0.9)

        pedals.setProperty("brake", 0.5)
        self.settle()
        self.assertTrue(pedals.property("brakePeakVisible"))
        self.assertAlmostEqual(pedals.property("brakePeak"), 0.9)

        pedals.setProperty("brake", 0.0)
        self.settle()
        self.assertFalse(pedals.property("brakePeakVisible"))
        self.assertEqual(pedals.property("brakePeak"), 0.0)

        pedals.setProperty("brake", 0.3)
        self.settle()
        self.assertFalse(pedals.property("brakePeakVisible"))
        self.assertAlmostEqual(pedals.property("brakePeak"), 0.3)

    def test_pedals_reduced_motion_disables_all_transitions(self):
        pedals = self.load("qml/pedals/PedalsRedline.qml")
        pedals.setProperty("reducedMotion", True)
        self.settle()
        self.assertEqual(pedals.property("fillDuration"), 0)
        self.assertEqual(pedals.property("haloDuration"), 0)
        self.assertEqual(pedals.property("peakPositionDuration"), 0)
        self.assertEqual(pedals.property("peakOpacityDuration"), 0)

    def test_both_widgets_rasterize_offscreen_at_contract_size(self):
        delta = self.render("qml/delta/DeltaRedline.qml")
        self.assertEqual((delta.width(), delta.height()), (280, 96))
        self.assertGreater(delta.pixelColor(140, 48).alpha(), 0)

        pedals = self.render("qml/pedals/PedalsRedline.qml")
        self.assertEqual((pedals.width(), pedals.height()), (120, 160))
        self.assertGreater(pedals.pixelColor(60, 80).alpha(), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
