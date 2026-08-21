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
    property var displayModel: []
    readonly property int slotCount: rowSlots.count

    implicitWidth: tokens.panelWidth
    implicitHeight: panel.implicitHeight

    Theme.RedlineTokens { id: tokens }
    ListModel { id: rowSlots }

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

    function syncDisplayModel() {
        var next = displayItems()
        displayModel = next
        while (rowSlots.count < next.length)
            rowSlots.append({})
    }

    onRowModelChanged: syncDisplayModel()
    onBattleChanged: syncDisplayModel()
    Component.onCompleted: syncDisplayModel()

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
                    model: rowSlots
                    delegate: Item {
                        id: slot
                        required property int index
                        objectName: "standingsSlot-" + index
                        property var itemData: index < root.displayModel.length
                            ? root.displayModel[index] : null
                        property var retainedRowData: ({})
                        width: visualRows.width
                        visible: itemData !== null
                        height: !visible ? 0 : itemData.kind === "battle"
                            ? (String(root.battle.stage || "seam") === "box" ? 84 : 65)
                            : 30

                        onItemDataChanged: {
                            if (itemData && itemData.kind === "row")
                                retainedRowData = itemData
                            if (itemData && itemData.kind === "battle" && battleVisual.item)
                                battleVisual.item.itemData = itemData
                        }

                        StandingsRow {
                            property var itemData: slot.retainedRowData
                            width: parent.width
                            visible: slot.itemData !== null && slot.itemData.kind === "row"
                            rowIndex: Number(itemData.row ? itemData.row.rowIndex || 0 : 0)
                            rowId: String(itemData.row ? itemData.row.id || "" : "")
                            classPosition: Number(itemData.row ? itemData.row.classPosition || rowIndex + 1 : 0)
                            driverNumber: String(itemData.row ? itemData.row.driverNumber || "" : "")
                            driverName: String(itemData.row ? itemData.row.driverName || "" : "")
                            bestLapText: String(itemData.row ? itemData.row.bestLapText || "—" : "—")
                            gapText: String(itemData.row ? itemData.row.gapText || "—" : "—")
                            isPlayer: Boolean(itemData.row && itemData.row.isPlayer)
                            isClassLeader: itemData.row && itemData.row.isClassLeader !== undefined
                                ? Boolean(itemData.row.isClassLeader) : rowIndex === 0
                            inPit: Boolean(itemData.row && itemData.row.inPit)
                            isSessionBest: Boolean(itemData.row && itemData.row.isSessionBest)
                            tireCompound: String(itemData.row ? itemData.row.tireReveal || "" : "")
                            tireLeaving: Boolean(itemData.row && itemData.row.tireLeaving)
                            battleCharge: itemData.row && itemData.row.battleCharge !== undefined
                                ? Number(itemData.row.battleCharge) : -1
                            positionDelta: Number(itemData.row ? itemData.row.positionDelta || 0 : 0)
                            flipOffset: Number(itemData.row ? itemData.row.flipOffset || 0 : 0)
                            overtakeDirection: String(itemData.row ? itemData.row.overtakeDirection || "" : "")
                            overtakeIndex: Number(itemData.row ? itemData.row.overtakeIndex || 0 : 0)
                            retiring: Boolean(itemData.row && itemData.row.retiring)
                            entering: Boolean(itemData.row && itemData.row.entering)
                            hot: Boolean(itemData.row && itemData.row.hot)
                            reducedMotion: root.reducedMotion
                        }

                        Loader {
                            id: battleVisual
                            width: parent.width
                            active: slot.itemData !== null && slot.itemData.kind === "battle"
                            visible: active
                            sourceComponent: battleDelegate
                            onLoaded: item.itemData = slot.itemData
                        }
                    }
                }
            }
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
