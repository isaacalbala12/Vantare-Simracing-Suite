//! Estilo del sistema de diseño Vantare (#1497): colores, tipografía, estilos
//! Neo/Neutro, acentos, clases y movimiento compartidos por todos los
//! widgets, más la geometría de cada uno. Vive en `styles/vantare.json`:
//! compilado en producto y editable en vivo en Workshop.

use super::motion::Timing;
use gpui::{Hsla, Rgba};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, OnceLock};

thread_local! {
    /// Opacidad de la fila que se está pintando (fundido de entrada).
    static OPACITY: std::cell::Cell<f32> = const { std::cell::Cell::new(1.0) };
}

pub(crate) fn with_opacity<R>(value: f32, f: impl FnOnce() -> R) -> R {
    let previous = OPACITY.with(|o| o.replace(o.get() * value));
    let result = f();
    OPACITY.with(|o| o.set(previous));
    result
}

/// Color `#rrggbb` o `#rrggbbaa`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Color(pub(crate) u32, pub(crate) f32);

impl Color {
    pub(crate) fn hsla(self) -> Hsla {
        self.alpha(self.1)
    }
    /// Color con opacidad propia, multiplicada por la de la fila en curso.
    pub(crate) fn alpha(self, alpha: f32) -> Hsla {
        Rgba {
            r: ((self.0 >> 16) & 0xff) as f32 / 255.0,
            g: ((self.0 >> 8) & 0xff) as f32 / 255.0,
            b: (self.0 & 0xff) as f32 / 255.0,
            a: alpha * OPACITY.with(std::cell::Cell::get),
        }
        .into()
    }
}

impl Serialize for Color {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let alpha = (self.1 * 255.0).round() as u32;
        let text = if alpha == 255 {
            format!("#{:06x}", self.0)
        } else {
            format!("#{:06x}{alpha:02x}", self.0)
        };
        serializer.serialize_str(&text)
    }
}

impl<'de> Deserialize<'de> for Color {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        let hex = text
            .strip_prefix('#')
            .filter(|s| s.len() == 6 || s.len() == 8)
            .ok_or_else(|| serde::de::Error::custom("color: usa #rrggbb o #rrggbbaa"))?;
        let value = u32::from_str_radix(hex, 16).map_err(serde::de::Error::custom)?;
        Ok(if hex.len() == 6 {
            Self(value, 1.0)
        } else {
            Self(value >> 8, (value & 0xff) as f32 / 255.0)
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Style {
    pub geometry: Geometry,
    pub fonts: Fonts,
    pub colors: Colors,
    pub classes: Vec<ClassColors>,
    pub accents: Accents,
    pub styles: Variants,
    pub motion: MotionStyle,
    pub relative: RelativeStyle,
    pub brand: BrandStyle,
    pub fuel: FuelStyle,
}

/// Geometría y colores propios de Fuel y stint Vantare.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FuelStyle {
    pub width_compact: f32,
    pub width_standard: f32,
    pub width_expanded: f32,
    /// Etiqueta de las filas (Inter).
    pub row_label: f32,
    pub gauge_title: f32,
    pub gauge_value: f32,
    /// Valor del medidor secundario (combustible bajo la energía).
    pub gauge_value_small: f32,
    pub gauge_suffix: f32,
    pub gauge_bar: f32,
    pub gauge_height: f32,
    pub big: f32,
    pub big_secondary: f32,
    pub big_height: f32,
    pub bar: f32,
    pub tile_height: f32,
    pub tile_label: f32,
    pub tile_value: f32,
    pub tile_margin: f32,
    pub tile_radius: f32,
    pub sub_height: f32,
    pub spark_height: f32,
    pub spark_stroke: f32,
    pub spark_dot: f32,
    pub window_height: f32,
    pub window_labels: f32,
    pub low_pulse_ms: f32,
    pub low_fill: Color,
    pub low_text: Color,
    pub low_border: Color,
    pub fuel_bar: Color,
    pub track: Color,
    pub refuel: Color,
    pub average_line: Color,
    pub tile_fill: Color,
    pub tile_line: Color,
    /// Opacidad del relleno de la ventana de parada en el acento.
    pub window_fill: f32,
    pub now: Color,
}

/// Marca Vantare de la cabecera (#1504): símbolo rojo y nombre en Rajdhani.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BrandStyle {
    pub symbol: Color,
    pub symbol_height: f32,
    pub size: f32,
    pub tracking: f32,
    /// Entre el símbolo y el nombre.
    pub gap: f32,
    /// Entre la marca y el texto derecho de la cabecera.
    pub margin: f32,
}

/// Geometría y colores propios de Relative Vantare.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RelativeStyle {
    pub col_position: f32,
    pub position_size: f32,
    pub col_laps: f32,
    pub col_rating: f32,
    pub col_safety: f32,
    pub col_trend: f32,
    pub col_gap: f32,
    /// Ancho máximo del piloto según su `widthPreset` (sm, md, lg).
    pub driver_sm: f32,
    pub driver_md: f32,
    pub driver_lg: f32,
    pub strip_height: f32,
    pub strip_dot: f32,
    pub strip_me: f32,
    pub strip_label: f32,
    pub strip_gap: f32,
    /// Periodo y opacidad máxima del pulso de tráfico rápido.
    pub pulse_ms: f32,
    pub pulse_alpha: f32,
    pub laps_down_fill: Color,
    pub laps_down_text: Color,
    pub laps_up_fill: Color,
    pub laps_up_text: Color,
    pub platinum_fill: Color,
    pub platinum_text: Color,
    pub gold_fill: Color,
    pub gold_text: Color,
    pub silver_fill: Color,
    pub silver_text: Color,
    pub bronze_fill: Color,
    pub bronze_text: Color,
    pub strip_line: Color,
    pub strip_tick: Color,
    pub strip_text: Color,
}

/// Duraciones del movimiento en ms e intensidad del destello.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct MotionStyle {
    pub reorder_ms: f32,
    pub fade_ms: f32,
    pub flash_ms: f32,
    /// Intensidad del destello respecto a la fila propia (1 = igual).
    pub flash_boost: f32,
}

impl MotionStyle {
    pub(crate) fn timing(&self) -> Timing {
        let ms = |v: f32| std::time::Duration::from_secs_f32(v.max(0.0) / 1000.0);
        Timing {
            reorder: ms(self.reorder_ms),
            fade: ms(self.fade_ms),
            flash: ms(self.flash_ms),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Geometry {
    pub column_header_height: f32,
    pub row_height: f32,
    pub cell_gap: f32,
    pub footer_gap: f32,
    pub footer_height: f32,
    pub banner_height: f32,
    pub banner_gap: f32,
    pub player_bleed: f32,
    pub class_dot: f32,
    pub number_min_width: f32,
    pub number_height: f32,
    pub number_padding: f32,
    pub chip_radius: f32,
    pub compound_size: f32,
    pub compound_border: f32,
    pub pill_height: f32,
    pub pill_padding: f32,
    pub sector_width: f32,
    pub sector_height: f32,
    pub sector_gap: f32,
    pub sector_radius: f32,
    pub col_position: f32,
    pub col_gained: f32,
    pub col_pit: f32,
    pub col_lap: f32,
    pub col_gap: f32,
    pub wait_height: f32,
    pub skeleton_bar: f32,
    pub pulse: f32,
    /// Ancho del piloto según su `widthPreset` (xs, sm, md, lg).
    pub driver_xs: f32,
    pub driver_sm: f32,
    pub driver_md: f32,
    pub driver_lg: f32,
    pub separator_height: f32,
    pub separator_gap_top: f32,
    pub separator_gap_bottom: f32,
    /// Por debajo, cabecera y pie abreviados; desde `wide_width`, tiempo restante.
    pub narrow_width: f32,
    pub wide_width: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Fonts {
    pub body: f32,
    pub small: f32,
    pub header: f32,
    pub header_tracking: f32,
    pub column: f32,
    pub column_tracking: f32,
    pub position: f32,
    pub mono: f32,
    pub mono_small: f32,
    pub pill: f32,
    pub pill_tracking: f32,
    pub compound: f32,
    pub separator: f32,
    pub separator_tracking: f32,
    pub banner: f32,
    pub banner_tracking: f32,
    pub wait_title: f32,
    pub regular_weight: f32,
    pub bold_weight: f32,
    pub pill_weight: f32,
    pub display_family: String,
    pub mono_family: String,
    pub display_baseline: f32,
    pub mono_baseline: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Colors {
    pub text: Color,
    pub muted: Color,
    pub value: Color,
    pub header_em: Color,
    pub column: Color,
    pub frozen: Color,
    pub line: Color,
    pub separator_band: Color,
    pub skeleton: Color,
    pub pulse: Color,
    pub gain: Color,
    pub loss: Color,
    pub even: Color,
    pub purple: Color,
    pub green: Color,
    pub best_personal: Color,
    pub yellow: Color,
    pub sector_pending: Color,
    pub box_fill: Color,
    pub box_text: Color,
    pub stops_fill: Color,
    pub stops_text: Color,
    pub compound_soft: Color,
    pub compound_medium: Color,
    pub compound_hard: Color,
    pub compound_wet: Color,
    pub fcy_fill: Color,
    pub fcy_text: Color,
    pub yellow_fill: Color,
    pub yellow_text: Color,
    pub yellow_line: Color,
    pub final_fill: Color,
    pub final_text: Color,
    pub shadow: Color,
    /// Líder de la clase: posición, «Líder» y destello al tomar el mando.
    pub leader: Color,
    pub flash_gain: Color,
    pub flash_loss: Color,
}

/// Colores de una clase; `match` es un fragmento del nombre en minúsculas y
/// la última entrada (vacía) cubre cualquier otra clase.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ClassColors {
    #[serde(rename = "match")]
    pub matches: String,
    pub dot: Color,
    pub tint: Color,
    pub ink: Color,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Accents {
    pub red: Color,
    pub amber: Color,
    pub green: Color,
    pub white: Color,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Variants {
    pub neo: Variant,
    pub neutro: Variant,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Rasgos independientes de cada estilo del catálogo.
pub(crate) struct Variant {
    pub top: Color,
    pub bottom: Color,
    pub border: Color,
    /// Opacidad del borde en el color del acento; 0 usa `border`.
    pub border_accent: f32,
    pub radius: f32,
    pub padding_x: f32,
    pub padding_y: f32,
    pub shadow_y: f32,
    pub shadow_blur: f32,
    pub shadow_alpha: f32,
    /// Cabecera en Rajdhani en lugar de Inter.
    pub header_display: bool,
    pub header_size: f32,
    pub header_tracking: f32,
    pub header_color: Color,
    pub header_height: f32,
    pub header_gap: f32,
    /// Opacidad de la línea inferior de la cabecera en el acento; 0 sin línea.
    pub header_rule: f32,
    pub player_from: f32,
    pub player_to: f32,
    pub player_vertical: bool,
    pub player_radius: f32,
    /// Fila propia en blanco a esta opacidad en lugar del acento; 0 usa el degradado.
    pub player_white: f32,
    pub square_dots: bool,
}

impl Style {
    pub(crate) fn compiled() -> Arc<Self> {
        static STYLE: OnceLock<Arc<Style>> = OnceLock::new();
        STYLE
            .get_or_init(|| {
                // El test `compiled_style_is_valid` garantiza que el JSON compilado es válido.
                Self::from_json(include_str!("../../styles/vantare.json"))
                    .unwrap_or_else(|error| panic!("styles/vantare.json: {error}"))
            })
            .clone()
    }

    pub(crate) fn from_json(json: &str) -> Result<Arc<Self>, String> {
        let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        check_numbers(&value, "")?;
        let style: Self = serde_json::from_value(value).map_err(|e| e.to_string())?;
        if style
            .classes
            .last()
            .is_none_or(|class| !class.matches.is_empty())
        {
            return Err("classes: la última entrada debe tener \"match\": \"\"".into());
        }
        if style.geometry.row_height < 1.0 || style.geometry.driver_xs < 20.0 {
            return Err("geometry: fila y piloto demasiado pequeños".into());
        }
        Ok(Arc::new(style))
    }

    pub(crate) fn class(&self, name: &str) -> &ClassColors {
        let name = name.to_lowercase();
        self.classes
            .iter()
            .find(|class| name.contains(&class.matches))
            .unwrap_or(&self.classes[self.classes.len() - 1])
    }
}

/// Todos los números deben ser finitos, no negativos y razonables.
fn check_numbers(value: &serde_json::Value, path: &str) -> Result<(), String> {
    match value {
        serde_json::Value::Number(number) => {
            let n = number.as_f64().unwrap_or(f64::NAN);
            if !n.is_finite() || !(0.0..=4096.0).contains(&n) {
                return Err(format!("{path}: valor fuera de rango"));
            }
        }
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                check_numbers(value, &format!("{path}.{key}"))?;
            }
        }
        serde_json::Value::Array(list) => {
            for (index, value) in list.iter().enumerate() {
                check_numbers(value, &format!("{path}[{index}]"))?;
            }
        }
        _ => {}
    }
    Ok(())
}
