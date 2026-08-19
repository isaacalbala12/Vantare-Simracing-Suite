import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property bool hot: false
    width: 12
    height: 14

    Theme.RedlineTokens { id: tokens }

    function flyTo(targetX, targetY) {
        x = targetX
        y = targetY
    }

    Canvas {
        id: canvas
        anchors.fill: parent
        onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = tokens.fastest
            ctx.fillStyle = tokens.fastest
            ctx.lineWidth = 1.6
            ctx.fillRect(4.5, 0, 3, 2)
            ctx.beginPath()
            ctx.arc(6, 8, 5, 0, Math.PI * 2)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(6, 8)
            ctx.lineTo(8.4, 5.6)
            ctx.stroke()
        }
    }

    Rectangle {
        anchors.centerIn: parent
        width: 18
        height: 18
        radius: 9
        color: "transparent"
        border.width: 1
        border.color: tokens.fastest
        opacity: root.hot ? 0.0 : 0.45

        Behavior on opacity {
            NumberAnimation { duration: tokens.fastestHotMs; easing.type: Easing.OutCubic }
        }
    }

    Behavior on x {
        NumberAnimation {
            duration: tokens.fastestMs
            easing.type: Easing.BezierSpline
            easing.bezierCurve: tokens.flipBezier
        }
    }
    Behavior on y {
        NumberAnimation {
            duration: tokens.fastestMs
            easing.type: Easing.BezierSpline
            easing.bezierCurve: tokens.flipBezier
        }
    }
}
