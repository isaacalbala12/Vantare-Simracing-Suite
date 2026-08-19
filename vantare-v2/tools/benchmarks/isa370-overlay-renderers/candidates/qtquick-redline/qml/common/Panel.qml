import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    default property alias content: contentItem.data
    property alias contentItem: contentItem

    implicitWidth: tokens.panelWidth
    implicitHeight: contentItem.childrenRect.height + tokens.panelPadding * 2

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        anchors.fill: parent
        radius: tokens.panelRadius
        border.width: 1
        border.color: tokens.panelBorder
        gradient: Gradient {
            GradientStop { position: 0.0; color: tokens.panelTop }
            GradientStop { position: 0.30; color: "#0f0f10" }
            GradientStop { position: 1.0; color: tokens.panelBottom }
        }
    }

    Item {
        id: contentItem
        anchors.fill: parent
        anchors.margins: tokens.panelPadding
    }
}
