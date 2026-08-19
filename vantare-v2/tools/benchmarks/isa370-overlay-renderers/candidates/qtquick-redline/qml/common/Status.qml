import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string message: ""
    property string kind: "unavailable"
    property bool card: false
    property real horizontalPadding: 8
    property real verticalPadding: 6

    visible: message.length > 0
    implicitHeight: visible ? Math.max(card ? 34 : 0, statusText.implicitHeight + verticalPadding * 2) : 0
    height: implicitHeight

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        objectName: "statusBackground"
        anchors.fill: parent
        visible: root.card
        radius: 7
        color: root.kind === "error" ? "#332024" : "#1f1f22"
        border.width: 1
        border.color: root.kind === "error" ? tokens.accent : "#2fe8e8e8"
    }

    Text {
        id: statusText
        objectName: "statusText"
        anchors.fill: parent
        anchors.leftMargin: root.horizontalPadding
        anchors.rightMargin: root.horizontalPadding
        anchors.topMargin: root.verticalPadding
        anchors.bottomMargin: root.verticalPadding
        text: root.message
        color: tokens.textMuted
        font.pixelSize: 11
        font.weight: Font.DemiBold
        lineHeightMode: Text.ProportionalHeight
        lineHeight: 1.2
        elide: Text.ElideRight
        verticalAlignment: Text.AlignVCenter
    }
}
