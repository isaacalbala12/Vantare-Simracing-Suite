import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    required property bool overlayMode
    required property bool editorMode
    required property bool efficiencyMode
    property string previewTitle: "STANDINGS"
    property int previewRows: 8
    property int previewOpacity: 90
    property bool previewRelative: true
    property string previewAccent: "Turquesa"
    readonly property color editorAccent: previewAccent === "Ámbar" ? "#efb955" : (previewAccent === "Blanco" ? "#e8f0f4" : "#5fe1ee")
    width: efficiencyMode ? 428 : (overlayMode ? 520 : (editorMode ? 1280 : 1060))
    height: efficiencyMode ? 364 : (overlayMode ? 500 : 720)
    visible: false
    title: efficiencyMode ? "Vantare · Standings Eficiencia" : (overlayMode ? "Vantare Native Trial Overlay" : (editorMode ? "Vantare Native Trial Editor" : "Vantare Native Trial Control"))
    color: overlayMode || efficiencyMode ? "transparent" : "#090d13"
    background: Rectangle { color: root.overlayMode || root.efficiencyMode ? "transparent" : "#090d13" }
    readonly property color ink: "#e8f0f4"
    readonly property color muted: "#91a6b3"
    readonly property color accent: "#5fe1ee"

    function valueText(field, suffix) {
        if (!field || field.v === undefined || field.q === "missing" || field.q === "invalid") return "—"
        return String(field.v) + (suffix || "")
    }

    function numberText(field, digits, suffix) {
        if (!field || (field.q !== "fresh" && field.q !== "stale")) return "—"
        return Number(field.v === undefined ? 0 : field.v).toFixed(digits) + (suffix || "")
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

    component EditorPanel: Rectangle {
        color: "#15212b"
        radius: 8
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 12
            spacing: 7
            Label { text: "EDITOR · BORRADOR LOCAL"; color: root.accent; font.bold: true; Layout.fillWidth: true }
            Label { text: "Título del overlay"; color: root.muted }
            TextField {
                id: titleField
                text: root.previewTitle
                maximumLength: 32
                Layout.fillWidth: true
                onTextEdited: root.previewTitle = text
            }
            Label { text: "Filas visibles: " + root.previewRows; color: root.muted }
            SpinBox {
                from: 4; to: 10; value: root.previewRows
                Layout.fillWidth: true
                onValueModified: root.previewRows = value
            }
            Label { text: "Opacidad: " + root.previewOpacity + "%"; color: root.muted }
            Slider {
                from: 40; to: 100; stepSize: 5; value: root.previewOpacity
                Layout.fillWidth: true
                onMoved: root.previewOpacity = Math.round(value)
            }
            Label { text: "Color de acento"; color: root.muted }
            ComboBox {
                model: ["Turquesa", "Ámbar", "Blanco"]
                currentIndex: model.indexOf(root.previewAccent)
                Layout.fillWidth: true
                onActivated: root.previewAccent = currentText
            }
            RowLayout {
                Layout.fillWidth: true
                Switch {
                    checked: root.previewRelative
                    onToggled: root.previewRelative = checked
                }
                Label { text: "Mostrar Relative"; color: root.muted; Layout.fillWidth: true }
            }
            Label { text: "VISTA PREVIA"; color: root.muted; font.bold: true }
            Rectangle {
                color: "#090d13"
                radius: 6
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                Column {
                    anchors.fill: parent
                    anchors.margins: 9
                    spacing: 2
                    opacity: root.previewOpacity / 100
                    Label { text: root.previewTitle; color: root.editorAccent; font.bold: true }
                    Repeater {
                        model: feed.standings.slice(0, root.previewRows)
                        delegate: Label {
                            required property var modelData
                            width: parent.width
                            height: 17
                            text: modelData.position + "   " + (modelData.driver || modelData.id)
                            color: root.ink
                            elide: Text.ElideRight
                        }
                    }
                    Label {
                        visible: root.previewRelative
                        text: "RELATIVE · " + feed.relative.length + " coches"
                        color: root.editorAccent
                    }
                }
            }
            Button {
                id: resetButton
                text: "Restablecer borrador"
                Layout.fillWidth: true
                contentItem: Label {
                    text: resetButton.text
                    color: "#101820"
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: {
                    root.previewTitle = "STANDINGS"
                    root.previewRows = 8
                    root.previewOpacity = 90
                    root.previewRelative = true
                    root.previewAccent = "Turquesa"
                }
            }
        }
    }

    Loader {
        anchors.fill: parent
        sourceComponent: root.efficiencyMode ? efficiencyContent : (root.overlayMode ? overlayContent : controlContent)
    }

    Component {
        id: efficiencyContent
        Rectangle {
            width: 428; height: 364; color: "#de111214"; radius: 6
            Column {
                anchors.fill: parent
                spacing: 0
                Rectangle {
                    width: 428; height: 42; color: "#e618191b"
                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        spacing: 0
                        Text { width: 85; height: 42; verticalAlignment: Text.AlignVCenter; text: "VANTARE"; color: "#e32530"; font.pixelSize: 12; font.bold: true }
                        Text { width: 95; height: 42; verticalAlignment: Text.AlignVCenter; text: "CARRERA " + feed.efficiencyClock; color: "#f5f5f5"; font.pixelSize: 11; font.bold: true }
                        Rectangle { width: 48; height: 27; anchors.verticalCenter: parent.verticalCenter; color: "#c1121f"; radius: 3
                            Text { anchors.centerIn: parent; text: feed.efficiencyClass.slice(0, 3); color: "white"; font.pixelSize: 10; font.bold: true }
                        }
                        Text { width: 105; height: 42; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignHCenter; text: "AL LÍDER"; color: "#bdbfc4"; font.pixelSize: 9; font.bold: true }
                        Text { width: 87; height: 42; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignRight; text: "MEJOR V."; color: "#bdbfc4"; font.pixelSize: 9; font.bold: true }
                    }
                }
                Item {
                    width: 428; height: 300; clip: true
                    Repeater {
                        model: feed.efficiencyRows
                        delegate: Rectangle {
                            required property var modelData
                            required property int index
                            y: index * 30
                            width: 428; height: 30
                            color: modelData.player ? "#ab343538" : (modelData.position <= 3 ? "#77191a1c" : "transparent")
                            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#292a2d" }
                            Rectangle { visible: modelData.player; x: 3; y: 5; width: 2; height: 20; color: "#ed2431" }
                            Row {
                                anchors.fill: parent
                                Text { width: 30; height: 30; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignHCenter; text: modelData.position; color: "#b9bbc1"; font.pixelSize: 14 }
                                Text { width: 236; height: 30; verticalAlignment: Text.AlignVCenter; leftPadding: 8; text: modelData.driver + (modelData.player ? "  TÚ" : ""); color: "#f5f5f5"; font.pixelSize: 14; font.bold: true; elide: Text.ElideRight }
                                Text { width: 86; height: 30; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignHCenter; text: modelData.gap; color: "#f5f5f5"; font.pixelSize: 14 }
                                Text { width: 76; height: 30; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignRight; rightPadding: 8; text: modelData.bestLap; color: "#e6e5e9"; font.pixelSize: 14 }
                            }
                        }
                    }
                }
                Rectangle { width: 428; height: 22; color: "#e618191b"
                    Text { anchors.centerIn: parent; width: parent.width - 16; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight; text: feed.efficiencyFooter; color: "#b9b9bd"; font.pixelSize: 10; font.bold: true }
                }
            }
        }
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
                        Label { text: root.numberText(feed.player.rpm, 0, " rpm") + "  ·  " + root.numberText(feed.player.gear, 0, ""); color: root.ink; font.pixelSize: 20; font.bold: true }
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
                    Layout.preferredWidth: root.editorMode ? 250 : 290
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
                EditorPanel {
                    visible: root.editorMode
                    Layout.preferredWidth: root.editorMode ? 300 : 0
                    Layout.fillHeight: true
                }
            }
        }
    }
}
