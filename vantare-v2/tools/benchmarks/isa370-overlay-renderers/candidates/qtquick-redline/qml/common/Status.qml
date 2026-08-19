import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string message: ""
    property string kind: "unavailable"

    visible: message.length > 0
    implicitHeight: visible ? 34 : 0

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        anchors.fill: parent
        radius: 7
        color: root.kind === "error" ? "#332024" : "#1f1f22"
        border.width: 1
        border.color: root.kind === "error" ? tokens.accent : "#2fe8e8e8"
    }

    Text {
        anchors.fill: parent
        anchors.margins: 8
        text: root.message
        color: tokens.textMuted
        font.pixelSize: 11
        font.weight: Font.DemiBold
        elide: Text.ElideRight
        verticalAlignment: Text.AlignVCenter
    }
}
