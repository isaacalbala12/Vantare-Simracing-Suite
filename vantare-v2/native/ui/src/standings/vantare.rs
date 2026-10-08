//! Standings en el sistema de diseño Vantare (#1497), según el catálogo r10b.
//!
//! El ViewModel es puro (`vantare_domain::standings_vantare`); aquí solo se
//! decide la geometría y se pinta con las primitivas GPUI del kit. Los valores
//! visuales viven en `styles/standings-vantare.json`: compilados en producto y
//! editables en vivo en Workshop.

use super::vantare_motion::{Flash, Motion, Sample, Timing};
use super::{Accent, Look};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{rect, text};
use gpui::{
    App, BorderStyle, BoxShadow, Corners, Edges, Hsla, Rgba, linear_color_stop, linear_gradient,
    point, px, quad,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, OnceLock};
use vantare_domain::format::{Language, PLACEHOLDER};
use vantare_domain::standings_vantare::{Banner, Board, Mark, Pit, Row};
use vantare_domain::{SourceState, TyreCompound};

// ---------------------------------------------------------------------------
// Estilo
// ---------------------------------------------------------------------------

thread_local! {
    /// Opacidad de la fila que se está pintando (fundido de entrada).
    static OPACITY: std::cell::Cell<f32> = const { std::cell::Cell::new(1.0) };
}

fn with_opacity<R>(value: f32, f: impl FnOnce() -> R) -> R {
    let previous = OPACITY.with(|o| o.replace(o.get() * value));
    let result = f();
    OPACITY.with(|o| o.set(previous));
    result
}

/// Color `#rrggbb` o `#rrggbbaa`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Color(u32, f32);

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
    fn timing(&self) -> Timing {
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
    pub carmin: Variant,
    pub limpio: Variant,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Rasgos independientes de cada estilo del catálogo.
pub(crate) struct Variant {
    pub top: Color,
    pub bottom: Color,
    pub border: Color,
    /// Opacidad del borde en el color del acento (Carmín); 0 usa `border`.
    pub border_accent: f32,
    pub radius: f32,
    pub padding_x: f32,
    pub padding_y: f32,
    pub shadow_y: f32,
    pub shadow_blur: f32,
    pub shadow_alpha: f32,
    /// Cabecera en Rajdhani (Carmín) en lugar de Inter.
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
    /// Fila propia en blanco a esta opacidad (Limpio) en lugar del acento.
    pub player_white: f32,
    pub square_dots: bool,
}

impl Style {
    pub(crate) fn compiled() -> Arc<Self> {
        static STYLE: OnceLock<Arc<Style>> = OnceLock::new();
        STYLE
            .get_or_init(|| {
                // El test `compiled_style_is_valid` garantiza que el JSON compilado es válido.
                Self::from_json(include_str!("../../styles/standings-vantare.json"))
                    .unwrap_or_else(|error| panic!("styles/standings-vantare.json: {error}"))
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

    fn class(&self, name: &str) -> &ClassColors {
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

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

/// Qué coches se muestran: `classificationMode` y `classScope` de Settings.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Mode {
    /// Estándar: la clase del jugador (o la del líder sin jugador).
    PlayerClass,
    /// Estándar con todas las clases, en orden de la general.
    AllClasses,
    /// Multiclase: todas las clases agrupadas, con su franja.
    Multiclass,
}

/// Anchura del piloto (`widthPreset` de su columna).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Preset {
    Xs,
    Sm,
    Md,
    Lg,
}

/// Columna colocable. P va siempre primera y no está aquí; el coche es un
/// complemento del piloto, no una columna propia.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Gained,
    /// Punto de clase y chip de dorsal.
    Number,
    /// Piloto (con el punto de clase si no hay columna de dorsal).
    Driver,
    Compound,
    Pit,
    Sectors,
    Last,
    Best,
    Interval,
    Gap,
}

impl Kind {
    fn from_metric(metric: &str) -> Option<Self> {
        Some(match metric {
            "positionsGained" => Self::Gained,
            "driverNumber" | "carNumber" => Self::Number,
            "driverName" => Self::Driver,
            "tireCompound" => Self::Compound,
            "pit" => Self::Pit,
            "sectors" => Self::Sectors,
            "lastLap" => Self::Last,
            "bestLap" => Self::Best,
            "interval" => Self::Interval,
            "gap" => Self::Gap,
            _ => return None,
        })
    }

    pub(crate) fn metric(self) -> &'static str {
        match self {
            Self::Gained => "positionsGained",
            Self::Number => "driverNumber",
            Self::Driver => "driverName",
            Self::Compound => "tireCompound",
            Self::Pit => "pit",
            Self::Sectors => "sectors",
            Self::Last => "lastLap",
            Self::Best => "bestLap",
            Self::Interval => "interval",
            Self::Gap => "gap",
        }
    }

    /// Los tiempos y diferencias se alinean a la derecha de su columna.
    fn right_aligned(self) -> bool {
        matches!(self, Self::Last | Self::Best | Self::Interval | Self::Gap)
    }
}

/// Columnas activas en el orden de `columns`, más los complementos.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Cols {
    pub order: Vec<Kind>,
    pub vehicle: bool,
    pub driver: Preset,
}

impl Cols {
    fn from_settings(columns: &[super::options::ColumnSetting]) -> Self {
        let mut order: Vec<Kind> = Vec::new();
        for column in columns {
            if let Some(kind) = Kind::from_metric(&column.metric_id)
                && (column.enabled || kind == Kind::Driver)
                && !order.contains(&kind)
            {
                order.push(kind);
            }
        }
        // El piloto siempre se ve; si falta, va tras el dorsal o al principio.
        if !order.contains(&Kind::Driver) {
            let at = order
                .iter()
                .position(|k| *k == Kind::Number)
                .map_or(0, |i| i + 1);
            order.insert(at, Kind::Driver);
        }
        let driver = columns.iter().find(|c| c.metric_id == "driverName");
        Self {
            order,
            vehicle: columns
                .iter()
                .any(|c| c.enabled && c.metric_id == "vehicle"),
            driver: match driver.map(|c| c.width_preset.as_str()) {
                Some("xs") => Preset::Xs,
                Some("sm") => Preset::Sm,
                Some("lg") => Preset::Lg,
                _ => Preset::Md,
            },
        }
    }

    fn has(&self, kind: Kind) -> bool {
        self.order.contains(&kind)
    }
}

/// Columnas colocadas para editarlas: `(métrica, x, ancho)`, franja vertical
/// de la cabecera a la última fila y separación entre columnas (px del widget).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ColumnBoxes {
    pub columns: Vec<(&'static str, f32, f32)>,
    pub top: f32,
    pub bottom: f32,
    pub gap: f32,
}

impl ColumnBoxes {
    /// Columna bajo el punto, contando media separación a cada lado.
    pub(crate) fn at(&self, x: f32, y: f32) -> Option<(&'static str, f32, f32)> {
        if y < self.top || y > self.bottom {
            return None;
        }
        let half = self.gap / 2.0;
        self.columns
            .iter()
            .copied()
            .find(|(_, left, width)| x >= left - half && x <= left + width + half)
    }
}

/// Una columna colocada: métrica, borde izquierdo y ancho (px del widget).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Placed {
    pub kind: Kind,
    pub x: f32,
    pub width: f32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Options {
    pub look: Look,
    pub accent: Accent,
    pub mode: Mode,
    pub cols: Cols,
    pub rows: usize,
    /// Formato del nombre de la columna de piloto (`format.mode`, `maxChars`).
    pub name_mode: String,
    pub name_max: usize,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        let columns = settings
            .columns
            .clone()
            .unwrap_or_else(|| super::vantare_template("standard"));
        let driver = columns.iter().find(|c| c.metric_id == "driverName");
        Self {
            look: settings.style,
            accent: settings.accent,
            mode: if settings.classification_mode == "multiclass" {
                Mode::Multiclass
            } else if settings.class_scope == "all-classes" {
                Mode::AllClasses
            } else {
                Mode::PlayerClass
            },
            cols: Cols::from_settings(&columns),
            rows: settings.row_count.clamp(1, 30),
            name_mode: driver.map(|c| c.format.mode.clone()).unwrap_or_default(),
            name_max: driver
                .and_then(|c| c.format.max_chars)
                .unwrap_or(16)
                .min(64),
        }
    }

    fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.look {
            Look::Neo => &style.styles.neo,
            Look::Carmin => &style.styles.carmin,
            Look::Limpio => &style.styles.limpio,
        }
    }

    fn accent(&self, style: &Style) -> Color {
        match self.accent {
            Accent::Red => style.accents.red,
            Accent::Amber => style.accents.amber,
            Accent::Green => style.accents.green,
            Accent::White => style.accents.white,
        }
    }

    /// Ancho máximo del piloto según su preset.
    fn driver_max(&self, style: &Style) -> f32 {
        let g = &style.geometry;
        match self.cols.driver {
            Preset::Xs => g.driver_xs,
            Preset::Sm => g.driver_sm,
            Preset::Md => g.driver_md,
            Preset::Lg => g.driver_lg,
        }
    }

    /// Columnas colocadas de izquierda a derecha y ancho total del panel.
    fn layout(&self, style: &Style, driver: f32) -> (Vec<Placed>, f32) {
        let g = &style.geometry;
        let gap = g.cell_gap;
        let pad = self.variant(style).padding_x;
        let dot = g.class_dot + gap;
        let number = self.cols.has(Kind::Number);
        let mut x = pad + g.col_position;
        let mut placed = Vec::with_capacity(self.cols.order.len());
        for &kind in &self.cols.order {
            let width = match kind {
                Kind::Gained => g.col_gained,
                Kind::Number => dot + g.number_min_width,
                Kind::Driver => driver + if number { 0.0 } else { dot },
                Kind::Compound => g.compound_size,
                Kind::Pit => g.col_pit,
                Kind::Sectors => 3.0 * g.sector_width + 2.0 * g.sector_gap,
                Kind::Last | Kind::Best => g.col_lap,
                Kind::Interval | Kind::Gap => g.col_gap,
            };
            x += gap;
            placed.push(Placed { kind, x, width });
            x += width;
        }
        (placed, x + pad)
    }

    #[cfg(test)]
    fn width(&self, style: &Style) -> f32 {
        self.layout(style, self.driver_max(style)).1
    }
}

/// Ancho aproximado de un texto Inter (em por carácter): el layout es puro y
/// no mide con la ventana; `text::fit` recorta al pintar si se queda corto.
fn estimate(text: &str, size: f32) -> f32 {
    text.chars()
        .map(|c| match c {
            ' ' => 0.28,
            '.' | ',' | '·' | '\'' | 'i' | 'l' | 'I' | 'j' | '|' => 0.3,
            'f' | 't' | 'r' => 0.4,
            'm' | 'w' | 'M' | 'W' => 0.86,
            c if c.is_ascii_digit() => 0.62,
            c if c.is_uppercase() => 0.7,
            _ => 0.57,
        })
        .sum::<f32>()
        * size
}

/// Complemento del coche junto al piloto: completo con el piloto ancho; si no,
/// la marca.
fn vehicle_detail(row: &Row, cols: &Cols) -> String {
    match (cols.vehicle, cols.driver) {
        (false, _) => String::new(),
        _ if row.vehicle.is_empty() => String::new(),
        (true, Preset::Lg) => format!(" · {}", row.vehicle),
        (true, _) => row
            .vehicle
            .split_whitespace()
            .next()
            .map_or_else(String::new, |short| format!(" · {short}")),
    }
}

fn driver_text(row: &Row, options: &Options) -> String {
    if row.driver.is_empty() {
        PLACEHOLDER.to_owned()
    } else {
        vantare_domain::standings::driver_name(&row.driver, &options.name_mode, options.name_max)
    }
}

/// Piloto ajustado al nombre más largo de toda la sesión (estable aunque
/// cambien las filas visibles), sin pasar del preset.
fn driver_width(board: Option<&Board>, options: &Options, style: &Style) -> f32 {
    let max = options.driver_max(style);
    let widest = board
        .into_iter()
        .flat_map(|b| b.groups.iter().flat_map(|g| &g.rows))
        .map(|row| {
            estimate(&driver_text(row, options), style.fonts.body)
                + estimate(&vehicle_detail(row, &options.cols), style.fonts.small)
        })
        .fold(0.0_f32, f32::max);
    if widest <= 0.0 {
        return max;
    }
    (widest + 8.0).clamp(style.geometry.driver_xs, max)
}

// ---------------------------------------------------------------------------
// Layout (puro: no mide texto)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Item {
    Banner,
    Header,
    Columns,
    Separator(usize),
    Row(usize, usize),
    Wait,
    Skeleton(usize),
    Footer(Footer),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Footer {
    Spectator,
    Pits,
    Session,
}

#[derive(Clone, Debug, PartialEq)]
struct Plan {
    width: f32,
    height: f32,
    items: Vec<(f32, Item)>,
    columns: Vec<Placed>,
}

fn waiting(board: Option<&Board>) -> bool {
    board.is_none_or(|b| matches!(b.source_state, SourceState::Waiting | SourceState::Lost))
}

/// Líder de su clase (la proyección rotula su gap como «Líder»).
fn is_leader(row: &Row) -> bool {
    matches!(row.gap.as_str(), "Líder" | "Leader")
}

/// Clase mostrada: la del jugador o, sin jugador, la primera (la del líder).
fn shown_group(board: &Board) -> Option<usize> {
    board
        .groups
        .iter()
        .position(|group| group.rows.iter().any(|row| row.is_player))
        .or_else(|| (!board.groups.is_empty()).then_some(0))
}

/// Filas visibles `(grupo, fila)` según el modo, como mucho `rows`. Si el
/// jugador queda fuera del límite, las tres últimas son su entorno.
fn rows(board: &Board, options: &Options) -> Vec<(usize, usize)> {
    let mut ordered: Vec<(usize, usize)> = match options.mode {
        Mode::PlayerClass => shown_group(board)
            .map(|g| (0..board.groups[g].rows.len()).map(|r| (g, r)).collect())
            .unwrap_or_default(),
        Mode::AllClasses | Mode::Multiclass => board
            .groups
            .iter()
            .enumerate()
            .flat_map(|(g, group)| (0..group.rows.len()).map(move |r| (g, r)))
            .collect(),
    };
    if options.mode == Mode::AllClasses {
        ordered.sort_by_key(|&(g, r)| {
            board.groups[g].rows[r]
                .position
                .parse::<u32>()
                .unwrap_or(u32::MAX)
        });
    }
    let limit = options.rows.max(1);
    let player = ordered
        .iter()
        .position(|&(g, r)| board.groups[g].rows[r].is_player);
    match player {
        Some(index) if index >= limit && limit > 3 => {
            let start = (index - 1).min(ordered.len().saturating_sub(3));
            let mut shown: Vec<_> = ordered[..limit - 3].to_vec();
            shown.extend_from_slice(&ordered[start..(start + 3).min(ordered.len())]);
            shown
        }
        _ => ordered.into_iter().take(limit).collect(),
    }
}

fn plan(board: Option<&Board>, options: &Options, style: &Style) -> Plan {
    let variant = options.variant(style);
    let g = &style.geometry;
    let shown = board.filter(|b| !waiting(Some(b)));
    let (columns, width) = options.layout(style, driver_width(shown, options, style));
    let mut items = Vec::new();
    let mut y = variant.padding_y;
    if board.is_some_and(|b| b.banner.is_some()) {
        items.push((0.0, Item::Banner));
        y = g.banner_height + g.banner_gap;
    }
    items.push((y, Item::Header));
    y += variant.header_height + variant.header_gap;
    match board.filter(|b| !waiting(Some(b))) {
        None => {
            items.push((y, Item::Wait));
            y += g.wait_height;
            let count = if width < g.narrow_width { 4 } else { 5 };
            for index in 0..count {
                items.push((y, Item::Skeleton(index)));
                y += g.row_height;
            }
        }
        Some(board) => {
            items.push((y, Item::Columns));
            y += g.column_header_height;
            let mut group = None;
            for (gi, ri) in rows(board, options) {
                if options.mode == Mode::Multiclass && group != Some(gi) {
                    group = Some(gi);
                    y += g.separator_gap_top;
                    items.push((y, Item::Separator(gi)));
                    y += g.separator_height + g.separator_gap_bottom;
                }
                items.push((y, Item::Row(gi, ri)));
                y += g.row_height;
            }
            let mut footers = Vec::new();
            if !board.player_present {
                footers.push(Footer::Spectator);
            } else if board.player_in_pits {
                footers.push(Footer::Pits);
            }
            footers.push(Footer::Session);
            for footer in footers {
                y += g.footer_gap;
                items.push((y, Item::Footer(footer)));
                y += 1.0 + g.footer_gap + g.footer_height;
            }
        }
    }
    Plan {
        width,
        height: y + variant.padding_y,
        items,
        columns,
    }
}

// ---------------------------------------------------------------------------
// Estado del widget
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub(crate) struct State {
    pub options: Options,
    pub style: Arc<Style>,
    pub board: Option<Board>,
    plan: Plan,
    motion: Motion,
}

impl State {
    pub(crate) fn new(options: Options) -> Self {
        let style = Style::compiled();
        let plan = plan(None, &options, &style);
        Self {
            options,
            style,
            board: None,
            plan,
            motion: Motion::default(),
        }
    }

    /// Filas visibles con su posición vertical para el movimiento.
    fn samples(&self) -> Vec<Sample> {
        let Some(board) = &self.board else {
            return Vec::new();
        };
        self.plan
            .items
            .iter()
            .filter_map(|&(y, item)| {
                let Item::Row(g, r) = item else { return None };
                let row = &board.groups[g].rows[r];
                Some(Sample {
                    id: row.id,
                    y,
                    position: row.position.parse().unwrap_or(u32::MAX),
                    fastest: row.best_mark == Mark::Fastest,
                    in_pits: row.pit == Pit::InPits,
                    leader: is_leader(row),
                })
            })
            .collect()
    }

    pub(crate) fn settle(&mut self) {
        self.motion.settle();
    }

    /// Columnas colocadas en px del widget, para editar su orden arrastrando
    /// sobre la vista previa. `None` sin filas que mostrar.
    pub(crate) fn columns(&self) -> Option<ColumnBoxes> {
        let top = self.plan.items.iter().find_map(|(y, item)| match item {
            Item::Columns => Some(*y),
            _ => None,
        })?;
        let bottom = self
            .plan
            .items
            .iter()
            .filter(|(_, item)| matches!(item, Item::Row(..)))
            .map(|(y, _)| y + self.style.geometry.row_height)
            .reduce(f32::max)
            .unwrap_or(top + self.style.geometry.column_header_height);
        Some(ColumnBoxes {
            columns: self
                .plan
                .columns
                .iter()
                .map(|c| (c.kind.metric(), c.x, c.width))
                .collect(),
            top,
            bottom,
            gap: self.style.geometry.cell_gap,
        })
    }

    pub(crate) fn wake(&self, now: std::time::Instant) -> crate::app::Wake {
        self.motion.wake(self.style.motion.timing(), now)
    }

    /// Devuelve si cambió lo que se dibuja.
    pub(crate) fn ingest(&mut self, board: Board) -> bool {
        if self.board.as_ref() == Some(&board) {
            return false;
        }
        self.board = Some(board);
        self.plan = plan(self.board.as_ref(), &self.options, &self.style);
        let samples = self.samples();
        self.motion.update(
            &samples,
            self.style.motion.timing(),
            std::time::Instant::now(),
        );
        true
    }

    pub(crate) fn set_style(&mut self, style: Arc<Style>) {
        self.style = style;
        self.plan = plan(self.board.as_ref(), &self.options, &self.style);
        let samples = self.samples();
        self.motion.snap(&samples);
    }

    /// Tamaño del panel. La sombra se pinta por fuera, como en el catálogo:
    /// la posición del layout es la esquina visible del widget.
    pub(crate) fn size(&self) -> (f32, f32) {
        (self.plan.width, self.plan.height)
    }

    pub(crate) fn paint(&self, language: Language, window: &mut Window, cx: &mut App) {
        Painter {
            style: &self.style,
            variant: self.options.variant(&self.style),
            accent: self.options.accent(&self.style),
            options: &self.options,
            board: self.board.as_ref(),
            plan: &self.plan,
            language,
            motion: &self.motion,
            now: std::time::Instant::now(),
        }
        .paint(window, cx);
    }
}

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

/// Blanco de la fila propia en Limpio.
const WHITE: Color = Color(0xffffff, 1.0);

/// Píldora de boxes: igual en español e inglés, como el catálogo.
const BOX: &str = "BOX";

struct Painter<'a> {
    style: &'a Style,
    variant: &'a Variant,
    accent: Color,
    options: &'a Options,
    board: Option<&'a Board>,
    plan: &'a Plan,
    language: Language,
    motion: &'a Motion,
    now: std::time::Instant,
}

#[derive(Clone, Copy)]
enum Face {
    Body,
    Display,
    Mono,
}

fn transparent() -> Hsla {
    gpui::transparent_black()
}

fn round_rect(window: &mut Window, x: f32, y: f32, w: f32, h: f32, radius: f32, color: Hsla) {
    if w > 0.0 && h > 0.0 {
        window.paint_quad(quad(
            rect(x, y, w, h),
            Corners::all(px(radius)),
            color,
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
    }
}

impl Painter<'_> {
    fn es(&self) -> bool {
        self.language == Language::Es
    }

    fn ink(&self, face: Face, size: f32, tracking: f32, color: Hsla) -> text::TextInk<'_> {
        let f = &self.style.fonts;
        let (family, weight) = match face {
            Face::Body => (None, f.regular_weight),
            Face::Display => (Some(f.display_family.as_str()), 600.0),
            Face::Mono => (Some(f.mono_family.as_str()), 400.0),
        };
        text::TextInk {
            family,
            size,
            weight,
            tracking,
            color,
        }
    }

    fn baseline(&self, face: Face, top: f32, height: f32, size: f32) -> f32 {
        let offset = match face {
            Face::Body => 0.0,
            Face::Display => self.style.fonts.display_baseline,
            Face::Mono => self.style.fonts.mono_baseline,
        };
        text::baseline(top, height, size) + offset
    }

    /// Texto alineado a la izquierda (`right = None`) o al borde derecho dado.
    #[allow(clippy::too_many_arguments)] // Celda de texto: posición, caja, cara e ink.
    fn label(
        &self,
        window: &mut Window,
        cx: &mut App,
        value: &str,
        x: f32,
        right: Option<f32>,
        top: f32,
        height: f32,
        face: Face,
        ink: &text::TextInk<'_>,
    ) -> f32 {
        let width = text::width(window, value, ink);
        let left = right.map_or(x, |r| r - width);
        let base = self.baseline(face, top, height, ink.size);
        text::draw(window, cx, value, left, base, ink);
        width
    }

    fn paint(&self, window: &mut Window, cx: &mut App) {
        let (w, h) = (self.plan.width, self.plan.height);
        let v = self.variant;
        let corners = Corners::all(px(v.radius));
        if v.shadow_alpha > 0.0 {
            window.paint_drop_shadows(
                rect(0.0, 0.0, w, h),
                corners,
                &[BoxShadow {
                    color: self.style.colors.shadow.alpha(v.shadow_alpha),
                    offset: point(px(0.0), px(v.shadow_y)),
                    blur_radius: px(v.shadow_blur),
                    spread_radius: px(0.0),
                    inset: false,
                }],
            );
        }
        let border = if v.border_accent > 0.0 {
            self.accent.alpha(v.border_accent)
        } else {
            v.border.hsla()
        };
        window.paint_quad(quad(
            rect(0.0, 0.0, w, h),
            corners,
            linear_gradient(
                180.0,
                linear_color_stop(v.top.hsla(), 0.0),
                linear_color_stop(v.bottom.hsla(), 1.0),
            ),
            Edges::all(px(if border.a > 0.0 { 1.0 } else { 0.0 })),
            border,
            BorderStyle::default(),
        ));
        for &(y, item) in &self.plan.items {
            match item {
                Item::Banner => self.banner(window, cx),
                Item::Header => self.header(window, cx, y),
                Item::Columns => self.columns(window, cx, y),
                Item::Separator(group) => self.separator(window, cx, y, group),
                Item::Row(group, row) => self.animated_row(window, cx, y, group, row),
                Item::Wait => self.wait(window, cx, y),
                Item::Skeleton(index) => self.skeleton(window, y, index),
                Item::Footer(footer) => self.footer(window, cx, y, footer),
            }
        }
    }

    fn banner(&self, window: &mut Window, cx: &mut App) {
        let Some(board) = self.board else { return };
        let Some(banner) = &board.banner else { return };
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let g = &self.style.geometry;
        let (w, h) = (self.plan.width, g.banner_height);
        let (fill_color, ink_color, title) = match banner {
            Banner::FullCourseYellow => (c.fcy_fill, c.fcy_text, "FCY".to_owned()),
            Banner::LocalYellow(sector) => (
                c.yellow_fill,
                c.yellow_text,
                if self.es() {
                    format!("Amarilla · Sector {sector}")
                } else {
                    format!("Yellow · Sector {sector}")
                },
            ),
            Banner::FinalLap => (
                c.final_fill,
                c.final_text,
                if self.es() {
                    "Última vuelta"
                } else {
                    "Final lap"
                }
                .to_owned(),
            ),
        };
        let radius = (self.variant.radius - 1.0).max(0.0);
        window.paint_quad(quad(
            rect(0.0, 0.0, w, h),
            Corners {
                top_left: px(radius),
                top_right: px(radius),
                bottom_right: px(0.0),
                bottom_left: px(0.0),
            },
            fill_color.hsla(),
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
        if matches!(banner, Banner::LocalYellow(_)) {
            round_rect(window, 0.0, h - 1.0, w, 1.0, 0.0, c.yellow_line.hsla());
        }
        let pad = self.variant.padding_x;
        let mut x = pad;
        if matches!(banner, Banner::FinalLap) {
            // Bandera a cuadros: 8 celdas de 4 px, damero de 4 × 2.
            let top = (h - 8.0) / 2.0;
            for (col, row) in [(0, 0), (2, 0), (1, 1), (3, 1)] {
                round_rect(
                    window,
                    x + col as f32 * 4.0,
                    top + row as f32 * 4.0,
                    4.0,
                    4.0,
                    0.0,
                    c.final_text.hsla(),
                );
            }
            x += 16.0 + 8.0;
            let ink = self.ink(Face::Mono, f.mono_small, 0.0, ink_color.hsla());
            self.label(
                window,
                cx,
                &board.lap,
                0.0,
                Some(w - pad),
                0.0,
                h,
                Face::Mono,
                &ink,
            );
        }
        let ink = self.ink(Face::Display, f.banner, f.banner_tracking, ink_color.hsla());
        self.label(
            window,
            cx,
            &title.to_uppercase(),
            x,
            None,
            0.0,
            h,
            Face::Display,
            &ink,
        );
    }

    fn header(&self, window: &mut Window, cx: &mut App, y: f32) {
        let v = self.variant;
        let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
        let (pad, w) = (v.padding_x, self.plan.width);
        let face = if v.header_display {
            Face::Display
        } else {
            Face::Body
        };
        let ink = self.ink(
            face,
            v.header_size,
            v.header_tracking,
            v.header_color.hsla(),
        );
        let em_color = if v.header_display {
            self.accent.hsla()
        } else {
            self.style.colors.header_em.hsla()
        };
        let em = self.ink(face, v.header_size, v.header_tracking, em_color);
        let board = self.board.filter(|b| !waiting(Some(b)));
        // Sin sesión se rotula el widget, no un guion suelto.
        let session = board.map_or_else(
            || {
                if self.es() {
                    "Clasificación"
                } else {
                    "Standings"
                }
                .to_owned()
            },
            |b| b.session.clone(),
        );
        let lap = board.map_or("", |b| b.lap.as_str());
        let mut x = pad;
        if lap.is_empty() {
            self.label(
                window,
                cx,
                &session.to_uppercase(),
                x,
                None,
                y,
                h,
                face,
                &ink,
            );
        } else if self.narrow() {
            let text = format!("{session} · {} {lap}", if self.es() { "V" } else { "L" });
            self.label(window, cx, &text.to_uppercase(), x, None, y, h, face, &ink);
        } else {
            let lead = format!("{session} · {} ", if self.es() { "Vuelta" } else { "Lap" });
            x += self.label(window, cx, &lead.to_uppercase(), x, None, y, h, face, &ink);
            self.label(window, cx, lap, x, None, y, h, face, &em);
        }
        if let Some(board) = board {
            let classes: Vec<&str> = match self.options.mode {
                Mode::PlayerClass => shown_group(board)
                    .map(|g| board.groups[g].short.as_str())
                    .into_iter()
                    .collect(),
                Mode::AllClasses | Mode::Multiclass => {
                    board.groups.iter().map(|g| g.short.as_str()).collect()
                }
            };
            let mut parts: Vec<String> = Vec::new();
            if self.plan.width >= self.style.geometry.wide_width && board.remaining != PLACEHOLDER {
                parts.push(format!(
                    "{} {}",
                    board.remaining,
                    if self.es() { "restante" } else { "left" }
                ));
            }
            parts.extend(
                classes
                    .iter()
                    .filter(|s| !s.is_empty())
                    .map(|s| (*s).to_owned()),
            );
            let right = parts.join(" · ").to_uppercase();
            self.label(window, cx, &right, 0.0, Some(w - pad), y, h, face, &ink);
        }
        if v.header_rule > 0.0 {
            round_rect(
                window,
                pad,
                y + v.header_height - 1.0,
                w - 2.0 * pad,
                1.0,
                0.0,
                self.accent.alpha(v.header_rule),
            );
        }
    }

    /// Cabecera de columnas, en el mismo orden y sitio que las filas.
    fn columns(&self, window: &mut Window, cx: &mut App, y: f32) {
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let h = g.column_header_height;
        let ink = self.ink(
            Face::Body,
            f.column,
            f.column_tracking,
            self.style.colors.column.hsla(),
        );
        let es = self.es();
        let pad = self.variant.padding_x;
        let put = |window: &mut Window, cx: &mut App, value: &str, x: f32, right: Option<f32>| {
            self.label(
                window,
                cx,
                &value.to_uppercase(),
                x,
                right,
                y,
                h,
                Face::Body,
                &ink,
            );
        };
        put(window, cx, "P", 0.0, Some(pad + g.col_position));
        let number = self.options.cols.has(Kind::Number);
        for column in &self.plan.columns {
            let label = match (column.kind, es) {
                (Kind::Gained, _) => "±",
                (Kind::Number, true) => "Dorsal",
                (Kind::Number, false) => "No.",
                (Kind::Driver, true) if self.options.cols.vehicle => "Piloto · coche",
                (Kind::Driver, false) if self.options.cols.vehicle => "Driver · car",
                (Kind::Driver, true) => "Piloto",
                (Kind::Driver, false) => "Driver",
                (Kind::Compound, _) => "N",
                (Kind::Pit, true) => "Par.",
                (Kind::Pit, false) => "Stops",
                (Kind::Sectors, _) => "Sect.",
                (Kind::Last, true) => "Última",
                (Kind::Last, false) => "Last",
                (Kind::Best, true) => "Mejor",
                (Kind::Best, false) => "Best",
                (Kind::Interval, _) => "Int.",
                (Kind::Gap, _) => "Gap",
            };
            let x = if column.kind == Kind::Driver && !number {
                column.x + g.class_dot + g.cell_gap
            } else {
                column.x
            };
            if column.kind.right_aligned() {
                put(window, cx, label, 0.0, Some(column.x + column.width));
            } else {
                put(window, cx, label, x, None);
            }
        }
    }

    /// Por debajo de `narrow_width`, cabecera y pie abreviados.
    fn narrow(&self) -> bool {
        self.plan.width < self.style.geometry.narrow_width
    }

    fn class_dot(&self, window: &mut Window, x: f32, y: f32, class: &ClassColors) {
        let g = &self.style.geometry;
        let dot = g.class_dot;
        round_rect(
            window,
            x,
            y + (g.row_height - dot) / 2.0,
            dot,
            dot,
            if self.variant.square_dots {
                1.0
            } else {
                dot / 2.0
            },
            class.dot.hsla(),
        );
    }

    fn separator(&self, window: &mut Window, cx: &mut App, y: f32, group: usize) {
        let Some(board) = self.board else { return };
        let Some(group) = board.groups.get(group) else {
            return;
        };
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let (pad, w, h) = (self.variant.padding_x, self.plan.width, g.separator_height);
        round_rect(window, 0.0, y, w, h, 0.0, c.separator_band.hsla());
        let class = self.style.class(&group.class);
        let name = if group.class.is_empty() {
            PLACEHOLDER.to_owned()
        } else {
            group.class.to_uppercase()
        };
        let ink = self.ink(
            Face::Display,
            f.separator,
            f.separator_tracking,
            class.ink.hsla(),
        );
        self.label(window, cx, &name, pad, None, y, h, Face::Display, &ink);
        let detail = format!(
            "{} {} · {} {}",
            group.cars,
            match (self.es(), group.cars) {
                (true, 1) => "coche",
                (true, _) => "coches",
                (false, 1) => "car",
                (false, _) => "cars",
            },
            if self.es() { "mejor" } else { "best" },
            group.best_lap
        );
        let ink = self.ink(Face::Mono, f.mono_small, 0.0, c.muted.hsla());
        self.label(
            window,
            cx,
            &detail,
            0.0,
            Some(w - pad),
            y,
            h,
            Face::Mono,
            &ink,
        );
    }

    /// Fila con su movimiento: desplazamiento, fundido de entrada y destello.
    fn animated_row(&self, window: &mut Window, cx: &mut App, y: f32, gi: usize, ri: usize) {
        let Some(row) = self.board.and_then(|b| b.groups.get(gi)?.rows.get(ri)) else {
            return;
        };
        let pose = self
            .motion
            .pose(row.id, self.style.motion.timing(), self.now);
        let y = y + pose.offset;
        with_opacity(pose.alpha, || self.row(window, cx, y, gi, ri, pose.flash));
    }

    /// Fondo de fila con el perfil de la fila propia (degradado o plano).
    fn highlight(&self, window: &mut Window, y: f32, color: Color, scale: f32) {
        if scale <= 0.0 {
            return;
        }
        let v = self.variant;
        let g = &self.style.geometry;
        let x0 = v.padding_x - g.player_bleed;
        let background = if v.player_white > 0.0 {
            // Limpio: plano; el blanco propio y los destellos con la misma opacidad base.
            let base = if color == WHITE { v.player_white } else { 0.3 };
            color.alpha(base * scale).into()
        } else {
            linear_gradient(
                if v.player_vertical { 180.0 } else { 90.0 },
                linear_color_stop(color.alpha(v.player_from * scale), 0.0),
                linear_color_stop(color.alpha(v.player_to * scale), 1.0),
            )
        };
        window.paint_quad(quad(
            rect(x0, y, self.plan.width - 2.0 * x0, g.row_height),
            Corners::all(px(v.player_radius)),
            background,
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
    }

    fn row(
        &self,
        window: &mut Window,
        cx: &mut App,
        y: f32,
        gi: usize,
        ri: usize,
        flash: Option<(Flash, f32)>,
    ) {
        let Some(board) = self.board else { return };
        let Some(group) = board.groups.get(gi) else {
            return;
        };
        let Some(row) = group.rows.get(ri) else {
            return;
        };
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let v = self.variant;
        let h = g.row_height;
        let me = row.is_player && board.player_present;
        // El destello sustituye a la fila propia y se funde de vuelta en ella.
        let strength = flash.map_or(0.0, |(_, s)| s);
        // Fondo fijo: el líder en amarillo (también si es el jugador); la fila
        // propia en el acento.
        let leader = is_leader(row);
        let base = if leader {
            Some(c.leader)
        } else if me {
            Some(if v.player_white > 0.0 {
                WHITE
            } else {
                self.accent
            })
        } else {
            None
        };
        if let Some(color) = base {
            self.highlight(window, y, color, 1.0 - strength);
        }
        if let Some((kind, strength)) = flash {
            let color = match kind {
                Flash::Gain => c.flash_gain,
                Flash::Loss => c.flash_loss,
                Flash::Lead => c.leader,
                Flash::Best => c.purple,
                Flash::Pit => c.box_fill,
            };
            self.highlight(window, y, color, strength * self.style.motion.flash_boost);
        }
        let class = self.style.class(&group.class);
        // Posición: el líder en amarillo.
        let position_color = if leader { c.leader } else { c.muted };
        let ink = self.ink(Face::Display, f.position, 0.0, position_color.hsla());
        self.label(
            window,
            cx,
            &row.position,
            0.0,
            Some(v.padding_x + g.col_position),
            y,
            h,
            Face::Display,
            &ink,
        );
        let frozen =
            matches!(board.banner, Some(Banner::FullCourseYellow)) || (me && board.player_in_pits);
        let has_pit = self.options.cols.has(Kind::Pit);
        let number = self.options.cols.has(Kind::Number);
        for column in &self.plan.columns {
            let (x, right) = (column.x, column.x + column.width);
            match column.kind {
                Kind::Gained => self.gained(window, cx, row, x, y),
                Kind::Number => {
                    self.class_dot(window, x, y, class);
                    self.number(window, cx, row, class, x + g.class_dot + g.cell_gap, y);
                }
                Kind::Driver => {
                    let mut start = x;
                    if !number {
                        self.class_dot(window, x, y, class);
                        start += g.class_dot + g.cell_gap;
                    }
                    let mut name_right = right;
                    // Sin columna de paradas, la píldora BOX va junto al nombre.
                    if !has_pit && row.pit == Pit::InPits {
                        let width = self.pill_width(window, BOX);
                        self.pit(window, cx, row, name_right - width, y, false);
                        name_right -= width + g.cell_gap;
                    }
                    self.name(window, cx, row, start, name_right, y);
                }
                Kind::Compound => self.compound(window, cx, row, x, y),
                Kind::Pit => self.pit(window, cx, row, x, y, true),
                Kind::Sectors => self.sectors(window, cx, row, x, y),
                Kind::Last | Kind::Best => {
                    let (text, color) = if column.kind == Kind::Last {
                        (&row.last_lap, c.value)
                    } else {
                        (
                            &row.best_lap,
                            match row.best_mark {
                                Mark::Fastest => c.purple,
                                Mark::Personal => c.best_personal,
                                _ => c.value,
                            },
                        )
                    };
                    let ink = self.ink(Face::Mono, f.mono, 0.0, color.hsla());
                    self.label(window, cx, text, 0.0, Some(right), y, h, Face::Mono, &ink);
                }
                Kind::Interval | Kind::Gap => {
                    let is_gap = column.kind == Kind::Gap;
                    let color = if frozen {
                        c.frozen
                    } else if leader && is_gap {
                        c.leader
                    } else if me {
                        c.text
                    } else {
                        c.value
                    };
                    let text = if is_gap { &row.gap } else { &row.interval };
                    let ink = self.ink(Face::Mono, f.mono, 0.0, color.hsla());
                    self.label(window, cx, text, 0.0, Some(right), y, h, Face::Mono, &ink);
                }
            }
        }
    }

    fn gained(&self, window: &mut Window, cx: &mut App, row: &Row, x: f32, y: f32) {
        let c = &self.style.colors;
        let (value, color) = match row.gained {
            Some(n) if n > 0 => (format!("▲{n}"), c.gain),
            Some(n) if n < 0 => (format!("▼{}", -n), c.loss),
            Some(_) => ("–".to_owned(), c.even),
            None => (PLACEHOLDER.to_owned(), c.even),
        };
        let ink = self.ink(Face::Mono, self.style.fonts.mono_small, 0.0, color.hsla());
        self.label(
            window,
            cx,
            &value,
            x,
            None,
            y,
            self.style.geometry.row_height,
            Face::Mono,
            &ink,
        );
    }

    fn number_text(row: &Row) -> String {
        if row.number.is_empty() {
            PLACEHOLDER.to_owned()
        } else {
            format!("#{}", row.number)
        }
    }

    fn number_width(&self, window: &Window, row: &Row) -> f32 {
        let g = &self.style.geometry;
        let ink = self.ink(Face::Mono, self.style.fonts.mono_small, 0.0, transparent());
        (text::width(window, &Self::number_text(row), &ink) + 2.0 * g.number_padding)
            .max(g.number_min_width)
    }

    fn number(
        &self,
        window: &mut Window,
        cx: &mut App,
        row: &Row,
        class: &ClassColors,
        x: f32,
        y: f32,
    ) {
        let g = &self.style.geometry;
        let width = self.number_width(window, row);
        let top = y + (g.row_height - g.number_height) / 2.0;
        round_rect(
            window,
            x,
            top,
            width,
            g.number_height,
            g.chip_radius,
            class.tint.hsla(),
        );
        let ink = self.ink(
            Face::Mono,
            self.style.fonts.mono_small,
            0.0,
            class.ink.hsla(),
        );
        let label = Self::number_text(row);
        let text_width = text::width(window, &label, &ink);
        self.label(
            window,
            cx,
            &label,
            x + (width - text_width) / 2.0,
            None,
            top,
            g.number_height,
            Face::Mono,
            &ink,
        );
    }

    fn name(&self, window: &mut Window, cx: &mut App, row: &Row, x: f32, right: f32, y: f32) {
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let h = self.style.geometry.row_height;
        let available = (right - x).max(0.0);
        let driver_ink = self.ink(Face::Body, f.body, 0.0, c.text.hsla());
        let driver = driver_text(row, self.options);
        let driver = text::fit(window, &driver, &driver_ink, available);
        let used = self.label(window, cx, &driver, x, None, y, h, Face::Body, &driver_ink);
        let detail = vehicle_detail(row, &self.options.cols);
        if detail.is_empty() {
            return;
        }
        let small = self.ink(Face::Body, f.small, 0.0, c.muted.hsla());
        let rest = available - used;
        if rest > 12.0 {
            let detail = text::fit(window, &detail, &small, rest);
            self.label(
                window,
                cx,
                &detail,
                x + used,
                None,
                y,
                h,
                Face::Body,
                &small,
            );
        }
    }

    fn compound(&self, window: &mut Window, cx: &mut App, row: &Row, x: f32, y: f32) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let size = g.compound_size;
        let top = y + (g.row_height - size) / 2.0;
        let Some(compound) = row.compound else {
            let ink = self.ink(Face::Body, f.small, 0.0, c.even.hsla());
            self.label(
                window,
                cx,
                PLACEHOLDER,
                x,
                None,
                y,
                g.row_height,
                Face::Body,
                &ink,
            );
            return;
        };
        let (color, letter) = match (compound, self.es()) {
            (TyreCompound::Soft, true) => (c.compound_soft, "B"),
            (TyreCompound::Soft, false) => (c.compound_soft, "S"),
            (TyreCompound::Medium, _) => (c.compound_medium, "M"),
            (TyreCompound::Hard, true) => (c.compound_hard, "D"),
            (TyreCompound::Hard, false) => (c.compound_hard, "H"),
            (TyreCompound::Wet, true) => (c.compound_wet, "LL"),
            (TyreCompound::Wet, false) => (c.compound_wet, "W"),
        };
        window.paint_quad(quad(
            rect(x, top, size, size),
            Corners::all(px(size / 2.0)),
            transparent(),
            Edges::all(px(g.compound_border)),
            color.hsla(),
            BorderStyle::default(),
        ));
        let mut ink = self.ink(
            Face::Body,
            if letter.len() > 1 {
                f.compound - 1.0
            } else {
                f.compound
            },
            0.0,
            c.text.hsla(),
        );
        ink.weight = f.bold_weight;
        let width = text::width(window, letter, &ink);
        self.label(
            window,
            cx,
            letter,
            x + (size - width) / 2.0,
            None,
            top,
            size,
            Face::Body,
            &ink,
        );
    }

    fn pill_ink(&self, color: Hsla) -> text::TextInk<'_> {
        let f = &self.style.fonts;
        let mut ink = self.ink(Face::Body, f.pill, f.pill_tracking, color);
        ink.weight = f.pill_weight;
        ink
    }

    fn pill_width(&self, window: &Window, label: &str) -> f32 {
        text::width(window, label, &self.pill_ink(transparent()))
            + 2.0 * self.style.geometry.pill_padding
    }

    /// Píldora de boxes: BOX en el pit lane, o «N P» paradas en ampliado.
    fn pit(&self, window: &mut Window, cx: &mut App, row: &Row, x: f32, y: f32, stops: bool) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        let (label, fill_color, ink_color) = match row.pit {
            Pit::InPits => (BOX.to_owned(), c.box_fill, c.box_text),
            Pit::Stops(n) if stops => (format!("{n} P"), c.stops_fill, c.stops_text),
            Pit::Unknown if stops => {
                let ink = self.ink(Face::Body, self.style.fonts.small, 0.0, c.even.hsla());
                self.label(
                    window,
                    cx,
                    PLACEHOLDER,
                    x,
                    None,
                    y,
                    g.row_height,
                    Face::Body,
                    &ink,
                );
                return;
            }
            _ => return,
        };
        let width = self.pill_width(window, &label);
        let top = y + (g.row_height - g.pill_height) / 2.0;
        round_rect(
            window,
            x,
            top,
            width,
            g.pill_height,
            g.chip_radius,
            fill_color.hsla(),
        );
        let ink = self.pill_ink(ink_color.hsla());
        self.label(
            window,
            cx,
            &label,
            x + g.pill_padding,
            None,
            top,
            g.pill_height,
            Face::Body,
            &ink,
        );
    }

    fn sectors(&self, window: &mut Window, cx: &mut App, row: &Row, x: f32, y: f32) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        if row.sectors.is_empty() {
            let ink = self.ink(Face::Body, self.style.fonts.small, 0.0, c.even.hsla());
            self.label(
                window,
                cx,
                PLACEHOLDER,
                x,
                None,
                y,
                g.row_height,
                Face::Body,
                &ink,
            );
            return;
        }
        let top = y + (g.row_height - g.sector_height) / 2.0;
        for (index, mark) in row.sectors.iter().take(3).enumerate() {
            let color = match mark {
                Mark::Fastest => c.purple,
                Mark::Personal => c.green,
                Mark::Slower => c.yellow,
                Mark::Pending => c.sector_pending,
            };
            round_rect(
                window,
                x + index as f32 * (g.sector_width + g.sector_gap),
                top,
                g.sector_width,
                g.sector_height,
                g.sector_radius,
                color.hsla(),
            );
        }
    }

    fn wait(&self, window: &mut Window, cx: &mut App, y: f32) {
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let center = self.plan.width / 2.0;
        let pulse = g.pulse;
        round_rect(
            window,
            center - pulse / 2.0,
            y + 10.0,
            pulse,
            pulse,
            pulse / 2.0,
            c.pulse.hsla(),
        );
        let title = if self.es() {
            "ESPERANDO AL SIMULADOR"
        } else {
            "WAITING FOR THE SIMULATOR"
        };
        let ink = self.ink(
            Face::Display,
            f.wait_title,
            f.separator_tracking,
            c.header_em.hsla(),
        );
        let width = text::width(window, title, &ink);
        self.label(
            window,
            cx,
            title,
            center - width / 2.0,
            None,
            y + 22.0,
            f.wait_title,
            Face::Display,
            &ink,
        );
        let hint = if self.es() {
            "Abre el simulador y entra en una sesión"
        } else {
            "Open the simulator and join a session"
        };
        let ink = self.ink(Face::Body, f.small, 0.0, c.muted.hsla());
        let width = text::width(window, hint, &ink);
        self.label(
            window,
            cx,
            hint,
            center - width / 2.0,
            None,
            y + 40.0,
            20.0,
            Face::Body,
            &ink,
        );
    }

    fn skeleton(&self, window: &mut Window, y: f32, index: usize) {
        let g = &self.style.geometry;
        let color = self.style.colors.skeleton.hsla();
        let (pad, w, h) = (self.variant.padding_x, self.plan.width, g.row_height);
        let bar = g.skeleton_bar;
        let top = y + (h - bar) / 2.0;
        let mut x = pad;
        round_rect(window, x, top, 16.0, bar, 2.0, color);
        x += 16.0 + g.cell_gap;
        let dot = g.class_dot;
        round_rect(window, x, y + (h - dot) / 2.0, dot, dot, dot / 2.0, color);
        x += dot + g.cell_gap;
        let name = 110.0 + ((index * 37) % 70) as f32;
        round_rect(window, x, top, name, bar, 2.0, color);
        round_rect(window, w - pad - 48.0, top, 48.0, bar, 2.0, color);
    }

    fn footer(&self, window: &mut Window, cx: &mut App, y: f32, footer: Footer) {
        let Some(board) = self.board else { return };
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.plan.width);
        round_rect(window, pad, y, w - 2.0 * pad, 1.0, 0.0, c.line.hsla());
        let top = y + 1.0 + g.footer_gap;
        let h = g.footer_height;
        let ink = self.ink(Face::Body, f.header, 0.0, c.muted.hsla());
        let es = self.es();
        match footer {
            Footer::Spectator => {
                let pulse = g.pulse;
                round_rect(
                    window,
                    pad,
                    top + (h - pulse) / 2.0,
                    pulse,
                    pulse,
                    pulse / 2.0,
                    c.pulse.hsla(),
                );
                let left = if es {
                    "No estás en esta sesión · modo espectador"
                } else {
                    "You are not in this session · spectator mode"
                };
                self.label(
                    window,
                    cx,
                    left,
                    pad + pulse + g.cell_gap,
                    None,
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
                let right = if es {
                    "Siguiendo al líder"
                } else {
                    "Following the leader"
                };
                self.label(
                    window,
                    cx,
                    right,
                    0.0,
                    Some(w - pad),
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
            }
            Footer::Pits => {
                let width = self.pill_width(window, BOX);
                let pill_top = top + (h - g.pill_height) / 2.0;
                round_rect(
                    window,
                    pad,
                    pill_top,
                    width,
                    g.pill_height,
                    g.chip_radius,
                    c.box_fill.hsla(),
                );
                let pill = self.pill_ink(c.box_text.hsla());
                self.label(
                    window,
                    cx,
                    BOX,
                    pad + g.pill_padding,
                    None,
                    pill_top,
                    g.pill_height,
                    Face::Body,
                    &pill,
                );
                let stops = board
                    .groups
                    .iter()
                    .flat_map(|group| &group.rows)
                    .find(|row| row.is_player)
                    .and_then(|row| match row.pit {
                        Pit::Stops(n) => Some(n),
                        _ => None,
                    });
                let text = match (stops, es) {
                    (Some(n), true) => format!("Parada {}", n + 1),
                    (Some(n), false) => format!("Stop {}", n + 1),
                    (None, true) => "En boxes".to_owned(),
                    (None, false) => "In the pits".to_owned(),
                };
                self.label(
                    window,
                    cx,
                    &text,
                    pad + width + g.cell_gap,
                    None,
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
            }
            Footer::Session => {
                let mut x = pad;
                // Compacto abrevia el pie para que quepa en 340 px.
                let compact = self.narrow();
                if let Some((time, driver)) = &board.fastest {
                    let lead = match (compact, es) {
                        (true, true) => "VR ",
                        (true, false) => "FL ",
                        (false, true) => "Vuelta rápida ",
                        (false, false) => "Fastest lap ",
                    };
                    x += self.label(window, cx, lead, x, None, top, h, Face::Body, &ink);
                    let mono = self.ink(Face::Mono, f.mono_small, 0.0, c.purple.hsla());
                    x += self.label(window, cx, time, x, None, top, h, Face::Mono, &mono);
                    self.label(
                        window,
                        cx,
                        &format!(" · {driver}"),
                        x,
                        None,
                        top,
                        h,
                        Face::Body,
                        &ink,
                    );
                } else {
                    let lead = if es {
                        "Vuelta rápida —"
                    } else {
                        "Fastest lap —"
                    };
                    self.label(window, cx, lead, x, None, top, h, Face::Body, &ink);
                }
                let track = if compact {
                    format!("{} · {}", board.track_temperature, board.surface)
                } else {
                    format!(
                        "{} {} · {}",
                        if es { "Pista" } else { "Track" },
                        board.track_temperature,
                        board.surface
                    )
                };
                self.label(
                    window,
                    cx,
                    &track,
                    0.0,
                    Some(w - pad),
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::format::Preferences;

    fn scene() -> vantare_domain::Snapshot {
        vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/telemetry-real/acc.snapshot.json"
        ))
        .expect("foto real ACC")
    }

    /// Opciones de una plantilla con `rows` filas y el modo dado.
    fn template(name: &str, rows: usize, mode: &str) -> Options {
        Options::from_settings(&super::super::Settings {
            columns: Some(super::super::vantare_template(name)),
            row_count: rows,
            classification_mode: if mode == "multiclass" {
                "multiclass".into()
            } else {
                "normal".into()
            },
            class_scope: if mode == "all" {
                "all-classes".into()
            } else {
                "player-class".into()
            },
            ..super::super::Settings::default()
        })
    }

    fn options(name: &str) -> Options {
        template(name, 8, "player")
    }

    #[test]
    fn compiled_style_is_valid_and_round_trips() {
        let style = Style::compiled();
        let json = serde_json::to_string(&*style).expect("JSON");
        assert_eq!(*Style::from_json(&json).expect("válido"), *style);
    }

    #[test]
    fn style_rejects_unknown_negative_and_missing_fallback() {
        let original = serde_json::to_value(&*Style::compiled()).expect("JSON");
        let mut bad = original.clone();
        bad["geometry"]["row_height"] = serde_json::json!(-1);
        assert!(Style::from_json(&bad.to_string()).is_err());
        let mut bad = original.clone();
        bad["geometry"]["typo"] = serde_json::json!(1);
        assert!(Style::from_json(&bad.to_string()).is_err());
        let mut bad = original.clone();
        bad["colors"]["text"] = serde_json::json!("red");
        assert!(Style::from_json(&bad.to_string()).is_err());
        let mut bad = original;
        bad["classes"].as_array_mut().expect("clases").pop();
        assert!(Style::from_json(&bad.to_string()).is_err());
        assert!(Style::from_json("{}").is_err());
    }

    #[test]
    fn real_acc_photo_shows_only_the_player_class_in_standard_mode() {
        let board = vantare_domain::standings_vantare::project(&scene(), Preferences::default());
        let cars: usize = board.groups.iter().map(|g| g.rows.len()).sum();
        assert_eq!(cars, 32);
        let mine = shown_group(&board).expect("clase del jugador");
        let class_cars = board.groups[mine].rows.len();
        let style = Style::compiled();
        for name in ["compact", "standard", "expanded"] {
            let plan = plan(Some(&board), &options(name), &style);
            let rows: Vec<_> = plan
                .items
                .iter()
                .filter_map(|(_, item)| match item {
                    Item::Row(g, _) => Some(*g),
                    _ => None,
                })
                .collect();
            assert!(rows.iter().all(|g| *g == mine), "solo la clase del jugador");
            assert_eq!(rows.len(), class_cars.min(8));
        }
    }

    #[test]
    fn templates_reproduce_the_catalogue_widths_and_columns_drive_the_width() {
        let style = Style::compiled();
        let width = |o: &Options| o.width(&style);
        assert_eq!(width(&options("compact")), 340.0);
        assert_eq!(width(&options("standard")), 520.0);
        assert_eq!(width(&options("expanded")), 900.0);
        let mut narrower = options("standard");
        narrower.cols.order.retain(|kind| *kind != Kind::Sectors);
        assert!(
            width(&narrower) < 520.0,
            "quitar una columna estrecha el panel"
        );
    }

    #[test]
    fn column_boxes_pick_the_exact_column_including_half_gaps_only_inside_the_table() {
        let mut state = State::new(options("standard"));
        assert!(
            state.columns().is_none(),
            "sin filas no hay columnas que editar"
        );
        state.ingest(vantare_domain::standings_vantare::project(
            &scene(),
            Preferences::default(),
        ));
        let boxes = state.columns().expect("columnas");
        assert!(boxes.bottom > boxes.top);
        for window in boxes.columns.windows(2) {
            let ((_, left, width), (next, next_left, _)) = (window[0], window[1]);
            assert!(
                (next_left - (left + width) - boxes.gap).abs() < 0.01,
                "separación"
            );
            // Justo pasada la media separación ya es la columna siguiente.
            let x = left + width + boxes.gap / 2.0 + 0.5;
            assert_eq!(boxes.at(x, boxes.top + 1.0).map(|c| c.0), Some(next));
        }
        let (first, left, _) = boxes.columns[0];
        assert_eq!(
            boxes.at(left + 1.0, boxes.bottom - 1.0).map(|c| c.0),
            Some(first)
        );
        assert_eq!(
            boxes.at(left + 1.0, boxes.top - 1.0),
            None,
            "cabecera de sesión"
        );
        assert_eq!(boxes.at(left + 1.0, boxes.bottom + 1.0), None, "pie");
    }

    #[test]
    fn modes_choose_player_class_all_classes_or_multiclass_bands() {
        let board = vantare_domain::standings_vantare::project(&scene(), Preferences::default());
        let style = Style::compiled();
        let count = |plan: &Plan, separator: bool| {
            plan.items
                .iter()
                .filter(|(_, item)| {
                    if separator {
                        matches!(item, Item::Separator(_))
                    } else {
                        matches!(item, Item::Row(..))
                    }
                })
                .count()
        };
        let all = plan(Some(&board), &template("standard", 30, "all"), &style);
        assert_eq!((count(&all, false), count(&all, true)), (30, 0));
        let multi = plan(
            Some(&board),
            &template("standard", 30, "multiclass"),
            &style,
        );
        assert_eq!(count(&multi, false), 30);
        assert_eq!(
            count(&multi, true),
            board.groups.len(),
            "una franja por clase"
        );
    }

    #[test]
    fn race_scene_animates_overtakes_best_lap_and_pit_entry_then_settles() {
        use super::super::vantare_motion::Flash;
        use vantare_domain::standings_vantare::project;
        let scene: serde_json::Value = serde_json::from_str(include_str!(
            "../../fixtures/standings-vantare-carrera.scene.json"
        ))
        .expect("escena de carrera");
        let frames = scene["frames"].as_array().expect("fases");
        let mut state = State::new(options("standard"));
        let timing = state.style.motion.timing();
        let mut flashes = Vec::new();
        for frame in frames {
            let photo =
                vantare_ipc::snapshot_from_json(&frame["snapshot"].to_string()).expect("foto DTO");
            assert!(state.ingest(project(&photo, Preferences::default())));
            let now = std::time::Instant::now();
            for sample in state.samples() {
                if let Some((flash, _)) = state.motion.pose(sample.id, timing, now).flash {
                    flashes.push(flash);
                }
            }
        }
        for expected in [
            Flash::Gain,
            Flash::Loss,
            Flash::Lead,
            Flash::Best,
            Flash::Pit,
        ] {
            assert!(flashes.contains(&expected), "{expected:?} en {flashes:?}");
        }
        let later = std::time::Instant::now() + timing.flash + timing.reorder;
        assert_eq!(state.wake(later), crate::app::Wake::Idle);
    }

    #[test]
    fn waiting_source_shows_skeleton_and_spectator_footer_without_player() {
        let style = Style::compiled();
        let plan_none = plan(None, &options("standard"), &style);
        assert!(plan_none.items.iter().any(|(_, i)| *i == Item::Wait));
        assert_eq!(
            plan_none
                .items
                .iter()
                .filter(|(_, i)| matches!(i, Item::Skeleton(_)))
                .count(),
            5
        );
        let mut photo = scene();
        photo.state.player = None;
        let board = vantare_domain::standings_vantare::project(&photo, Preferences::default());
        let plan = plan(Some(&board), &options("standard"), &style);
        assert!(
            plan.items
                .iter()
                .any(|(_, i)| *i == Item::Footer(Footer::Spectator))
        );
    }

    #[test]
    fn catalogue_scene_reproduces_the_r10b_marks() {
        use vantare_domain::standings_vantare::project;
        let scene: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/standings-vantare.scene.json"))
                .expect("escena del catálogo");
        let frame = |index: usize| {
            vantare_ipc::snapshot_from_json(&scene["frames"][index]["snapshot"].to_string())
                .expect("foto DTO")
        };
        let prefs = Preferences::default();
        let board = project(&frame(0), prefs);
        let sizes: Vec<_> = board
            .groups
            .iter()
            .map(|g| (g.short.as_str(), g.cars))
            .collect();
        assert_eq!(sizes, [("HY", 7), ("LMP2", 3), ("LMGT3", 5)]);
        assert_eq!(board.groups[0].best_lap, "3:27.046");
        assert_eq!(
            (board.lap.as_str(), board.remaining.as_str()),
            ("14/38", "5:42:18")
        );
        assert_eq!(board.fastest, Some(("3:27.046".into(), "Lotterer".into())));
        assert_eq!(
            (board.track_temperature.as_str(), board.surface.as_str()),
            ("31 °C", "seca")
        );
        let hy = &board.groups[0].rows;
        let (lotterer, me, lynn) = (&hy[0], &hy[2], &hy[5]);
        assert_eq!(lotterer.gap, "Líder");
        assert_eq!(lotterer.best_mark, Mark::Fastest);
        assert_eq!(
            lotterer.sectors,
            [Mark::Personal, Mark::Fastest, Mark::Pending]
        );
        assert!(me.is_player);
        assert_eq!(me.gained, Some(2));
        assert_eq!(me.sectors, [Mark::Fastest, Mark::Personal, Mark::Personal]);
        assert_eq!(me.best_mark, Mark::Personal);
        assert_eq!(
            (me.gap.as_str(), me.interval.as_str()),
            ("+3.802", "+2.518")
        );
        assert_eq!(me.compound, Some(TyreCompound::Medium));
        assert_eq!(
            (me.pit, me.vehicle.as_str()),
            (Pit::Stops(1), "Ferrari 499P")
        );
        assert_eq!(lynn.pit, Pit::InPits);
        assert_eq!(
            board.groups[1].rows[0].sectors[0],
            Mark::Personal,
            "LMP2 sin morado"
        );
        assert_eq!(board.groups[2].rows[0].best_mark, Mark::Fastest);
        assert_eq!(
            project(&frame(1), prefs).banner,
            Some(Banner::FullCourseYellow)
        );
        assert_eq!(
            project(&frame(2), prefs).banner,
            Some(Banner::LocalYellow(2))
        );
        let last = project(&frame(3), prefs);
        assert_eq!(
            (last.banner, last.lap.as_str()),
            (Some(Banner::FinalLap), "38/38")
        );
        assert!(project(&frame(4), prefs).player_in_pits);
        assert_eq!(project(&frame(5), prefs).source_state, SourceState::Waiting);
        assert!(!project(&frame(6), prefs).player_present);
    }

    #[test]
    fn repaints_only_when_the_board_changes() {
        let mut state = State::new(options("expanded"));
        let photo = scene();
        let board = vantare_domain::standings_vantare::project(&photo, Preferences::default());
        assert!(state.ingest(board.clone()));
        assert!(!state.ingest(board));
        let before = state.size();
        let mut style = (*Style::compiled()).clone();
        style.geometry.row_height = 30.0;
        state.set_style(Arc::new(style));
        assert!(state.size().1 > before.1);
    }
}
