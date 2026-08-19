import QtQuick 2.15
import "../common" as Common
import "../theme" as Theme

Item {
    id: root

    property string status: "ready"
    property string tone: "neutral"
    property string statusKind: status === "error" ? "error" : "unavailable"
    property string statusMessage: ""
    property real progress: 0.0
    property string deltaText: "0.000"
    property string bestLapText: "1:38.031"
    property bool showReference: true
    property bool reducedMotion: false

    readonly property int readyHeight: 96
    readonly property int barHeight: 46
    readonly property int fillDuration: reducedMotion ? 0 : 220
    readonly property int crossDuration: 700
    readonly property int bestDuration: 1100
    readonly property string referenceLabel: "BEST"
    readonly property real clampedMagnitude: Math.min(1.0, Math.abs(progress))
    readonly property real fillPercent: clampedMagnitude * 50.0
    readonly property string fillDirection: progress < 0 ? "gain" : progress > 0 ? "loss" : "neutral"
    readonly property bool crossPulseRunning: crossAnimation.running
    readonly property bool bestSweepRunning: bestAnimation.running
    readonly property real zeroScaleX: zeroScale.xScale
    readonly property real zeroScaleY: zeroScale.yScale
    readonly property real crossGlowOpacity: crossGlow.opacity
    readonly property real bestSweepOpacity: bestSweep.opacity
    readonly property bool lossFillMoving: lossFillAnimation.running
    readonly property real lossVisualWidth: lossFill.width
    readonly property real lossTargetWidth: progress > 0 ? bar.width * fillPercent / 100.0 : 0
    readonly property real gainTargetWidth: progress < 0 ? bar.width * fillPercent / 100.0 : 0
    readonly property real lossTargetOpacity: progress > 0 ? 0.3 + clampedMagnitude * 0.55 : 0
    readonly property real gainTargetOpacity: progress < 0 ? 0.3 + clampedMagnitude * 0.55 : 0
    property alias statusVisible: statusView.visible
    property alias renderedStatusMessage: statusView.message
    property alias renderedStatusHeight: statusView.implicitHeight

    property string previousStatus: "ready"
    property string previousTone: "neutral"
    property string previousBestLapText: ""
    property bool motionReady: false
    property bool motionEvaluationScheduled: false
    property bool fillReady: false

    width: 280
    height: readyHeight + (statusMessage.length > 0 ? 42 : 0)

    Theme.RedlineTokens { id: tokens }
    function isSide(value) {
        return value === "gaining" || value === "losing"
    }

    function scheduleMotionEvaluation() {
        if (!motionReady || motionEvaluationScheduled)
            return
        motionEvaluationScheduled = true
        Qt.callLater(evaluateMotion)
    }

    function evaluateMotion() {
        motionEvaluationScheduled = false
        const bothReady = previousStatus === "ready" && status === "ready"
        if (bothReady && isSide(previousTone) && isSide(tone) && previousTone !== tone)
            triggerCross(tone)
        if (bothReady && bestLapText !== previousBestLapText && bestLapText.trim() !== "" && bestLapText !== "—")
            triggerBest()
        previousStatus = status
        previousTone = tone
        previousBestLapText = bestLapText
    }

    function triggerCross(nextTone) {
        if (reducedMotion)
            return
        crossGlow.color = nextTone === "gaining" ? tokens.positive : tokens.accentHot
        crossAnimation.restart()
    }

    function triggerBest() {
        if (!reducedMotion)
            bestAnimation.restart()
    }

    function snapFill() {
        gainFillAnimation.stop()
        lossFillAnimation.stop()
        gainFill.width = gainTargetWidth
        gainFill.opacity = gainTargetOpacity
        lossFill.width = lossTargetWidth
        lossFill.opacity = lossTargetOpacity
    }

    function animateFill() {
        if (!fillReady)
            return
        if (reducedMotion) {
            snapFill()
            return
        }
        gainFillAnimation.stop()
        gainWidthMotion.from = gainFill.width
        gainWidthMotion.to = gainTargetWidth
        gainOpacityMotion.from = gainFill.opacity
        gainOpacityMotion.to = gainTargetOpacity
        gainFillAnimation.restart()
        lossFillAnimation.stop()
        lossWidthMotion.from = lossFill.width
        lossWidthMotion.to = lossTargetWidth
        lossOpacityMotion.from = lossFill.opacity
        lossOpacityMotion.to = lossTargetOpacity
        lossFillAnimation.restart()
    }

    onStatusChanged: scheduleMotionEvaluation()
    onToneChanged: scheduleMotionEvaluation()
    onBestLapTextChanged: scheduleMotionEvaluation()
    onProgressChanged: animateFill()
    onStatusMessageChanged: {
        statusView.message = statusMessage
        statusView.visible = statusMessage.length > 0
    }
    onStatusKindChanged: statusView.kind = statusKind

    onReducedMotionChanged: {
        if (!reducedMotion)
            return
        crossAnimation.stop()
        bestAnimation.stop()
        snapFill()
        zeroScale.yScale = 1.0
        crossGlow.opacity = 0.0
        bestSweep.opacity = 0.0
    }

    Component.onCompleted: {
        previousStatus = status
        previousTone = tone
        previousBestLapText = bestLapText
        statusView.message = statusMessage
        statusView.kind = statusKind
        statusView.visible = statusMessage.length > 0
        snapFill()
        fillReady = true
        motionReady = true
    }

    Common.Panel {
        id: panel
        objectName: "deltaPanel"
        anchors.top: parent.top
        width: root.width
        height: root.readyHeight

        Rectangle {
            id: bar
            width: parent.width
            height: root.barHeight
            radius: 4
            color: "#0a0a0b"
            border.width: 1
            border.color: "#12e8e8e8"
            clip: true

            Rectangle {
                id: gainFill
                anchors.right: parent.horizontalCenter
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                width: 0
                color: tokens.positive
                opacity: 0
            }

            Rectangle {
                id: lossFill
                anchors.left: parent.horizontalCenter
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                width: 0
                color: tokens.accentHot
                opacity: 0
            }

            Item {
                id: zeroPulseLayer
                anchors.centerIn: parent
                width: 24
                height: parent.height
                transform: Scale {
                    id: zeroScale
                    origin.x: zeroPulseLayer.width / 2
                    origin.y: zeroPulseLayer.height / 2
                    xScale: 1.0
                    yScale: 1.0
                }
                Rectangle {
                    anchors.centerIn: parent
                    width: 12
                    height: parent.height
                    color: "#20e8e8e8"
                }
                Rectangle {
                    id: crossGlow
                    anchors.fill: parent
                    color: tokens.positive
                    opacity: 0.0
                }
                Rectangle {
                    id: zeroLine
                    objectName: "deltaZero"
                    anchors.centerIn: parent
                    width: 1.5
                    height: parent.height
                    color: "#d9e8e8e8"
                }
            }

            Text {
                anchors.centerIn: parent
                anchors.verticalCenterOffset: 2
                text: root.deltaText
                color: "#d9000000"
                font.family: "Barlow Semi Condensed"
                font.pixelSize: 30
                font.weight: Font.ExtraBold
                font.letterSpacing: -0.6
            }
            Text {
                anchors.centerIn: parent
                text: root.deltaText
                color: tokens.textBright
                font.family: "Barlow Semi Condensed"
                font.pixelSize: 30
                font.weight: Font.ExtraBold
                font.letterSpacing: -0.6
            }
        }

        Item {
            id: referenceRow
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: bar.bottom
            height: root.showReference ? 34 : 0
            visible: root.showReference
            clip: true
            Rectangle {
                id: bestSweep
                anchors.fill: parent
                opacity: 0
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: "transparent" }
                    GradientStop { position: 0.5; color: "#59b18cff" }
                    GradientStop { position: 1.0; color: "transparent" }
                }
            }
            Text {
                anchors.left: parent.left
                anchors.leftMargin: 3
                anchors.verticalCenter: parent.verticalCenter
                text: root.referenceLabel
                color: tokens.textDim
                font.family: "Barlow Semi Condensed"
                font.pixelSize: 9
                font.weight: Font.ExtraBold
                font.capitalization: Font.AllUppercase
                font.letterSpacing: 1.35
            }
            Text {
                anchors.right: parent.right
                anchors.rightMargin: 3
                anchors.verticalCenter: parent.verticalCenter
                text: root.bestLapText
                color: tokens.text
                font.family: "Barlow Semi Condensed"
                font.pixelSize: 12
                font.weight: Font.ExtraBold
            }
        }
    }

    Common.Status {
        id: statusView
        objectName: "deltaStatus"
        anchors.top: panel.bottom
        anchors.topMargin: visible ? 8 : 0
        width: root.width
        message: ""
        kind: "unavailable"
    }

    ParallelAnimation {
        id: gainFillAnimation
        NumberAnimation { id: gainWidthMotion; target: gainFill; property: "width"; duration: root.fillDuration; easing.type: Easing.OutQuad }
        NumberAnimation { id: gainOpacityMotion; target: gainFill; property: "opacity"; duration: root.fillDuration; easing.type: Easing.OutQuad }
    }

    ParallelAnimation {
        id: lossFillAnimation
        NumberAnimation { id: lossWidthMotion; target: lossFill; property: "width"; duration: root.fillDuration; easing.type: Easing.OutQuad }
        NumberAnimation { id: lossOpacityMotion; target: lossFill; property: "opacity"; duration: root.fillDuration; easing.type: Easing.OutQuad }
    }

    SequentialAnimation {
        id: crossAnimation
        ParallelAnimation {
            NumberAnimation { target: zeroScale; property: "yScale"; from: 1.0; to: 1.9; duration: Math.round(root.crossDuration * 0.35); easing.type: Easing.OutQuad }
            NumberAnimation { target: crossGlow; property: "opacity"; from: 0.0; to: 0.48; duration: Math.round(root.crossDuration * 0.35); easing.type: Easing.OutQuad }
        }
        ParallelAnimation {
            NumberAnimation { target: zeroScale; property: "yScale"; from: 1.9; to: 1.0; duration: root.crossDuration - Math.round(root.crossDuration * 0.35); easing.type: Easing.OutQuad }
            NumberAnimation { target: crossGlow; property: "opacity"; from: 0.48; to: 0.0; duration: root.crossDuration - Math.round(root.crossDuration * 0.35); easing.type: Easing.OutQuad }
        }
    }

    SequentialAnimation {
        id: bestAnimation
        NumberAnimation { target: bestSweep; property: "opacity"; from: 0.0; to: 1.0; duration: Math.round(root.bestDuration * 0.30); easing.type: Easing.OutQuad }
        NumberAnimation { target: bestSweep; property: "opacity"; from: 1.0; to: 0.0; duration: root.bestDuration - Math.round(root.bestDuration * 0.30); easing.type: Easing.OutQuad }
    }
}
