import QtQuick 2.15
import "../theme" as Theme

Item {
    visible: false
    width: 0
    height: 0

    Theme.RedlineTokens { id: shared }
    readonly property int panelWidth: shared.panelWidth
    readonly property int panelRadius: shared.panelRadius
    readonly property int panelPadding: shared.panelPadding
    readonly property int rowHeight: shared.rowHeight
    readonly property int rowStride: 26

    readonly property int flipBaseMs: 280
    readonly property int flipPerRowMs: 55
    readonly property int flipMaxMs: 520
    readonly property int enterMs: 380
    readonly property int crossMs: 900
    readonly property int crossStaggerMs: 45
    readonly property int crossMaxConcurrent: 3
    readonly property int ghostMs: 380
    readonly property int approachEnterMs: 260
    readonly property int approachTrackMs: 600

    readonly property string flipEasing: "0.22,0.9,0.3,1"
    readonly property var flipBezier: [0.22, 0.9, 0.3, 1, 1, 1]

    readonly property string fontFamily: "Barlow Semi Condensed"
    // Relative-only vocabulary stays local; shared Redline materials are aliases.
    readonly property color panelTop: shared.panelTop
    readonly property color panelMiddle: "#0f0f10"
    readonly property color panelBottom: shared.panelBottom
    readonly property color panelBorder: shared.panelBorder
    readonly property color text: shared.text
    readonly property color textBright: shared.textBright
    readonly property color textDim: shared.textDim
    readonly property color accent: shared.accent
    readonly property color accentDark: shared.accentDark
    readonly property color accentHot: shared.accentHot
    readonly property color positive: shared.positive
    readonly property color lapping: "#4b9fff"
    readonly property color lappingText: "#cfe4ff"
}
