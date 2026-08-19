import QtQuick 2.15

Item {
    id: root

    property int reservations: 0

    width: 0
    height: 0
    visible: false

    function reserve() {
        const slot = reservations
        reservations += 1
        resetBatch.restart()
        return slot < tokens.crossMaxConcurrent ? slot : -1
    }

    RelativeTokens { id: tokens }

    Timer {
        id: resetBatch
        interval: 0
        onTriggered: root.reservations = 0
    }
}
