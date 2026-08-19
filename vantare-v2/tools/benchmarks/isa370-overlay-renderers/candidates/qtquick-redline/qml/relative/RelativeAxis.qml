import QtQuick 2.15

Item {
    id: root

    property string label: ""
    property bool labelFirst: true

    implicitHeight: 18
    width: parent ? parent.width : tokens.panelWidth - tokens.panelPadding * 2

    RelativeTokens { id: tokens }

    Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 8

        Text {
            visible: root.labelFirst
            width: visible ? implicitWidth : 0
            anchors.verticalCenter: parent.verticalCenter
            text: root.label
            color: tokens.textDim
            font.family: tokens.fontFamily
            font.pixelSize: Math.round(8.5)
            font.weight: Font.ExtraBold
            font.letterSpacing: 1.35
        }
        Rectangle {
            width: Math.max(0, parent.width - axisLabelA.width - axisLabelB.width - parent.spacing)
            height: 1.5
            anchors.verticalCenter: parent.verticalCenter
            radius: 1
            color: tokens.accentHot
            opacity: 0.85
        }
        Text {
            id: axisLabelA
            visible: false
            text: root.labelFirst ? root.label : ""
        }
        Text {
            id: axisLabelB
            visible: !root.labelFirst
            width: visible ? implicitWidth : 0
            anchors.verticalCenter: parent.verticalCenter
            text: root.label
            color: tokens.textDim
            font.family: tokens.fontFamily
            font.pixelSize: Math.round(8.5)
            font.weight: Font.ExtraBold
            font.letterSpacing: 1.35
        }
    }
}
