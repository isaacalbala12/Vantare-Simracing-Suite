pragma ComponentBehavior: Bound

import QtQuick 2.15
import "../common" as Common
import "../theme" as Theme

Item {
    id: root

    property string vehicleClass: ""
    property var rowModel: []
    property var battle: null
    property bool showSessionHeader: false
    property string sessionLabel: ""
    property string remainingText: ""
    property string lapText: ""
    property bool finalMinutes: false

    implicitWidth: tokens.panelWidth
    implicitHeight: panel.implicitHeight

    Theme.RedlineTokens { id: tokens }

    Common.Panel {
        id: panel
        width: root.width
        height: implicitHeight

        Column {
            id: content
            width: parent.width

            Item {
                width: parent.width
                height: root.showSessionHeader ? 38 : 0
                visible: root.showSessionHeader

                Row {
                    anchors.left: parent.left; anchors.leftMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 22

                    Column {
                        spacing: 1
                        Text {
                            text: root.sessionLabel
                            color: tokens.accent
                            font.pixelSize: 10; font.weight: Font.Bold
                        }
                        Text {
                            id: remaining
                            text: root.remainingText
                            color: root.finalMinutes ? tokens.accentHot : tokens.text
                            font.pixelSize: 13; font.weight: Font.Bold
                            SequentialAnimation on opacity {
                                running: root.finalMinutes
                                loops: Animation.Infinite
                                NumberAnimation { to: 0.86; duration: tokens.finalMinutesMs / 2; easing.type: Easing.InOutQuad }
                                NumberAnimation { to: 1.0; duration: tokens.finalMinutesMs / 2; easing.type: Easing.InOutQuad }
                            }
                        }
                    }
                    Column {
                        visible: root.lapText.length > 0
                        spacing: 1
                        Text { text: "LAP"; color: tokens.textDim; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: root.lapText; color: tokens.text; font.pixelSize: 13; font.weight: Font.Bold }
                    }
                }
            }

            Item {
                width: parent.width
                height: root.vehicleClass.length > 0 ? 30 : 0
                visible: root.vehicleClass.length > 0
                Rectangle {
                    anchors.left: parent.left; anchors.leftMargin: 6
                    anchors.verticalCenter: parent.verticalCenter
                    width: classLabel.implicitWidth + 16; height: 19; radius: 5
                    color: "transparent"; border.width: 1.5; border.color: tokens.accent
                    Text {
                        id: classLabel; anchors.centerIn: parent
                        text: root.vehicleClass.toUpperCase()
                        color: tokens.text; font.pixelSize: 10; font.weight: Font.Bold
                    }
                }
                Text {
                    anchors.right: parent.right; anchors.rightMargin: 6
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.rowModel ? root.rowModel.length : 0
                    color: tokens.textDim; font.pixelSize: 10; font.weight: Font.Bold
                }
            }

            Item {
                width: parent.width
                height: rowsColumn.height

                Battle {
                    visible: root.battle !== null && root.battle !== undefined
                    x: -2
                    y: visible ? Number(root.battle.aheadIndex || 0) * tokens.rowStride : 0
                    width: parent.width + 4
                    stage: visible && root.battle.stage ? root.battle.stage : "seam"
                    intervalSeconds: visible ? Number(root.battle.intervalSeconds || 0) : 0
                }

                Column {
                    id: rowsColumn
                    width: parent.width
                    Repeater {
                        model: root.rowModel || []
                        delegate: StandingsRow {
                            required property int index
                            required property var modelData

                            width: rowsColumn.width
                            rowIndex: index
                            rowId: String(modelData.id || "")
                            classPosition: Number(modelData.classPosition || index + 1)
                            driverNumber: String(modelData.driverNumber || "")
                            driverName: String(modelData.driverName || "")
                            bestLapText: String(modelData.bestLapText || "—")
                            gapText: String(modelData.gapText || "—")
                            isPlayer: Boolean(modelData.isPlayer)
                            isClassLeader: Boolean(modelData.isClassLeader || index === 0)
                            inPit: Boolean(modelData.inPit)
                            isSessionBest: Boolean(modelData.isSessionBest)
                            tireCompound: String(modelData.tireCompound || "")
                            tireLeaving: Boolean(modelData.tireLeaving)
                            battleCharge: modelData.battleCharge === undefined ? -1 : Number(modelData.battleCharge)
                            positionDelta: Number(modelData.positionDelta || 0)
                            flipOffset: Number(modelData.flipOffset || 0)
                            overtakeDirection: String(modelData.overtakeDirection || "")
                            overtakeIndex: Number(modelData.overtakeIndex || 0)
                            retiring: Boolean(modelData.retiring)
                        }
                    }
                }
            }
        }
    }
}
