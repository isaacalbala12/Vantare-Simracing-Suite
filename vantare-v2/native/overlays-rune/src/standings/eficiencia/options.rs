//! Columnas V3 del pintor Eficiencia; Vantare usa su propio layout.
use super::model::{Align, Column, Metric, NameMode, Preset};
use vantare_domain::widget_settings::columns as keys;

pub use vantare_domain::widget_settings::columns::ColumnSetting;

pub(crate) trait ColumnPresentation {
    fn column(&self) -> Option<Column>;
}
impl ColumnPresentation for ColumnSetting {
    fn column(&self) -> Option<Column> {
        if !self.enabled {
            return None;
        }
        let metric = match self.metric_id.as_str() {
            keys::COLUMN_METRIC_POSITION => Metric::Position,
            keys::COLUMN_METRIC_DRIVER_NUMBER | keys::COLUMN_METRIC_CAR_NUMBER => {
                Metric::DriverNumber
            }
            keys::COLUMN_METRIC_DRIVER_NAME => Metric::DriverName,
            keys::COLUMN_METRIC_VEHICLE_CLASS | keys::COLUMN_METRIC_CLASS => Metric::VehicleClass,
            keys::COLUMN_METRIC_GAP => Metric::Gap,
            keys::COLUMN_METRIC_INTERVAL => Metric::Interval,
            keys::COLUMN_METRIC_CURRENT_LAP => Metric::CurrentLap,
            keys::COLUMN_METRIC_LAST_LAP => Metric::LastLap,
            keys::COLUMN_METRIC_BEST_LAP => Metric::BestLap,
            keys::COLUMN_METRIC_PIT => Metric::Pit,
            _ => return None,
        };
        Some(Column {
            metric,
            preset: match self.width_preset.as_str() {
                keys::COLUMN_WIDTH_XS => Preset::Xs,
                keys::COLUMN_WIDTH_SM => Preset::Sm,
                keys::COLUMN_WIDTH_MD => Preset::Md,
                keys::COLUMN_WIDTH_LG => Preset::Lg,
                _ => Preset::Auto,
            },
            align: match self.style.align.as_deref() {
                Some(keys::COLUMN_ALIGN_LEFT) => Some(Align::Left),
                Some(keys::COLUMN_ALIGN_CENTER) => Some(Align::Center),
                Some(keys::COLUMN_ALIGN_RIGHT) => Some(Align::Right),
                _ => None,
            },
            name_mode: match self.format.mode.as_str() {
                keys::COLUMN_NAME_INITIAL => NameMode::Initial,
                keys::COLUMN_NAME_SURNAME => NameMode::Surname,
                keys::COLUMN_NAME_TRUNCATE => NameMode::Truncate,
                _ => NameMode::Full,
            },
            max_chars: self
                .format
                .max_chars
                .unwrap_or(16)
                .min(keys::MAX_CHARS_LIMIT),
        })
    }
}
