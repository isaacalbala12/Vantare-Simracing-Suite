import QtQuick 2.15

Item {
    id: root
    objectName: "approachIndicator"

    property var gapSeconds: null
    property bool ahead: true
    property bool active: false
    property bool reducedMotion: false
    readonly property bool hasGap: typeof gapSeconds === "number" && isFinite(gapSeconds)
    readonly property bool imminent: hasGap && Math.abs(gapSeconds) <= 1
    readonly property real proximity: hasGap
                                      ? Math.max(0, Math.min(1, 1 - Math.abs(gapSeconds)))
                                      : 0
    readonly property real rightRatio: (Math.round((1 - proximity) * 55 + 20)) / 100
    readonly property real targetWidth: Math.max(0, parent ? parent.width - 8 - parent.width * rightRatio : 0)

    height: 2
    width: targetWidth
    x: 8
    y: ahead && parent ? parent.height - height : 0
    visible: active && imminent

    RelativeTokens { id: tokens }

    Item {
        id: bar
        anchors.fill: parent
        opacity: root.reducedMotion ? 1 : 0
        transform: Scale {
            id: revealScale
            origin.x: 0
            origin.y: bar.height / 2
            xScale: root.reducedMotion ? 1 : 0
        }

        Rectangle {
            objectName: "approachGlow"
            anchors.fill: parent
            anchors.topMargin: -3
            anchors.bottomMargin: -3
            radius: 4
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "#80c1121f" }
                GradientStop { position: 1; color: "#80ff4d5c" }
            }
        }
        Rectangle {
            objectName: "approachCore"
            anchors.fill: parent
            radius: 2
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "#c1121f" }
                GradientStop { position: 1; color: "#ff4d5c" }
            }
        }
    }

    Behavior on width {
        NumberAnimation {
            duration: root.reducedMotion ? 0 : tokens.approachTrackMs
            easing.type: Easing.OutCubic
        }
    }

    ParallelAnimation {
        id: enterAnimation
        NumberAnimation {
            target: revealScale
            property: "xScale"
            from: 0
            to: 1
            duration: root.reducedMotion ? 0 : tokens.approachEnterMs
            easing.type: Easing.OutCubic
        }
        NumberAnimation {
            target: bar
            property: "opacity"
            from: 0
            to: 1
            duration: root.reducedMotion ? 0 : tokens.approachEnterMs
            easing.type: Easing.OutCubic
        }
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
        if (reducedMotion) {
            enterAnimation.stop()
            revealScale.xScale = 1
            bar.opacity = 1
        }
    }
}
