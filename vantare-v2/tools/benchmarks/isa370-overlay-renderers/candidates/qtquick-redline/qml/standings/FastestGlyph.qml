import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property bool flightActive: false
    property bool resident: true
    property real fromX: 0
    property real fromY: 0
    property real toX: 0
    property real toY: 0
    readonly property int flightDurationMs: tokens.fastestMs
    readonly property var flightBezier: tokens.crownBezier
    width: resident ? 10 : 12
    height: resident ? tokens.fastestGlyphHeight : 14

    Theme.RedlineTokens { id: tokens }

    Component.onCompleted: {
        if (resident)
            residentReveal.start()
    }

    function fly(startX, startY, targetX, targetY) {
        fromX = startX
        fromY = startY
        toX = targetX
        toY = targetY
        x = startX
        y = startY
        opacity = 1
        scale = 1
        flightActive = true
        flight.restart()
    }

    Canvas {
        id: canvas
        anchors.fill: parent
        onPaint: {
            var ctx = getContext("2d")
            var centerX = root.resident ? 5 : 6
            var centerY = root.resident ? 7 : 8
            var radius = root.resident ? 4 : 5
            ctx.reset()
            ctx.strokeStyle = tokens.fastest
            ctx.fillStyle = tokens.fastest
            ctx.lineWidth = 1.6
            ctx.fillRect(centerX - 1.5, 0, 3, 2)
            ctx.beginPath()
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            var hand = root.resident ? 2.2 : 2.4
            ctx.lineTo(centerX + hand, centerY - hand)
            ctx.stroke()
        }
    }

    SequentialAnimation {
        id: flight
        ParallelAnimation {
            NumberAnimation {
                target: root; property: "x"; to: root.toX
                duration: tokens.fastestMs * 0.7
                easing.type: Easing.BezierSpline
                easing.bezierCurve: tokens.crownBezier
            }
            NumberAnimation {
                target: root; property: "y"; to: root.toY
                duration: tokens.fastestMs * 0.7
                easing.type: Easing.BezierSpline
                easing.bezierCurve: tokens.crownBezier
            }
            NumberAnimation {
                target: root; property: "scale"; to: 1.35
                duration: tokens.fastestMs * 0.7
                easing.type: Easing.OutCubic
            }
        }
        ParallelAnimation {
            NumberAnimation { target: root; property: "scale"; to: 1; duration: tokens.fastestMs * 0.3 }
            NumberAnimation { target: root; property: "opacity"; to: 0; duration: tokens.fastestMs * 0.3 }
        }
        ScriptAction { script: root.flightActive = false }
    }

    SequentialAnimation {
        id: residentReveal
        ScriptAction { script: root.opacity = 0 }
        PauseAnimation { duration: tokens.fastestResidentDelayMs }
        NumberAnimation { target: root; property: "opacity"; to: 1; duration: tokens.fastestResidentFadeMs; easing.type: Easing.OutCubic }
    }
}
