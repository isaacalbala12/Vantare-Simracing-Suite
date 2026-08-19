pragma ComponentBehavior: Bound

import QtQuick 2.15

Column {
    id: root
    objectName: "proximityRelative"

    property var rowsModel: null
    property int playerIndex: -1
    property string playerClass: ""
    property bool reducedMotion: false

    width: parent ? parent.width : 404
    spacing: 0

    RelativeTokens { id: tokens }

    function classRank(vehicleClass) {
        const ranks = ({"HYPERCAR": 0, "LMH": 0, "LMDH": 0, "GTP": 0,
                         "LMP1": 1, "LMP2": 2, "LMP3": 3, "GTE": 4,
                         "GT3": 5, "LMGT3": 5, "GT4": 6})
        const key = String(vehicleClass || "").trim().toUpperCase()
        return ranks[key] === undefined ? 99 : ranks[key]
    }

    Repeater {
        model: root.rowsModel
        delegate: RelativeModelRow {
            id: proximityDelegate
            mode: "all"
            reducedMotion: root.reducedMotion
            property bool showSeam: root.playerIndex >= 0
                                    && (index === root.playerIndex - 1 || index === root.playerIndex)
            height: 30 + (showSeam ? 6 : 0)

            RelativeRow {
                width: parent.width
                height: 30
                rowData: parent.rowData
                variant: "proximity"
                showProximityCell: !rowData.isPlayer
                fasterClass: root.playerClass.length > 0
                             && root.classRank(rowData.vehicleClass) < root.classRank(root.playerClass)
                crossDirection: proximityDelegate.crossDirection
                crossIndex: proximityDelegate.index < 3 ? proximityDelegate.index : -1
                reducedMotion: root.reducedMotion
            }
            Item {
                y: 30
                width: parent.width
                height: proximityDelegate.showSeam ? 6 : 0
                visible: height > 0
                Rectangle {
                    objectName: "proximitySeam"
                    x: 12
                    width: parent.width - 24
                    height: 1.5
                    anchors.verticalCenter: parent.verticalCenter
                    color: tokens.accentHot
                    opacity: 0.85
                }
            }
        }
    }
}
