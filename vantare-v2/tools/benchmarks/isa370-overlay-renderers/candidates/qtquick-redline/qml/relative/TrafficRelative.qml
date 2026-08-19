pragma ComponentBehavior: Bound

import QtQuick 2.15

Item {
    id: root
    objectName: "trafficRelative"

    property var rowsModel: null
    property string playerClass: ""
    property bool modelReady: false
    property bool reducedMotion: false
    property string threatId: ""
    property var threatCandidates: ({})

    width: parent ? parent.width : 404
    implicitHeight: list.height

    RelativeTokens { id: tokens }

    function classRank(vehicleClass) {
        const ranks = ({"HYPERCAR": 0, "LMH": 0, "LMDH": 0, "GTP": 0,
                         "LMP1": 1, "LMP2": 2, "LMP3": 3, "GTE": 4,
                         "GT3": 5, "LMGT3": 5, "GT4": 6})
        const key = String(vehicleClass || "").trim().toUpperCase()
        return ranks[key] === undefined ? 99 : ranks[key]
    }

    function shortClass(vehicleClass) {
        const name = String(vehicleClass || "").trim().toUpperCase()
        return name === "HYPERCAR" ? "HY" : name === "LMGT3" ? "GT3" : name
    }

    function updateThreat(rowId, vehicleClass, gapSeconds, isPlayer) {
        const candidates = Object.assign({}, threatCandidates)
        if (isPlayer || gapSeconds === null || Number(gapSeconds) >= 0)
            delete candidates[rowId]
        else
            candidates[rowId] = ({"vehicleClass": vehicleClass, "gapSeconds": Number(gapSeconds)})
        threatCandidates = candidates
        recomputeThreat()
    }

    function removeThreat(rowId) {
        const candidates = Object.assign({}, threatCandidates)
        delete candidates[rowId]
        threatCandidates = candidates
        recomputeThreat()
    }

    function recomputeThreat() {
        let closestId = ""
        let closestGap = -Infinity
        for (const rowId in threatCandidates) {
            const candidate = threatCandidates[rowId]
            if (classRank(candidate.vehicleClass) >= classRank(playerClass))
                continue
            if (candidate.gapSeconds > closestGap) {
                closestGap = candidate.gapSeconds
                closestId = rowId
            }
        }
        threatId = closestId
    }

    onPlayerClassChanged: recomputeThreat()

    ListView {
        id: list
        objectName: "trafficList"
        width: parent.width
        height: Math.max(1, count * 30 + (root.threatId.length > 0 ? 20 : 0))
        interactive: false
        clip: false
        cacheBuffer: 1000
        model: root.rowsModel
        delegate: RelativeModelRow {
            id: trafficDelegate
            mode: "all"
            modelReady: root.modelReady
            reducedMotion: root.reducedMotion
            readonly property bool isThreat: rowId === root.threatId
            height: 30 + (isThreat ? 20 : 0)

            Component.onCompleted: root.updateThreat(rowId, vehicleClass, gapSeconds, isPlayer)
            Component.onDestruction: root.removeThreat(rowId)
            onVehicleClassChanged: root.updateThreat(rowId, vehicleClass, gapSeconds, isPlayer)
            onGapSecondsChanged: root.updateThreat(rowId, vehicleClass, gapSeconds, isPlayer)

            Item {
                objectName: trafficDelegate.isThreat ? "lapNote" : ""
                width: parent.width
                height: trafficDelegate.isThreat ? 20 : 0
                visible: height > 0
                Text {
                    x: 10
                    anchors.verticalCenter: parent.verticalCenter
                    text: "◀◀ " + root.shortClass(trafficDelegate.vehicleClass)
                          + " #" + trafficDelegate.driverNumber
                          + " A " + Math.abs(Number(trafficDelegate.gapSeconds || 0)).toFixed(1)
                          + "s — TE DOBLA"
                    color: tokens.lapping
                    font.family: tokens.fontFamily
                    font.pixelSize: Math.round(8.5)
                    font.weight: Font.ExtraBold
                    font.letterSpacing: 1.35
                }
                Rectangle {
                    anchors.left: parent.left
                    anchors.leftMargin: 260
                    anchors.right: parent.right
                    anchors.rightMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    height: 1
                    color: tokens.lapping
                    opacity: 0.6
                }
            }

            RelativeRow {
                y: trafficDelegate.isThreat ? 20 : 0
                width: parent.width
                height: 30
                rowData: parent.rowData
                variant: "traffic"
                showClassRail: true
                fasterClass: root.playerClass.length > 0
                             && root.classRank(rowData.vehicleClass) < root.classRank(root.playerClass)
                crossDirection: trafficDelegate.crossDirection
                crossIndex: trafficDelegate.index < 3 ? trafficDelegate.index : -1
                reducedMotion: root.reducedMotion
            }
        }

        add: Transition {
            NumberAnimation {
                properties: "opacity"; from: 0; to: 1
                duration: root.reducedMotion ? 0 : tokens.enterMs
                easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier
            }
        }
        move: Transition {
            NumberAnimation {
                id: moveAnimation
                properties: "x,y"
                duration: root.reducedMotion ? 0 : Math.min(
                    tokens.flipMaxMs,
                    tokens.flipBaseMs + Math.abs(moveAnimation.to - moveAnimation.from)
                        / tokens.rowStride * tokens.flipPerRowMs)
                easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier
            }
        }
        moveDisplaced: Transition {
            NumberAnimation {
                id: displacedAnimation
                properties: "x,y"
                duration: root.reducedMotion ? 0 : Math.min(
                    tokens.flipMaxMs,
                    tokens.flipBaseMs + Math.abs(displacedAnimation.to - displacedAnimation.from)
                        / tokens.rowStride * tokens.flipPerRowMs)
                easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier
            }
        }
    }
}
