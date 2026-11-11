//! The host consumes serialized fixtures and never links this renderer crate.
#[path = "../examples/onboarding-presentation.rs"]
mod exporter;
#[test]
fn host_presentation_fixture_matches_native_without_a_window() {
    let expected = include_bytes!("../../hub-host/data/onboarding-presentation.json");
    assert_eq!(
        exporter::bytes().expect("native presentation bytes"),
        expected
    );
    assert_eq!(
        exporter::bytes().expect("repeat native presentation bytes"),
        expected
    );
}
