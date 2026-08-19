import QtQuick 2.15
import QtTest 1.15
import "../qml/relative" as Relative

TestCase {
    id: testCase
    name: "RelativeRedlineRuntime"
    when: windowShown
    width: 640
    height: 480

    property var harness: null

    Component {
        id: harnessComponent
        Item {
            id: harnessRoot
            width: 420
            height: 440
            property alias rows: rows
            property alias visual: visual
            property bool reducedMotion: false

            ListModel {
                id: rows
                dynamicRoles: true
                property string status: "ready"
            }

            Relative.RelativeRedline {
                id: visual
                rowsModel: rows
                variant: "mirror"
                reducedMotion: harnessRoot.reducedMotion
            }
        }
    }

    function appendRow(id, position, number, name, vehicleClass, gap, side, player) {
        harness.rows.append({
            "rowId": id,
            "position": position,
            "driverNumber": number,
            "driverName": name,
            "vehicleClass": vehicleClass,
            "gapText": gap === null ? "—" : String(gap),
            "isPlayer": player,
            "side": side,
            "tone": "neutral",
            "gapSeconds": gap
        })
    }

    function indexOf(rowId) {
        for (let index = 0; index < harness.rows.count; ++index) {
            if (harness.rows.get(index).rowId === rowId)
                return index
        }
        return -1
    }

    function visual(name) {
        return findChild(harness.visual, name)
    }

    function aheadApproach() {
        const row = visual("relativeRow-ahead-mirror")
        return row === null ? null : findChild(row, "approachIndicator")
    }

    function init() {
        harness = createTemporaryObject(harnessComponent, testCase)
        verify(harness !== null)
        appendRow("ahead", 7, "12", "Alex Martin", "GT3", null, "ahead", false)
        appendRow("player", 8, "17", "Isaac Driver", "GT3", 0, "player", true)
        appendRow("behind", 9, "6", "Maya Chen", "HYPERCAR", -0.6, "behind", false)
        tryCompare(harness.visual, "playerIndex", 1)
    }

    function cleanup() {
        harness.destroy()
        harness = null
    }

    function test_null_gap_stays_absent_until_real_data_arrives() {
        wait(400)
        tryVerify(function() { return visual("relativeRow-ahead-mirror") !== null }, 200)
        const approach = aheadApproach()
        verify(approach !== null)
        compare(approach.gapSeconds, null)
        compare(approach.hasGap, false)
        compare(approach.imminent, false)

        harness.rows.setProperty(indexOf("ahead"), "gapSeconds", 0.4)
        wait(50)
        const current = aheadApproach()
        verify(current !== null)
        compare(current.gapSeconds, 0.4)
        compare(current.hasGap, true)
        compare(current.imminent, true)
        compare(current.active, true)
    }

    function test_three_variants_instantiate_against_the_same_model() {
        const surfaces = {
            "mirror": "mirrorRelative",
            "proximity": "proximityRelative",
            "traffic": "trafficRelative"
        }
        for (const variant in surfaces) {
            harness.visual.variant = variant
            tryVerify(function() { return visual(surfaces[variant]) !== null }, 200)
        }
    }

    function test_insert_animates_but_data_changed_does_not_reenter() {
        wait(400)
        appendRow("new", 10, "44", "New Driver", "GT3", -1.2, "behind", false)
        tryVerify(function() { return visual("modelRow-new-all") !== null }, 200)
        const row = visual("modelRow-new-all")
        verify(row !== null)
        verify(row.opacity < 1)
        tryCompare(row, "opacity", 1, 450)

        harness.rows.setProperty(indexOf("new"), "driverName", "Renamed Driver")
        wait(20)
        compare(row.opacity, 1)
    }

    function test_move_uses_measured_flip_and_recomputes_player_index() {
        wait(400)
        const wrapper = visual("modelRow-ahead-all")
        verify(wrapper !== null)
        compare(Math.round(wrapper.y), 0)

        harness.rows.move(0, 2, 1)
        tryCompare(harness.visual, "playerIndex", 0)
        wait(15)
        verify(wrapper.y < 90)
        tryCompare(wrapper, "y", 96, 600)
    }

    function test_remove_keeps_a_real_ghost_for_380ms() {
        wait(400)
        const rowName = "modelRow-behind-all"
        verify(visual(rowName) !== null)
        harness.rows.remove(indexOf("behind"), 1)
        wait(20)
        verify(visual(rowName) !== null)
        wait(260)
        verify(visual(rowName) !== null)
        tryVerify(function() { return visual(rowName) === null }, 180)
    }

    function test_cross_only_runs_for_ready_models() {
        wait(400)
        const row = visual("relativeRow-ahead-mirror")
        verify(row !== null)
        harness.rows.setProperty(indexOf("ahead"), "side", "behind")
        tryCompare(row, "crossRunning", true)
        wait(1000)
        compare(row.crossRunning, false)

        harness.rows.status = "missing"
        harness.rows.setProperty(indexOf("ahead"), "side", "ahead")
        wait(20)
        compare(row.crossRunning, false)
    }

    function test_player_index_tracks_move_and_remove() {
        harness.rows.move(1, 0, 1)
        tryCompare(harness.visual, "playerIndex", 0)
        harness.rows.remove(0, 1)
        tryCompare(harness.visual, "playerIndex", -1)
    }

    function test_reduced_motion_makes_model_transitions_immediate() {
        harness.reducedMotion = true
        wait(0)
        appendRow("instant", 10, "55", "Instant Driver", "GT3", -1.4, "behind", false)
        tryVerify(function() { return visual("modelRow-instant-all") !== null }, 100)
        const row = visual("modelRow-instant-all")
        verify(row !== null)
        compare(row.opacity, 1)
        harness.rows.remove(indexOf("instant"), 1)
        tryVerify(function() { return visual("modelRow-instant-all") === null }, 100)
    }
}
