import QtQuick 2.15

Item {
    id: root
    objectName: "approachIndicator"

    property real gapSeconds: 0
    property bool ahead: true
    property bool active: false
    property bool reducedMotion: false
    readonly property bool imminent: Math.abs(gapSeconds) <= 1
    readonly property real proximity: Math.max(0, Math.min(1, 1 - Math.abs(gapSeconds)))
    readonly property real rightRatio: (Math.round((1 - proximity) * 55 + 20)) / 100
    readonly property real targetWidth: Math.max(0, parent ? parent.width - 8 - parent.width * rightRatio : 0)

    height: 2
    width: targetWidth
    x: 8
    y: ahead && parent ? parent.height - height : 0
    visible: active && imminent

    RelativeTokens { id: tokens }

    Rectangle {
        id: bar
        anchors.fill: parent
        radius: 2
        color: tokens.accent
        opacity: 1
        transform: Scale {
            id: revealScale
            origin.x: 0
            origin.y: bar.height / 2
            xScale: root.reducedMotion ? 1 : 0
        }
    }

    Behavior on width {
        NumberAnimation {
            duration: root.reducedMotion ? 0 : tokens.approachTrackMs
            easing.type: Easing.OutCubic
        }
    }

    NumberAnimation {
        id: enterAnimation
        target: revealScale
        property: "xScale"
        from: 0
        to: 1
        duration: root.reducedMotion ? 0 : tokens.approachEnterMs
        easing.type: Easing.OutCubic
    }

    Component.onCompleted: {
        if (imminent)
            enterAnimation.start()
    }
    onImminentChanged: {
        if (imminent)
            enterAnimation.restart()
    }
    onReducedMotionChanged: {
        if (reducedMotion)
            revealScale.xScale = 1
    }
}
