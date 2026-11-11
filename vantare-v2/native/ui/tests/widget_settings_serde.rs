//! Real saved layouts keep the same bytes through the old UI path and domain.
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use vantare_domain::widget_settings::{delta, fuel_strategy, pedals, relative, standings};
use vantare_ui::Settings;

fn through_domain<T: Serialize + DeserializeOwned>(value: &Value) -> Value {
    let settings: T =
        serde_json::from_value(value.clone()).expect("domain reads the saved settings");
    let mut after = serde_json::to_value(settings).expect("domain serializes the settings");
    after["kind"] = value["kind"].clone();
    after
}

#[test]
fn real_layout_settings_keep_identical_serialized_bytes_after_the_move() {
    let mut checked = 0;
    for fixture in [
        include_str!("../fixtures/layouts/native-beta-v0.0.975.json"),
        include_str!("../../packaging/fixtures/layout.golden.json"),
        include_str!("../../hub-host/data/widget-defaults.json"),
    ] {
        let document: Value = serde_json::from_str(fixture).expect("real fixture");
        let instances = if let Some(values) = document["instances"].as_array() {
            values.iter().collect::<Vec<_>>()
        } else {
            document["widgets"]
                .as_object()
                .expect("widget export")
                .values()
                .collect()
        };
        for instance in instances {
            let original = &instance["settings"];
            let after = match original["kind"].as_str().expect("kind") {
                "standings" => through_domain::<standings::Settings>(original),
                "relative" => through_domain::<relative::Settings>(original),
                "delta" => through_domain::<delta::Settings>(original),
                "pedals" => through_domain::<pedals::Settings>(original),
                "fuel-strategy" => through_domain::<fuel_strategy::Settings>(original),
                _ => continue,
            };
            let before: Settings =
                serde_json::from_value(original.clone()).expect("UI public path");
            let after: Settings = serde_json::from_value(after).expect("UI reads domain output");
            assert_eq!(
                serde_json::to_vec(&before).expect("before bytes"),
                serde_json::to_vec(&after).expect("after bytes")
            );
            checked += 1;
        }
    }
    assert!(
        checked >= 10,
        "legacy layouts and all five default settings"
    );
}
