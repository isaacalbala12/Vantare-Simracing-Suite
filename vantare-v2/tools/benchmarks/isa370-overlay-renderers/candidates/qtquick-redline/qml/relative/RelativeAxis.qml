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
        Item {
            objectName: "relativeAxisMaterial"
            width: Math.max(0, parent.width - axisLabelA.width - axisLabelB.width - parent.spacing)
            height: 10
            anchors.verticalCenter: parent.verticalCenter

            Rectangle {
                objectName: "relativeAxisGlow"
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                height: 8
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#00ff4d5c" }
                    GradientStop { position: 0.3; color: "#8cff4d5c" }
                    GradientStop { position: 0.7; color: "#8cff4d5c" }
                    GradientStop { position: 1; color: "#00ff4d5c" }
                }
            }
            Rectangle {
                objectName: "relativeAxisCore"
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                height: 1.5
                radius: 1
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#00ff4d5c" }
                    GradientStop { position: 0.3; color: "#d9ff4d5c" }
                    GradientStop { position: 0.7; color: "#d9ff4d5c" }
                    GradientStop { position: 1; color: "#00ff4d5c" }
                }
            }
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
