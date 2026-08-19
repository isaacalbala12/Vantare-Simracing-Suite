import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string stage: "seam"
    property real intervalSeconds: 0
    property var aheadRow: ({})
    property var behindRow: ({})
    property bool reducedMotion: false
    property string visualStage: stage
    property real charge: Math.max(0.1, Math.min(1, 1 - intervalSeconds / 0.8))
    readonly property real seamHeight: visualStage === "box" ? 12 : 3
    readonly property real layoutHeight: visualStage === "box" ? 84 : 65

    onStageChanged: visualStage = stage

    implicitHeight: layoutHeight
    height: layoutHeight

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        id: box
        objectName: "battleWrapper"
        x: 0
        y: root.visualStage === "box" ? 3 : 0
        width: parent.width
        height: root.visualStage === "box" ? 78 : 65
        radius: 10
        color: root.visualStage === "box" ? "#d9170c0e" : "transparent"
        border.width: 1
        border.color: root.visualStage === "box" ? "#80e63946" : "transparent"
        opacity: root.visualStage === "dissolve" ? 0 : 1

        Behavior on color { ColorAnimation { duration: tokens.battleDissolveMs } }
        Behavior on border.color { ColorAnimation { duration: tokens.battleDissolveMs } }
        Behavior on opacity { NumberAnimation { duration: tokens.battleDissolveMs } }
    }

    StandingsRow {
        id: ahead
        objectName: "battleAhead"
        x: 3
        y: root.visualStage === "box" ? 6 : 1
        width: root.width - 6
        rowId: String(root.aheadRow.id || "")
        rowIndex: Number(root.aheadRow.rowIndex || 0)
        classPosition: Number(root.aheadRow.classPosition || 1)
        driverNumber: String(root.aheadRow.driverNumber || "")
        driverName: String(root.aheadRow.driverName || "")
        bestLapText: String(root.aheadRow.bestLapText || "—")
        gapText: String(root.aheadRow.gapText || "—")
        isPlayer: Boolean(root.aheadRow.isPlayer)
        isClassLeader: Boolean(root.aheadRow.isClassLeader)
        isSessionBest: Boolean(root.aheadRow.isSessionBest)
        inPit: Boolean(root.aheadRow.inPit)
        tireCompound: String(root.aheadRow.tireReveal || "")
        tireLeaving: Boolean(root.aheadRow.tireLeaving)
        positionDelta: Number(root.aheadRow.positionDelta || 0)
        flipOffset: Number(root.aheadRow.flipOffset || 0)
        overtakeDirection: String(root.aheadRow.overtakeDirection || "")
        entering: Boolean(root.aheadRow.entering)
        hot: Boolean(root.aheadRow.hot)
        reducedMotion: root.reducedMotion
    }

    Item {
        id: seam
        objectName: "battleSeam"
        x: 3
        y: ahead.y + tokens.rowHeight
        width: root.width - 6
        height: root.seamHeight

        Rectangle {
            anchors.left: parent.left; anchors.leftMargin: 12
            anchors.right: parent.right; anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            height: 1.5
            color: tokens.accentHot
            opacity: root.visualStage === "dissolve" ? 0 : 0.85
            Behavior on opacity { NumberAnimation { duration: tokens.battleDissolveMs } }
        }
        Rectangle {
            anchors.centerIn: parent
            width: 46; height: 18; radius: 9
            color: "#1a0d0f"; border.width: 1; border.color: tokens.accentHot
            opacity: root.visualStage === "box" ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: 300 } }
            Text {
                anchors.centerIn: parent
                text: root.intervalSeconds.toFixed(1)
                color: tokens.textBright; font.pixelSize: 10; font.weight: Font.Bold
            }
        }
    }

    StandingsRow {
        id: behind
        objectName: "battleBehind"
        x: 3
        y: seam.y + seam.height
        width: root.width - 6
        rowId: String(root.behindRow.id || "")
        rowIndex: Number(root.behindRow.rowIndex || 1)
        classPosition: Number(root.behindRow.classPosition || 2)
        driverNumber: String(root.behindRow.driverNumber || "")
        driverName: String(root.behindRow.driverName || "")
        bestLapText: String(root.behindRow.bestLapText || "—")
        gapText: String(root.behindRow.gapText || "—")
        isPlayer: Boolean(root.behindRow.isPlayer)
        isSessionBest: Boolean(root.behindRow.isSessionBest)
        inPit: Boolean(root.behindRow.inPit)
        tireCompound: String(root.behindRow.tireReveal || "")
        tireLeaving: Boolean(root.behindRow.tireLeaving)
        battleCharge: root.visualStage === "box" ? root.charge : -1
        positionDelta: Number(root.behindRow.positionDelta || 0)
        flipOffset: Number(root.behindRow.flipOffset || 0)
        overtakeDirection: String(root.behindRow.overtakeDirection || "")
        entering: Boolean(root.behindRow.entering)
        hot: Boolean(root.behindRow.hot)
        reducedMotion: root.reducedMotion
    }

    Timer {
        interval: tokens.battleMs
        running: root.stage === "seam" && root.visualStage === "seam"
        repeat: false
        onTriggered: root.visualStage = "box"
    }
}
