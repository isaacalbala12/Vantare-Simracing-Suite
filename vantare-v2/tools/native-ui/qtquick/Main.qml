import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    required property bool overlayMode
    required property bool editorMode
    property string previewTitle: "STANDINGS"
    property int previewRows: 8
    property int previewOpacity: 90
    property bool previewRelative: true
    property string previewAccent: "Turquesa"
    readonly property color editorAccent: previewAccent === "Ámbar" ? "#efb955" : (previewAccent === "Blanco" ? "#e8f0f4" : "#5fe1ee")
    width: overlayMode ? 520 : (editorMode ? 1280 : 1060)
    height: overlayMode ? 500 : 720
    visible: false
    title: overlayMode ? "Vantare Native Trial Overlay" : (editorMode ? "Vantare Native Trial Editor" : "Vantare Native Trial Control")
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
