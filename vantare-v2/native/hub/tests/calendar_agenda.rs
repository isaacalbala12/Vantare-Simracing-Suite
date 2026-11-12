//! Fixture maintenance against the actual GPUI model, without opening a window.
#[path = "../examples/calendar-agenda.rs"]
mod exporter;
use exporter::calendar;
#[test]
fn portable_host_agenda_fixture_matches_frozen_gpui() {
    let expected: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../hub-web/fixtures/calendar-agenda-gpui.json"
    ))
    .unwrap();
    let mut actual = exporter::value();
    assert_eq!(
        actual["sources"], expected["sources"],
        "regenerate calendar-agenda after a native model change"
    );
    let expected_rows = expected["cases"].as_array().unwrap();
    let actual_rows = actual["cases"].as_array_mut().unwrap();
    assert_eq!(actual_rows.len(), expected_rows.len());
    for (actual, expected) in actual_rows.iter_mut().zip(expected_rows) {
        // Alerts::cause uses the OS local zone. First is compared directly when
        // that zone matches the recorded fixture; the host tests additionally
        // exercise First with injected zones (including midnight gaps/folds).
        if actual["offsetSeconds"] != expected["offsetSeconds"] {
            if actual["alerts"]["bands"]
                .as_array()
                .unwrap()
                .iter()
                .any(|band| band["mode"] == "first")
            {
                eprintln!(
                    "First local-zone comparison skipped for {}: fixture offset differs; starts and source hashes remain checked",
                    expected["seriesId"]
                );
                actual["causes"] = expected["causes"].clone();
            }
            actual["offsetSeconds"] = expected["offsetSeconds"].clone();
        }
        assert_eq!(actual, expected);
    }
}
