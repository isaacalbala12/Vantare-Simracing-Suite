//! Uses the existing bounded layout parser, exposing only visible widget boxes.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const WIDGET_LIMIT: usize = 128;
pub const COORDINATE_LIMIT: i32 = 32_768;
pub const CANVAS_MIN: u32 = 64;
pub const VERSION_LIMIT: usize = 128;
pub const REVISION_PATTERN: &str = "^[0-9a-f]{64}$";
pub const OPACITY_MAX: u8 = 100;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HomeWidgetKind {
    Standings,
    Radar,
    Pedals,
    Delta,
    CarDamageVisual,
    InputTelemetry,
    MulticlassRelative,
    BroadcastTower,
    DeltaTrace,
    TrackMap,
    TrackWeather,
    CarDamageNumbers,
    HeadToHead,
    FuelStrategy,
    PedalsTelemetry,
    Relative,
    RacingFlags,
    FastestLap,
    SessionAlerts,
}
impl HomeWidgetKind {
    pub fn key(self) -> String {
        serde_json::to_value(self)
            .expect("kind")
            .as_str()
            .expect("string")
            .to_owned()
    }
    pub const ALL: [Self; 19] = [
        Self::Standings,
        Self::Radar,
        Self::Pedals,
        Self::Delta,
        Self::CarDamageVisual,
        Self::InputTelemetry,
        Self::MulticlassRelative,
        Self::BroadcastTower,
        Self::DeltaTrace,
        Self::TrackMap,
        Self::TrackWeather,
        Self::CarDamageNumbers,
        Self::HeadToHead,
        Self::FuelStrategy,
        Self::PedalsTelemetry,
        Self::Relative,
        Self::RacingFlags,
        Self::FastestLap,
        Self::SessionAlerts,
    ];
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HomePreviewState {
    Missing,
    Protected,
    Ready,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HomePreviewWidget {
    pub kind: HomeWidgetKind,
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    // Percentage, rounded from the persisted fraction. No settings leave Rust.
    pub opacity: u8,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HomeLayoutView {
    pub state: HomePreviewState,
    pub width: u32,
    pub height: u32,
    pub widgets: Vec<HomePreviewWidget>,
}
impl HomeLayoutView {
    pub fn empty(state: HomePreviewState) -> Self {
        Self {
            state,
            width: 1920,
            height: 1080,
            widgets: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_kinds_exactly_cover_the_native_defaults_snapshot() {
        let source: serde_json::Value =
            serde_json::from_str(include_str!("../../data/widget-defaults.json")).unwrap();
        let expected: std::collections::BTreeSet<_> = source["widgets"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        assert_eq!(
            HomeWidgetKind::ALL
                .into_iter()
                .map(HomeWidgetKind::key)
                .collect::<std::collections::BTreeSet<_>>(),
            expected
        );
        for kind in HomeWidgetKind::ALL {
            assert!(crate::widget_defaults::get(&kind.key()).is_some());
        }
    }
}
