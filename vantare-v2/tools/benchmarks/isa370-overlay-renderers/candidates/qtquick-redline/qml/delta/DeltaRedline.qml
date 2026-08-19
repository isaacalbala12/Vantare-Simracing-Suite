import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property real progress: 0.0
    property string deltaText: "0.000"
    property string bestLapText: "1:38.031"
    property bool showReference: true
    property bool reducedMotion: false
    property string statusMessage: ""

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

    property string previousSide: "neutral"
    property string previousBestLapText: ""
    property bool motionReady: false

    width: 280
    height: 96

    Theme.RedlineTokens { id: tokens }

    function sideFor(value) {
        return value < 0 ? "gaining" : value > 0 ? "losing" : "neutral"
    }

    function triggerCross(nextSide) {
        if (reducedMotion)
            return
        zeroGlow.color = nextSide === "gaining" ? tokens.positive : tokens.accentHot
        crossAnimation.restart()
    }

    function triggerBest() {
        if (!reducedMotion)
            bestAnimation.restart()
    }

    onProgressChanged: {
        const nextSide = sideFor(progress)
        if (motionReady && previousSide !== "neutral" && nextSide !== "neutral" && previousSide !== nextSide)
            triggerCross(nextSide)
        previousSide = nextSide
    }

    onBestLapTextChanged: {
        if (motionReady && bestLapText !== previousBestLapText && bestLapText.trim() !== "" && bestLapText !== "—")
            triggerBest()
        previousBestLapText = bestLapText
    }

    onReducedMotionChanged: {
        if (!reducedMotion)
            return
        crossAnimation.stop()
        bestAnimation.stop()
        zeroLine.scale = 1.0
        bestSweep.opacity = 0.0
    }

    Component.onCompleted: {
        previousSide = sideFor(progress)
        previousBestLapText = bestLapText
        motionReady = true
    }

    Rectangle {
        anchors.fill: parent
        radius: 6
        border.width: 1
        border.color: "#1ae8e8e8"
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#17171a" }
            GradientStop { position: 0.40; color: "#101012" }
            GradientStop { position: 1.0; color: "#0c0c0d" }
        }

        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            height: 1
            radius: 6
            color: "#2ee8e8e8"
        }

        Item {
            id: content
            anchors.fill: parent
            anchors.margins: 7

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
                width: root.progress < 0 ? parent.width * root.fillPercent / 100.0 : 0
                color: tokens.positive
                opacity: root.progress < 0 ? 0.3 + root.clampedMagnitude * 0.55 : 0

                Behavior on width {
                    enabled: !root.reducedMotion
                    NumberAnimation { duration: root.fillDuration; easing.type: Easing.OutQuad }
                }
                Behavior on opacity {
                    enabled: !root.reducedMotion
                    NumberAnimation { duration: root.fillDuration; easing.type: Easing.OutQuad }
                }
                }

                Rectangle {
                id: lossFill
                anchors.left: parent.horizontalCenter
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                width: root.progress > 0 ? parent.width * root.fillPercent / 100.0 : 0
                color: tokens.accentHot
                opacity: root.progress > 0 ? 0.3 + root.clampedMagnitude * 0.55 : 0

                Behavior on width {
                    enabled: !root.reducedMotion
                    NumberAnimation { duration: root.fillDuration; easing.type: Easing.OutQuad }
                }
                Behavior on opacity {
                    enabled: !root.reducedMotion
                    NumberAnimation { duration: root.fillDuration; easing.type: Easing.OutQuad }
                }
                }

                Rectangle {
                id: zeroGlow
                anchors.centerIn: zeroLine
                width: 12
                height: parent.height
                color: "transparent"
                opacity: crossAnimation.running ? 0.32 : 0
                }

                Rectangle {
                id: zeroLine
                objectName: "deltaZero"
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.verticalCenter: parent.verticalCenter
                width: 1.5
                height: parent.height
                color: "#d9e8e8e8"
                transformOrigin: Item.Center
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
                height: root.showReference ? 35 : 0
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
    }

    SequentialAnimation {
        id: crossAnimation
        NumberAnimation {
            target: zeroLine
            property: "scale"
            from: 1.0
            to: 1.9
            duration: Math.round(root.crossDuration * 0.35)
            easing.type: Easing.OutQuad
        }
        NumberAnimation {
            target: zeroLine
            property: "scale"
            from: 1.9
            to: 1.0
            duration: root.crossDuration - Math.round(root.crossDuration * 0.35)
            easing.type: Easing.OutQuad
        }
    }

    SequentialAnimation {
        id: bestAnimation
        NumberAnimation {
            target: bestSweep
            property: "opacity"
            from: 0.0
            to: 1.0
            duration: Math.round(root.bestDuration * 0.30)
            easing.type: Easing.OutQuad
        }
        NumberAnimation {
            target: bestSweep
            property: "opacity"
            from: 1.0
            to: 0.0
            duration: root.bestDuration - Math.round(root.bestDuration * 0.30)
            easing.type: Easing.OutQuad
        }
    }
}
