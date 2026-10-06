//! Relative Eficiencia: filas de 29 px, letra base 14 y siete huecos por defecto.
//! La proyección usa las señales relativas v4 del núcleo.

mod motion;

use crate::app::{Paint, Wake};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text::{self, Ink, ink};
use crate::efficiency::{col, paint_rect, rect, tokens};
use gpui::{
    App, BorderStyle, ContentMask, Corners, Edges, linear_color_stop, linear_gradient, px, quad,
};
use motion::{Motion, Visual};
use std::time::Instant;
use vantare_domain::{
    Snapshot,
    format::{Language, Preferences},
    relative::{self, Side, ViewModel},
};

pub const SIZE: (f32, f32) = (470.0, 277.0);
const SCALE: f32 = 1.0;
const BAND: f32 = 36.0;
const FOOTER: f32 = 38.0;
const ROW: f32 = 29.0;
// Conserva las señales Vantare (número y mejor vuelta), sin inventar ratings.
const EDGES: [f32; 7] = [0.0, 30.0, 38.0, 68.0, 300.0, 364.0, 470.0];

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub columns: Option<Vec<crate::standings::options::ColumnSetting>>,
    pub range_ahead: usize,
    pub range_behind: usize,
    pub class_scope: String,
    pub include_player: bool,
    pub row_height_mode: String,
    pub footer_slots: Vec<String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            columns: None,
            range_ahead: 3,
            range_behind: 3,
            class_scope: "all".into(),
            include_player: true,
            row_height_mode: "compact".into(),
            footer_slots: Vec::new(),
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "includePlayer",
            "parseRelativeContent conserva siempre al jugador; el inspector productivo no ofrece ocultarlo",
        ),
        (
            "rowHeightMode",
            "RelativeFunctional conserva filas de 28 px; fill solo figura en su clave de presentación",
        ),
        (
            "columns.format.display/decimals",
            "el VM v2 productivo siempre formatea la vuelta completa con tres decimales",
        ),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.range_ahead = value.range_ahead.min(8);
        value.range_behind = value.range_behind.min(8);
        value.include_player = true;
        if value.class_scope != "sameClass" {
            value.class_scope = "all".into();
        }
        if value.row_height_mode != "fill" {
            value.row_height_mode = "compact".into();
        }
        value.footer_slots.truncate(9);
        if let Some(columns) = &mut value.columns {
            columns.truncate(7);
            columns.retain(|c| {
                [
                    "position",
                    "class",
                    "carNumber",
                    "driverName",
                    "gap",
                    "bestLap",
                    "lastLap",
                ]
                .contains(&c.metric_id.as_str())
            });
        }
        value
    }
    fn content(&self) -> relative::Content {
        relative::Content {
            range_ahead: self.range_ahead,
            range_behind: self.range_behind,
            same_class: self.class_scope == "sameClass",
            include_player: self.include_player,
        }
    }
    fn slot_count(&self) -> usize {
        self.range_ahead + self.range_behind + usize::from(self.include_player)
    }
    fn size(&self) -> (f32, f32) {
        (SIZE.0, SIZE.1 + (self.slot_count() as f32 - 7.0) * ROW)
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
    settings: Settings,
    footer: Vec<vantare_domain::standings::InfoCell>,
    footer_rows: usize,
    workshop: bool,
    motion: Motion,
    boundary: Option<(u64, u64, Preferences)>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: relative::project_content(
                &Snapshot::default(),
                prefs,
                settings.normalized().content(),
            ),
            settings: settings.normalized(),
            footer: Vec::new(),
            footer_rows: 1,
            workshop: false,
            motion: Motion::default(),
            boundary: None,
        }
    }

    pub(crate) fn workshop_layout(&mut self) {
        self.workshop = true;
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        if self.workshop {
            let footer = if self.footer.is_empty() {
                FOOTER
            } else {
                (15.0 + self.footer_rows as f32 * 14.0).max(FOOTER) * SCALE
            };
            (
                SIZE.0,
                BAND + self.settings.slot_count() as f32 * ROW + footer,
            )
        } else {
            self.settings.size()
        }
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let mut next = relative::project_content(snapshot, prefs, self.settings.content());
        let last_lap_visible = self.settings.footer_slots.iter().any(|id| id == "lastLap")
            || self
                .settings
                .columns
                .iter()
                .flatten()
                .any(|c| c.enabled && c.metric_id == "lastLap");
        if !last_lap_visible {
            for row in next.slots.iter_mut().flatten() {
                row.last_lap = "—".into();
                row.last_lap_stale = false;
            }
        }
        let footer = relative::footer_slots(snapshot, prefs, &next, &self.settings.footer_slots);
        self.footer_rows = 1;
        if footer.len() > 5 {
            let total = footer
                .iter()
                .map(|cell| {
                    cell.label.chars().count() as f32 * 5.5
                        + cell.value.chars().count() as f32 * 7.5
                        + 12.0
                        + 14.0
                })
                .sum::<f32>();
            self.footer_rows = (total / (SIZE.0 - 24.0)).ceil().max(1.0) as usize;
        }
        let footer_changed = crate::app::replace_if_changed(&mut self.footer, footer);
        let boundary = Some((snapshot.epoch, snapshot.state.session.id.0, prefs));
        let interrupted = self.boundary != boundary && self.motion.animating(Instant::now());
        if next.status.is_some() || self.vm.status.is_some() {
            self.motion = Motion::default();
            self.boundary = boundary;
        } else if self.boundary == boundary {
            self.motion.update(&self.vm, &next, Instant::now());
        } else {
            self.motion = Motion::default();
            self.boundary = boundary;
        }
        crate::app::replace_if_changed(&mut self.vm, next) || interrupted || footer_changed
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        let rows = self.motion.sample(&self.vm, now);
        let wake = if self.motion.animating(now) {
            Wake::Frame
        } else {
            Wake::Idle
        };
        let vm = self.vm.clone();
        let settings = self.settings.clone();
        let footer = self.footer.clone();
        let size = self.size();
        let footer_rows = self.footer_rows;
        (
            Box::new(move |window, cx| {
                paint(
                    &vm,
                    &rows,
                    &settings,
                    &footer,
                    size,
                    footer_rows,
                    prefs,
                    window,
                    cx,
                );
            }),
            wake,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.motion.animating(Instant::now())
    }
}

fn paint(
    vm: &ViewModel,
    rows: &[Visual],
    settings: &Settings,
    footer: &[vantare_domain::standings::InfoCell],
    size: (f32, f32),
    footer_rows: usize,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    let (width, height) = size;
    let panel = rect(0.0, 0.0, width, height);
    let radius = Corners::all(px(tokens::RADIUS * SCALE));
    let no_border = Edges::all(px(0.0));
    window.paint_quad(quad(
        panel,
        radius,
        col(tokens::PANEL, 0.87),
        no_border,
        col(0, 0.0),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        panel,
        radius,
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        no_border,
        col(0, 0.0),
        BorderStyle::default(),
    ));
    let has_meta = !vm.track.is_empty() || !vm.player_badge.is_empty();
    let meta_bottom = if has_meta { BAND } else { 0.0 };
    let top = meta_bottom
        + if vm.status.is_some() {
            38.0 * SCALE
        } else {
            0.0
        };
    if let Some(status) = &vm.status {
        let font = ink(12.0 * SCALE, 700.0, 0.0, col(0xe2c568, 1.0));
        text::draw(
            window,
            cx,
            status,
            12.0 * SCALE,
            meta_bottom + text::baseline(10.0, 18.0, 12.0) * SCALE,
            &font,
        );
    }
    if has_meta {
        line(window, BAND - SCALE, tokens::INK, 0.1);
        let (label, _) = labels(prefs.language);
        let font = ink(14.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
        let badge_width = text::width(window, &vm.player_badge, &font);
        let label_width = text::width(
            window,
            label,
            &ink(11.0, 600.0, 0.1, col(tokens::MUTED, 1.0)),
        );
        let track = text::fit(
            window,
            &vm.track,
            &font,
            (width - badge_width - label_width - 42.0).max(0.0),
        );
        item(window, cx, 12.0 * SCALE, 0.0, label, &track);
        let x = width - 12.0 * SCALE - badge_width;
        text::draw(
            window,
            cx,
            &vm.player_badge,
            x,
            text::baseline(0.0, BAND, font.size),
            &font,
        );
    }
    let footer_height = if footer.is_empty() {
        FOOTER
    } else {
        (15.0 + footer_rows as f32 * 14.0).max(FOOTER) * SCALE
    };
    let row_height =
        ((height - footer_height - top) / settings.slot_count().max(1) as f32).min(ROW);
    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(0.0, top, width, height - footer_height - top),
        }),
        |window| {
            for row in rows {
                if settings.columns.is_some() {
                    paint_configured_row(
                        row,
                        top,
                        row_height,
                        settings,
                        prefs.language,
                        window,
                        cx,
                    );
                } else {
                    paint_row(
                        row,
                        top,
                        row_height,
                        settings.slot_count(),
                        prefs.language,
                        window,
                        cx,
                    );
                }
            }
            if rows.is_empty() && vm.status.is_none() {
                let message = if prefs.language == Language::Es {
                    "SIN DATOS"
                } else {
                    "NO DATA"
                };
                let font = ink(12.0 * SCALE, 600.0, 0.0, col(tokens::MUTED, 1.0));
                text::draw(window, cx, message, 12.0 * SCALE, top + 22.0 * SCALE, &font);
            }
        },
    );
    let session = [&vm.session, &vm.remaining]
        .into_iter()
        .filter(|v| !v.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");
    let (_, weather) = labels(prefs.language);
    let fields = [
        ("", session.as_str()),
        (weather[0], vm.air.as_str()),
        (weather[1], vm.track_temperature.as_str()),
        (weather[2], vm.wind.as_str()),
    ];
    let visible = fields
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .collect::<Vec<_>>();
    if !footer.is_empty() && vm.status.is_none() {
        crate::standings::view::paint_info_cells(
            footer,
            width,
            height,
            footer_height,
            true,
            SCALE,
            SIZE.0,
            window,
            cx,
        );
    } else if !visible.is_empty() {
        let y = height - FOOTER;
        line(window, y, tokens::INK, 0.1);
        let widths = visible
            .iter()
            .map(|(label, value)| item_width(window, label, value))
            .collect::<Vec<_>>();
        let gap = 16.0 * SCALE;
        let total = widths.iter().sum::<f32>() + gap * (visible.len() - 1) as f32;
        let mut x = (width - total) / 2.0;
        for ((label, value), w) in visible.into_iter().zip(widths) {
            item(window, cx, x, y, label, value);
            x += w + gap;
        }
    }
    window.paint_quad(quad(
        panel,
        radius,
        col(0, 0.0),
        Edges::all(px(SCALE)),
        col(0xffffff, 0.085),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0 * SCALE),
        Corners {
            top_left: px(tokens::RADIUS * SCALE),
            top_right: px(tokens::RADIUS * SCALE),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0, 0.0),
        Edges {
            top: px(SCALE),
            right: px(0.0),
            bottom: px(0.0),
            left: px(0.0),
        },
        col(0xffffff, 0.085),
        BorderStyle::default(),
    ));
}

// Un borde CSS escalado mide menos de 1 px: el snap del kit puede vaciarlo.
// Se reparte su cobertura entre como máximo dos píxeles, sin tocar el kit.
fn line(window: &mut Window, y: f32, color: u32, alpha: f32) {
    let (_, origin_y) = text::origin();
    let start = y + origin_y;
    let first = start.floor();
    for pixel in [first, first + 1.0] {
        let coverage = ((start + SCALE).min(pixel + 1.0) - start.max(pixel)).max(0.0);
        if coverage > 0.0 {
            paint_rect(
                window,
                0.0,
                pixel - origin_y,
                SIZE.0,
                1.0,
                col(color, alpha * coverage),
            );
        }
    }
}

fn labels(language: Language) -> (&'static str, [&'static str; 3]) {
    match language {
        Language::Es => ("PISTA", ["AIRE", "PISTA", "VIENTO"]),
        Language::En => ("TRACK", ["AIR", "TRACK", "WIND"]),
    }
}

fn item_width(window: &Window, label: &str, value: &str) -> f32 {
    let label_font = ink(11.0 * SCALE, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let font = ink(14.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
    text::width(window, value, &font)
        + if label.is_empty() {
            0.0
        } else {
            text::width(window, label, &label_font) + 6.0 * SCALE
        }
}

fn item(window: &mut Window, cx: &mut App, x: f32, y: f32, label: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    let label_font = ink(11.0 * SCALE, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let font = ink(14.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
    let advance = if label.is_empty() {
        0.0
    } else {
        text::width(window, label, &label_font) + 6.0 * SCALE
    };
    text::draw(
        window,
        cx,
        label,
        x,
        y + text::baseline(0.0, BAND, font.size),
        &label_font,
    );
    text::draw(
        window,
        cx,
        value,
        x + advance,
        y + text::baseline(0.0, BAND, font.size),
        &font,
    );
}

fn paint_row(
    visual: &Visual,
    top: f32,
    row_height: f32,
    slot_count: usize,
    language: Language,
    window: &mut Window,
    cx: &mut App,
) {
    let row = &visual.row;
    let y = top + visual.y * row_height;
    let opacity = visual.opacity;
    let player = row.side == Side::Player;
    if player {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            row_height,
            col(0xbfc2ca, 0.23 * opacity),
        );
        window.paint_quad(quad(
            rect(0.0, y, SIZE.0, row_height),
            Corners::all(px(0.0)),
            linear_gradient(
                180.0,
                linear_color_stop(col(0xffffff, 0.04 * opacity), 0.0),
                linear_color_stop(col(0xffffff, 0.0), 0.6),
            ),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        line(window, y, 0xffffff, 0.13 * opacity);
    }
    if let Some((color, alpha)) = visual.cue {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            row_height,
            col(color, alpha * opacity),
        );
    }
    if visual.y < slot_count.saturating_sub(1) as f32 {
        let (color, alpha) = if player {
            (0xffffff, 0.08)
        } else {
            (tokens::INK, 0.1)
        };
        line(window, y + row_height - SCALE, color, alpha * opacity);
    }
    let edges = EDGES;
    let position = ink(
        13.0 * SCALE,
        600.0,
        -0.02,
        col(
            if player { 0xffffff } else { 0xb9bbc1 },
            opacity * if row.position_stale { 0.6 } else { 1.0 },
        ),
    );
    // Posición 2ch + hueco 4 + tick 3, centrado como el grid del productivo.
    let two_ch = text::width(window, "00", &ink(13.0 * SCALE, 600.0, 0.0, position.color));
    let identity_x = (edges[1] - two_ch - 7.0 * SCALE) / 2.0;
    let pos_x = identity_x + (two_ch - text::width(window, &row.position, &position)) / 2.0;
    text::draw(
        window,
        cx,
        &row.position,
        pos_x,
        text::baseline(y, row_height, position.size),
        &position,
    );
    let color = match row.class.to_uppercase().as_str() {
        "HYPERCAR" => 0xc1121f,
        "LMP2" => 0x0055a4,
        "LMP3" => 0xf59e0b,
        "GT3" | "LMGT3" => 0x2ecc71,
        _ => 0x6b7280,
    };
    paint_rect(
        window,
        identity_x + two_ch + 4.0 * SCALE,
        y + (row_height - 14.0) / 2.0,
        3.0 * SCALE,
        14.0 * SCALE,
        col(color, position.color.a),
    );
    let number = ink(11.0 * SCALE, 600.0, -0.02, col(0xa5a5ab, opacity));
    cell(
        window,
        cx,
        &row.number,
        edges[2],
        edges[3],
        text::baseline(y, row_height, number.size),
        &number,
        true,
    );
    let name = ink(14.0 * SCALE, 700.0, -0.025, col(tokens::INK, opacity));
    let badge = row
        .lap_delta
        .filter(|delta| *delta != 0 && !player)
        .map(|delta| {
            format!(
                "{}{} {}",
                if delta > 0 { "+" } else { "−" },
                delta.unsigned_abs(),
                if language == Language::Es { "V" } else { "L" }
            )
        });
    let badge_font = ink(8.0 * SCALE, 650.0, 0.01, col(0xc6c6cb, opacity));
    let badge_width = badge.as_ref().map_or(0.0, |value| {
        text::width(window, value, &badge_font) + 10.0 * SCALE
    });
    let value = text::fit(
        window,
        &row.driver.to_uppercase(),
        &name,
        edges[4]
            - edges[3]
            - 10.0 * SCALE
            - if badge.is_some() {
                badge_width + 7.0 * SCALE
            } else {
                0.0
            },
    );
    // Cada tamaño de letra comparte el centro vertical de la fila.
    text::draw(
        window,
        cx,
        &value,
        edges[3],
        text::baseline(y, row_height, name.size),
        &name,
    );
    if let Some(value) = badge {
        let x = edges[4] - 10.0 * SCALE - badge_width;
        window.paint_quad(quad(
            rect(x, y + (row_height - 14.0) / 2.0, badge_width, 14.0 * SCALE),
            Corners::all(px(3.0 * SCALE)),
            col(0, 0.0),
            Edges::all(px(SCALE)),
            col(tokens::INK, 0.16 * opacity),
            BorderStyle::default(),
        ));
        text::draw(
            window,
            cx,
            &value,
            x + 5.0 * SCALE,
            y + 17.0 * SCALE,
            &badge_font,
        );
    }
    let gap = ink(
        16.0 * SCALE,
        650.0,
        -0.02,
        col(tokens::INK, opacity * if row.gap_stale { 0.6 } else { 1.0 }),
    );
    cell(
        window,
        cx,
        &row.gap,
        edges[4],
        edges[5],
        text::baseline(y, row_height, gap.size),
        &gap,
        false,
    );
    let lap = ink(
        13.0 * SCALE,
        600.0,
        -0.02,
        col(
            0xe6e5e9,
            opacity * if row.best_lap_stale { 0.6 } else { 1.0 },
        ),
    );
    cell(
        window,
        cx,
        &row.best_lap,
        edges[5],
        edges[6],
        text::baseline(y, row_height, lap.size),
        &lap,
        false,
    );
}

fn paint_configured_row(
    visual: &Visual,
    top: f32,
    height: f32,
    settings: &Settings,
    language: Language,
    window: &mut Window,
    cx: &mut App,
) {
    let row = &visual.row;
    let y = top + visual.y * height;
    if row.side == Side::Player {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            height,
            col(0xbfc2ca, 0.23 * visual.opacity),
        );
    }
    if let Some((color, alpha)) = visual.cue {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            height,
            col(color, alpha * visual.opacity),
        );
    }
    if visual.y < settings.slot_count().saturating_sub(1) as f32 {
        line(
            window,
            y + height - SCALE,
            tokens::INK,
            0.1 * visual.opacity,
        );
    }
    let columns: Vec<_> = settings
        .columns
        .iter()
        .flatten()
        .filter(|c| c.enabled)
        .collect();
    let total = columns
        .iter()
        .map(|c| c.relative_width())
        .sum::<f32>()
        .max(1.0);
    let has_position = columns.iter().any(|c| c.metric_id == "position");
    let has_class = columns.iter().any(|c| c.metric_id == "class");
    let mut x = 0.0;
    for column in columns {
        let w = column.relative_width() / total * SIZE.0;
        let stale = match column.metric_id.as_str() {
            "position" => row.position_stale,
            "gap" => row.gap_stale,
            "bestLap" => row.best_lap_stale,
            "lastLap" => row.last_lap_stale,
            _ => false,
        };
        let value = match column.metric_id.as_str() {
            "position" => row.position.clone(),
            "class" => String::new(),
            "carNumber" => row.number.clone(),
            "driverName" => column.driver_name(&row.driver).to_uppercase(),
            "gap" => row.gap.clone(),
            "bestLap" => row.best_lap.clone(),
            "lastLap" => row.last_lap.clone(),
            _ => "—".into(),
        };
        let centered = column.style.align.as_deref().map_or(
            matches!(
                column.metric_id.as_str(),
                "position" | "class" | "carNumber"
            ),
            |v| v == "center",
        );
        let font = ink(
            if column.metric_id == "driverName" {
                14.0
            } else if column.metric_id == "gap" {
                16.0
            } else {
                13.0
            } * SCALE,
            if column.metric_id == "driverName" {
                700.0
            } else {
                600.0
            },
            -0.02,
            col(tokens::INK, visual.opacity * if stale { 0.6 } else { 1.0 }),
        );
        let baseline = text::baseline(y, height, font.size);
        if (column.metric_id == "class" && !has_position)
            || (column.metric_id == "position" && has_class)
        {
            let color = match row.class.to_uppercase().as_str() {
                "HYPERCAR" => 0xc1121f,
                "LMP2" => 0x0055a4,
                "LMP3" => 0xf59e0b,
                "GT3" | "LMGT3" => 0x2ecc71,
                _ => 0x6b7280,
            };
            paint_rect(
                window,
                x + w - 4.0 * SCALE,
                y + (height - 14.0 * SCALE) / 2.0,
                3.0 * SCALE,
                14.0 * SCALE,
                col(color, visual.opacity),
            );
        }
        // Clase es un tick, nunca una celda de texto vacía recortada con elipsis.
        if column.metric_id == "class" {
            x += w;
            continue;
        }
        if column.style.align.as_deref() == Some("left")
            || (column.metric_id == "driverName" && column.style.align.is_none())
        {
            let badge = (column.metric_id == "driverName" && row.side != Side::Player)
                .then_some(row.lap_delta)
                .flatten()
                .filter(|delta| *delta != 0)
                .map(|delta| {
                    format!(
                        "{}{} {}",
                        if delta > 0 { "+" } else { "−" },
                        delta.unsigned_abs(),
                        if language == Language::Es { "V" } else { "L" }
                    )
                });
            let badge_font = ink(8.0 * SCALE, 650.0, 0.01, col(0xc6c6cb, visual.opacity));
            let badge_width = badge
                .as_ref()
                .map_or(0.0, |v| text::width(window, v, &badge_font) + 10.0 * SCALE);
            let reserve = if badge.is_some() {
                badge_width + 7.0 * SCALE
            } else {
                0.0
            };
            let fitted = text::fit(window, &value, &font, (w - 10.0 * SCALE - reserve).max(0.0));
            text::draw(window, cx, &fitted, x, baseline, &font);
            if let Some(badge) = badge {
                let bx = x + w - 10.0 * SCALE - badge_width;
                let by = y + (height - 14.0 * SCALE) / 2.0;
                window.paint_quad(quad(
                    rect(bx, by, badge_width, 14.0 * SCALE),
                    Corners::all(px(3.0 * SCALE)),
                    col(0, 0.0),
                    Edges::all(px(SCALE)),
                    col(tokens::INK, 0.16 * visual.opacity),
                    BorderStyle::default(),
                ));
                text::draw(
                    window,
                    cx,
                    &badge,
                    bx + 5.0 * SCALE,
                    by + 10.0 * SCALE,
                    &badge_font,
                );
            }
        } else {
            cell(window, cx, &value, x, x + w, baseline, &font, centered);
        }
        x += w;
    }
}

fn cell(
    window: &mut Window,
    cx: &mut App,
    value: &str,
    left: f32,
    right: f32,
    baseline: f32,
    font: &Ink,
    centered: bool,
) {
    let fitted = text::fit(window, value, font, right - left - 12.0 * SCALE);
    let width = text::width(window, &fitted, font);
    let x = if centered {
        (left + right - width) / 2.0
    } else {
        right - 6.0 * SCALE - width
    };
    text::draw(window, cx, &fitted, x, baseline, font);
}

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            LapTimes, PitStatus, Positions, Relative, SessionClock, SessionInfo, TrackName, Weather,
        };
        let settings = self.normalized();
        let mut demand = crate::demand::signals(
            33,
            &[Relative, Positions, PitStatus, SessionInfo, TrackName],
        );
        if settings.columns.as_ref().is_none_or(|cols| {
            cols.iter()
                .any(|c| c.enabled && matches!(c.metric_id.as_str(), "bestLap" | "lastLap"))
        }) {
            demand.request(LapTimes, 250);
        }
        // Sin huecos configurados, el pie productivo conserva reloj y clima.
        if settings.footer_slots.iter().all(|id| id == "none") {
            demand.request(SessionClock, 250);
            demand.request(Weather, 500);
        }
        for id in &settings.footer_slots {
            if id == "track" {
                demand.request(TrackName, 500);
            } else {
                crate::demand::information(&mut demand, id, true);
            }
        }
        demand
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn row_count_changes_height_without_changing_row_proportions() {
        for ahead in 0..=8 {
            for behind in 0..=8 {
                let settings = Settings {
                    range_ahead: ahead,
                    range_behind: behind,
                    ..Settings::default()
                };
                let (width, height) = settings.size();
                assert_eq!(width, 470.0);
                assert_eq!(height, BAND + FOOTER + settings.slot_count() as f32 * 29.0);
            }
        }
    }

    #[test]
    fn configured_columns_fill_and_slots_reach_the_rendered_model() {
        let prefs = Preferences::default();
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/relative.snapshot.json"))
                .expect("escena");
        let settings: Settings = serde_json::from_str(r#"{"rangeAhead":1,"rangeBehind":2,"classScope":"sameClass","rowHeightMode":"fill","footerSlots":["time","lastLap","track"],"columns":[{"id":"driverName","metricId":"driverName","format":{"mode":"initial"}},{"id":"lastLap","metricId":"lastLap","widthPreset":"md"}]}"#).expect("ajustes");
        let mut widget = Widget::new(&settings, prefs);
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.vm.slots.len(), 4);
        assert_eq!(widget.footer.len(), 3);
        assert_eq!(widget.footer[0].value, "01:59:58");
        assert_eq!(widget.settings.row_height_mode, "fill");
        assert_eq!(
            widget.settings.columns.as_ref().expect("columnas")[0].driver_name("André Lotterer"),
            "A. Lotterer"
        );
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        assert!(
            Settings {
                include_player: false,
                ..Settings::default()
            }
            .normalized()
            .include_player
        );
    }

    #[test]
    fn unchanged_drawing_does_not_repaint_and_first_snapshot_is_quiet() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = source::synthetic(0);
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        snapshot.state.player = None;
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
    }

    #[test]
    fn source_interruption_clears_rows_without_animated_ghosts() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/relative.snapshot.json"))
                .expect("escena reconstruida v4");
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.state.cars[1].relative_s = vantare_domain::Quality::Reliable(-0.1);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Frame);
        snapshot.state.source_state = vantare_domain::SourceState::Lost;
        assert!(widget.ingest(&snapshot, prefs));
        assert!(widget.vm.slots.iter().all(Option::is_none));
        assert_eq!(widget.vm.status.as_deref(), Some("DESCONECTADO"));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
    }

    #[test]
    fn reconstructed_reference_scene_preserves_relative_gaps_laps_and_si_weather() {
        // Datos reconstruidos de tools/widget-reference/scene.tsx, congelados
        // en reference/relative.geometry.json; no son evidencia de LMU live.
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/relative.snapshot.json"))
                .expect("escena Relative DTO v4");
        assert_eq!(snapshot.state.cars.len(), 20);
        assert_eq!(snapshot.epoch, 3);
        let vm = relative::project(&snapshot, Preferences::default());
        let player = vm.slots[relative::RANGE]
            .as_ref()
            .expect("jugador congelado");
        assert_eq!(player.driver, "André Lotterer");
        assert_eq!(player.best_lap, "—");
        assert_eq!(vm.remaining, "01:59:58");
        assert_eq!(vm.air, "21°");
        assert_eq!(vm.track_temperature, "28°");
        assert_eq!(vm.wind, "14 km/h");
        assert_eq!(vm.slots.iter().flatten().count(), 7);
        assert_eq!(
            vm.slots
                .iter()
                .flatten()
                .map(|r| r.id.0)
                .collect::<Vec<_>>(),
            vec![4, 3, 2, 1, 20, 19, 18]
        );
        assert_eq!(vm.slots[0].as_ref().expect("rival").lap_delta, Some(-1));
        assert_eq!(vm.slots[2].as_ref().expect("delante").gap, "+0.4");
        assert_eq!(vm.slots[4].as_ref().expect("detrás").gap, "-0.3");
    }
}
