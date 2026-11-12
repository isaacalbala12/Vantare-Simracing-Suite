//! Serialized column options shared by the table widgets.
pub const MAX_CHARS_LIMIT: usize = 64;
pub const COLUMN_NAME_FULL: &str = "full";
pub const COLUMN_NAME_INITIAL: &str = "initial";
pub const COLUMN_NAME_SURNAME: &str = "surname";
pub const COLUMN_NAME_TRUNCATE: &str = "truncate";
pub const COLUMN_WIDTH_XS: &str = "xs";
pub const COLUMN_WIDTH_SM: &str = "sm";
pub const COLUMN_WIDTH_MD: &str = "md";
pub const COLUMN_WIDTH_LG: &str = "lg";
pub const COLUMN_ALIGN_LEFT: &str = "left";
pub const COLUMN_ALIGN_CENTER: &str = "center";
pub const COLUMN_ALIGN_RIGHT: &str = "right";
pub const COLUMN_WIDTH_AUTO: &str = "auto";
pub const COLUMN_METRIC_POSITION: &str = "position";
pub const COLUMN_METRIC_POSITIONS_GAINED: &str = "positionsGained";
pub const COLUMN_METRIC_DRIVER_NUMBER: &str = "driverNumber";
pub const COLUMN_METRIC_DRIVER_NAME: &str = "driverName";
pub const COLUMN_METRIC_VEHICLE: &str = "vehicle";
pub const COLUMN_METRIC_TIRE_COMPOUND: &str = "tireCompound";
pub const COLUMN_METRIC_PIT: &str = "pit";
pub const COLUMN_METRIC_SECTORS: &str = "sectors";
pub const COLUMN_METRIC_LAST_LAP: &str = "lastLap";
pub const COLUMN_METRIC_BEST_LAP: &str = "bestLap";
pub const COLUMN_METRIC_INTERVAL: &str = "interval";
pub const COLUMN_METRIC_GAP: &str = "gap";
pub const COLUMN_METRIC_CAR_NUMBER: &str = "carNumber";
pub const COLUMN_METRIC_LAP_DELTA: &str = "lapDelta";
pub const COLUMN_METRIC_DRIVER_RATING: &str = "driverRating";
pub const COLUMN_METRIC_SAFETY_RATING: &str = "safetyRating";
pub const COLUMN_METRIC_TREND: &str = "trend";
pub const COLUMN_METRIC_TRACK_STRIP: &str = "trackStrip";
pub const COLUMN_METRIC_VEHICLE_CLASS: &str = "vehicleClass";
pub const COLUMN_METRIC_CLASS: &str = "class";
pub const COLUMN_METRIC_CURRENT_LAP: &str = "currentLap";
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "WidgetColumnFormat"))]
#[serde(default, rename_all = "camelCase")]
pub struct Format {
    pub mode: String,
    pub max_chars: Option<usize>,
    pub display: Option<String>,
    pub decimals: Option<u8>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "WidgetColumnStyle"))]
#[serde(default)]
pub struct Style {
    pub align: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "WidgetColumnSetting"))]
#[serde(default, rename_all = "camelCase")]
pub struct ColumnSetting {
    pub id: String,
    pub metric_id: String,
    pub enabled: bool,
    pub width_preset: String,
    pub format: Format,
    pub style: Style,
}
impl Default for ColumnSetting {
    fn default() -> Self {
        Self {
            id: String::new(),
            metric_id: String::new(),
            enabled: true,
            width_preset: COLUMN_WIDTH_AUTO.into(),
            format: Format::default(),
            style: Style::default(),
        }
    }
}
