pragma ComponentBehavior: Bound

import QtQuick 2.15
import "../common" as Common
import "../theme" as Theme

Item {
    id: root

    property string vehicleClass: ""
    property var rowModel: []
    property var battle: null
    property bool showSessionHeader: false
    property string sessionLabel: ""
    property string remainingText: ""
    property string lapText: ""
    property bool finalMinutes: false
    property bool reducedMotion: false

    implicitWidth: tokens.panelWidth
    implicitHeight: panel.implicitHeight

    Theme.RedlineTokens { id: tokens }

    function displayItems() {
        var rows = rowModel || []
        if (!battle)
            return rows.map(function(row) { return { kind: "row", row: row } })
        var aheadIndex = battle.aheadIndex === undefined ? -1 : Number(battle.aheadIndex)
        if (aheadIndex < 0 && battle.aheadId) {
            for (var i = 0; i < rows.length; i++) {
                if (String(rows[i].id) === String(battle.aheadId)) {
                    aheadIndex = i
                    break
                }
            }
        }
        if (aheadIndex < 0 || aheadIndex + 1 >= rows.length)
            return rows.map(function(row) { return { kind: "row", row: row } })
        var result = []
        for (var index = 0; index < rows.length; index++) {
            if (index === aheadIndex) {
                result.push({ kind: "battle", ahead: rows[index], behind: rows[index + 1] })
                index++
            } else {
                result.push({ kind: "row", row: rows[index] })
            }
        }
        return result
    }

    function activeRowCount() {
        var count = 0
        var rows = rowModel || []
        for (var index = 0; index < rows.length; index++) {
            if (!rows[index].retiring)
                count++
        }
        return count
    }

    Common.Panel {
        id: panel
        width: root.width
        height: implicitHeight

        Column {
            width: parent.width

            Item {
                width: parent.width
                height: root.showSessionHeader ? sessionRow.implicitHeight + 14 : 0
                visible: root.showSessionHeader

                Row {
                    id: sessionRow
                    anchors.left: parent.left
                    anchors.leftMargin: 8
                    anchors.top: parent.top
                    anchors.topMargin: 4
                    spacing: 22

                    Common.Slot {
                        objectName: "sessionSlot"
                        label: root.sessionLabel
                        value: root.remainingText
                        accent: true
                        alert: root.finalMinutes
                        breathing: root.finalMinutes
                    }
                    Common.Slot {
                        objectName: "lapSlot"
                        visible: root.lapText.length > 0
                        label: "LAP"
                        value: root.lapText
                    }
                }
            }

            Item {
                width: parent.width
                height: root.vehicleClass.length > 0 ? 30 : 0
                visible: root.vehicleClass.length > 0
                Rectangle {
                    objectName: "classChip"
                    anchors.left: parent.left; anchors.leftMargin: 6
                    anchors.top: parent.top; anchors.topMargin: 2
                    width: classLabel.implicitWidth + 16; height: 19; radius: 5
                    color: "transparent"; border.width: 1.5; border.color: tokens.accent
                    Text {
                        id: classLabel; anchors.centerIn: parent
                        text: root.vehicleClass.toUpperCase()
                        color: tokens.text; font.pixelSize: 10; font.weight: Font.ExtraBold
                        font.letterSpacing: 1.4
                    }
                }
                Text {
                    objectName: "classCount"
                    anchors.right: parent.right; anchors.rightMargin: 6
                    anchors.top: parent.top; anchors.topMargin: 2
                    text: root.activeRowCount()
                    color: tokens.textDim; font.pixelSize: 10; font.weight: Font.Bold
                }
            }

            Column {
                id: visualRows
                width: parent.width

                Repeater {
                    model: root.displayItems()
                    delegate: Loader {
                        required property var modelData
                        width: visualRows.width
                        sourceComponent: modelData.kind === "battle" ? battleDelegate : rowDelegate
                        onLoaded: item.itemData = modelData
                    }
                }
            }
        }
    }

    Component {
        id: rowDelegate
        StandingsRow {
            property var itemData: ({})
            width: visualRows.width
            rowIndex: Number(itemData.row.rowIndex || 0)
            rowId: String(itemData.row.id || "")
            classPosition: Number(itemData.row.classPosition || rowIndex + 1)
            driverNumber: String(itemData.row.driverNumber || "")
            driverName: String(itemData.row.driverName || "")
            bestLapText: String(itemData.row.bestLapText || "—")
            gapText: String(itemData.row.gapText || "—")
            isPlayer: Boolean(itemData.row.isPlayer)
            isClassLeader: itemData.row.isClassLeader === undefined
                ? rowIndex === 0 : Boolean(itemData.row.isClassLeader)
            inPit: Boolean(itemData.row.inPit)
            isSessionBest: Boolean(itemData.row.isSessionBest)
            tireCompound: String(itemData.row.tireReveal || "")
            tireLeaving: Boolean(itemData.row.tireLeaving)
            battleCharge: itemData.row.battleCharge === undefined ? -1 : Number(itemData.row.battleCharge)
            positionDelta: Number(itemData.row.positionDelta || 0)
            flipOffset: Number(itemData.row.flipOffset || 0)
            overtakeDirection: String(itemData.row.overtakeDirection || "")
            overtakeIndex: Number(itemData.row.overtakeIndex || 0)
            retiring: Boolean(itemData.row.retiring)
            entering: Boolean(itemData.row.entering)
            hot: Boolean(itemData.row.hot)
            reducedMotion: root.reducedMotion
        }
    }

    Component {
        id: battleDelegate
        Battle {
            property var itemData: ({})
            width: visualRows.width + 4
            x: -2
            aheadRow: itemData.ahead
            behindRow: itemData.behind
            stage: String(root.battle.stage || "seam")
            intervalSeconds: Number(root.battle.intervalSeconds || 0)
            reducedMotion: root.reducedMotion
        }
    }
}
