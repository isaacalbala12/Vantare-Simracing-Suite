//! Keep host ICS expectations synchronized with the frozen GPUI implementation.
#[path = "../examples/calendar-ics.rs"]
mod exporter;
use exporter::calendar;
#[test]
fn host_ics_fixture_matches_actual_gpui_entries_for_every_scope() {
    let expected: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../hub-web/fixtures/calendar-ics-gpui.json"
    ))
    .unwrap();
    assert_eq!(exporter::value(), expected);
}
