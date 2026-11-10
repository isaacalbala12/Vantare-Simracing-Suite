//! Wire projection of the persisted layout fields, without linking GPUI.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PerformanceLevel {
    Maximum,
    High,
    #[default]
    Balanced,
    Economy,
    Minimum,
}
impl PerformanceLevel {
    pub const ALL: [Self; 5] = [
        Self::Maximum,
        Self::High,
        Self::Balanced,
        Self::Economy,
        Self::Minimum,
    ];
}
// Frozen overlay cadence, in ALL order. This is presentation, never a scheduler.
pub const WIDGET_HZ: [u16; 5] = [0, 60, 40, 30, 20];
pub const TABLE_HZ: [u16; 5] = [30, 20, 15, 10, 5];
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackView {
    pub level: PerformanceLevel,
    pub customized: bool,
    pub hide_off_track: bool,
    pub protected: bool,
}
