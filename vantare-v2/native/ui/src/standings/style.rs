//! Valores de Standings: compilados en producto, editables solo en Workshop.
use crate::efficiency::text::{self, TextInk};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Style {
    pub colors: Colors,
    pub geometry: Geometry,
    pub fonts: Fonts,
    pub shadow: Shadow,
    pub opacity: Opacity,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Colors {
    pub ink: Color,
    pub muted: Color,
    pub panel: Color,
    pub loss: Color,
    pub white: Color,
    pub black: Color,
    pub flag_unknown: Color,
    pub flag_green: Color,
    pub flag_yellow: Color,
    pub flag_blue: Color,
    pub flag_red: Color,
    pub flag_black: Color,
    pub flag_checkered: Color,
    pub broadcast_accent: Color,
    pub hypercar: Color,
    pub lmp: Color,
    pub gold: Color,
    pub session: Color,
    pub class_start: Color,
    pub class_end: Color,
    pub column_label: Color,
    pub player: Color,
    pub gain: Color,
    pub player_marker: Color,
    pub position: Color,
    pub number: Color,
    pub pace_gap: Color,
    pub unit: Color,
    pub lap: Color,
    pub best_lap: Color,
    pub best_sweep: Color,
    pub best_marker: Color,
    pub footer_label: Color,
    pub footer_value: Color,
    pub pit_ink: Color,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Geometry {
    pub row_height: f32,
    pub session_header_height: f32,
    pub column_header_height: f32,
    pub footer_height: f32,
    pub brand_band_height: f32,
    pub pit_rail_width: f32,
    pub broadcast_header_height: f32,
    pub broadcast_column_height: f32,
    pub class_band_height: f32,
    pub radius: f32,
    pub chip_radius: f32,
    pub chip_cut_radius: f32,
    pub pit_radius: f32,
    pub cell_padding: f32,
    pub broadcast_name_padding: f32,
    pub position_padding: f32,
    pub footer_pair_gap: f32,
    pub footer_gap: f32,
    pub logo_size: f32,
    pub brand_logo_size: f32,
    pub player_marker_width: f32,
    pub player_marker_height: f32,
    pub pit_badge_height: f32,
    pub pit_glow_blur: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Fonts {
    pub marker_size: f32,
    pub session_label_size: f32,
    pub column_label_size: f32,
    pub badge_size: f32,
    pub footer_value_size: f32,
    pub number_size: f32,
    pub brand_size: f32,
    pub body_size: f32,
    pub clock_size: f32,
    pub plain_clock_size: f32,
    pub regular_weight: f32,
    pub medium_weight: f32,
    pub semibold_weight: f32,
    pub metric_weight: f32,
    pub bold_weight: f32,
    pub heavy_weight: f32,
    pub tracking_scale: f32,
    pub family: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Shadow {
    pub sigma: f32,
    pub spread: f32,
    pub offset_y: f32,
    pub alpha: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Opacity {
    pub panel: f32,
    pub frame: f32,
    pub top_frame: f32,
    pub player: f32,
    pub broadcast_player: f32,
    pub footer: f32,
    pub pit_glow: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Color(pub u32);

impl Serialize for Color {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&format!("#{:06x}", self.0))
    }
}

impl<'de> Deserialize<'de> for Color {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        let hex = text
            .strip_prefix('#')
            .filter(|s| s.len() == 6)
            .ok_or_else(|| serde::de::Error::custom("color: usa #rrggbb"))?;
        u32::from_str_radix(hex, 16)
            .map(Self)
            .map_err(serde::de::Error::custom)
    }
}

impl Default for Style {
    fn default() -> Self {
        include!(concat!(env!("OUT_DIR"), "/standings-style.rs"))
    }
}

impl Style {
    pub fn compiled() -> Arc<Self> {
        static STYLE: std::sync::OnceLock<Arc<Style>> = std::sync::OnceLock::new();
        STYLE.get_or_init(|| Arc::new(Self::default())).clone()
    }

    pub fn from_json(json: &str) -> Result<Arc<Self>, String> {
        // El esquema completo detecta errores de nombre; nunca aplica un estilo parcial.
        let style: Self = serde_json::from_str(json).map_err(|e| e.to_string())?;
        style.validate()?;
        Ok(Arc::new(style))
    }

    pub fn validate(&self) -> Result<(), String> {
        let value = serde_json::to_value(self).map_err(|e| e.to_string())?;
        for group in ["geometry", "fonts", "shadow", "opacity"] {
            if let Some(fields) = value[group].as_object() {
                for (name, value) in fields {
                    if name != "family" {
                        let number = value
                            .as_f64()
                            .ok_or_else(|| format!("{group}.{name}: valor no finito"))?;
                        if !number.is_finite()
                            || number.abs() > 4096.0
                            || (group != "shadow" && number < 0.0)
                            || (group == "opacity" && number > 1.0)
                            || (group == "fonts" && name.ends_with("_size") && number < 1.0)
                        {
                            return Err(format!("{group}.{name}: valor fuera de rango"));
                        }
                    }
                }
            }
        }
        if self.geometry.row_height < 1.0 || self.geometry.pit_rail_width < 1.0 {
            return Err("geometry: fila y rail deben medir al menos 1 px".into());
        }
        if self.shadow.sigma <= 0.0 || !(0.0..=1.0).contains(&self.shadow.alpha) {
            return Err("shadow: sigma > 0 y alpha entre 0 y 1".into());
        }
        if self
            .fonts
            .family
            .as_ref()
            .is_some_and(|s| s.trim().is_empty() || s.len() > 128)
        {
            return Err("fonts.family: nombre vacío o demasiado largo".into());
        }
        if self.fonts.family.is_none() {
            for weight in [
                self.fonts.regular_weight,
                self.fonts.medium_weight,
                self.fonts.semibold_weight,
                self.fonts.metric_weight,
                self.fonts.bold_weight,
                self.fonts.heavy_weight,
            ] {
                if ![400., 500., 600., 650., 700., 750., 800.].contains(&weight) {
                    return Err("fonts: peso Inter no registrado".into());
                }
            }
        }
        Ok(())
    }

    pub fn ink(&self, size: f32, weight: f32, tracking: f32, color: gpui::Hsla) -> TextInk<'_> {
        let mut ink = text::ink(size, weight, tracking * self.fonts.tracking_scale, color);
        ink.family = self.fonts.family.as_deref();
        ink
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiled_defaults_match_the_editable_file() {
        let json = include_str!("../../styles/standings.json");
        let style = Style::from_json(json).expect("estilo válido");
        assert_eq!(*style, Style::default());
        assert_eq!(style.geometry.row_height, super::super::model::ROW_HEIGHT);
        assert_eq!(
            style.geometry.session_header_height,
            super::super::model::SESSION_HEADER_HEIGHT
        );
        assert_eq!(
            style.geometry.column_header_height,
            super::super::model::COLUMN_HEADER_HEIGHT
        );
        assert_eq!(
            style.geometry.brand_band_height,
            super::super::model::BRAND_BAND_HEIGHT
        );
    }

    #[test]
    fn rejects_unknown_missing_invalid_and_unbounded_values() {
        let original = serde_json::to_value(Style::default()).expect("JSON");
        for (group, field, bad) in [
            ("colors", "ink", serde_json::json!("red")),
            ("geometry", "row_height", serde_json::json!(0)),
            ("geometry", "radius", serde_json::json!(-1)),
            ("fonts", "bold_weight", serde_json::json!(699)),
            ("fonts", "family", serde_json::json!("")),
            ("shadow", "sigma", serde_json::json!(0)),
            ("opacity", "panel", serde_json::json!(2)),
            ("geometry", "typo", serde_json::json!(12)),
        ] {
            let mut value = original.clone();
            value[group][field] = bad;
            assert!(
                Style::from_json(&value.to_string()).is_err(),
                "{group}.{field}"
            );
        }
        assert!(Style::from_json("{}").is_err());
    }
}
