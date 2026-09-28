import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    required property bool overlayMode
    width: overlayMode ? 520 : 1060
    height: overlayMode ? 500 : 720
    visible: false
    title: overlayMode ? "Vantare Native Trial Overlay" : "Vantare Native Trial Control"
    color: overlayMode ? "transparent" : "#090d13"
    readonly property color ink: "#e8f0f4"
    readonly property color muted: "#91a6b3"
    readonly property color accent: "#5fe1ee"

    function valueText(field, suffix) {
        if (!field || field.v === undefined || field.q === "missing" || field.q === "invalid") return "—"
        return String(field.v) + (suffix || "")
    }

    function numberText(field, digits, suffix) {
        if (!field || field.v === undefined || field.q === "missing" || field.q === "invalid") return "—"
        return Number(field.v).toFixed(digits) + (suffix || "")
    }

    component StandingsList: Rectangle {
        id: panel
        property bool compact: false
        color: "#ed101820"
        border.color: "#31515c"
        radius: 8
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 10
            spacing: 5
            Label {
                text: "STANDINGS  ·  " + feed.standings.length + " coches"
                color: root.accent
                font.bold: true
                font.letterSpacing: 1.3
                Layout.fillWidth: true
            }
            ListView {
                id: rows
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: panel.compact ? feed.standings.slice(0, 10) : feed.standings
                ScrollBar.vertical: ScrollBar {}
                delegate: Rectangle {
                    required property var modelData
                    required property int index
                    width: rows.width
                    height: panel.compact ? 37 : 33
                    color: modelData.id === feed.player.id ? "#2a36505b" : (index % 2 ? "#101b23" : "#131f28")
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        spacing: 8
                        Label { text: modelData.position; color: root.accent; Layout.preferredWidth: 30; font.bold: true }
                        Label { text: modelData.driver || modelData.id; color: root.ink; Layout.fillWidth: true; elide: Text.ElideRight }
                        Label { text: modelData.classId || "—"; color: root.muted; Layout.preferredWidth: 100 }
                        Label { text: modelData.laps; color: root.muted; Layout.preferredWidth: 35; horizontalAlignment: Text.AlignRight }
                    }
                }
            }
        }
    }

    Loader {
        anchors.fill: parent
        sourceComponent: root.overlayMode ? overlayContent : controlContent
    }

    Component {
        id: overlayContent
        ColumnLayout {
            anchors.fill: parent
            spacing: 4
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 44
                color: "#ed101820"
                border.color: "#31515c"
                radius: 8
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    Label { text: "VANTARE"; color: root.accent; font.bold: true; font.letterSpacing: 2 }
                    Item { Layout.fillWidth: true }
                    Label { text: root.valueText(feed.session.track); color: root.ink }
                }
            }
            StandingsList { compact: true; Layout.fillWidth: true; Layout.fillHeight: true }
        }
    }

    Component {
        id: controlContent
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 18
            spacing: 14
            RowLayout {
                Layout.fillWidth: true
                Label { text: "VANTARE"; color: root.accent; font.pixelSize: 23; font.bold: true; font.letterSpacing: 2 }
                Label { text: "Native Go trial"; color: root.muted; font.pixelSize: 19 }
                Item { Layout.fillWidth: true }
                Label { text: feed.state.toUpperCase(); color: feed.state === "live" ? root.accent : "#d4ae70"; font.bold: true }
            }
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 90
                Layout.maximumHeight: 90
                spacing: 12
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 90; color: "#15212b"; radius: 8
                    Column { anchors.fill: parent; anchors.margins: 12; spacing: 8
                        Label { text: "CIRCUITO"; color: root.muted; font.pixelSize: 11 }
                        Label { text: root.valueText(feed.session.track); color: root.ink; font.pixelSize: 20; font.bold: true }
                    }
                }
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 90; color: "#15212b"; radius: 8
                    Column { anchors.fill: parent; anchors.margins: 12; spacing: 8
                        Label { text: "PILOTO · VELOCIDAD"; color: root.muted; font.pixelSize: 11 }
                        Label { text: root.numberText(feed.player.speed, 1, " m/s"); color: root.ink; font.pixelSize: 20; font.bold: true }
                    }
                }
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 90; color: "#15212b"; radius: 8
                    Column { anchors.fill: parent; anchors.margins: 12; spacing: 8
                        Label { text: "MOTOR · MARCHA"; color: root.muted; font.pixelSize: 11 }
                        Label { text: root.numberText(feed.player.rpm, 0, " rpm") + "  ·  " + root.valueText(feed.player.gear); color: root.ink; font.pixelSize: 20; font.bold: true }
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.minimumHeight: 0
                spacing: 12
                StandingsList { Layout.fillWidth: true; Layout.fillHeight: true }
                Rectangle {
                    Layout.preferredWidth: 290
                    Layout.fillHeight: true
                    color: "#15212b"
                    radius: 8
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 12
                        Label { text: "RELATIVE"; color: root.accent; font.bold: true; font.letterSpacing: 1.3 }
                        ListView {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            model: feed.relative
                            delegate: Label {
                                required property var modelData
                                width: parent.width
                                height: 28
                                text: (modelData.position || "—") + "   " + (modelData.name || modelData.id)
                                color: root.ink
                                elide: Text.ElideRight
                            }
                        }
                        Label { text: "Sesión: " + feed.sessionId; color: root.muted; elide: Text.ElideMiddle; Layout.fillWidth: true }
                    }
                }
            }
        }
    }
}
