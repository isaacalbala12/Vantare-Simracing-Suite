import QtQuick 2.15
import QtTest 1.15
import "../qml/delta" as Delta
import "../qml/pedals" as Pedals

TestCase {
    id: testCase
    name: "DeltaPedalsRedlineContract"
    when: windowShown

    width: 420
    height: 300

    Component {
        id: deltaComponent
        Delta.DeltaRedline { }
    }

    Component {
        id: pedalsComponent
        Pedals.PedalsRedline { }
    }

    function makeDelta() {
        const item = createTemporaryObject(deltaComponent, testCase)
        verify(item !== null)
        wait(0)
        return item
    }

    function makePedals() {
        const item = createTemporaryObject(pedalsComponent, testCase)
        verify(item !== null)
        wait(0)
        return item
    }

    function test_delta_geometry_panel_status_and_tokens() {
        const item = makeDelta()
        compare(item.width, 280)
        compare(item.readyHeight, 96)
        compare(item.barHeight, 46)
        compare(item.fillDuration, 220)
        compare(item.crossDuration, 700)
        compare(item.bestDuration, 1100)
        verify(findChild(item, "deltaPanel") !== null)
        verify(findChild(item, "deltaStatus") !== null)

        item.status = "stale"
        item.statusKind = "unavailable"
        item.statusMessage = "Telemetry unavailable"
        wait(0)
        compare(item.statusMessage, "Telemetry unavailable")
        compare(item.renderedStatusMessage, "Telemetry unavailable")
        compare(item.height, 138)
    }

    function test_delta_fill_and_readiness_are_causal() {
        const item = makeDelta()
        item.progress = -0.27
        wait(0)
        compare(item.fillDirection, "gain")
        fuzzyCompare(item.fillPercent, 13.5, 0.001)

        item.status = "ready"
        item.tone = "gaining"
        wait(0)
        item.status = "stale"
        item.tone = "losing"
        item.bestLapText = "1:37.900"
        wait(0)
        verify(!item.crossPulseRunning)
        verify(!item.bestSweepRunning)

        item.status = "ready"
        wait(0)
        verify(!item.crossPulseRunning)
        verify(!item.bestSweepRunning)

        item.tone = "gaining"
        wait(0)
        verify(item.crossPulseRunning)
        fuzzyCompare(item.zeroScaleX, 1.0, 0.001)
    }

    function test_delta_neutral_path_does_not_cross() {
        const item = makeDelta()
        item.tone = "gaining"
        wait(0)
        item.tone = "neutral"
        wait(0)
        item.tone = "losing"
        wait(0)
        verify(!item.crossPulseRunning)
    }

    function test_delta_reduced_motion_stops_and_snaps_in_flight() {
        const item = makeDelta()
        item.tone = "gaining"
        wait(0)
        item.tone = "losing"
        item.bestLapText = "1:37.900"
        item.progress = 0.8
        wait(0)
        verify(item.crossPulseRunning)
        verify(item.bestSweepRunning)
        verify(item.lossFillMoving)

        item.reducedMotion = true
        wait(0)
        verify(!item.crossPulseRunning)
        verify(!item.bestSweepRunning)
        verify(!item.lossFillMoving)
        fuzzyCompare(item.lossVisualWidth, item.lossTargetWidth, 0.001)
        fuzzyCompare(item.zeroScaleX, 1.0, 0.001)
        fuzzyCompare(item.zeroScaleY, 1.0, 0.001)
        fuzzyCompare(item.crossGlowOpacity, 0.0, 0.001)
        fuzzyCompare(item.bestSweepOpacity, 0.0, 0.001)
        compare(item.fillDuration, 0)
    }

    function test_pedals_geometry_defaults_and_status() {
        const item = makePedals()
        compare(item.width, 120)
        compare(item.readyHeight, 160)
        compare(item.railOrder, "clutch,brake,throttle")
        // Colour channels are asserted separately below to avoid QVariant
        // string-format differences between Qt patch releases.
        fuzzyCompare(item.throttleColor.r, 46 / 255, 0.001)
        fuzzyCompare(item.brakeColor.r, 231 / 255, 0.001)
        fuzzyCompare(item.clutchColor.b, 219 / 255, 0.001)
        verify(findChild(item, "pedalsPanel") !== null)
        verify(findChild(item, "pedalsStatus") !== null)

        item.throttleColor = "#ff00ff"
        compare(item.throttleColor, Qt.color("#ff00ff"))

        item.statusMessage = "Telemetry unavailable"
        wait(0)
        compare(item.renderedStatusMessage, "Telemetry unavailable")
        compare(item.height, 202)
    }

    function test_pedals_transform_only_fill_and_reduced_motion_snap() {
        const item = makePedals()
        item.throttle = 1.0
        tryVerify(function() { return item.throttleFillMoving }, 100)
        compare(item.throttleFillHeight, item.throttleWellHeight)

        item.reducedMotion = true
        wait(0)
        verify(!item.throttleFillMoving)
        fuzzyCompare(item.throttleVisualScale, 1.0, 0.001)
        compare(item.throttleFillHeight, item.throttleWellHeight)
        compare(item.fillDuration, 0)
        compare(item.haloDuration, 0)
        compare(item.peakPositionDuration, 0)
        compare(item.peakOpacityDuration, 0)
    }

    function test_brake_peak_is_scoped_to_one_event() {
        const item = makePedals()
        item.brake = 0.9
        wait(0)
        verify(!item.brakePeakVisible)
        fuzzyCompare(item.brakePeak, 0.9, 0.001)
        item.brake = 0.5
        wait(0)
        verify(item.brakePeakVisible)
        fuzzyCompare(item.brakePeak, 0.9, 0.001)
        item.brake = 0.0
        wait(0)
        verify(!item.brakePeakVisible)
        compare(item.brakePeak, 0.0)
        item.brake = 0.3
        wait(0)
        verify(!item.brakePeakVisible)
        fuzzyCompare(item.brakePeak, 0.3, 0.001)
    }
}
