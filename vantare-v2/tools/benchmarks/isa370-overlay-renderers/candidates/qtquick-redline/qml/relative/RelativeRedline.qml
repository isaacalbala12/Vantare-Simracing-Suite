pragma ComponentBehavior: Bound

import QtQuick 2.15
import "../common" as Common

Item {
    id: root
    objectName: "relativeRedline"

    property var rowsModel: null
    property string variant: "mirror"
    property bool showHeader: true
    property bool reducedMotion: false
    property string statusMessage: ""
    property string playerClass: ""
    property string playerRowId: ""
    property int playerIndex: -1
    readonly property bool modelReady: rowsModel !== null
                                       && String(rowsModel.status || "") === "ready"

    width: tokens.panelWidth
    implicitWidth: tokens.panelWidth
    implicitHeight: panel.height + (statusMessage.length > 0 ? status.height + 8 : 0)
    height: implicitHeight

    RelativeTokens { id: tokens }

    function shortClass(vehicleClass) {
        const name = String(vehicleClass || "").trim().toUpperCase()
        return name === "HYPERCAR" ? "HY" : name === "LMGT3" ? "GT3" : name
    }

    function syncPlayer(rowId, vehicleClass, index, isPlayer) {
        if (!isPlayer)
            return
        playerRowId = rowId
        playerClass = vehicleClass
        playerIndex = index
    }

    Common.Panel {
        id: panel
        objectName: "relativePanel"
        width: parent.width
        height: implicitHeight

        Column {
            id: content
            width: panel.contentItem.width
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

                        function sync() {
                            root.syncPlayer(rowId, vehicleClass, index, isPlayer)
                        }
                        Component.onCompleted: sync()
                        Component.onDestruction: {
                            if (root.playerRowId === rowId) {
                                root.playerRowId = ""
                                root.playerClass = ""
                                root.playerIndex = -1
                            }
                        }
                        onVehicleClassChanged: sync()
                        onIndexChanged: sync()
                        onIsPlayerChanged: sync()

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

    Common.Status {
        id: status
        anchors.top: panel.bottom
        anchors.topMargin: 8
        width: parent.width
        height: implicitHeight
        message: root.statusMessage
        kind: root.modelReady ? "unavailable" : "error"
    }

    Component {
        id: mirrorComponent
        MirrorRelative {
            width: variantLoader.width
            rowsModel: root.rowsModel
            playerClass: root.playerClass
            playerIndex: root.playerIndex
            modelReady: root.modelReady
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
            modelReady: root.modelReady
            reducedMotion: root.reducedMotion
        }
    }
    Component {
        id: trafficComponent
        TrafficRelative {
            width: variantLoader.width
            rowsModel: root.rowsModel
            playerClass: root.playerClass
            modelReady: root.modelReady
            reducedMotion: root.reducedMotion
        }
    }
}
