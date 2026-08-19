pragma ComponentBehavior: Bound

import QtQuick 2.15

Column {
    id: root
    objectName: "mirrorRelative"

    property var rowsModel: null
    property string playerClass: ""
    property bool reducedMotion: false

    width: parent ? parent.width : 404
    spacing: 0

    function classRank(vehicleClass) {
        const ranks = ({"HYPERCAR": 0, "LMH": 0, "LMDH": 0, "GTP": 0,
                         "LMP1": 1, "LMP2": 2, "LMP3": 3, "GTE": 4,
                         "GT3": 5, "LMGT3": 5, "GT4": 6})
        const key = String(vehicleClass || "").trim().toUpperCase()
        return ranks[key] === undefined ? 99 : ranks[key]
    }

    Repeater {
        objectName: "mirrorRepeater"
        model: root.rowsModel
        delegate: RelativeModelRow {
            id: mirrorDelegate
            mode: "all"
            reducedMotion: root.reducedMotion
            height: 30 + (isPlayer ? 36 : 0)

            RelativeAxis {
                width: parent.width
                height: mirrorDelegate.isPlayer ? 18 : 0
                visible: mirrorDelegate.isPlayer
                label: "ADELANTE"
                labelFirst: true
            }
            RelativeRow {
                y: mirrorDelegate.isPlayer ? 18 : 0
                width: parent.width
                height: 30
                rowData: parent.rowData
                objectName: "relativeRow-" + String(rowData.id || "") + "-mirror"
                variant: "mirror"
                showApproach: !mirrorDelegate.isPlayer
                fasterClass: root.playerClass.length > 0
                             && root.classRank(rowData.vehicleClass) < root.classRank(root.playerClass)
                crossDirection: mirrorDelegate.crossDirection
                crossIndex: mirrorDelegate.index < 3 ? mirrorDelegate.index : -1
                reducedMotion: root.reducedMotion
            }
            RelativeAxis {
                y: 48
                width: parent.width
                height: mirrorDelegate.isPlayer ? 18 : 0
                visible: mirrorDelegate.isPlayer
                label: "DETRÁS"
                labelFirst: false
            }
        }
    }
}
