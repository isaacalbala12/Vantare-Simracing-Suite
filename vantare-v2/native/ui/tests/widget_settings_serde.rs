//! Frozen bytes emitted by origin/nightly 45a64e016558a214c5eb63537d281859bcfa95fb,
//! before the Settings extraction. Never regenerate this oracle with the types under test.
use serde_json::Value;
use vantare_ui::Settings;

fn serialized_real_fixtures() -> Vec<u8> {
    let mut fixtures = Vec::new();
    let mut kinds = std::collections::BTreeSet::new();
    for fixture in [
        include_str!("../fixtures/layouts/native-beta-v0.0.975.json"),
        include_str!("../../packaging/fixtures/layout.golden.json"),
        include_str!("../fixtures/layouts/widget-settings-families.json"),
    ] {
        let document: Value = serde_json::from_str(fixture).expect("saved layout fixture");
        let mut settings = Vec::new();
        for instance in document["instances"].as_array().expect("instances") {
            let value = &instance["settings"];
            let kind = value["kind"].as_str().expect("kind");
            if !matches!(
                kind,
                "standings" | "relative" | "delta" | "pedals" | "fuel-strategy"
            ) {
                continue;
            }
            kinds.insert(kind.to_owned());
            settings
                .push(serde_json::from_value::<Settings>(value.clone()).expect("saved settings"));
        }
        assert!(
            !settings.is_empty(),
            "each real fixture contributes settings"
        );
        fixtures.push(settings);
    }
    assert_eq!(
        kinds.len(),
        5,
        "all five extracted widget kinds are covered"
    );
    let mut bytes = serde_json::to_vec_pretty(&fixtures).expect("serialize settings");
    bytes.push(b'\n');
    bytes
}

#[test]
fn real_layout_settings_keep_pre_extraction_serialized_bytes() {
    assert_eq!(
        serialized_real_fixtures(),
        include_bytes!("widget-settings-canonical-45a64e016.json"),
        "independent pre-extraction nightly byte oracle"
    );
}
