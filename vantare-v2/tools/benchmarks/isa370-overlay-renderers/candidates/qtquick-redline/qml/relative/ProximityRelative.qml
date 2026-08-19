pragma ComponentBehavior: Bound

import QtQuick 2.15

Item {
    id: root
    objectName: "proximityRelative"

    property var rowsModel: null
    property int playerIndex: -1
    property string playerClass: ""
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
        objectName: "proximityList"
        width: parent.width
        height: Math.max(1, count * 30 + (root.playerIndex < 0 ? 0 : root.playerIndex === 0 ? 6 : 12))
        interactive: false
        clip: false
        cacheBuffer: 1000
        model: root.rowsModel
        delegate: RelativeModelRow {
            id: proximityDelegate
            mode: "all"
            modelReady: root.modelReady
            reducedMotion: root.reducedMotion
            property bool showSeam: root.playerIndex >= 0
                                    && (index === root.playerIndex - 1 || index === root.playerIndex)
            height: 30 + (showSeam ? 6 : 0)

            RelativeRow {
                width: parent.width
                height: 30
                rowData: parent.rowData
                variant: "proximity"
                showProximityCell: !rowData.isPlayer
                fasterClass: root.playerClass.length > 0
                             && root.classRank(rowData.vehicleClass) < root.classRank(root.playerClass)
                crossDirection: proximityDelegate.crossDirection
                crossIndex: proximityDelegate.index < 3 ? proximityDelegate.index : -1
                reducedMotion: root.reducedMotion
            }
            Item {
                y: 30
                width: parent.width
                height: proximityDelegate.showSeam ? 6 : 0
                visible: height > 0
                Item {
                    objectName: "proximitySeam"
                    x: 12
                    width: parent.width - 24
                    height: 8
                    anchors.verticalCenter: parent.verticalCenter
                    Rectangle {
                        objectName: "proximitySeamGlow"
                        anchors.fill: parent
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0; color: "#00ff4d5c" }
                            GradientStop { position: 0.28; color: "#8cff4d5c" }
                            GradientStop { position: 0.72; color: "#8cff4d5c" }
                            GradientStop { position: 1; color: "#00ff4d5c" }
                        }
                    }
                    Rectangle {
                        objectName: "proximitySeamCore"
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        height: 1.5
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0; color: "#00ff4d5c" }
                            GradientStop { position: 0.28; color: "#d9ff4d5c" }
                            GradientStop { position: 0.72; color: "#d9ff4d5c" }
                            GradientStop { position: 1; color: "#00ff4d5c" }
                        }
                    }
                }
            }
        }

        add: Transition {
            ParallelAnimation {
                NumberAnimation { properties: "transitionOpacity"; from: 0; to: 1; duration: !root.modelReady || root.reducedMotion ? 0 : tokens.enterMs; easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier }
                NumberAnimation { properties: "enterScaleY"; from: 0.1; to: 1; duration: !root.modelReady || root.reducedMotion ? 0 : tokens.enterMs; easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier }
            }
        }
        move: Transition {
            NumberAnimation {
                id: moveAnimation
                properties: "x,y"
                duration: !root.modelReady || root.reducedMotion ? 0 : Math.min(
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
                duration: !root.modelReady || root.reducedMotion ? 0 : Math.min(
                    tokens.flipMaxMs,
                    tokens.flipBaseMs + Math.abs(displacedAnimation.to - displacedAnimation.from)
                        / tokens.rowStride * tokens.flipPerRowMs)
                easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.flipBezier
            }
        }
    }
}
