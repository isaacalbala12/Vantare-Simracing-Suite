pragma ComponentBehavior: Bound

import QtQuick 2.15
import QtQuick.Effects
import "../theme" as Theme

Item {
    id: root

    default property alias content: contentItem.data
    property alias contentItem: contentItem
    readonly property real shadowVerticalOffset: 10
    readonly property int shadowBlurMax: 32
    readonly property real shadowBlur: 0.8125

    implicitWidth: tokens.panelWidth
    implicitHeight: contentItem.childrenRect.height + tokens.panelPadding * 2

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        id: background
        anchors.fill: parent
        radius: tokens.panelRadius
        border.width: 1
        border.color: tokens.panelBorder
        gradient: Gradient {
            GradientStop { position: 0.0; color: tokens.panelTop }
            GradientStop { position: 0.30; color: "#0f0f10" }
            GradientStop { position: 1.0; color: tokens.panelBottom }
        }
        layer.enabled: true
        layer.effect: MultiEffect {
            objectName: "panelShadow"
            shadowEnabled: true
            shadowColor: "#73000000"
            shadowVerticalOffset: root.shadowVerticalOffset
            shadowBlur: root.shadowBlur
            blurMax: root.shadowBlurMax
        }
    }

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.leftMargin: 1
        anchors.rightMargin: 1
        height: 1
        radius: tokens.panelRadius
        color: tokens.panelBorderTop
    }

    Item {
        id: contentItem
        objectName: "panelContent"
        anchors.fill: parent
        anchors.margins: tokens.panelPadding
    }
}
