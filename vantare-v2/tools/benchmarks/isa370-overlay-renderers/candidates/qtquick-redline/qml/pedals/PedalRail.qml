import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string label: ""
    property string reading: "0%"
    property real value: 0.0
    property color fillColor: "#e8e8e8"
    property bool reducedMotion: false
    property bool peakEnabled: false
    property real peakValue: 0.0
    property bool peakVisible: false

    readonly property real clampedValue: Math.max(0.0, Math.min(1.0, value))
    readonly property bool engaged: value > 0.02
    readonly property bool saturated: value >= 0.99
    readonly property int fillDuration: reducedMotion ? 0 : 90
    readonly property int haloDuration: reducedMotion ? 0 : 160
    readonly property int peakPositionDuration: reducedMotion ? 0 : 120
    readonly property int peakOpacityDuration: reducedMotion ? 0 : 220

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        id: well
        objectName: "pedalWell"
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: parent.height - 25
        radius: 4
        color: "#0a0a0b"
        border.width: 1
        border.color: "#12e8e8e8"
        clip: true

        Rectangle {
            id: fill
            objectName: "pedalFill"
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: parent.height * root.clampedValue
            color: root.fillColor

            Behavior on height {
                enabled: !root.reducedMotion
                NumberAnimation { duration: root.fillDuration; easing.type: Easing.Linear }
            }
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 1
            radius: 3
            color: "transparent"
            border.width: 1
            border.color: "#52e8e8e8"
            opacity: root.saturated ? 1.0 : 0.0

            Behavior on opacity {
                enabled: !root.reducedMotion
                NumberAnimation { duration: root.haloDuration; easing.type: Easing.OutQuad }
            }
        }

        Rectangle {
            id: peak
            objectName: "brakePeak"
            visible: root.peakEnabled
            x: 0
            y: well.height - Math.max(0.0, Math.min(1.0, root.peakValue)) * well.height - height / 2
            width: well.width
            height: 1.5
            radius: 1
            color: "#8ce8e8e8"
            opacity: root.peakVisible ? 1.0 : 0.0

            Behavior on y {
                enabled: !root.reducedMotion
                NumberAnimation { duration: root.peakPositionDuration; easing.type: Easing.Linear }
            }
            Behavior on opacity {
                enabled: !root.reducedMotion
                NumberAnimation { duration: root.peakOpacityDuration; easing.type: Easing.OutQuad }
            }
        }
    }

    Item {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: well.bottom
        anchors.bottom: parent.bottom

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 5
            text: root.label
            color: root.engaged ? tokens.text : tokens.textDim
            font.family: "Barlow Semi Condensed"
            font.pixelSize: 8
            font.weight: Font.ExtraBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.96
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            text: root.reading
            color: tokens.text
            font.family: "Barlow Semi Condensed"
            font.pixelSize: 11
            font.weight: Font.ExtraBold
            font.letterSpacing: -0.22
        }
    }
}
