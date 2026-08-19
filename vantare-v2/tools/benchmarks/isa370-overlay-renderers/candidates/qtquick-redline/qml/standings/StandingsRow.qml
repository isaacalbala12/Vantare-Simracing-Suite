import QtQuick 2.15
import "../theme" as Theme

Item {
    id: root
    objectName: "standingsRow-" + rowId

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
    property bool entering: false
    property bool hot: false
    property bool reducedMotion: false

    property int displayedPositionDelta: 0
    property real visualOffset: 0
    property bool hotActive: false
    property real displayedCharge: 0
    property real previousCharge: -1
    readonly property int chargeAnimationMs: reducedMotion ? 0 : tokens.battleGapUpdateMs
    readonly property int overtakeAnimationMs: tokens.overtakeMs
    readonly property int retirementAnimationMs: tokens.retirementMs

    width: parent ? parent.width : tokens.panelWidth - tokens.panelPadding * 2
    height: tokens.rowHeight
    opacity: 1
    x: 0
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

    Component.onCompleted: {
        if (entering)
            enterAnimation.start()
        if (battleCharge >= 0)
            updateCharge(battleCharge)
        if (retiring)
            retirementAnimation.start()
    }
    onFlipOffsetChanged: {
        if (flipOffset !== 0)
            playFlip(flipOffset, Math.abs(flipOffset) / tokens.rowStride)
    }
    onOvertakeDirectionChanged: startOvertake()
    onPositionDeltaChanged: deltaTimer.restart()
    onTireCompoundChanged: {
        if (tireCompound.length > 0) {
            tireLifeAnimation.restart()
            tireEnter.restart()
            tireHold.restart()
        }
    }
    onTireLeavingChanged: {
        if (tireLeaving)
            tireExit.restart()
    }
    onEnteringChanged: { if (entering) enterAnimation.restart() }
    onRetiringChanged: { if (retiring) retirementAnimation.restart() }
    onHotChanged: {
        if (hot) {
            hotActive = true
            hotWaveAnimation.restart()
            hotHold.restart()
        }
    }
    onBattleChargeChanged: updateCharge(battleCharge)

    function updateCharge(nextCharge) {
        var bounded = nextCharge < 0 ? 0 : Math.max(0.1, Math.min(1, nextCharge))
        if (reducedMotion) {
            displayedCharge = bounded
        } else {
            chargeAnimation.duration = previousCharge < 0 && nextCharge >= 0
                ? tokens.battleGapEnterMs
                : nextCharge < 0 ? tokens.battleGapExitMs : tokens.battleGapUpdateMs
            chargeAnimation.to = bounded
            chargeAnimation.restart()
        }
        previousCharge = nextCharge
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
        NumberAnimation {
            target: deltaChip; property: "scale"; to: 1.18; duration: tokens.deltaChipMs * 0.6
            easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.deltaBezier
        }
        NumberAnimation {
            target: deltaChip; property: "scale"; to: 1.0; duration: tokens.deltaChipMs * 0.4
            easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.deltaBezier
        }
    }

    ParallelAnimation {
        id: retirementAnimation
        NumberAnimation {
            target: root; property: "x"; from: 0; to: 26
            duration: tokens.retirementMs
            easing.type: Easing.BezierSpline
            easing.bezierCurve: tokens.retirementBezier
        }
        NumberAnimation {
            target: root; property: "opacity"; from: 0.75; to: 0
            duration: tokens.retirementMs
            easing.type: Easing.BezierSpline
            easing.bezierCurve: tokens.retirementBezier
        }
        SequentialAnimation {
            PauseAnimation { duration: tokens.retirementMs * 0.55 }
            NumberAnimation {
                target: root; property: "height"; from: tokens.rowHeight; to: 0
                duration: tokens.retirementMs * 0.45
                easing.type: Easing.BezierSpline
                easing.bezierCurve: tokens.retirementBezier
            }
        }
    }

    Rectangle {
        id: rowBackground
        anchors.fill: parent
        radius: 7
        color: root.isPlayer ? "transparent"
             : root.isClassLeader ? tokens.leaderBottom
             : root.rowIndex % 2 && !root.isPlayer ? "#09e8e8e8"
             : "transparent"
        gradient: root.isClassLeader && !root.isPlayer ? leaderGradient : null
    }

    Canvas {
        id: playerRadial
        objectName: "playerRadial"
        anchors.fill: parent
        visible: root.isPlayer
        onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.save()
            ctx.scale(1, 4.28)
            var gradient = ctx.createRadialGradient(width / 2, height / 8.56, 0, width / 2, height / 8.56, width * 0.35)
            gradient.addColorStop(0, "rgba(193,18,31,0.4)")
            gradient.addColorStop(0.6, "rgba(193,18,31,0.12)")
            gradient.addColorStop(0.9, "rgba(193,18,31,0)")
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, width, height / 4.28)
            ctx.restore()
        }
    }

    Rectangle {
        id: hotWave
        visible: root.hotActive
        x: -width
        width: root.width * 0.45
        height: root.height
        radius: 7
        color: "#47b18cff"
        opacity: 0.9
    }

    ParallelAnimation {
        id: hotWaveAnimation
        NumberAnimation { target: hotWave; property: "x"; from: -hotWave.width; to: root.width * 2.2; duration: tokens.fastestHotVisualMs; easing.type: Easing.OutCubic }
        NumberAnimation { target: hotWave; property: "opacity"; from: 0.9; to: 0; duration: tokens.fastestHotVisualMs; easing.type: Easing.OutCubic }
    }
    Timer { id: hotHold; interval: tokens.fastestHotHoldMs; onTriggered: root.hotActive = false }

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
            NumberAnimation { target: flash; property: "opacity"; from: 0; to: 1; duration: tokens.overtakeMs * 0.18; easing.type: Easing.OutCubic }
            NumberAnimation { target: flash; property: "opacity"; to: 0; duration: tokens.overtakeMs * 0.82; easing.type: Easing.OutCubic }
        }
    }

    Text {
        objectName: "positionCell"
        x: 8; width: 24; anchors.verticalCenter: parent.verticalCenter
        text: root.classPosition > 0 ? root.classPosition : "—"
        horizontalAlignment: Text.AlignHCenter
        color: root.isClassLeader ? tokens.accentDark : tokens.accent
        font.pixelSize: 14; font.weight: Font.Bold
    }

    Item {
        objectName: "identityCell"
        x: 40; width: root.width - 248; height: parent.height
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
            color: root.isPlayer ? tokens.textBright : root.isClassLeader ? "#0f0f10" : tokens.text
            font.pixelSize: 13; font.weight: Font.DemiBold
            elide: Text.ElideRight
        }
        Item {
            id: tire
            objectName: "tireBadge"
            anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
            width: root.tireCompound.length > 0 ? 15 : 0; height: 15
            opacity: root.tireCompound.length > 0 ? 1 : 0
            scale: 1
            rotation: 0

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
            ParallelAnimation {
                id: tireEnter
                NumberAnimation { target: tire; property: "scale"; from: 0.2; to: 1; duration: tokens.tireEnterMs; easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.tireEnterBezier }
                NumberAnimation { target: tire; property: "rotation"; from: -160; to: 0; duration: tokens.tireEnterMs; easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.tireEnterBezier }
                NumberAnimation { target: tire; property: "opacity"; from: 0; to: 1; duration: tokens.tireEnterMs }
            }
            ParallelAnimation {
                id: tireExit
                NumberAnimation { target: tire; property: "scale"; to: 0.3; duration: tokens.tireExitMs; easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.tireExitBezier }
                NumberAnimation { target: tire; property: "rotation"; to: 120; duration: tokens.tireExitMs; easing.type: Easing.BezierSpline; easing.bezierCurve: tokens.tireExitBezier }
                NumberAnimation { target: tire; property: "opacity"; to: 0; duration: tokens.tireExitMs }
            }
            NumberAnimation {
                id: tireLifeAnimation
                target: tireLife; property: "opacity"
                from: 1; to: 0.15; duration: tokens.tireMs
            }
            Timer {
                id: tireHold
                interval: tokens.tireMs - tokens.tireExitMs
                onTriggered: tireExit.restart()
            }
        }
    }

    Rectangle {
        id: deltaChip
        objectName: "deltaCell"
        x: root.width - 200; width: 44; height: 18; anchors.verticalCenter: parent.verticalCenter
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
        objectName: "bestCell"
        x: root.width - 148; width: 74; height: parent.height
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
        }
    }

    Rectangle {
        id: gapCell
        objectName: "gapCell"
        x: root.width - 66; width: 58; height: 21; anchors.verticalCenter: parent.verticalCenter
        radius: 5
        color: root.battleCharge >= 0 ? "#12e8e8e8" : "transparent"
        clip: true

        Rectangle {
            id: chargeFill
            visible: root.battleCharge >= 0 || root.displayedCharge > 0
            width: parent.width * root.displayedCharge
            height: parent.height
            color: tokens.accentDark
        }
        Text {
            anchors.fill: parent; anchors.rightMargin: 5
            horizontalAlignment: Text.AlignRight; verticalAlignment: Text.AlignVCenter
            text: root.inPit ? "PIT" : root.isClassLeader ? "INT" : root.gapText
            color: root.inPit ? (root.isClassLeader ? "#0f0f10" : tokens.pit)
                 : root.isPlayer ? tokens.accentHot
                 : root.isClassLeader ? "#0f0f10" : tokens.text
            font.pixelSize: root.inPit ? 11 : 13; font.weight: Font.Bold
        }
    }

    NumberAnimation {
        id: chargeAnimation
        target: root; property: "displayedCharge"
        easing.type: Easing.OutCubic
    }
}
