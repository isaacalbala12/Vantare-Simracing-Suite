//! The pre-extraction GPUI exporter is the byte oracle, not a second schema.
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use vantare_domain::widget_settings::{delta, fuel_strategy, pedals, relative, standings};

fn rewrite<T: Serialize + DeserializeOwned>(value: &mut Value) {
    let kind = value["kind"].clone();
    let settings: T = serde_json::from_value(value.clone()).expect("real GPUI settings");
    *value = serde_json::to_value(settings).expect("serialize domain settings");
    value["kind"] = kind;
}

#[test]
fn gpui_widget_defaults_round_trip_without_changing_a_byte() {
    let original = include_bytes!("../../hub-host/data/widget-defaults.json");
    let mut document: Value = serde_json::from_slice(original).expect("versioned GPUI export");
    for (kind, widget) in document["widgets"].as_object_mut().expect("widgets") {
        let settings = &mut widget["settings"];
        match kind.as_str() {
            "standings" => rewrite::<standings::Settings>(settings),
            "relative" => rewrite::<relative::Settings>(settings),
            "delta" => rewrite::<delta::Settings>(settings),
            "pedals" => rewrite::<pedals::Settings>(settings),
            "fuel-strategy" => rewrite::<fuel_strategy::Settings>(settings),
            _ => {}
        }
    }
    let mut after = serde_json::to_vec_pretty(&document).expect("serialize original document");
    after.push(b'\n');
    assert_eq!(
        after, original,
        "the committed export predates the extraction"
    );
}
