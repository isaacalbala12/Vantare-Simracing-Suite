//! Contrato de columnas V3. Reutilizado por las dos tablas de esta familia.
use super::model::{Align, Column, Metric, NameMode, Preset};

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
            "position" => Metric::Position,
            "driverNumber" | "carNumber" => Metric::DriverNumber,
            "driverName" => Metric::DriverName,
            "vehicleClass" | "class" => Metric::VehicleClass,
            "gap" => Metric::Gap,
            "interval" => Metric::Interval,
            "currentLap" => Metric::CurrentLap,
            "lastLap" => Metric::LastLap,
            "bestLap" => Metric::BestLap,
            "pit" => Metric::Pit,
            _ => return None,
        };
        Some(Column {
            metric,
            preset: match self.width_preset.as_str() {
                "xs" => Preset::Xs,
                "sm" => Preset::Sm,
                "md" => Preset::Md,
                "lg" => Preset::Lg,
                _ => Preset::Auto,
            },
            align: match self.style.align.as_deref() {
                Some("left") => Some(Align::Left),
                Some("center") => Some(Align::Center),
                Some("right") => Some(Align::Right),
                _ => None,
            },
            name_mode: match self.format.mode.as_str() {
                "initial" => NameMode::Initial,
                "surname" => NameMode::Surname,
                "truncate" => NameMode::Truncate,
                _ => NameMode::Full,
            },
            max_chars: self.format.max_chars.unwrap_or(16).min(64),
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
            "xs" => 20.0,
            "sm" => 36.0,
            "md" => 60.0,
            "lg" => 90.0,
            _ => match self.metric_id.as_str() {
                "position" => 24.0,
                "class" => 6.0,
                "carNumber" => 28.0,
                "driverName" => 120.0,
                "gap" => 48.0,
                _ => 62.0,
            },
        }
    }

    fn driver_name(&self, value: &str) -> String {
        vantare_domain::standings::driver_name(
            value,
            &self.format.mode,
            self.format.max_chars.unwrap_or(16).min(64),
        )
    }
}
