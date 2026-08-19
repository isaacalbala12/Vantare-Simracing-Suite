import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root

    property string rowId: ""
    property int rowIndex: 0
    property int classPosition: 0
    property string driverNumber: ""
    property string driverName: ""
    property string bestLapText: "—"
    property string gapText: "—"
    property bool isPlayer: false
    property bool isClassLeader: false
    property bool inPit: false
    property bool isSessionBest: false
    property string tireCompound: ""
    property bool tireLeaving: false
    property real battleCharge: -1
    property int positionDelta: 0
    property real flipOffset: 0
    property string overtakeDirection: ""
    property int overtakeIndex: 0
    property bool retiring: false

    property int displayedPositionDelta: 0
    property real visualOffset: 0

    width: parent ? parent.width : tokens.panelWidth - tokens.panelPadding * 2
    height: tokens.rowHeight
    opacity: 0
    x: -10
    transform: Translate { y: root.visualOffset }

    Theme.RedlineTokens { id: tokens }

    function playFlip(offset, rowsMoved) {
        visualOffset = offset
        flipAnimation.duration = Math.min(
            tokens.flipMaxMs,
            tokens.flipBaseMs + Math.abs(rowsMoved) * tokens.flipPerRowMs
        )
        flipAnimation.restart()
    }

    function startOvertake() {
        if (overtakeDirection.length > 0)
            overtakeFlash.restart()
    }

    Component.onCompleted: enterAnimation.start()
    onFlipOffsetChanged: {
        if (flipOffset !== 0)
            playFlip(flipOffset, Math.abs(flipOffset) / tokens.rowStride)
    }
    onOvertakeDirectionChanged: startOvertake()
    onPositionDeltaChanged: deltaTimer.restart()
    onTireCompoundChanged: {
        if (tireCompound.length > 0)
            tireLifeAnimation.restart()
    }

    SequentialAnimation {
        id: enterAnimation
        ParallelAnimation {
            NumberAnimation {
                target: root; property: "x"; from: -10; to: 0
                duration: tokens.enterMs
                easing.type: Easing.BezierSpline
                easing.bezierCurve: tokens.flipBezier
            }
            NumberAnimation {
                target: root; property: "opacity"; from: 0; to: 1
                duration: tokens.enterMs
            }
        }
    }

    NumberAnimation {
        id: flipAnimation
        target: root
        property: "visualOffset"
        to: 0
        duration: tokens.flipBaseMs
        easing.type: Easing.BezierSpline
        easing.bezierCurve: tokens.flipBezier
    }

    Timer {
        id: deltaTimer
        interval: tokens.deltaStepMs
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            if (root.displayedPositionDelta === root.positionDelta) {
                stop()
                return
            }
            root.displayedPositionDelta += root.positionDelta > root.displayedPositionDelta ? 1 : -1
            deltaPop.restart()
        }
    }

    SequentialAnimation {
        id: deltaPop
        NumberAnimation { target: deltaChip; property: "scale"; to: 1.18; duration: tokens.deltaChipMs * 0.6 }
        NumberAnimation { target: deltaChip; property: "scale"; to: 1.0; duration: tokens.deltaChipMs * 0.4 }
    }

    states: State {
        name: "retired"
        when: root.retiring
        PropertyChanges { root.x: 26; root.opacity: 0; root.height: 0 }
    }
    transitions: Transition {
        to: "retired"
        ParallelAnimation {
            NumberAnimation {
                properties: "x,opacity,height"
                duration: tokens.retirementMs
                easing.type: Easing.InOutQuad
            }
        }
    }

    Rectangle {
        id: rowBackground
        anchors.fill: parent
        radius: 7
        color: root.isClassLeader ? tokens.leaderBottom
             : root.isPlayer ? "#52c1121f"
             : root.rowIndex % 2 ? "#09e8e8e8"
             : "transparent"
        gradient: root.isClassLeader ? leaderGradient : null
    }

    Gradient {
        id: leaderGradient
        GradientStop { position: 0.0; color: tokens.leaderTop }
        GradientStop { position: 1.0; color: tokens.leaderBottom }
    }

    Rectangle {
        id: flash
        anchors.fill: parent
        radius: 7
        opacity: 0
        color: root.overtakeDirection === "rise" ? "#4735c77b" : "#38e63946"
    }

    SequentialAnimation {
        id: overtakeFlash
        PauseAnimation { duration: root.overtakeIndex * tokens.overtakeStaggerMs }
        SequentialAnimation {
            NumberAnimation { target: flash; property: "opacity"; from: 0; to: 1; duration: tokens.overtakeMs * 0.18 }
            NumberAnimation { target: flash; property: "opacity"; to: 0; duration: tokens.overtakeMs * 0.82 }
        }
    }

    Text {
        x: 0; width: 24; anchors.verticalCenter: parent.verticalCenter
        text: root.classPosition > 0 ? root.classPosition : "—"
        horizontalAlignment: Text.AlignHCenter
        color: root.isClassLeader ? tokens.accentDark : tokens.accent
        font.pixelSize: 14; font.weight: Font.Bold
    }

    Item {
        x: 32; width: 172; height: parent.height
        Text {
            id: carNumber
            anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
            text: "#" + root.driverNumber
            color: root.isClassLeader ? "#55555a" : tokens.textDim
            font.pixelSize: 10; font.weight: Font.DemiBold
        }
        Text {
            anchors.left: carNumber.right; anchors.leftMargin: 7
            anchors.right: tire.left; anchors.rightMargin: 4
            anchors.verticalCenter: parent.verticalCenter
            text: root.driverName
            color: root.isClassLeader ? "#0f0f10" : tokens.text
            font.pixelSize: 13; font.weight: Font.DemiBold
            elide: Text.ElideRight
        }
        Item {
            id: tire
            anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
            width: root.tireCompound.length > 0 ? 15 : 0; height: 15
            opacity: root.tireCompound.length > 0 ? 1 : 0
            scale: root.tireLeaving ? 0.3 : 1
            rotation: root.tireLeaving ? 120 : 0

            property color compoundColor: root.tireCompound === "S" ? tokens.accent
                                          : root.tireCompound === "M" ? "#e8c93c"
                                          : tokens.text

            Rectangle {
                anchors.fill: parent; radius: width / 2
                color: "transparent"; border.width: 1.5; border.color: tire.compoundColor
            }
            Text {
                anchors.centerIn: parent; text: root.tireCompound
                color: tire.compoundColor; font.pixelSize: 8; font.weight: Font.Bold
            }
            Rectangle {
                id: tireLife
                anchors.centerIn: parent; width: 22; height: 22; radius: 11
                color: "transparent"; border.width: 1; border.color: tire.compoundColor
                opacity: 0
            }
            Behavior on scale { NumberAnimation { duration: tokens.tireExitMs; easing.type: Easing.InQuad } }
            Behavior on rotation { NumberAnimation { duration: tokens.tireExitMs; easing.type: Easing.InQuad } }
            Behavior on opacity { NumberAnimation { duration: tokens.tireExitMs } }
            NumberAnimation {
                id: tireLifeAnimation
                target: tireLife; property: "opacity"
                from: 1; to: 0.15; duration: tokens.tireMs
            }
        }
    }

    Rectangle {
        id: deltaChip
        x: 212; width: 44; height: 18; anchors.verticalCenter: parent.verticalCenter
        radius: 4; color: "transparent"; border.width: root.displayedPositionDelta === 0 ? 0 : 1
        border.color: root.displayedPositionDelta > 0 ? "#8035c77b" : "#73e63946"
        Text {
            anchors.centerIn: parent
            text: root.displayedPositionDelta > 0 ? "+" + root.displayedPositionDelta
                  : root.displayedPositionDelta < 0 ? root.displayedPositionDelta : ""
            color: root.displayedPositionDelta > 0 ? tokens.positive : tokens.accent
            font.pixelSize: 10; font.weight: Font.Bold
        }
    }

    Item {
        x: 264; width: 74; height: parent.height
        Text {
            anchors.fill: parent; verticalAlignment: Text.AlignVCenter
            horizontalAlignment: Text.AlignRight
            text: root.bestLapText
            color: root.isSessionBest ? tokens.fastest
                 : root.isClassLeader ? "#55555a" : tokens.textMuted
            font.pixelSize: 11; font.weight: root.isSessionBest ? Font.Bold : Font.DemiBold
        }
        FastestGlyph {
            anchors.left: parent.left; anchors.leftMargin: -2
            anchors.verticalCenter: parent.verticalCenter
            visible: root.isSessionBest
            hot: root.isSessionBest
        }
    }

    Rectangle {
        id: gapCell
        x: 346; width: 58; height: 21; anchors.verticalCenter: parent.verticalCenter
        radius: 5
        color: root.battleCharge >= 0 ? "#12e8e8e8" : "transparent"
        clip: true

        Rectangle {
            visible: root.battleCharge >= 0
            width: parent.width * Math.max(0, Math.min(1, root.battleCharge))
            height: parent.height
            color: tokens.accentDark
            Behavior on width { NumberAnimation { duration: 600; easing.type: Easing.OutCubic } }
        }
        Text {
            anchors.fill: parent; anchors.rightMargin: 5
            horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignVCenter
            text: root.inPit ? "PIT" : root.isClassLeader ? "INT" : root.gapText
            color: root.inPit ? tokens.pit
                 : root.isClassLeader ? "#0f0f10"
                 : root.isPlayer ? tokens.accentHot : tokens.text
            font.pixelSize: root.inPit ? 11 : 13; font.weight: Font.Bold
        }
    }
}
