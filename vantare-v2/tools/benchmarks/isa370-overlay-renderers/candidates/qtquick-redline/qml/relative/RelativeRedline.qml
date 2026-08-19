pragma ComponentBehavior: Bound

import QtQuick 2.15

Item {
    id: root
    objectName: "relativeRedline"

    property var rowsModel: null
    property string variant: "mirror"
    property bool showHeader: true
    property bool reducedMotion: false
    property string statusMessage: ""
    property string playerClass: ""
    property int playerIndex: -1

    width: tokens.panelWidth
    implicitWidth: tokens.panelWidth
    implicitHeight: panel.height + (statusMessage.length > 0 ? status.height + 8 : 0)

    RelativeTokens { id: tokens }

    function shortClass(vehicleClass) {
        const name = String(vehicleClass || "").trim().toUpperCase()
        return name === "HYPERCAR" ? "HY" : name === "LMGT3" ? "GT3" : name
    }

    Rectangle {
        id: panel
        objectName: "relativePanel"
        width: parent.width
        height: content.height + tokens.panelPadding * 2
        radius: tokens.panelRadius
        border.width: 1
        border.color: tokens.panelBorder
        gradient: Gradient {
            GradientStop { position: 0.0; color: tokens.panelTop }
            GradientStop { position: 0.30; color: tokens.panelMiddle }
            GradientStop { position: 1.0; color: tokens.panelBottom }
        }

        Column {
            id: content
            x: tokens.panelPadding
            y: tokens.panelPadding
            width: parent.width - tokens.panelPadding * 2
            spacing: 0

            Item {
                width: parent.width
                height: root.showHeader ? 34 : 0
                visible: root.showHeader

                Repeater {
                    model: root.rowsModel
                    delegate: RelativeModelRow {
                        id: headerDelegate
                        mode: "player"
                        width: content.width
                        height: matches ? 34 : 0

                        Component.onCompleted: {
                            if (isPlayer) {
                                root.playerClass = vehicleClass
                                root.playerIndex = index
                            }
                        }
                        onVehicleClassChanged: {
                            if (isPlayer)
                                root.playerClass = vehicleClass
                        }

                        Row {
                            anchors.left: parent.left
                            anchors.leftMargin: 8
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 22

                            Row {
                                spacing: 8
                                Text {
                                    text: "P"
                                    color: tokens.accent
                                    font.family: tokens.fontFamily
                                    font.pixelSize: Math.round(9.5)
                                    font.weight: Font.Bold
                                    font.letterSpacing: 1.35
                                }
                                Text {
                                    text: String(headerDelegate.position)
                                    color: tokens.text
                                    font.family: tokens.fontFamily
                                    font.pixelSize: Math.round(12.5)
                                    font.weight: Font.ExtraBold
                                }
                            }
                            Row {
                                spacing: 8
                                Text {
                                    text: "CLASS"
                                    color: tokens.textDim
                                    font.family: tokens.fontFamily
                                    font.pixelSize: Math.round(9.5)
                                    font.weight: Font.Bold
                                    font.letterSpacing: 1.35
                                }
                                Text {
                                    text: root.shortClass(headerDelegate.vehicleClass)
                                    color: tokens.text
                                    font.family: tokens.fontFamily
                                    font.pixelSize: Math.round(12.5)
                                    font.weight: Font.ExtraBold
                                }
                            }
                        }
                    }
                }
            }

            Loader {
                id: variantLoader
                width: parent.width
                sourceComponent: root.variant === "mirror" ? mirrorComponent
                               : root.variant === "proximity" ? proximityComponent
                               : root.variant === "traffic" ? trafficComponent
                               : null
            }
        }
    }

    Rectangle {
        id: status
        anchors.top: panel.bottom
        anchors.topMargin: 8
        width: parent.width
        height: 34
        visible: root.statusMessage.length > 0
        radius: 7
        color: "#1f1f22"
        border.width: 1
        border.color: tokens.panelBorder
        Text {
            anchors.fill: parent
            anchors.margins: 8
            text: root.statusMessage
            color: tokens.textDim
            font.family: tokens.fontFamily
            font.pixelSize: 11
            font.weight: Font.DemiBold
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
        }
    }

    Component {
        id: mirrorComponent
        MirrorRelative {
            width: variantLoader.width
            rowsModel: root.rowsModel
            playerClass: root.playerClass
            reducedMotion: root.reducedMotion
        }
    }
    Component {
        id: proximityComponent
        ProximityRelative {
            width: variantLoader.width
            rowsModel: root.rowsModel
            playerIndex: root.playerIndex
            playerClass: root.playerClass
            reducedMotion: root.reducedMotion
        }
    }
    Component {
        id: trafficComponent
        TrafficRelative {
            width: variantLoader.width
            rowsModel: root.rowsModel
            playerClass: root.playerClass
            reducedMotion: root.reducedMotion
        }
    }
}
