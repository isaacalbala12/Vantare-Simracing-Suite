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
    visible: root.matches

    RelativeTokens { id: tokens }

    Behavior on y {
        NumberAnimation {
            id: flipAnimation
            duration: root.reducedMotion ? 0 : Math.min(
                tokens.flipMaxMs,
                tokens.flipBaseMs
                    + Math.abs(flipAnimation.to - flipAnimation.from)
                    / tokens.rowStride * tokens.flipPerRowMs
            )
            easing.type: Easing.BezierSpline
            easing.bezierCurve: tokens.flipBezier
        }
    }

    Component.onCompleted: previousSide = side
    onSideChanged: {
        if (previousSide.length > 0 && previousSide !== side && !isPlayer) {
            crossDirection = side === "ahead" ? "lost" : "gained"
            crossReset.restart()
        }
        previousSide = side
    }
    Timer {
        id: crossReset
        interval: tokens.crossMs + tokens.crossStaggerMs * 2
        onTriggered: root.crossDirection = ""
    }
}
