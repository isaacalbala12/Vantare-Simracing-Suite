import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string label: ""
    property string reading: "0%"
    property real value: 0.0
    property color fillColor: "#e8e8e8"
    property bool reducedMotion: false
    property bool peakEnabled: false
    property real peakValue: 0.0
    property bool peakVisible: false

    readonly property real clampedValue: Math.max(0.0, Math.min(1.0, value))
    readonly property bool engaged: value > 0.02
    readonly property bool saturated: value >= 0.99
    readonly property int fillDuration: reducedMotion ? 0 : 90
    readonly property int haloDuration: reducedMotion ? 0 : 160
    readonly property int peakPositionDuration: reducedMotion ? 0 : 120
    readonly property int peakOpacityDuration: reducedMotion ? 0 : 220
    readonly property real visualScale: fillScale.yScale
    readonly property bool fillMoving: fillAnimation.running
    readonly property real fillHeight: fill.height
    readonly property real wellHeight: well.height

    property bool visualReady: false

    Theme.RedlineTokens { id: tokens }

    function peakTargetY() {
        return well.height - Math.max(0.0, Math.min(1.0, peakValue)) * well.height - peak.height / 2
    }

    function snapVisuals() {
        fillAnimation.stop()
        haloAnimation.stop()
        peakPositionAnimation.stop()
        peakOpacityAnimation.stop()
        fillScale.yScale = clampedValue
        halo.opacity = saturated ? 1.0 : 0.0
        peak.y = peakTargetY()
        peak.opacity = peakVisible ? 1.0 : 0.0
    }

    function animateFill() {
        if (!visualReady)
            return
        if (reducedMotion) {
            snapVisuals()
            return
        }
        fillAnimation.stop()
        fillAnimation.from = fillScale.yScale
        fillAnimation.to = clampedValue
        fillAnimation.restart()
        haloAnimation.stop()
        haloAnimation.from = halo.opacity
        haloAnimation.to = saturated ? 1.0 : 0.0
        haloAnimation.restart()
    }

    function animatePeakPosition() {
        if (!visualReady)
            return
        if (reducedMotion) {
            snapVisuals()
            return
        }
        peakPositionAnimation.stop()
        peakPositionAnimation.from = peak.y
        peakPositionAnimation.to = peakTargetY()
        peakPositionAnimation.restart()
    }

    function animatePeakOpacity() {
        if (!visualReady)
            return
        if (reducedMotion) {
            snapVisuals()
            return
        }
        peakOpacityAnimation.stop()
        peakOpacityAnimation.from = peak.opacity
        peakOpacityAnimation.to = peakVisible ? 1.0 : 0.0
        peakOpacityAnimation.restart()
    }

    onValueChanged: animateFill()
    onPeakValueChanged: animatePeakPosition()
    onPeakVisibleChanged: animatePeakOpacity()
    onReducedMotionChanged: {
        if (reducedMotion)
            snapVisuals()
    }

    Component.onCompleted: {
        snapVisuals()
        visualReady = true
    }

    Rectangle {
        id: well
        objectName: "pedalWell"
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: parent.height - 25
        radius: 4
        color: "#0a0a0b"
        border.width: 1
        border.color: "#12e8e8e8"
        clip: true

        Rectangle {
            id: fill
            objectName: "pedalFill"
            anchors.fill: parent
            color: root.fillColor
            transform: Scale {
                id: fillScale
                origin.x: fill.width / 2
                origin.y: fill.height
                xScale: 1.0
                yScale: 0.0
            }
        }

        Rectangle {
            id: halo
            anchors.fill: parent
            anchors.margins: 1
            radius: 3
            color: "transparent"
            border.width: 1
            border.color: "#52e8e8e8"
            opacity: 0.0
        }

        Rectangle {
            id: peak
            objectName: "brakePeak"
            visible: root.peakEnabled
            x: 0
            y: well.height - height / 2
            width: well.width
            height: 1.5
            radius: 1
            color: "#8ce8e8e8"
            opacity: 0.0
        }
    }

    Item {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: well.bottom
        anchors.bottom: parent.bottom
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 5
            text: root.label
            color: root.engaged ? tokens.text : tokens.textDim
            font.family: "Barlow Semi Condensed"
            font.pixelSize: 8
            font.weight: Font.ExtraBold
            font.capitalization: Font.AllUppercase
            font.letterSpacing: 0.96
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            text: root.reading
            color: tokens.text
            font.family: "Barlow Semi Condensed"
            font.pixelSize: 11
            font.weight: Font.ExtraBold
            font.letterSpacing: -0.22
        }
    }

    NumberAnimation { id: fillAnimation; target: fillScale; property: "yScale"; duration: root.fillDuration; easing.type: Easing.Linear }
    NumberAnimation { id: haloAnimation; target: halo; property: "opacity"; duration: root.haloDuration; easing.type: Easing.OutQuad }
    NumberAnimation { id: peakPositionAnimation; target: peak; property: "y"; duration: root.peakPositionDuration; easing.type: Easing.Linear }
    NumberAnimation { id: peakOpacityAnimation; target: peak; property: "opacity"; duration: root.peakOpacityDuration; easing.type: Easing.OutQuad }
}
