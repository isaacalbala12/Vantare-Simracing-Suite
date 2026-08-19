import QtQuick 2.15
import "../common" as Common
import "../theme" as Theme

Item {
    id: root

    property real clutch: 0.0
    property real brake: 0.0
    property real throttle: 0.0
    property string clutchText: Math.round(clutch * 100) + "%"
    property string brakeText: Math.round(brake * 100) + "%"
    property string throttleText: Math.round(throttle * 100) + "%"
    property color clutchColor: "#3498db"
    property color brakeColor: "#e74c3c"
    property color throttleColor: "#2ecc71"
    property bool reducedMotion: false
    property string statusKind: "unavailable"
    property string statusMessage: ""

    readonly property int readyHeight: 160
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
    readonly property real throttleVisualScale: throttleRail.visualScale
    readonly property bool throttleFillMoving: throttleRail.fillMoving
    readonly property real throttleFillHeight: throttleRail.fillHeight
    readonly property real throttleWellHeight: throttleRail.wellHeight
    property alias statusVisible: statusView.visible
    property alias renderedStatusMessage: statusView.message
    property alias renderedStatusHeight: statusView.implicitHeight

    property real brakePeak: 0.0
    property bool brakePeakVisible: false
    property bool peakReady: false

    width: 120
    height: readyHeight + (statusMessage.length > 0 ? 42 : 0)

    Theme.RedlineTokens { id: tokens }
    onStatusMessageChanged: {
        statusView.message = statusMessage
        statusView.visible = statusMessage.length > 0
    }
    onStatusKindChanged: statusView.kind = statusKind

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
        statusView.message = statusMessage
        statusView.kind = statusKind
        statusView.visible = statusMessage.length > 0
        peakReady = true
    }

    Common.Panel {
        id: panel
        objectName: "pedalsPanel"
        anchors.top: parent.top
        width: root.width
        height: root.readyHeight

        Row {
            anchors.fill: parent
            anchors.margins: 7
            spacing: 6

            PedalRail {
                id: clutchRail
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
                id: brakeRail
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
                id: throttleRail
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

    Common.Status {
        id: statusView
        objectName: "pedalsStatus"
        anchors.top: panel.bottom
        anchors.topMargin: visible ? 8 : 0
        width: root.width
        message: ""
        kind: "unavailable"
    }
}
