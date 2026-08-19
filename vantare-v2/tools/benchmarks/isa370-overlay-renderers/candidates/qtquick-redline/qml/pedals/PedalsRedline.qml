import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property real clutch: 0.0
    property real brake: 0.0
    property real throttle: 0.0
    property string clutchText: Math.round(clutch * 100) + "%"
    property string brakeText: Math.round(brake * 100) + "%"
    property string throttleText: Math.round(throttle * 100) + "%"
    property color clutchColor: "#4b9fff"
    property color brakeColor: "#e63946"
    property color throttleColor: "#35c77b"
    property bool reducedMotion: false
    property string statusMessage: ""

    readonly property int railCount: 3
    readonly property string railOrder: "clutch,brake,throttle"
    readonly property bool clutchEngaged: clutch > 0.02
    readonly property bool brakeEngaged: brake > 0.02
    readonly property bool throttleEngaged: throttle > 0.02
    readonly property bool clutchSaturated: clutch >= 0.99
    readonly property bool brakeSaturated: brake >= 0.99
    readonly property bool throttleSaturated: throttle >= 0.99
    readonly property int fillDuration: reducedMotion ? 0 : 90
    readonly property int haloDuration: reducedMotion ? 0 : 160
    readonly property int peakPositionDuration: reducedMotion ? 0 : 120
    readonly property int peakOpacityDuration: reducedMotion ? 0 : 220

    property real brakePeak: 0.0
    property bool brakePeakVisible: false
    property bool peakReady: false

    width: 120
    height: 160

    Theme.RedlineTokens { id: tokens }

    onBrakeChanged: {
        if (!peakReady)
            return
        if (brake <= 0.02) {
            brakePeak = 0.0
            brakePeakVisible = false
            return
        }
        brakePeak = Math.max(brakePeak, brake)
        brakePeakVisible = brakePeak - brake >= 0.03
    }

    Component.onCompleted: {
        brakePeak = brake > 0.02 ? brake : 0.0
        brakePeakVisible = false
        peakReady = true
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

        Row {
            anchors.fill: parent
            anchors.margins: 7
            spacing: 6

            PedalRail {
                objectName: "clutchRail"
                width: (parent.width - parent.spacing * 2) / 3
                height: parent.height
                label: "CLU"
                reading: root.clutchText
                value: root.clutch
                fillColor: root.clutchColor
                reducedMotion: root.reducedMotion
            }

            PedalRail {
                objectName: "brakeRail"
                width: (parent.width - parent.spacing * 2) / 3
                height: parent.height
                label: "BRK"
                reading: root.brakeText
                value: root.brake
                fillColor: root.brakeColor
                reducedMotion: root.reducedMotion
                peakEnabled: true
                peakValue: root.brakePeak
                peakVisible: root.brakePeakVisible
            }

            PedalRail {
                objectName: "throttleRail"
                width: (parent.width - parent.spacing * 2) / 3
                height: parent.height
                label: "THR"
                reading: root.throttleText
                value: root.throttle
                fillColor: root.throttleColor
                reducedMotion: root.reducedMotion
            }
        }
    }
}
