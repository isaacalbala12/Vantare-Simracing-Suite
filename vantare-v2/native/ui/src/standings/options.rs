//! Contrato de columnas V3. Reutilizado por las dos tablas de esta familia.
use super::model::{Align, Column, Metric, NameMode, Preset};
use vantare_domain::widget_settings::columns as keys;

pub use vantare_domain::widget_settings::columns::{ColumnSetting, Format, Style};

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

pub trait ColumnFormat {
    fn relative_width(&self) -> f32;
    fn driver_name(&self, value: &str) -> String;
}
impl ColumnFormat for ColumnSetting {
    fn relative_width(&self) -> f32 {
        match self.width_preset.as_str() {
            keys::COLUMN_WIDTH_XS => 20.0,
            keys::COLUMN_WIDTH_SM => 36.0,
            keys::COLUMN_WIDTH_MD => 60.0,
            keys::COLUMN_WIDTH_LG => 90.0,
            _ => match self.metric_id.as_str() {
                keys::COLUMN_METRIC_POSITION => 24.0,
                keys::COLUMN_METRIC_CLASS => 6.0,
                keys::COLUMN_METRIC_CAR_NUMBER => 28.0,
                keys::COLUMN_METRIC_DRIVER_NAME => 120.0,
                keys::COLUMN_METRIC_GAP => 48.0,
                _ => 62.0,
            },
        }
    }

    fn driver_name(&self, value: &str) -> String {
        vantare_domain::standings::driver_name(
            value,
            &self.format.mode,
            self.format
                .max_chars
                .unwrap_or(16)
                .min(keys::MAX_CHARS_LIMIT),
        )
    }
}
