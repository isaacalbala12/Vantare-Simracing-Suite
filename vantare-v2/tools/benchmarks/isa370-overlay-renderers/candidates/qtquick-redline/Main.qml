pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import "qml/standings" as Standings
import "qml/delta" as Delta
import "qml/pedals" as Pedals
import "qml/relative" as Relative

Window {
    id: root
    required property string activeWidget
    required property string activeScene
    required property var standingsModel
    required property var relativeModel
    required property var deltaModel
    required property var pedalsModel
    required property var playback
    property bool reducedMotion: false
    property bool deltaShowHeader: true
    property string relativeVariant: "mirror"
    property bool relativeShowHeader: true

    width: 1920
    height: 1080
    visible: false
    color: "transparent"
    title: "Vantare Qt Quick Redline visual spike"

    Loader {
        anchors.centerIn: parent
        sourceComponent: root.activeWidget === "standings" ? standingsComponent
                         : root.activeWidget === "relative" ? relativeComponent
                         : root.activeWidget === "delta" ? deltaComponent
                         : pedalsComponent
    }

    Component {
        id: standingsComponent
        Standings.StandingsRedline {
            id: standingsVisual
            objectName: "standingsVisual"
            incomingSnapshot: root.standingsModel.visualClasses
            sessionLabel: root.standingsModel.sessionLabel
            remainingText: root.standingsModel.remainingText
            lapText: root.standingsModel.lapText
            statusKind: root.standingsModel.status
            statusMessage: root.standingsModel.statusMessage
            reducedMotion: root.reducedMotion
            onIncomingSnapshotChanged: applyIncomingSnapshot()
            Component.onCompleted: applyIncomingSnapshot()
        }
    }
    Component {
        id: relativeComponent
        Relative.RelativeRedline {
            objectName: "relativeVisual"
            rowsModel: root.relativeModel
            variant: root.relativeVariant
            showHeader: root.relativeShowHeader
            reducedMotion: root.reducedMotion
        }
    }
    Component {
        id: deltaComponent
        Delta.DeltaRedline {
            objectName: "deltaVisual"
            status: root.deltaModel.status
            statusMessage: root.deltaModel.statusMessage
            tone: root.deltaModel.tone
            progress: root.deltaModel.progress
            deltaText: root.deltaModel.deltaText
            bestLapText: root.deltaModel.bestLapText
            showReference: root.deltaShowHeader
            reducedMotion: root.reducedMotion
        }
    }
    Component {
        id: pedalsComponent
        Pedals.PedalsRedline {
            objectName: "pedalsVisual"
            statusKind: root.pedalsModel.status === "error" ? "error" : "unavailable"
            statusMessage: root.pedalsModel.statusMessage
            throttle: root.pedalsModel.throttle
            brake: root.pedalsModel.brake
            clutch: root.pedalsModel.clutch
            throttleText: root.pedalsModel.throttleText
            brakeText: root.pedalsModel.brakeText
            clutchText: root.pedalsModel.clutchText
            reducedMotion: root.reducedMotion
        }
    }
}
