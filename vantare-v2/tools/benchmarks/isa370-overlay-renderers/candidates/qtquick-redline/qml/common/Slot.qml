import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string label: ""
    property string value: ""
    property bool accent: false
    property bool alert: false
    property bool breathing: false

    implicitWidth: slotRow.implicitWidth
    implicitHeight: Math.max(labelText.implicitHeight, valueText.implicitHeight)

    Theme.RedlineTokens { id: tokens }

    Row {
        id: slotRow
        spacing: 8

        Text {
            id: labelText
            objectName: "slotLabel"
            readonly property real cssPixelSize: 9.5
            text: root.label
            color: root.accent ? tokens.accent : tokens.textDim
            font.pointSize: cssPixelSize * 0.75
            font.letterSpacing: 1.33
            font.weight: Font.Bold
            font.capitalization: Font.AllUppercase
        }
        Text {
            id: valueText
            objectName: "slotValue"
            readonly property real cssPixelSize: 12.5
            text: root.value
            color: root.alert ? tokens.accentHot : tokens.text
            font.pointSize: cssPixelSize * 0.75
            font.weight: Font.ExtraBold
        }
    }

    SequentialAnimation on opacity {
        running: root.breathing
        loops: Animation.Infinite
        NumberAnimation { to: 0.86; duration: tokens.finalMinutesMs / 2; easing.type: Easing.InOutQuad }
        NumberAnimation { to: 1.0; duration: tokens.finalMinutesMs / 2; easing.type: Easing.InOutQuad }
    }
}
