pragma ComponentBehavior: Bound

import QtQuick 2.15
import QtQuick.Effects
import "../theme" as Theme

Item {
    id: root

    default property alias content: contentItem.data
    property alias contentItem: contentItem
    property real panelRadius: tokens.panelRadius
    property real panelPadding: tokens.panelPadding
    property color gradientTop: tokens.panelTop
    property color gradientMiddle: "#0f0f10"
    property color gradientBottom: tokens.panelBottom
    property real gradientMiddlePosition: 0.30
    property bool shadowEnabled: true
    property real shadowBlurRadius: 26
    property real shadowVerticalOffset: 10
    property real shadowOpacity: 0.45
    readonly property int shadowBlurMax: 32
    readonly property real shadowBlur: shadowBlurRadius / shadowBlurMax

    implicitWidth: tokens.panelWidth
    implicitHeight: contentItem.childrenRect.height + panelPadding * 2

    Theme.RedlineTokens { id: tokens }

    Rectangle {
        id: background
        anchors.fill: parent
        radius: root.panelRadius
        border.width: 1
        border.color: tokens.panelBorder
        gradient: Gradient {
            GradientStop { position: 0.0; color: root.gradientTop }
            GradientStop { position: root.gradientMiddlePosition; color: root.gradientMiddle }
            GradientStop { position: 1.0; color: root.gradientBottom }
        }
        layer.enabled: true
        layer.effect: MultiEffect {
            objectName: "panelShadow"
            shadowEnabled: root.shadowEnabled
            shadowColor: Qt.rgba(0, 0, 0, root.shadowOpacity)
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
        radius: root.panelRadius
        color: tokens.panelBorderTop
    }

    Item {
        id: contentItem
        objectName: "panelContent"
        anchors.fill: parent
        anchors.margins: root.panelPadding
    }
}
