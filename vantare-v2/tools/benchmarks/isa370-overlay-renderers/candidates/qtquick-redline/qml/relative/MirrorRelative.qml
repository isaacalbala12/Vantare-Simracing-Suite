pragma ComponentBehavior: Bound

import QtQuick 2.15

CrossingBudget {
    id: root
    objectName: "mirrorRelative"

    property var rowsModel: null
    property string playerClass: ""
    property int playerIndex: -1
    property bool modelReady: false
    property bool reducedMotion: false

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

    ListView {
        id: list
        objectName: "mirrorList"
        width: parent.width
        height: Math.max(1, count * 30 + (root.playerIndex >= 0 ? 36 : 0))
        interactive: false
        clip: false
        cacheBuffer: 1000
        model: root.rowsModel
        delegate: RelativeModelRow {
            id: mirrorDelegate
            mode: "all"
            modelReady: root.modelReady
            reducedMotion: root.reducedMotion
            onCrossDetected: direction => acceptCross(direction, root.reserveCrossSlot())
            height: 30 + (isPlayer ? 36 : 0)

            RelativeAxis {
                width: parent.width
                height: mirrorDelegate.isPlayer ? 18 : 0
                visible: mirrorDelegate.isPlayer
                label: "ADELANTE"
                labelFirst: true
            }
            RelativeRow {
                y: mirrorDelegate.isPlayer ? 18 : 0
                width: parent.width
                height: 30
                rowData: parent.rowData
                objectName: "relativeRow-" + String(rowData.id || "") + "-mirror"
                variant: "mirror"
                showApproach: !mirrorDelegate.isPlayer
                fasterClass: root.playerClass.length > 0
                             && root.classRank(rowData.vehicleClass) < root.classRank(root.playerClass)
                crossDirection: mirrorDelegate.crossDirection
                crossIndex: mirrorDelegate.crossSlot
                reducedMotion: root.reducedMotion
            }
            RelativeAxis {
                y: 48
                width: parent.width
                height: mirrorDelegate.isPlayer ? 18 : 0
                visible: mirrorDelegate.isPlayer
                label: "DETRÁS"
                labelFirst: false
            }
        }

        add: Transition {
            ParallelAnimation {
                NumberAnimation {
                    properties: "transitionOpacity"; from: 0; to: 1
                    duration: !root.modelReady || root.reducedMotion ? 0 : tokens.enterMs
                    easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier
                }
                NumberAnimation {
                    properties: "enterScaleY"; from: 0.1; to: 1
                    duration: !root.modelReady || root.reducedMotion ? 0 : tokens.enterMs
                    easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier
                }
            }
        }
        move: Transition {
            NumberAnimation {
                id: moveAnimation
                properties: "x,y"
                duration: !root.modelReady || root.reducedMotion ? 0 : Math.min(
                    tokens.flipMaxMs,
                    tokens.flipBaseMs + Math.abs(moveAnimation.to - moveAnimation.from)
                        / tokens.rowStride * tokens.flipPerRowMs
                )
                easing.type: Easing.BezierSpline
                easing.bezierCurve: tokens.flipBezier
            }
        }
        moveDisplaced: Transition {
            NumberAnimation {
                id: displacedAnimation
                properties: "x,y"
                duration: !root.modelReady || root.reducedMotion ? 0 : Math.min(
                    tokens.flipMaxMs,
                    tokens.flipBaseMs + Math.abs(displacedAnimation.to - displacedAnimation.from)
                        / tokens.rowStride * tokens.flipPerRowMs
                )
                easing.type: Easing.BezierSpline
                easing.bezierCurve: tokens.flipBezier
            }
        }
    }
}
