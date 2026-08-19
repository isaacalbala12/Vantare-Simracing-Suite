import QtQuick 2.15

Item {
    id: root
    objectName: "relativeRow-" + String(rowData.id || "")

    property var rowData: ({})
    property string variant: "mirror"
    property bool showClassRail: false
    property bool showProximityCell: false
    property bool showApproach: false
    property bool reducedMotion: false
    property string crossDirection: String(rowData.crossDirection || "")
    property int crossIndex: Number(rowData.crossIndex || 0)
    property bool fasterClass: Boolean(rowData.isFasterClass)

    property int positionColumnWidth: 22
    property int classColumnWidth: 46
    property int gapColumnWidth: root.variant === "traffic" ? 58 : 62
    property int classRailWidth: root.variant === "traffic" ? 4 : 0
    readonly property int columnGap: 8
    readonly property bool isPlayer: Boolean(rowData.isPlayer)
    readonly property bool crossRunning: crossAnimation.running
    readonly property string side: String(rowData.side || (Number(rowData.gapSeconds || 0) >= 0 ? "ahead" : "behind"))
    readonly property color semanticGapColor: isPlayer ? tokens.accentHot
                                                : side === "ahead" ? tokens.positive
                                                : tokens.accentHot

    width: parent ? parent.width : tokens.panelWidth - tokens.panelPadding * 2
    height: tokens.rowHeight
    opacity: 1

    RelativeTokens { id: tokens }

    function initialSurname(name) {
        const cleaned = String(name || "").replace(/\(.*?\)/g, " ").trim()
        const words = cleaned.split(/\s+/).filter(Boolean)
        if (words.length < 2)
            return cleaned
        return words[0].charAt(0) + ". " + words.slice(1).join(" ")
    }

    function classShort(vehicleClass) {
        const name = String(vehicleClass || "").trim().toUpperCase()
        if (name === "HYPERCAR")
            return "HY"
        if (name === "LMGT3")
            return "GT3"
        return name
    }

    function classRank(vehicleClass) {
        const ranks = ({"HYPERCAR": 0, "LMH": 0, "LMDH": 0, "GTP": 0,
                         "LMP1": 1, "LMP2": 2, "LMP3": 3, "GTE": 4,
                         "GT3": 5, "LMGT3": 5, "GT4": 6})
        const key = String(vehicleClass || "").trim().toUpperCase()
        return ranks[key] === undefined ? 99 : ranks[key]
    }

    function classColor(vehicleClass) {
        const key = String(vehicleClass || "").trim().toUpperCase()
        if (["HYPERCAR", "LMH", "LMDH", "GTP"].indexOf(key) >= 0)
            return "#e0e4ec"
        if (key === "LMP2")
            return "#8fa8c4"
        if (key === "LMP3")
            return "#c2926a"
        if (["GTE", "GT3", "LMGT3", "GT4"].indexOf(key) >= 0)
            return "#9fb89a"
        return "#6b7280"
    }

    function signedGap() {
        const gap = Number(rowData.gapSeconds)
        if (rowData.gapSeconds === null || !isFinite(gap))
            return String(rowData.gapText || "—")
        const value = Math.abs(gap).toFixed(1)
        return gap > 0 ? "+" + value : gap < 0 ? "−" + value : value
    }

    function proximity() {
        if (rowData.gapSeconds === null)
            return 0
        return Math.max(0, Math.min(1, 1 - Math.abs(Number(rowData.gapSeconds)) / 5))
    }

    onCrossDirectionChanged: {
        if (!reducedMotion && crossDirection.length > 0
                && crossIndex >= 0 && crossIndex < tokens.crossMaxConcurrent)
            crossAnimation.restart()
    }
    onReducedMotionChanged: {
        if (reducedMotion) {
            crossAnimation.stop()
            crossWash.opacity = 0
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: 7
        color: root.isPlayer ? "#52c1121f"
             : Number(root.rowData.visualIndex || 0) % 2 && root.variant !== "mirror" ? "#09e8e8e8"
             : "transparent"
    }

    Rectangle {
        id: crossWash
        anchors.fill: parent
        radius: 7
        color: root.crossDirection === "gained" ? "#6135c77b" : "#61ff6b76"
        opacity: 0
    }

    SequentialAnimation {
        id: crossAnimation
        PauseAnimation {
            duration: root.reducedMotion ? 0 : Math.max(0, root.crossIndex) * tokens.crossStaggerMs
        }
        NumberAnimation {
            target: crossWash; property: "opacity"; from: 0; to: 1
            duration: root.reducedMotion ? 0 : tokens.crossMs * 0.22
            easing.type: Easing.OutCubic
        }
        NumberAnimation {
            target: crossWash; property: "opacity"; to: 0
            duration: root.reducedMotion ? 0 : tokens.crossMs * 0.78
            easing.type: Easing.OutCubic
        }
    }

    Item {
        id: columns
        x: root.variant === "traffic" ? 4 : 8
        width: parent.width - x - 8
        height: parent.height

        Rectangle {
            id: classRail
            objectName: root.showClassRail ? "classRail" : ""
            visible: root.showClassRail
            width: root.classRailWidth
            height: 20
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            radius: 2
            color: root.classColor(root.rowData.vehicleClass)
        }

        Text {
            id: position
            x: root.showClassRail ? root.classRailWidth + root.columnGap : 0
            width: root.positionColumnWidth
            height: parent.height
            text: String(root.rowData.position || "—")
            color: tokens.accent
            font.family: tokens.fontFamily
            font.pixelSize: Math.round(13.5)
            font.weight: Font.ExtraBold
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }

        Item {
            id: identity
            x: position.x + position.width + root.columnGap
            width: classChip.x - root.columnGap - x
            height: parent.height
            Text {
                id: number
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: "#" + String(root.rowData.driverNumber || "")
                color: tokens.textDim
                font.family: tokens.fontFamily
                font.pixelSize: 10
                font.weight: Font.DemiBold
            }
            Text {
                anchors.left: number.right
                anchors.leftMargin: 7
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: root.initialSurname(root.rowData.driverName)
                color: root.isPlayer ? tokens.textBright : tokens.text
                font.family: tokens.fontFamily
                font.pixelSize: 13
                font.weight: Font.Bold
                elide: Text.ElideRight
            }
        }

        Rectangle {
            id: classChip
            x: gapCell.x - root.columnGap - width
            width: root.classColumnWidth
            height: 17
            anchors.verticalCenter: parent.verticalCenter
            radius: 4
            color: root.fasterClass ? "#1f4b9fff" : "transparent"
            border.width: 1.5
            border.color: root.fasterClass ? tokens.lapping : tokens.accent
            Text {
                anchors.centerIn: parent
                text: root.classShort(root.rowData.vehicleClass)
                color: root.fasterClass ? tokens.lappingText : tokens.text
                font.family: tokens.fontFamily
                font.pixelSize: Math.round(8.5)
                font.weight: Font.ExtraBold
                font.letterSpacing: 0.85
            }
        }

        Rectangle {
            id: gapCell
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: root.gapColumnWidth
            height: root.showProximityCell ? 21 : parent.height
            radius: root.showProximityCell ? 5 : 0
            color: root.showProximityCell ? "#12e8e8e8" : "transparent"
            clip: true

            Rectangle {
                visible: root.showProximityCell
                width: parent.width * root.proximity()
                height: parent.height
                color: root.side === "ahead" ? tokens.positive : tokens.accent
                opacity: 0.9
                Behavior on width {
                    NumberAnimation {
                        duration: root.reducedMotion ? 0 : tokens.approachTrackMs
                        easing.type: Easing.OutCubic
                    }
                }
            }
            Text {
                anchors.fill: parent
                anchors.rightMargin: root.showProximityCell ? 0 : 0
                text: root.isPlayer ? "YOU" : root.signedGap()
                color: root.showProximityCell ? tokens.textBright : root.semanticGapColor
                font.family: tokens.fontFamily
                font.pixelSize: root.isPlayer ? 11 : root.showProximityCell ? 12 : 12.5
                font.weight: Font.Bold
                font.letterSpacing: root.isPlayer ? 1.1 : 0
                horizontalAlignment: root.showProximityCell ? Text.AlignHCenter : Text.AlignRight
                verticalAlignment: Text.AlignVCenter
            }
        }
    }

    ApproachIndicator {
        anchors.left: parent.left
        anchors.right: parent.right
        gapSeconds: root.rowData.gapSeconds
        ahead: root.side === "ahead"
        active: root.showApproach && !root.isPlayer
        reducedMotion: root.reducedMotion
    }
}
