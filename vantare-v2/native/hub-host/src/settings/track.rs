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
#[allow(clippy::struct_excessive_bools)] // Independent document state in the wire view.
pub struct TrackView {
    pub exists: bool,
    pub level: PerformanceLevel,
    pub customized: bool,
    pub hide_off_track: bool,
    pub protected: bool,
}

// Compared against the real overlay Preferences::valid in ui's unit tests.
pub const OVERRIDE_HZ: [u16; 10] = [0, 1, 4, 5, 10, 15, 20, 30, 40, 60];
pub const MAX_WIDGET_OVERRIDES: usize = 256;
pub const MAX_WIDGET_ID_BYTES: usize = 128;
pub fn valid_overrides(widgets: &std::collections::BTreeMap<String, u16>) -> bool {
    widgets.len() <= MAX_WIDGET_OVERRIDES
        && widgets.iter().all(|(id, hz)| {
            !id.is_empty() && id.len() <= MAX_WIDGET_ID_BYTES && OVERRIDE_HZ.contains(hz)
        })
}
