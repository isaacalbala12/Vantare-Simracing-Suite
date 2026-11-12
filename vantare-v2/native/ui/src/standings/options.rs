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

#[cfg(test)]
mod contract_parity_tests {
    use super::*;

    fn column() -> ColumnSetting {
        ColumnSetting {
            metric_id: "driverName".into(),
            ..Default::default()
        }
    }

    #[test]
    fn contract_choices_match_real_column_presentation() {
        // Exercise the same conversion the GPUI tables render, including the
        // implicit Auto/Full fallbacks; an invented choice is not an editor option.
        for (name, expected) in [
            ("xs", Preset::Xs),
            ("sm", Preset::Sm),
            ("md", Preset::Md),
            ("lg", Preset::Lg),
            ("auto", Preset::Auto),
        ] {
            assert!(keys::COLUMN_WIDTHS.contains(&name));
            let mut value = column();
            value.width_preset = name.into();
            assert_eq!(value.column().unwrap().preset, expected);
        }
        assert_eq!(keys::COLUMN_WIDTHS.len(), 5);
        for (name, expected) in [
            ("full", NameMode::Full),
            ("initial", NameMode::Initial),
            ("surname", NameMode::Surname),
            ("truncate", NameMode::Truncate),
        ] {
            assert!(keys::COLUMN_NAME_MODES.contains(&name));
            let mut value = column();
            value.format.mode = name.into();
            assert_eq!(value.column().unwrap().name_mode, expected);
        }
        assert_eq!(keys::COLUMN_NAME_MODES.len(), 4);
        for (name, expected) in [
            ("left", Align::Left),
            ("center", Align::Center),
            ("right", Align::Right),
        ] {
            assert!(keys::COLUMN_ALIGNS.contains(&name));
            let mut value = column();
            value.style.align = Some(name.into());
            assert_eq!(value.column().unwrap().align, Some(expected));
        }
        assert_eq!(keys::COLUMN_ALIGNS.len(), 3);
        for name in keys::LEGACY_TABLE_COLUMNS {
            let mut value = column();
            value.metric_id = (*name).into();
            assert!(value.column().is_some(), "{name}");
        }
        let mut unknown = column();
        unknown.metric_id = "unknown".into();
        assert!(unknown.column().is_none());
        assert!(!keys::LEGACY_TABLE_COLUMNS.contains(&"unknown"));
        assert!(!keys::COLUMN_WIDTHS.contains(&"unknown"));
        assert!(!keys::COLUMN_ALIGNS.contains(&"unknown"));
        assert!(!keys::COLUMN_NAME_MODES.contains(&"unknown"));
    }
}
