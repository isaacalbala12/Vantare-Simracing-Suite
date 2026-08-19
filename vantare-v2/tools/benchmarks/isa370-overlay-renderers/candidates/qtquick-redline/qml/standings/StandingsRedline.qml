pragma ComponentBehavior: Bound

import QtQuick 2.15
import "../common" as Common
import "../theme" as Theme

Item {
    id: root

    // Prepared presentation models only. Each class item exposes
    // vehicleClass, rows, and an optional battle object.
    property var classModel: []
    property string statusMessage: ""
    property string statusKind: "unavailable"
    property bool showSessionHeader: true
    property string sessionLabel: "RACE"
    property string remainingText: "00:00"
    property string lapText: ""
    property bool finalMinutes: false

    width: tokens.panelWidth
    implicitWidth: tokens.panelWidth
    implicitHeight: blocks.height + status.implicitHeight + (status.visible ? 8 : 0)

    Theme.RedlineTokens { id: tokens }

    Column {
        id: blocks
        width: parent.width
        spacing: 10

        Repeater {
            model: root.classModel || []
            delegate: ClassBlock {
                required property int index
                required property var modelData

                width: blocks.width
                vehicleClass: String(modelData.vehicleClass || "")
                rowModel: modelData.rows || []
                battle: modelData.battle || null
                showSessionHeader: root.showSessionHeader && index === 0
                sessionLabel: root.sessionLabel
                remainingText: root.remainingText
                lapText: root.lapText
                finalMinutes: root.finalMinutes
            }
        }
    }

    Common.Status {
        id: status
        anchors.top: blocks.bottom
        anchors.topMargin: visible ? 8 : 0
        width: parent.width
        message: root.statusMessage
        kind: root.statusKind
    }
}
