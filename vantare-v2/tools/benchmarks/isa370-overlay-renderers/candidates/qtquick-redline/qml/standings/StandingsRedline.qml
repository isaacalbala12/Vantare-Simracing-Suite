pragma ComponentBehavior: Bound

import QtQuick 2.15
import "../common" as Common
import "../theme" as Theme

Item {
    id: root

    property var incomingSnapshot: []
    property var previousSnapshot: []
    property var classModel: []
    property var baselinePositions: ({})
    property var retiredRowIds: []
    property var enteredRowIds: []
    property var retirementGhosts: []
    property var tireReveals: ({})
    property string hotRowId: ""
    property string activeBattleKey: ""
    property string crownFromRowId: ""
    property string crownToRowId: ""
    property string lastOvertakeGainer: ""
    property string lastOvertakeLoser: ""
    property real lastCrownFromY: 0
    property real lastCrownToY: 0
    property string statusMessage: ""
    property string statusKind: "unavailable"
    property bool showSessionHeader: true
    property string sessionLabel: "RACE"
    property string remainingText: "00:00"
    property string lapText: ""
    property bool finalMinutes: false
    property bool reducedMotion: false

    width: tokens.panelWidth
    implicitWidth: tokens.panelWidth
    implicitHeight: blocks.height + status.implicitHeight + (status.visible ? 8 : 0)

    Theme.RedlineTokens { id: tokens }

    function cloneRow(row) {
        var copy = {}
        for (var key in row)
            copy[key] = row[key]
        return copy
    }

    function positions(classes) {
        var result = {}
        for (var classIndex = 0; classIndex < classes.length; classIndex++) {
            var group = classes[classIndex]
            var rows = group.rows || []
            for (var index = 0; index < rows.length; index++) {
                result[String(rows[index].id)] = {
                    classIndex: classIndex, index: index,
                    vehicleClass: String(group.vehicleClass || ""), row: rows[index]
                }
            }
        }
        return result
    }

    function bestHolder(classes) {
        for (var classIndex = 0; classIndex < classes.length; classIndex++) {
            var rows = classes[classIndex].rows || []
            for (var index = 0; index < rows.length; index++) {
                if (rows[index].isSessionBest)
                    return String(rows[index].id)
            }
        }
        return ""
    }

    function numericGap(row, index) {
        if (index === 0 || String(row.gapText || "").toUpperCase() === "INT")
            return 0
        var parsed = Number.parseFloat(String(row.gapText || "").replace(/[^\d.-]/g, ""))
        return Number.isFinite(parsed) ? parsed : null
    }

    function deriveBattle(rows) {
        if (String(sessionLabel).trim().toUpperCase() !== "RACE")
            return null
        var playerIndex = -1
        for (var p = 0; p < rows.length; p++) {
            if (rows[p].isPlayer) {
                playerIndex = p
                break
            }
        }
        if (playerIndex < 0)
            return null
        var winner = null
        for (var index = 0; index + 1 < rows.length; index++) {
            var ahead = rows[index]
            var behind = rows[index + 1]
            if (ahead.inPit || behind.inPit)
                continue
            var aheadGap = numericGap(ahead, index)
            var behindGap = numericGap(behind, index + 1)
            if (aheadGap === null || behindGap === null)
                continue
            var interval = behindGap - aheadGap
            if (interval < 0 || interval >= 0.8)
                continue
            var candidate = {
                aheadIndex: index, aheadId: String(ahead.id), behindId: String(behind.id),
                intervalSeconds: Math.round(interval * 10) / 10, stage: "seam",
                playerDistance: Math.min(Math.abs(index - playerIndex), Math.abs(index + 1 - playerIndex))
            }
            if (!winner || candidate.playerDistance < winner.playerDistance ||
                    (candidate.playerDistance === winner.playerDistance && candidate.intervalSeconds < winner.intervalSeconds))
                winner = candidate
        }
        return winner
    }

    function rowPoint(classes, rowId) {
        var y = 0
        for (var classIndex = 0; classIndex < classes.length; classIndex++) {
            var rows = classes[classIndex].rows || []
            var headerHeight = (showSessionHeader && classIndex === 0 ? 30 : 0) +
                (String(classes[classIndex].vehicleClass || "").length > 0 ? 30 : 0)
            for (var index = 0; index < rows.length; index++) {
                if (String(rows[index].id) === rowId)
                    return {
                        x: 262,
                        y: y + 8 + headerHeight + index * tokens.rowStride +
                            (tokens.rowHeight - tokens.bestCellHeight) / 2 +
                            tokens.bestCellHeight / 2 - crownFly.height / 2
                    }
            }
            y += 16 + headerHeight + rows.length * tokens.rowStride + 10
        }
        return { x: 262, y: 8 }
    }

    function applyIncomingSnapshot() {
        applySnapshot(incomingSnapshot || [])
    }

    function applySnapshot(nextClasses) {
        var prevClasses = previousSnapshot || []
        var priorVisualClasses = classModel || []
        var before = positions(prevClasses)
        var after = positions(nextClasses)
        if (prevClasses.length === 0)
            baselinePositions = after

        var retired = []
        var entered = []
        for (var oldId in before) {
            if (after[oldId] === undefined)
                retired.push(oldId)
        }
        for (var newId in after) {
            if (before[newId] === undefined && prevClasses.length > 0)
                entered.push(newId)
        }
        retiredRowIds = retired
        enteredRowIds = entered
        if (retired.length > 0) {
            var ghosts = retirementGhosts.slice()
            for (var ghostIndex = 0; ghostIndex < retired.length; ghostIndex++) {
                var ghostId = retired[ghostIndex]
                ghosts.push({ id: ghostId, position: before[ghostId] })
            }
            retirementGhosts = ghosts
        }

        var oldBest = bestHolder(prevClasses)
        var newBest = bestHolder(nextClasses)
        crownFromRowId = oldBest && newBest !== oldBest ? oldBest : ""
        crownToRowId = crownFromRowId ? newBest : ""
        if (crownToRowId) {
            hotRowId = crownToRowId
            hotCleanup.restart()
        }

        var newOvertakeGainer = ""
        var newOvertakeLoser = ""

        for (var candidateId in after) {
            if (before[candidateId] === undefined || before[candidateId].vehicleClass !== after[candidateId].vehicleClass)
                continue
            if (after[candidateId].index >= before[candidateId].index)
                continue
            for (var loserId in after) {
                if (loserId === candidateId || before[loserId] === undefined)
                    continue
                if (before[loserId].vehicleClass === after[candidateId].vehicleClass &&
                        before[loserId].index === after[candidateId].index &&
                        after[loserId].index > before[loserId].index) {
                    newOvertakeGainer = candidateId
                    newOvertakeLoser = loserId
                    break
                }
            }
            if (newOvertakeGainer)
                break
        }
        if (newOvertakeGainer) {
            lastOvertakeGainer = newOvertakeGainer
            lastOvertakeLoser = newOvertakeLoser
            overtakeCleanup.restart()
        }

        var decoratedClasses = []
        var hasDissolvingBattle = false
        for (var classIndex = 0; classIndex < nextClasses.length; classIndex++) {
            var sourceGroup = nextClasses[classIndex]
            var sourceRows = sourceGroup.rows || []
            var decoratedRows = []
            for (var index = 0; index < sourceRows.length; index++) {
                var source = sourceRows[index]
                var id = String(source.id)
                var row = cloneRow(source)
                row.rowIndex = index
                row.classPosition = index + 1
                row.isClassLeader = index === 0
                row.entering = entered.indexOf(id) >= 0
                row.hot = hotRowId === id
                row.flipOffset = before[id] !== undefined && before[id].vehicleClass === String(sourceGroup.vehicleClass || "")
                    ? (before[id].index - index) * tokens.rowStride : 0
                row.positionDelta = baselinePositions[id] !== undefined && baselinePositions[id].vehicleClass === String(sourceGroup.vehicleClass || "")
                    ? baselinePositions[id].index - index : 0
                row.overtakeDirection = id === lastOvertakeGainer ? "rise" : id === lastOvertakeLoser ? "fall" : ""
                var newTireReveal = before[id] !== undefined && before[id].row.inPit && !source.inPit &&
                    String(source.tireCompound || "") && source.tireCompound !== before[id].row.tireCompound
                    ? String(source.tireCompound) : ""
                if (newTireReveal) {
                    tireReveals[id] = newTireReveal
                    tireCleanup.restart()
                }
                row.tireReveal = String(tireReveals[id] || "")
                decoratedRows.push(row)
            }
            var visualBattle = deriveBattle(decoratedRows)
            if (visualBattle && priorVisualClasses[classIndex] && priorVisualClasses[classIndex].battle) {
                var persistedBattle = priorVisualClasses[classIndex].battle
                if (String(persistedBattle.aheadId) === String(visualBattle.aheadId) &&
                        String(persistedBattle.behindId) === String(visualBattle.behindId) &&
                        persistedBattle.stage === "box")
                    visualBattle.stage = "box"
            }
            if (!visualBattle && priorVisualClasses[classIndex] && priorVisualClasses[classIndex].battle) {
                var previousBattle = priorVisualClasses[classIndex].battle
                var dissolveIndex = -1
                for (var battleIndex = 0; battleIndex + 1 < decoratedRows.length; battleIndex++) {
                    if (String(decoratedRows[battleIndex].id) === String(previousBattle.aheadId) &&
                            String(decoratedRows[battleIndex + 1].id) === String(previousBattle.behindId)) {
                        dissolveIndex = battleIndex
                        break
                    }
                }
                if (dissolveIndex >= 0) {
                    visualBattle = {
                        aheadIndex: dissolveIndex,
                        aheadId: String(previousBattle.aheadId),
                        behindId: String(previousBattle.behindId),
                        intervalSeconds: Number(previousBattle.intervalSeconds || 0),
                        stage: "dissolve"
                    }
                    hasDissolvingBattle = true
                }
            }
            for (var retiredIndex = 0; retiredIndex < retirementGhosts.length; retiredIndex++) {
                var retiredId = String(retirementGhosts[retiredIndex].id)
                var old = retirementGhosts[retiredIndex].position
                if (old.vehicleClass !== String(sourceGroup.vehicleClass || ""))
                    continue
                var ghost = cloneRow(old.row)
                ghost.rowIndex = old.index
                ghost.classPosition = 0
                ghost.gapText = "OUT"
                ghost.retiring = true
                ghost.isClassLeader = false
                ghost.isPlayer = false
                ghost.isSessionBest = false
                decoratedRows.splice(Math.min(old.index, decoratedRows.length), 0, ghost)
            }
            decoratedClasses.push({
                vehicleClass: String(sourceGroup.vehicleClass || ""),
                rows: decoratedRows,
                battle: visualBattle
            })
        }

        classModel = decoratedClasses
        previousSnapshot = nextClasses
        if (retired.length > 0)
            retirementCleanup.restart()
        if (hasDissolvingBattle)
            battleCleanup.restart()

        var nextBattleKey = ""
        for (var battleClassIndex = 0; battleClassIndex < decoratedClasses.length; battleClassIndex++) {
            var currentBattle = decoratedClasses[battleClassIndex].battle
            if (currentBattle && currentBattle.stage !== "dissolve") {
                nextBattleKey = String(currentBattle.aheadId) + "|" + String(currentBattle.behindId)
                break
            }
        }
        if (!nextBattleKey) {
            activeBattleKey = ""
            battleCrystallize.stop()
        } else if (nextBattleKey !== activeBattleKey) {
            activeBattleKey = nextBattleKey
            battleCrystallize.restart()
        }

        if (crownFromRowId && crownToRowId) {
            var from = rowPoint(prevClasses, crownFromRowId)
            var to = rowPoint(nextClasses, crownToRowId)
            lastCrownFromY = from.y
            lastCrownToY = to.y
            crownFly.fly(from.x, from.y, to.x, to.y)
        }
    }

    function clearRetiredRows() {
        retirementGhosts = []
        var cleaned = []
        for (var classIndex = 0; classIndex < classModel.length; classIndex++) {
            var group = classModel[classIndex]
            cleaned.push({
                vehicleClass: group.vehicleClass,
                rows: group.rows.filter(function(row) { return !row.retiring }),
                battle: group.battle
            })
        }
        classModel = cleaned
    }

    function clearTires() {
        tireReveals = ({})
        remapRows(function(row) { row.tireReveal = "" })
    }

    function clearHot() {
        hotRowId = ""
        remapRows(function(row) { row.hot = false })
    }

    function clearOvertake() {
        lastOvertakeGainer = ""
        lastOvertakeLoser = ""
        remapRows(function(row) { row.overtakeDirection = "" })
    }

    function remapRows(change) {
        var remapped = []
        for (var classIndex = 0; classIndex < classModel.length; classIndex++) {
            var group = classModel[classIndex]
            var rows = []
            for (var rowIndex = 0; rowIndex < group.rows.length; rowIndex++) {
                var row = cloneRow(group.rows[rowIndex])
                change(row)
                rows.push(row)
            }
            remapped.push({ vehicleClass: group.vehicleClass, rows: rows, battle: group.battle })
        }
        classModel = remapped
    }

    function crystallizeBattle() {
        var remapped = []
        for (var classIndex = 0; classIndex < classModel.length; classIndex++) {
            var group = classModel[classIndex]
            var battle = group.battle
            if (battle && String(battle.aheadId) + "|" + String(battle.behindId) === activeBattleKey) {
                battle = {
                    aheadIndex: battle.aheadIndex, aheadId: battle.aheadId,
                    behindId: battle.behindId, intervalSeconds: battle.intervalSeconds,
                    stage: "box"
                }
            }
            remapped.push({ vehicleClass: group.vehicleClass, rows: group.rows, battle: battle })
        }
        classModel = remapped
    }

    function clearDissolvingBattles() {
        var cleaned = []
        for (var classIndex = 0; classIndex < classModel.length; classIndex++) {
            var group = classModel[classIndex]
            cleaned.push({
                vehicleClass: group.vehicleClass,
                rows: group.rows,
                battle: group.battle && group.battle.stage === "dissolve" ? null : group.battle
            })
        }
        classModel = cleaned
    }

    Timer {
        id: retirementCleanup
        objectName: "retirementCleanup"
        interval: tokens.retirementMs
        repeat: false
        onTriggered: root.clearRetiredRows()
    }

    Timer { id: tireCleanup; interval: tokens.tireMs; repeat: false; onTriggered: root.clearTires() }
    Timer { id: hotCleanup; interval: tokens.fastestHotHoldMs; repeat: false; onTriggered: root.clearHot() }
    Timer { id: overtakeCleanup; interval: tokens.overtakeMs; repeat: false; onTriggered: root.clearOvertake() }
    Timer { id: battleCrystallize; interval: tokens.battleMs; repeat: false; onTriggered: root.crystallizeBattle() }

    Timer {
        id: battleCleanup
        objectName: "battleCleanup"
        interval: tokens.battleDissolveMs
        repeat: false
        onTriggered: root.clearDissolvingBattles()
    }

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
                reducedMotion: root.reducedMotion
            }
        }
    }

    FastestGlyph {
        id: crownFly
        objectName: "flyingCrown"
        visible: flightActive
        resident: false
        z: 20
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
