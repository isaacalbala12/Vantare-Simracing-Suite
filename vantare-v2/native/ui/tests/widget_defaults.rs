//! Serialized bridge only: hub-host never links the overlay renderer.
#[path = "../examples/widget-defaults.rs"]
mod exporter;
#[test]
fn versioned_host_defaults_match_all_native_widgets_without_a_window() {
    let generated = exporter::bytes().expect("headless native defaults");
    assert_eq!(
        generated,
        include_bytes!("../../hub-host/data/widget-defaults.json")
    );
    let value: serde_json::Value = serde_json::from_slice(&generated).expect("JSON defaults");
    let widgets = value["widgets"].as_object().expect("widget map");
    assert_eq!(widgets.len(), vantare_ui::Kind::ALL.len());
    for kind in vantare_ui::Kind::ALL {
        assert!(widgets.contains_key(kind.name()));
    }
    assert_eq!(exporter::bytes().expect("repeat export"), generated);
}
