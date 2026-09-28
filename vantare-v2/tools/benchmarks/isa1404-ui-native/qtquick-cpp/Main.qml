import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    required property bool overlayMode
    required property bool initialShowGap
    required property var fixtureRows
    property bool showGap: initialShowGap
    property int tick: 0
    width: overlayMode ? 560 : 720
    height: overlayMode ? 430 : 650
    visible: false
    title: overlayMode ? "Vantare Bakeoff · Qt Quick Overlay" : "Vantare Bakeoff · Qt Quick Control"
    color: overlayMode ? "transparent" : "#0b0e12"

    Timer { interval: 50; repeat: true; running: root.visible; onTriggered: root.tick = (root.tick + 1) % 1000 }

    component Standings: Rectangle {
        width: 540; height: 406; color: "#f0090d11"; border.color: "#397dD9ff"; border.width: 1
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 42; color: "transparent"
                RowLayout { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14; spacing: 12
                    Label { text: "VANTARE"; color: "#82e9ff"; font.bold: true; font.letterSpacing: 1.6 }
                    Label { text: "STANDINGS"; color: "#aab5bc"; font.bold: true }
                    Item { Layout.fillWidth: true }
                    Rectangle { width: 7; height: 7; radius: 4; color: "#63efff"; opacity: .35 + (root.tick % 10) / 20 }
                }
            }
            Repeater {
                model: root.fixtureRows
                delegate: Rectangle {
                    required property var modelData
                    width: 540; height: 42
                    color: modelData.player ? "#3e29c5e8" : "transparent"
                    border.color: "#12ffffff"; border.width: 1
                    RowLayout { anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12; spacing: 0
                        Label { text: modelData.position; color: modelData.player ? "#75ecff" : "#dce4e8"; font.bold: true; Layout.preferredWidth: 48 }
                        Label { text: modelData.driver; color: "#f2f5f7"; Layout.fillWidth: true }
                        Label { text: String(modelData.vehicleClass).replace("_ELMS", ""); color: "#7cdce9"; font.pixelSize: 11; Layout.preferredWidth: 100 }
                        Label { visible: root.showGap; text: Number(modelData.gapSeconds).toFixed(3); color: "#b8c1c7"; horizontalAlignment: Text.AlignRight; Layout.preferredWidth: visible ? 94 : 0 }
                    }
                }
            }
        }
    }

    Loader { anchors.centerIn: parent; sourceComponent: root.overlayMode ? overlayComponent : controlComponent }
    Component { id: overlayComponent; Standings {} }
    Component {
        id: controlComponent
        ColumnLayout {
            width: 660; spacing: 12
            Label { text: "Vantare UI bakeoff"; color: "#f2f5f7"; font.pixelSize: 26; font.bold: true }
            Label { text: "C++20 · Qt Quick 6.10.2"; color: "#91a0aa" }
            TextField { Layout.preferredWidth: 430; text: "Barcelona · LMU"; Accessible.name: "Nombre de sesión" }
            CheckBox { text: "Mostrar intervalo"; checked: root.showGap; onToggled: root.showGap = checked; Accessible.name: "Mostrar intervalo" }
            Standings {}
        }
    }
}
