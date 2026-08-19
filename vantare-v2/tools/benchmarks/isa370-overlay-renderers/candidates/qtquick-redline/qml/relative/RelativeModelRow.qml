import QtQuick 2.15

Item {
    id: root
    objectName: "modelRow-" + rowId + "-" + mode

    required property int index
    required property string rowId
    required property var position
    required property string driverNumber
    required property string driverName
    required property string vehicleClass
    required property string gapText
    required property bool isPlayer
    required property string side
    required property string tone
    required property var gapSeconds

    property string mode: "all"
    property bool reducedMotion: false
    property bool modelReady: false
    readonly property bool removalRunning: removalAnimation.running
    property real enterScaleY: 1
    property real transitionOpacity: 1
    readonly property real visualEnterScaleY: reducedMotion ? 1 : enterScaleY
    property int crossSlot: -1
    property string crossDirection: ""
    property string previousSide: ""
    readonly property bool matches: mode === "all"
                                    || (mode === "player" && isPlayer)
                                    || (!isPlayer && mode === side)
    readonly property var rowData: ({
        "id": rowId,
        "position": position,
        "driverNumber": driverNumber,
        "driverName": driverName,
        "vehicleClass": vehicleClass,
        "gapText": gapText,
        "isPlayer": isPlayer,
        "side": side,
        "tone": tone,
        "gapSeconds": gapSeconds,
        "visualIndex": index
    })

    width: parent ? parent.width : 404
    height: root.matches ? 30 : 0
    opacity: root.reducedMotion ? 1 : root.transitionOpacity
    visible: root.matches
    ListView.delayRemove: removalAnimation.running
    transform: Scale {
        origin.x: root.width / 2
        origin.y: root.height / 2
        yScale: root.visualEnterScaleY
    }

    RelativeTokens { id: tokens }

    signal crossDetected(string direction)

    function acceptCross(direction, slot) {
        crossSlot = slot
        if (crossSlot >= 0) {
            crossDirection = direction
            crossReset.restart()
        } else {
            crossDirection = ""
        }
    }

    Component.onCompleted: previousSide = side
    onSideChanged: {
        if (modelReady && previousSide.length > 0 && previousSide !== side && !isPlayer)
            crossDetected(side === "ahead" ? "lost" : "gained")
        previousSide = side
    }
    Timer {
        id: crossReset
        interval: tokens.crossMs + tokens.crossStaggerMs * 2
        onTriggered: root.crossDirection = ""
    }

    onReducedMotionChanged: {
        if (reducedMotion && removalAnimation.running) {
            removalAnimation.stop()
            root.transitionOpacity = 0
            root.height = 0
        }
    }
    ListView.onRemove: {
        if (root.modelReady && !root.isPlayer && !root.reducedMotion)
            removalAnimation.start()
        else {
            root.transitionOpacity = 0
            root.height = 0
        }
    }
    ParallelAnimation {
        id: removalAnimation
        NumberAnimation {
            target: root; property: "transitionOpacity"; to: 0
            duration: !root.modelReady || root.reducedMotion ? 0 : tokens.ghostMs
            easing.type: Easing.InCubic
        }
        NumberAnimation {
            target: root; property: "height"; to: 0
            duration: !root.modelReady || root.reducedMotion ? 0 : tokens.ghostMs
            easing.type: Easing.InCubic
        }
    }
}
