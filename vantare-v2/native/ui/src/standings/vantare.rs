//! Standings en el sistema de diseño Vantare (#1497), según el catálogo r10b.
//!
//! El ViewModel es puro (`vantare_domain::standings_vantare`); aquí solo se
//! decide la geometría y se pinta con las primitivas GPUI del kit. Los valores
//! visuales viven en `styles/standings-vantare.json`: compilados en producto y
//! editables en vivo en Workshop.

use super::{Accent, Look, Size};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{rect, text};
use gpui::{
    App, BorderStyle, BoxShadow, Corners, Edges, Hsla, Rgba, linear_color_stop, linear_gradient,
    point, px, quad,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, OnceLock};
use vantare_domain::format::{Language, PLACEHOLDER};
use vantare_domain::standings_vantare::{Banner, Board, Group, Mark, Pit, Row};
use vantare_domain::{SourceState, TyreCompound};

// ---------------------------------------------------------------------------
// Estilo
// ---------------------------------------------------------------------------

/// Color `#rrggbb` o `#rrggbbaa`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Color(u32, f32);

impl Color {
    pub(crate) fn hsla(self) -> Hsla {
        self.alpha(self.1)
    }
    pub(crate) fn alpha(self, alpha: f32) -> Hsla {
        Rgba {
            r: ((self.0 >> 16) & 0xff) as f32 / 255.0,
            g: ((self.0 >> 8) & 0xff) as f32 / 255.0,
            b: (self.0 & 0xff) as f32 / 255.0,
            a: alpha,
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
    pub widths: Widths,
    pub geometry: Geometry,
    pub fonts: Fonts,
    pub colors: Colors,
    pub classes: Vec<ClassColors>,
    pub accents: Accents,
    pub styles: Variants,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Widths {
    pub compact: f32,
    pub standard: f32,
    pub expanded: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Geometry {
    pub column_header_height: f32,
    pub row_height: f32,
    pub cell_gap: f32,
    pub separator_height: f32,
    pub separator_gap_top: f32,
    pub separator_gap_bottom: f32,
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
    pub col_gap_expanded: f32,
    pub wait_height: f32,
    pub skeleton_bar: f32,
    pub pulse: f32,
    pub standard_rows: f32,
    pub compact_rows: f32,
    pub expanded_rows: f32,
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
        if style.geometry.row_height < 1.0 || style.widths.compact < 100.0 {
            return Err("geometry: fila y anchos demasiado pequeños".into());
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Options {
    pub size: Size,
    pub look: Look,
    pub accent: Accent,
    pub interval: bool,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        Self {
            size: settings.size,
            look: settings.style,
            accent: settings.accent,
            interval: settings.gap_mode == super::GapMode::Interval,
        }
    }

    fn variant(self, style: &Style) -> &Variant {
        match self.look {
            Look::Neo => &style.styles.neo,
            Look::Carmin => &style.styles.carmin,
            Look::Limpio => &style.styles.limpio,
        }
    }

    fn accent(self, style: &Style) -> Color {
        match self.accent {
            Accent::Red => style.accents.red,
            Accent::Amber => style.accents.amber,
            Accent::Green => style.accents.green,
            Accent::White => style.accents.white,
        }
    }

    fn width(self, style: &Style) -> f32 {
        match self.size {
            Size::Compact => style.widths.compact,
            Size::Standard => style.widths.standard,
            Size::Expanded => style.widths.expanded,
        }
    }
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
}

fn waiting(board: Option<&Board>) -> bool {
    board.is_none_or(|b| matches!(b.source_state, SourceState::Waiting | SourceState::Lost))
}

/// Filas visibles `(grupo, fila)`, agrupadas por clase en todos los tamaños.
/// Si el jugador queda fuera del límite, las tres últimas son su entorno.
fn rows(board: &Board, size: Size, style: &Style) -> Vec<(usize, usize)> {
    let all: Vec<(usize, usize)> = board
        .groups
        .iter()
        .enumerate()
        .flat_map(|(g, group)| (0..group.rows.len()).map(move |r| (g, r)))
        .collect();
    let limit = match size {
        Size::Compact => style.geometry.compact_rows,
        Size::Standard => style.geometry.standard_rows,
        Size::Expanded => style.geometry.expanded_rows,
    }
    .max(1.0) as usize;
    let ordered = all;
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

fn plan(board: Option<&Board>, options: Options, style: &Style) -> Plan {
    let variant = options.variant(style);
    let g = &style.geometry;
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
            let count = if options.size == Size::Compact { 4 } else { 5 };
            for index in 0..count {
                items.push((y, Item::Skeleton(index)));
                y += g.row_height;
            }
        }
        Some(board) => {
            items.push((y, Item::Columns));
            y += g.column_header_height;
            let mut group = None;
            for (gi, ri) in rows(board, options.size, style) {
                if group != Some(gi) {
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
        width: options.width(style),
        height: y + variant.padding_y,
        items,
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
}

impl State {
    pub(crate) fn new(options: Options) -> Self {
        let style = Style::compiled();
        let plan = plan(None, options, &style);
        Self {
            options,
            style,
            board: None,
            plan,
        }
    }

    /// Devuelve si cambió lo que se dibuja.
    pub(crate) fn ingest(&mut self, board: Board) -> bool {
        if self.board.as_ref() == Some(&board) {
            return false;
        }
        self.board = Some(board);
        self.plan = plan(self.board.as_ref(), self.options, &self.style);
        true
    }

    pub(crate) fn set_style(&mut self, style: Arc<Style>) {
        self.style = style;
        self.plan = plan(self.board.as_ref(), self.options, &self.style);
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
            options: self.options,
            board: self.board.as_ref(),
            plan: &self.plan,
            language,
        }
        .paint(window, cx);
    }
}

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

/// Píldora de boxes: igual en español e inglés, como el catálogo.
const BOX: &str = "BOX";

struct Painter<'a> {
    style: &'a Style,
    variant: &'a Variant,
    accent: Color,
    options: Options,
    board: Option<&'a Board>,
    plan: &'a Plan,
    language: Language,
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
                Item::Row(group, row) => self.row(window, cx, y, group, row),
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
        } else if self.options.size == Size::Compact {
            let text = format!("{session} · {} {lap}", if self.es() { "V" } else { "L" });
            self.label(window, cx, &text.to_uppercase(), x, None, y, h, face, &ink);
        } else {
            let lead = format!("{session} · {} ", if self.es() { "Vuelta" } else { "Lap" });
            x += self.label(window, cx, &lead.to_uppercase(), x, None, y, h, face, &ink);
            self.label(window, cx, lap, x, None, y, h, face, &em);
        }
        if let Some(board) = board {
            let classes: Vec<&str> = if self.options.size == Size::Expanded {
                board.groups.iter().map(|g| g.short.as_str()).collect()
            } else {
                let mut shown: Vec<&str> = Vec::new();
                for (g, _) in rows(board, self.options.size, self.style) {
                    let short = board.groups[g].short.as_str();
                    if !shown.contains(&short) {
                        shown.push(short);
                    }
                }
                shown
            };
            let mut parts: Vec<String> = Vec::new();
            if self.options.interval {
                parts.push(if self.es() { "Intervalo" } else { "Interval" }.into());
            } else {
                if self.options.size == Size::Expanded && board.remaining != PLACEHOLDER {
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
            }
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

    /// Cabecera de columnas: mismas columnas que pinta cada tamaño.
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
        let cols = self.layout_columns();
        let es = self.es();
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
        put(window, cx, "P", 0.0, Some(cols.position_right));
        if let Some(x) = cols.gained {
            put(window, cx, "±", x, None);
        }
        put(
            window,
            cx,
            if es { "Dorsal" } else { "No." },
            cols.dot,
            None,
        );
        let driver = match (self.options.size, es) {
            (Size::Compact, true) => "Piloto",
            (Size::Compact, false) => "Driver",
            (_, true) => "Piloto · coche",
            (_, false) => "Driver · car",
        };
        let name = cols.dot + g.class_dot + g.cell_gap + g.number_min_width + g.cell_gap;
        put(window, cx, driver, name, None);
        if let Some(x) = cols.compound {
            put(window, cx, "N", x, None);
        }
        if let Some(x) = cols.pit {
            put(window, cx, if es { "Par." } else { "Stops" }, x, None);
        }
        if let Some(x) = cols.sectors {
            put(window, cx, "Sect.", x, None);
        }
        if let Some(right) = cols.last_right {
            put(
                window,
                cx,
                if es { "Última" } else { "Last" },
                0.0,
                Some(right),
            );
        }
        if let Some(right) = cols.best_right {
            put(
                window,
                cx,
                if es { "Mejor" } else { "Best" },
                0.0,
                Some(right),
            );
        }
        let gap = if self.options.interval { "Int." } else { "Gap" };
        put(window, cx, gap, 0.0, Some(cols.gap_right));
    }

    /// Columnas de cada tamaño. Ampliado lo muestra todo; estándar conserva
    /// ±, dorsal, paradas y sectores; compacto, dorsal, piloto y gap.
    fn layout_columns(&self) -> Columns {
        let g = &self.style.geometry;
        let gap = g.cell_gap;
        let pad = self.variant.padding_x;
        let size = self.options.size;
        let gap_right = self.plan.width - pad;
        let gap_width = if size == Size::Expanded {
            g.col_gap_expanded
        } else {
            g.col_gap
        };
        let mut edge = gap_right - gap_width;
        let mut take = |width: f32| {
            edge -= gap + width;
            edge
        };
        let (best_right, last_right) = if size == Size::Expanded {
            let best = take(g.col_lap) + g.col_lap;
            let last = take(g.col_lap) + g.col_lap;
            (Some(best), Some(last))
        } else {
            (None, None)
        };
        let sectors = (size != Size::Compact).then(|| take(self.sectors_width()));
        let pit = (size != Size::Compact).then(|| take(g.col_pit));
        let compound = (size == Size::Expanded).then(|| take(g.compound_size));
        let gained = (size != Size::Compact).then_some(pad + g.col_position + gap);
        Columns {
            position_right: pad + g.col_position,
            gained,
            dot: gained.map_or(pad + g.col_position + gap, |x| x + g.col_gained + gap),
            compound,
            pit,
            sectors,
            last_right,
            best_right,
            gap_right,
            name_right: edge - gap,
        }
    }

    fn sectors_width(&self) -> f32 {
        let g = &self.style.geometry;
        3.0 * g.sector_width + 2.0 * g.sector_gap
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

    fn row(&self, window: &mut Window, cx: &mut App, y: f32, gi: usize, ri: usize) {
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
        let (pad, w) = (v.padding_x, self.plan.width);
        let me = row.is_player && board.player_present;
        if me {
            let (x0, width) = (pad - g.player_bleed, w - 2.0 * (pad - g.player_bleed));
            let background = if v.player_white > 0.0 {
                gpui::white().opacity(v.player_white).into()
            } else {
                linear_gradient(
                    if v.player_vertical { 180.0 } else { 90.0 },
                    linear_color_stop(self.accent.alpha(v.player_from), 0.0),
                    linear_color_stop(self.accent.alpha(v.player_to), 1.0),
                )
            };
            window.paint_quad(quad(
                rect(x0, y, width, h),
                Corners::all(px(v.player_radius)),
                background,
                Edges::all(px(0.0)),
                transparent(),
                BorderStyle::default(),
            ));
        }
        let class = self.style.class(&group.class);
        let cols = self.layout_columns();
        // Posición.
        let ink = self.ink(Face::Display, f.position, 0.0, c.muted.hsla());
        self.label(
            window,
            cx,
            &row.position,
            0.0,
            Some(cols.position_right),
            y,
            h,
            Face::Display,
            &ink,
        );
        if let Some(x) = cols.gained {
            self.gained(window, cx, row, x, y);
        }
        // Punto de clase y dorsal.
        let dot = g.class_dot;
        let mut x = cols.dot;
        round_rect(
            window,
            x,
            y + (h - dot) / 2.0,
            dot,
            dot,
            if v.square_dots { 1.0 } else { dot / 2.0 },
            class.dot.hsla(),
        );
        x += dot + g.cell_gap;
        self.number(window, cx, row, class, x, y);
        x += self.number_width(window, row) + g.cell_gap;
        // Gap.
        let gap_text = self.gap_text(board, group, row);
        let frozen =
            matches!(board.banner, Some(Banner::FullCourseYellow)) || (me && board.player_in_pits);
        let gap_color = if frozen {
            c.frozen
        } else if me {
            c.text
        } else {
            c.value
        };
        let ink = self.ink(Face::Mono, f.mono, 0.0, gap_color.hsla());
        self.label(
            window,
            cx,
            &gap_text,
            0.0,
            Some(cols.gap_right),
            y,
            h,
            Face::Mono,
            &ink,
        );
        if let Some(cx0) = cols.compound {
            self.compound(window, cx, row, cx0, y);
        }
        let mut name_right = cols.name_right;
        match cols.pit {
            Some(px0) => self.pit(window, cx, row, px0, y, true),
            // Compacto: sin columna de paradas; la píldora BOX va junto al nombre.
            None if row.pit == Pit::InPits => {
                let width = self.pill_width(window, BOX);
                self.pit(window, cx, row, name_right - width, y, false);
                name_right -= width + g.cell_gap;
            }
            None => {}
        }
        if let Some(sx) = cols.sectors {
            self.sectors(window, cx, row, sx, y);
        }
        if let Some(right) = cols.last_right {
            let value = self.ink(Face::Mono, f.mono, 0.0, c.value.hsla());
            self.label(
                window,
                cx,
                &row.last_lap,
                0.0,
                Some(right),
                y,
                h,
                Face::Mono,
                &value,
            );
        }
        if let Some(right) = cols.best_right {
            let best = match row.best_mark {
                Mark::Fastest => c.purple,
                Mark::Personal => c.best_personal,
                _ => c.value,
            };
            let ink = self.ink(Face::Mono, f.mono, 0.0, best.hsla());
            self.label(
                window,
                cx,
                &row.best_lap,
                0.0,
                Some(right),
                y,
                h,
                Face::Mono,
                &ink,
            );
        }
        self.name(window, cx, row, x, name_right, y);
    }

    fn gap_text(&self, board: &Board, group: &Group, row: &Row) -> String {
        let leader_text = if self.es() { "Líder" } else { "Leader" };
        let text = if self.options.interval {
            row.interval.clone()
        } else {
            row.gap.clone()
        };
        // Fuera de ampliado, el líder de una clase que no lidera la general.
        let first_class = board.groups.first().map(|g| g.class.as_str());
        if self.options.size != Size::Expanded
            && text == leader_text
            && Some(group.class.as_str()) != first_class
            && !group.short.is_empty()
        {
            return format!("1º {}", group.short);
        }
        text
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
        let driver = if row.driver.is_empty() {
            PLACEHOLDER.to_owned()
        } else {
            row.driver.clone()
        };
        let driver = text::fit(window, &driver, &driver_ink, available);
        let used = self.label(window, cx, &driver, x, None, y, h, Face::Body, &driver_ink);
        let detail = match self.options.size {
            Size::Compact => String::new(),
            Size::Standard => match row.vehicle.split_whitespace().next() {
                Some(short) => format!(" · {short}"),
                None => String::new(),
            },
            Size::Expanded if row.vehicle.is_empty() => String::new(),
            Size::Expanded => format!(" · {}", row.vehicle),
        };
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
                let compact = self.options.size == Size::Compact;
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

struct Columns {
    position_right: f32,
    gained: Option<f32>,
    dot: f32,
    compound: Option<f32>,
    pit: Option<f32>,
    sectors: Option<f32>,
    last_right: Option<f32>,
    best_right: Option<f32>,
    gap_right: f32,
    /// Borde derecho disponible para el nombre.
    name_right: f32,
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

    fn options(size: Size) -> Options {
        Options {
            size,
            look: Look::Neo,
            accent: Accent::Red,
            interval: false,
        }
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
    fn real_acc_photo_plans_every_size_without_inventing_rows() {
        let board = vantare_domain::standings_vantare::project(&scene(), Preferences::default());
        let cars: usize = board.groups.iter().map(|g| g.rows.len()).sum();
        assert_eq!(cars, 32);
        let style = Style::compiled();
        let mut heights = Vec::new();
        for size in [Size::Compact, Size::Standard, Size::Expanded] {
            let plan = plan(Some(&board), options(size), &style);
            let rows = plan
                .items
                .iter()
                .filter(|(_, item)| matches!(item, Item::Row(..)))
                .count();
            match size {
                Size::Expanded => {
                    assert_eq!(rows, 30, "límite de filas del ampliado");
                    let bands = plan
                        .items
                        .iter()
                        .filter(|(_, item)| matches!(item, Item::Separator(_)))
                        .count();
                    assert!(bands >= 1);
                }
                _ => assert_eq!(rows, 8),
            }
            heights.push(plan.height);
        }
        assert!(heights[2] > heights[1]);
    }

    #[test]
    fn waiting_source_shows_skeleton_and_spectator_footer_without_player() {
        let style = Style::compiled();
        let plan_none = plan(None, options(Size::Standard), &style);
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
        let plan = plan(Some(&board), options(Size::Standard), &style);
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
        let mut state = State::new(options(Size::Expanded));
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
