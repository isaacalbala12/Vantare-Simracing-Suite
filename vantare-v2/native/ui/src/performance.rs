pub use vantare_domain::performance::*;
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    #[test]
    fn hub_layout_wire_contract_matches_widget_cadences_and_validation() {
        use vantare_hub_host::settings::track::{
            PerformanceLevel, TABLE_HZ, WIDGET_HZ, valid_overrides,
        };
        for (index, (native, wire)) in Level::ALL
            .into_iter()
            .zip(PerformanceLevel::ALL)
            .enumerate()
        {
            assert_eq!(
                serde_json::to_value(native).expect("native"),
                serde_json::to_value(wire).expect("wire")
            );
            assert_eq!(native.hz(crate::Kind::Pedals), WIDGET_HZ[index]);
            for kind in [
                crate::Kind::Standings,
                crate::Kind::Relative,
                crate::Kind::MulticlassRelative,
                crate::Kind::BroadcastTower,
            ] {
                assert_eq!(native.hz(kind), TABLE_HZ[index]);
            }
            assert_eq!(native.hz(crate::Kind::RacingFlags), 0);
        }
        let mut widgets = BTreeMap::new();
        for hz in 0..=u16::MAX {
            widgets.insert("qa".into(), hz);
            assert_eq!(
                Preferences {
                    widgets: widgets.clone(),
                    ..Default::default()
                }
                .valid(),
                valid_overrides(&widgets),
                "Hz {hz}"
            );
        }
        for id in [
            String::new(),
            "x".repeat(128),
            "x".repeat(129),
            "ñ".repeat(64),
            "ñ".repeat(65),
        ] {
            let widgets = BTreeMap::from([(id, 30)]);
            assert_eq!(
                Preferences {
                    widgets: widgets.clone(),
                    ..Default::default()
                }
                .valid(),
                valid_overrides(&widgets)
            );
        }
        for count in [0, 255, 256, 257] {
            let widgets = (0..count)
                .map(|i| (format!("qa-{i}"), 30))
                .collect::<BTreeMap<_, _>>();
            assert_eq!(
                Preferences {
                    widgets: widgets.clone(),
                    ..Default::default()
                }
                .valid(),
                valid_overrides(&widgets)
            );
        }
    }
}
