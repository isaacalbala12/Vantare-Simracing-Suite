//! Byte oracle for the static web illustration; no GPUI App or Window.
#[path = "../examples/onboarding-previews.rs"]
mod exporter;
#[test]
fn onboarding_preview_sizes_match_native_widgets_without_a_window() {
    let generated = exporter::bytes().expect("native preview geometry");
    assert_eq!(
        generated,
        include_bytes!("../fixtures/onboarding-previews.json")
    );
    let sizes: serde_json::Value = serde_json::from_slice(&generated).expect("preview sizes");
    for kind in vantare_ui::Kind::ALL {
        assert!(sizes.get(kind.name()).is_some());
    }
}
