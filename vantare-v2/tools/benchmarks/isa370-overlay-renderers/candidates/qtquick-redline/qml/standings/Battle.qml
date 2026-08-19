import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string stage: "seam"
    property bool autoCrystallize: false
    property real intervalSeconds: 0
    property real charge: Math.max(0.1, Math.min(1, 1 - intervalSeconds / 0.8))
    property string visualStage: stage

    onStageChanged: visualStage = stage

    implicitHeight: stage === "box" ? 72 : 63

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        id: box
        anchors.fill: parent
        radius: 10
        color: root.visualStage === "box" ? "#d9170c0e" : "transparent"
        border.width: 1
        border.color: root.visualStage === "box" ? "#80e63946" : "transparent"
        opacity: root.visualStage === "dissolve" ? 0 : 1

        Behavior on color { ColorAnimation { duration: tokens.battleDissolveMs } }
        Behavior on border.color { ColorAnimation { duration: tokens.battleDissolveMs } }
        Behavior on opacity { NumberAnimation { duration: tokens.battleDissolveMs } }
    }

    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - 24
        height: 2
        color: tokens.accentHot
        opacity: root.visualStage === "dissolve" ? 0 : 0.85
        Behavior on opacity { NumberAnimation { duration: tokens.battleDissolveMs } }
    }

    Rectangle {
        anchors.centerIn: parent
        width: 46; height: 18; radius: 9
        color: "#1a0d0f"
        border.width: 1; border.color: tokens.accentHot
        opacity: root.visualStage === "box" ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 300 } }
        Text {
            anchors.centerIn: parent
            text: root.intervalSeconds.toFixed(1)
            color: tokens.textBright
            font.pixelSize: 10; font.weight: Font.Bold
        }
    }

    Timer {
        interval: tokens.battleMs
        running: root.autoCrystallize && root.visualStage === "seam"
        repeat: false
        onTriggered: root.visualStage = "box"
    }
}
