import QtQuick 2.15

QtObject {
    readonly property int panelWidth: 420
    readonly property int panelRadius: 12
    readonly property int panelPadding: 8
    readonly property int rowHeight: 30
    readonly property int rowStride: 30

    readonly property int flipBaseMs: 320
    readonly property int flipPerRowMs: 60
    readonly property int flipMaxMs: 560
    readonly property int enterMs: 420
    readonly property int retirementMs: 640
    readonly property int overtakeMs: 1100
    readonly property int overtakeStaggerMs: 40
    readonly property int deltaStepMs: 140
    readonly property int deltaChipMs: 220
    readonly property int fastestMs: 620
    readonly property int fastestHotMs: 1400
    readonly property int tireMs: 4200
    readonly property int tireExitMs: 420
    readonly property int battleMs: 2500
    readonly property int battleDissolveMs: 360
    readonly property int finalMinutesMs: 2400

    // Control points consumed by Easing.BezierSpline animations.
    readonly property string flipEasing: "0.22,0.9,0.3,1"
    readonly property var flipBezier: [0.22, 0.9, 0.3, 1, 1, 1]

    readonly property color panelTop: "#17171a"
    readonly property color panelBottom: "#0d0d0e"
    readonly property color panelBorder: "#29e8e8e8"
    readonly property color text: "#e8e8e8"
    readonly property color textBright: "#ffffff"
    readonly property color textDim: "#7a7a7a"
    readonly property color textMuted: "#9a9aa0"
    readonly property color accent: "#e63946"
    readonly property color accentDark: "#c1121f"
    readonly property color accentHot: "#ff6b76"
    readonly property color positive: "#35c77b"
    readonly property color pit: "#d8af0f"
    readonly property color fastest: "#b18cff"
    readonly property color leaderTop: "#dfdfe3"
    readonly property color leaderBottom: "#c8c8cd"
}
