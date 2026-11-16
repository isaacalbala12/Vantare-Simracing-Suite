//! Dibujo de Relative Eficiencia. Recibe la proyección canónica; no ordena coches,
//! no calcula gaps ni cadencias. La captura usa exactamente esta vista.
use crate::eficiencia::{self as kit, INK, MUTED, baseline, color, fit, font, width};
use crate::relative::scene::{AlertKind, Scene, VisualRow};
use crate::widget::Update;
use rune::{El, el, text};
use std::sync::Arc;
use vantare_domain::{
    format::{Language, Preferences},
    geometry::Size,
    relative::{Board, Row, Side},
    standings::InfoCell,
    widget_settings::{columns::ColumnSetting, relative::Settings},
};

pub const WIDTH: f32 = 470.0;
const BAND: f32 = 36.0;
const FOOTER: f32 = 38.0;
const ROW: f32 = 29.0;
/// Banda de pausa del anfitrión de GPUI (`native/ui/src/app.rs:31`), no del Look.
const PAUSE_HEIGHT: f32 = 22.0;

pub fn natural_size(settings: &Settings) -> (f32, f32) {
    let settings = settings.normalized();
    let slots = settings.range_ahead + settings.range_behind + usize::from(settings.include_player);
    (WIDTH, BAND + FOOTER + slots as f32 * ROW)
}

// Coordenadas del mismo layout que pinta GPUI, antes de aplicar movimiento.
fn row_layout(board: &Board, settings: &Settings) -> (f32, f32, f32) {
    let (_, height) = natural_size(settings);
    let count = settings.range_ahead + settings.range_behind + usize::from(settings.include_player);
    let footer_h = if board.footer_cells.is_empty() {
        FOOTER
    } else {
        (15.0 + footer_rows(&board.footer_cells) as f32 * 14.0).max(FOOTER)
    };
    let meta = if !board.track.is_empty() || !board.player_badge.is_empty() {
        BAND
    } else {
        0.0
    };
    let top = meta + if board.status.is_some() { 38.0 } else { 0.0 };
    (
        top,
        ((height - footer_h - top).max(0.0) / count.max(1) as f32).min(ROW),
        footer_h,
    )
}

pub(crate) fn targets(board: &Board, settings: &Settings) -> Vec<f32> {
    let (top, row_h, _) = row_layout(board, settings);
    (0..board.slots.len())
        .map(|slot| top + slot as f32 * row_h)
        .collect()
}

/// Pintor del Look Eficiencia: retiene la última escena visible y solo recompone
/// cuando su estructura cambia. No avanza movimiento ni posee reloj propio.
pub(crate) struct Painter {
    settings: Settings,
    language: Language,
    scene: Scene,
}

impl Painter {
    pub fn new(settings: &Settings, prefs: Preferences, initial: &Scene) -> Self {
        Self {
            settings: settings.normalized(),
            language: prefs.language,
            scene: initial.clone(),
        }
    }
    pub fn size(&self) -> Size {
        self.size_for(self.scene.paused)
    }
    pub fn size_for(&self, paused: bool) -> Size {
        let (width, height) = natural_size(&self.settings);
        Size {
            width,
            height: height + if paused { PAUSE_HEIGHT } else { 0.0 },
        }
    }
    /// Este Look no pinta la tira de tráfico del mapa.
    pub fn has_strip(&self) -> bool {
        false
    }
    pub fn targets(&mut self, board: &Arc<Board>) -> Vec<f32> {
        targets(board, &self.settings)
    }
    /// Repintado por estructura: la foto y su contador no deciden.
    pub fn sync(&mut self, scene: &Scene) -> Update {
        if self.scene == *scene {
            return Update::default();
        }
        self.scene = scene.clone();
        Update {
            build: true,
            pixels: false,
        }
    }
    pub fn view(&self) -> El {
        view_scene(&self.scene, &self.settings, self.language)
    }
}

/// Vista asentada para QA: las mismas coordenadas que recibe Scene en el proceso.
#[cfg(test)]
pub fn view(board: &Board, settings: &Settings, language: Language) -> El {
    let positions = targets(board, settings);
    let rows: Vec<_> = board
        .slots
        .iter()
        .zip(positions)
        .filter_map(|(row, slot)| {
            row.as_ref().map(|row| VisualRow {
                row: row.clone(),
                slot,
                opacity: 1.0,
                alert: None,
                traffic_opacity: 0.0,
            })
        })
        .collect();
    view_rows(board, settings, language, &rows)
}

/// Solo pinta muestras del movimiento común; slot ya es una coordenada del layout.
pub(crate) fn view_scene(scene: &Scene, settings: &Settings, language: Language) -> El {
    let panel = view_rows(&scene.board, settings, language, &scene.rows);
    if !scene.paused {
        return panel;
    }
    let (w, h) = natural_size(settings);
    el().size(w, h + 22.0)
        .motion(rune::Spring::NONE)
        .child(panel.pin(Some(0.0), Some(0.0), None, None))
        .child(
            rect(0.0, h, w, 22.0, color(0x101113, 0.95))
                .key("pause-band")
                .child(label(
                    if language == Language::Es {
                        "EN PAUSA"
                    } else {
                        "PAUSED"
                    },
                    8.0,
                    16.0,
                    font(11.0, 600, 0.02),
                    color(0xffffff, 1.0),
                )),
        )
}

pub fn view_rows(board: &Board, settings: &Settings, language: Language, rows: &[VisualRow]) -> El {
    let settings = settings.normalized();
    let (w, h) = natural_size(&settings);
    let count = settings.range_ahead + settings.range_behind + usize::from(settings.include_player);
    let (top, row_h, footer_h) = row_layout(board, &settings);
    let has_meta = !board.track.is_empty() || !board.player_badge.is_empty();
    let meta_bottom = if has_meta { BAND } else { 0.0 };
    let mut panel = kit::panel(w, h).key("relative-eficiencia");
    if has_meta {
        let track_label = if language == Language::Es {
            "PISTA"
        } else {
            "TRACK"
        };
        let value_font = font(14.0, 650, -0.01);
        let label_font = font(11.0, 600, 0.1);
        let badge_w = width(&board.player_badge, value_font);
        let track = fit(
            &board.track,
            value_font,
            (w - badge_w - width(track_label, label_font) - 42.0).max(0.0),
        );
        panel = panel
            .child(rect(0.0, BAND - 1.0, w, 1.0, color(INK, 0.1)))
            .child(
                el().pin(Some(0.0), Some(0.0), None, None)
                    .child(label(
                        track_label,
                        12.0,
                        baseline(0.0, BAND, 14.0),
                        label_font,
                        color(MUTED, 1.0),
                    ))
                    .child(
                        label(
                            &track,
                            12.0 + width(track_label, label_font) + 6.0,
                            baseline(0.0, BAND, 14.0),
                            value_font,
                            color(INK, alpha(board.header_stale.track)),
                        )
                        .w(width(&track, value_font))
                        .key("track-name"),
                    ),
            )
            .child(
                label(
                    &board.player_badge,
                    w - 12.0 - badge_w,
                    baseline(0.0, BAND, 14.0),
                    value_font,
                    color(INK, alpha(board.header_stale.player_badge)),
                )
                .key("player-badge"),
            );
    }
    if let Some(status) = &board.status {
        panel = panel.child(
            label(
                status,
                12.0,
                meta_bottom + baseline(10.0, 18.0, 12.0),
                font(12.0, 700, 0.0),
                color(0xe2c568, 1.0),
            )
            .key("status"),
        );
    }
    let mut body = el()
        .pin(Some(0.0), Some(top), None, None)
        .size(w, (h - footer_h - top).max(0.0))
        .clip_soft(0.0)
        .key("rows");
    for row in rows {
        body = body.child(paint_row(row, top, row_h, count, &settings, language));
    }
    if rows.is_empty() && board.status.is_none() {
        body = body.child(
            label(
                if language == Language::Es {
                    "SIN DATOS"
                } else {
                    "NO DATA"
                },
                12.0,
                22.0,
                font(12.0, 600, 0.0),
                color(MUTED, 1.0),
            )
            .key("empty"),
        );
    }
    panel = panel.child(body);
    if !board.footer_cells.is_empty() && board.status.is_none() {
        panel = panel.child(footer(&board.footer_cells, h));
    } else {
        let weather = if language == Language::Es {
            ["AIRE", "PISTA", "VIENTO"]
        } else {
            ["AIR", "TRACK", "WIND"]
        };
        let session = [&board.session, &board.remaining]
            .into_iter()
            .filter(|s| !s.is_empty())
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ");
        let fields = [
            (
                "",
                session.as_str(),
                board.header_stale.session || board.header_stale.remaining,
            ),
            (weather[0], board.air.as_str(), board.header_stale.air),
            (
                weather[1],
                board.track_temperature.as_str(),
                board.header_stale.track_temperature,
            ),
            (weather[2], board.wind.as_str(), board.header_stale.wind),
        ];
        let widths = fields.map(|(l, v, _)| pair_width(l, v));
        let present = fields.iter().filter(|(_, v, _)| !v.is_empty()).count();
        if present > 0 {
            let mut x = (w
                - widths
                    .iter()
                    .zip(fields)
                    .filter(|(_, (_, v, _))| !v.is_empty())
                    .map(|(w, _)| w)
                    .sum::<f32>()
                - 16.0 * present.saturating_sub(1) as f32)
                / 2.0;
            panel = panel.child(rect(0.0, h - FOOTER, w, 1.0, color(INK, 0.1)));
            for ((l, v, stale), advance) in fields
                .into_iter()
                .zip(widths)
                .filter(|((_, v, _), _)| !v.is_empty())
            {
                if l.is_empty() && stale {
                    // La calidad de sesión y tiempo es independiente en GPUI.
                    let offset = if board.session.is_empty() || board.remaining.is_empty() {
                        0.0
                    } else {
                        pair_width("", &board.session) + width(" ", font(14.0, 650, -0.01))
                    };
                    panel = panel
                        .child(pair(
                            "",
                            &board.session,
                            board.header_stale.session,
                            x,
                            h - FOOTER,
                        ))
                        .child(pair(
                            "",
                            &board.remaining,
                            board.header_stale.remaining,
                            x + offset,
                            h - FOOTER,
                        ));
                } else {
                    panel = panel.child(pair(l, v, stale, x, h - FOOTER));
                }
                x += advance + 16.0;
            }
        }
    }
    panel.child(kit::outline(w, h, 0.085, 0.085))
}

/// Texto colocado con `pin`; la línea base llega ya calculada por `baseline`.
fn label(value: &str, x: f32, base: f32, style: rune::TextStyle, ink: rune::Color) -> El {
    let ascent = (style.size * 1984.0 / 2048.0).round();
    text(value)
        .font(style)
        .color(ink)
        .pin(Some(x), Some(base - ascent), None, None)
}

fn rect(x: f32, y: f32, w: f32, h: f32, ink: rune::Color) -> El {
    el().pin(Some(x), Some(y), None, None)
        .size(w.max(0.0), h.max(0.0))
        .fill(ink)
}

fn alpha(stale: bool) -> f32 {
    if stale { 0.6 } else { 1.0 }
}
fn pair_width(l: &str, v: &str) -> f32 {
    width(v, font(14.0, 650, -0.01))
        + if l.is_empty() {
            0.0
        } else {
            width(l, font(11.0, 600, 0.1)) + 6.0
        }
}
fn pair(l: &str, v: &str, stale: bool, x: f32, y: f32) -> El {
    let label_font = font(11.0, 600, 0.1);
    let advance = if l.is_empty() {
        0.0
    } else {
        width(l, label_font) + 6.0
    };
    let base = y + baseline(0.0, BAND, 14.0);
    el().pin(Some(0.0), Some(0.0), None, None)
        .child(label(l, x, base, label_font, color(MUTED, 1.0)))
        .child(label(
            v,
            x + advance,
            base,
            font(14.0, 650, -0.01),
            color(INK, alpha(stale)),
        ))
}

fn class_color(class: &str) -> u32 {
    // GPUI compara la clase en mayúsculas: `hypercar` también es HYPERCAR.
    match class.to_uppercase().as_str() {
        "HYPERCAR" => 0xc1121f,
        "LMP2" => 0x0055a4,
        "LMP3" => 0xf59e0b,
        "GT3" | "LMGT3" => 0x2ecc71,
        _ => 0x6b7280,
    }
}

fn badge(row: &Row, language: Language) -> Option<String> {
    row.lap_delta
        .filter(|v| *v != 0 && row.side != Side::Player)
        .map(|v| {
            format!(
                "{}{} {}",
                if v < 0 { "−" } else { "+" },
                v.unsigned_abs(),
                if language == Language::Es { "V" } else { "L" }
            )
        })
}

fn paint_row(
    paint: &VisualRow,
    top: f32,
    height: f32,
    count: usize,
    settings: &Settings,
    language: Language,
) -> El {
    let row = paint.row.as_ref();
    let mut node = el()
        .pin(Some(0.0), Some(paint.slot - top), None, None)
        .size(WIDTH, height)
        .key(format!("car-{}", row.id.0))
        .opacity(paint.opacity);
    let configured = settings.columns.is_some();
    if row.side == Side::Player {
        node = node.fill(color(0xbfc2ca, 0.23));
        if !configured {
            // Gradiente CSS de 180° (arriba→abajo) en radianes, como el resto del workspace.
            node = node
                .child(
                    el().pin(Some(0.0), Some(0.0), None, None)
                        .size(WIDTH, height)
                        .linear_gradient(
                            std::f32::consts::PI,
                            [(0.0, color(0xffffff, 0.04)), (0.6, color(0xffffff, 0.0))],
                        ),
                )
                .child(rect(0.0, 0.0, WIDTH, 1.0, color(0xffffff, 0.13)));
        }
    }
    if let Some(alert) = paint.alert {
        let rgb = match alert.kind {
            AlertKind::Gain => Some(0x7fb686),
            AlertKind::Loss => Some(0xd95360),
            AlertKind::Pits => None, // GPUI Eficiencia solo muestra avisos de cruce.
        };
        if let Some(rgb) = rgb {
            node = node.child(rect(
                0.0,
                0.0,
                WIDTH,
                height,
                color(rgb, 0.04 * alert.opacity),
            ));
        }
    }
    if paint.slot < top + count.saturating_sub(1) as f32 * height {
        node = node.child(rect(
            0.0,
            height - 1.0,
            WIDTH,
            1.0,
            color(
                if row.side == Side::Player && !configured {
                    0xffffff
                } else {
                    INK
                },
                if row.side == Side::Player && !configured {
                    0.08
                } else {
                    0.1
                },
            ),
        ));
    }
    let lap_badge = badge(row, language);
    let badge_font = font(8.0, 650, 0.01);
    let badge_w = lap_badge
        .as_ref()
        .map_or(0.0, |v| width(v, badge_font) + 10.0);
    let cells = if let Some(selected) = &settings.columns {
        columns(selected)
    } else {
        legacy_columns()
    };
    let has_class = cells.iter().any(|c| c.metric == "class");
    let has_position = cells.iter().any(|c| c.metric == "position");
    for cell in &cells {
        if cell.metric == "class" && !has_position
            || cell.metric == "position" && has_class
            || !configured && cell.metric == "position"
        {
            let x = if configured {
                cell.x + cell.w - 4.0
            } else {
                (30.0 - width("00", font(13.0, 600, 0.0)) - 7.0) / 2.0
                    + width("00", font(13.0, 600, 0.0))
                    + 4.0
            };
            node = node.child(rect(
                x,
                (height - 14.0) / 2.0,
                3.0,
                14.0,
                color(
                    class_color(&row.class),
                    if cell.metric == "position" {
                        alpha(row.position_stale)
                    } else {
                        1.0
                    },
                ),
            ));
        }
        if cell.metric == "class" {
            continue;
        }
        let (value, stale) = match cell.metric.as_str() {
            "position" => (row.position.to_string(), row.position_stale),
            "carNumber" => (row.number.clone(), false),
            "driverName" => (
                vantare_domain::standings::driver_name(
                    &row.driver,
                    &cell.name_mode,
                    cell.max_chars,
                )
                .to_uppercase(),
                false,
            ),
            "gap" => (row.gap.to_string(), row.gap_stale),
            "lastLap" => (row.last_lap.to_string(), row.last_lap_stale),
            _ => (row.best_lap.to_string(), row.best_lap_stale),
        };
        let driver = cell.metric == "driverName";
        let reserve = if driver && lap_badge.is_some() {
            badge_w + 7.0
        } else {
            0.0
        };
        let shown = fit(
            &value,
            cell.font,
            (cell.w - if cell.left { 10.0 + reserve } else { 12.0 }).max(0.0),
        );
        let value_w = width(&shown, cell.font);
        let x = if !configured && cell.metric == "position" {
            let two_ch = width("00", font(13.0, 600, 0.0));
            (30.0 - two_ch - 7.0) / 2.0 + (two_ch - value_w) / 2.0
        } else if cell.left {
            cell.x
        } else if cell.centered {
            cell.x + (cell.w - value_w) / 2.0
        } else {
            cell.x + cell.w - 6.0 - value_w
        };
        let rgb = if configured {
            INK
        } else {
            match cell.metric.as_str() {
                "position" if row.side != Side::Player => 0xb9bbc1,
                "position" => 0xffffff,
                "carNumber" => 0xa5a5ab,
                "bestLap" => 0xe6e5e9,
                _ => INK,
            }
        };
        node = node.child(
            // Texto ya recortado por `fit`, como el `Cell` de GPUI: una sola elipsis.
            label(
                &shown,
                x,
                baseline(0.0, height, cell.font.size),
                cell.font,
                color(rgb, alpha(stale)),
            )
            .w(value_w)
            .key(format!("car-{}-cell-{}", row.id.0, cell.index)),
        );
        if driver
            && cell.left
            && let Some(value) = &lap_badge
        {
            let bx = cell.x + cell.w - 10.0 - badge_w;
            let by = (height - 14.0) / 2.0;
            node = node
                .child(
                    el().pin(Some(bx), Some(by), None, None)
                        .size(badge_w, 14.0)
                        .radius(3.0)
                        .border(1.0, color(INK, 0.16)),
                )
                .child(
                    label(
                        value,
                        bx + 5.0,
                        if configured { by + 10.0 } else { 17.0 },
                        badge_font,
                        color(0xc6c6cb, 1.0),
                    )
                    .key(format!("car-{}-lap-delta", row.id.0)),
                );
        }
    }
    node
}

struct Column {
    index: usize,
    metric: String,
    x: f32,
    w: f32,
    centered: bool,
    left: bool,
    font: rune::TextStyle,
    name_mode: String,
    max_chars: usize,
}
fn columns(settings: &[ColumnSetting]) -> Vec<Column> {
    let selected: Vec<_> = settings
        .iter()
        .filter(|c| {
            c.enabled
                && [
                    "position",
                    "class",
                    "carNumber",
                    "driverName",
                    "gap",
                    "bestLap",
                    "lastLap",
                ]
                .contains(&c.metric_id.as_str())
        })
        .take(7)
        .collect();
    let weight = |c: &ColumnSetting| match c.width_preset.as_str() {
        "xs" => 20.0,
        "sm" => 36.0,
        "md" => 60.0,
        "lg" => 90.0,
        _ => match c.metric_id.as_str() {
            "position" => 24.0,
            "class" => 6.0,
            "carNumber" => 28.0,
            "driverName" => 120.0,
            "gap" => 48.0,
            _ => 62.0,
        },
    };
    let total = selected.iter().map(|c| weight(c)).sum::<f32>().max(1.0);
    let mut x = 0.0;
    selected
        .into_iter()
        .enumerate()
        .map(|(index, c)| {
            let w = WIDTH * weight(c) / total;
            let default_align = c.style.align.is_none();
            let result = Column {
                index,
                metric: c.metric_id.clone(),
                x,
                w,
                centered: c.style.align.as_deref() == Some("center")
                    || default_align
                        && ["position", "class", "carNumber"].contains(&c.metric_id.as_str()),
                left: c.style.align.as_deref() == Some("left")
                    || default_align && c.metric_id == "driverName",
                font: font(
                    if c.metric_id == "driverName" {
                        14.0
                    } else if c.metric_id == "gap" {
                        16.0
                    } else {
                        13.0
                    },
                    if c.metric_id == "driverName" {
                        700
                    } else {
                        600
                    },
                    -0.02,
                ),
                name_mode: c.format.mode.clone(),
                max_chars: c.format.max_chars.unwrap_or(16).min(64),
            };
            x += w;
            result
        })
        .collect()
}
fn legacy_columns() -> Vec<Column> {
    [
        ("position", 0.0, 30.0, 13.0, 600, -0.02),
        ("carNumber", 38.0, 30.0, 11.0, 600, -0.02),
        ("driverName", 68.0, 232.0, 14.0, 700, -0.025),
        ("gap", 300.0, 64.0, 16.0, 650, -0.02),
        ("bestLap", 364.0, 106.0, 13.0, 600, -0.02),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (metric, x, w, size, weight, tracking))| Column {
        index,
        metric: metric.into(),
        x,
        w,
        centered: ["position", "carNumber"].contains(&metric),
        left: metric == "driverName",
        font: font(size, weight, tracking),
        name_mode: String::new(),
        max_chars: usize::MAX,
    })
    .collect()
}

fn footer_rows(cells: &[InfoCell]) -> usize {
    if cells.len() <= 5 {
        return usize::from(!cells.is_empty());
    }
    (cells
        .iter()
        .map(|c| c.label.chars().count() as f32 * 5.5 + c.value.chars().count() as f32 * 7.5 + 26.0)
        .sum::<f32>()
        / (WIDTH - 24.0))
        .ceil() as usize
}
fn footer(cells: &[InfoCell], height: f32) -> El {
    let estimated = cells
        .iter()
        .map(|c| c.label.chars().count() as f32 * 5.5 + c.value.chars().count() as f32 * 7.5 + 12.0)
        .sum::<f32>()
        + 14.0 * cells.len().saturating_sub(1) as f32;
    let factor = if cells.len() <= 5 {
        ((WIDTH - 24.0) * 0.97 / estimated.max(1.0)).min(1.0)
    } else {
        1.0
    };
    let lf = font(9.0 * factor, 600, 0.1);
    let vf = font(11.0 * factor, 650, -0.01);
    let mut lines: Vec<Vec<(&InfoCell, f32)>> = vec![Vec::new()];
    let mut used = 0.0;
    for cell in cells {
        let w = width(&cell.label, lf) + 6.0 + width(&cell.value, vf);
        if cells.len() > 5 && used > 0.0 && used + 14.0 + w > WIDTH - 24.0 {
            lines.push(Vec::new());
            used = 0.0;
        }
        if let Some(line) = lines.last_mut() {
            line.push((cell, w));
        }
        used += w + if used > 0.0 { 14.0 } else { 0.0 };
    }
    let top = height - (16.0 + vf.size + lines.len().saturating_sub(1) as f32 * (vf.size + 4.0));
    let mut result = el()
        .pin(Some(0.0), Some(0.0), None, None)
        .key("footer")
        .child(rect(0.0, top, WIDTH, 1.0, color(INK, 0.1)));
    for (line_index, line) in lines.iter().enumerate() {
        let mut x = (WIDTH
            - line.iter().map(|(_, w)| w).sum::<f32>()
            - 14.0 * line.len().saturating_sub(1) as f32)
            / 2.0;
        let base =
            top + 8.0 + (vf.size * 1984.0 / 2048.0).round() + line_index as f32 * (vf.size + 4.0);
        for (index, (cell, w)) in line.iter().enumerate() {
            result = result
                .child(label(
                    &cell.label,
                    x,
                    base,
                    lf,
                    color(MUTED, alpha(cell.stale)),
                ))
                .child(
                    label(
                        &cell.value,
                        x + width(&cell.label, lf) + 6.0,
                        base,
                        vf,
                        color(INK, alpha(cell.stale)),
                    )
                    .key(format!("footer-{line_index}-{index}")),
                );
            x += w + 14.0;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relative::scene::{Alert, AlertKind, Motion, Scene as Visual, Timing};
    use rune::{Cx, Env, Runtime};
    use std::sync::Arc;
    use vantare_domain::{
        CarId, Snapshot,
        format::{Language, Preferences},
        relative::{Board, Row, Side},
        widget_settings::columns::{ColumnSetting, Format},
    };

    /// Foto del Board con la misma forma que el fixture de GPUI, sin otro simulador.
    fn board(ahead: usize, behind: usize) -> Board {
        let mut board =
            vantare_domain::relative::project(&Snapshot::default(), Preferences::default());
        board.track = "SPA-FRANCORCHAMPS".into();
        board.player_badge = "P4".into();
        board.status = None;
        board.player_present = true;
        board.source_state = vantare_domain::SourceState::Live;
        board.session.clear();
        board.remaining.clear();
        board.air.clear();
        board.track_temperature.clear();
        board.wind.clear();
        board.slots = (0..ahead + behind + 1)
            .map(|slot| {
                let side = match slot.cmp(&ahead) {
                    std::cmp::Ordering::Less => Side::Ahead,
                    std::cmp::Ordering::Equal => Side::Player,
                    std::cmp::Ordering::Greater => Side::Behind,
                };
                let mut row = Row::default();
                row.id = CarId(slot as u32);
                row.side = side;
                row.position = "12".into();
                row.number = "99".into();
                row.driver = "André Lotterer".into();
                row.class = "Hypercar".into();
                row.gap = "+1.20".into();
                row.best_lap = "2:01.456".into();
                row.last_lap = "2:02.789".into();
                row.lap_delta = Some(-2);
                Some(Arc::new(row))
            })
            .collect();
        board
    }

    struct Input {
        board: Board,
        settings: Settings,
        language: Language,
    }
    fn input(settings: Settings) -> Input {
        let board = board(settings.range_ahead, settings.range_behind);
        Input {
            board,
            settings,
            language: Language::Es,
        }
    }
    fn draw(input: &Input, _: &mut Cx<Input>) -> El {
        view(&input.board, &input.settings, input.language)
    }
    fn runtime(input: Input, scale: f32) -> Runtime<Input> {
        let size = natural_size(&input.settings);
        let mut rt = Runtime::with_text(
            input,
            draw,
            size,
            Env::new(true, scale),
            rune::text::TextSystem::new(kit::FONTS, ("Inter W400", "Inter W400")),
        );
        rt.transparent = true;
        rt.frame(0.0);
        rt.settle_all();
        rt.frame(0.0);
        rt
    }
    fn col(metric: &str) -> ColumnSetting {
        ColumnSetting {
            metric_id: metric.into(),
            ..ColumnSetting::default()
        }
    }
    fn timing() -> Timing {
        Timing {
            reorder: 0.28,
            fade: 0.2,
            flash: 0.5,
            pulse: 1.2,
        }
    }
    /// Vista asentada: las coordenadas del layout y una fila por slot ocupado.
    fn visual(board: Arc<Board>, settings: &Settings, paused: bool) -> Visual {
        let rows = board
            .slots
            .iter()
            .zip(targets(&board, settings))
            .filter_map(|(row, slot)| {
                row.as_ref().map(|row| VisualRow {
                    row: row.clone(),
                    slot,
                    opacity: 1.0,
                    alert: None,
                    traffic_opacity: 0.0,
                })
            })
            .collect();
        Visual {
            board,
            rows,
            strip: Vec::new(),
            paused,
        }
    }

    #[test]
    fn long_track_and_driver_names_elide_once_with_the_loaded_font_metrics() {
        let long = "INTERNATIONAL MOTORSPORT DRIVER NAME "
            .repeat(12)
            .trim_end()
            .to_owned();
        for scale in [1.0] {
            let mut state = input(Settings::eficiencia());
            state.board.track = long.clone();
            Arc::make_mut(state.board.slots[0].as_mut().expect("driver")).driver = long.clone();
            let mut rt = runtime(state, scale);
            rt.set_font_smoothing(rune::text::FontSmoothing::Off);
            rt.frame(0.0);
            let elements = rt.elements();
            for key in ["track-name", "car-0-cell-2"] {
                let painted = elements
                    .iter()
                    .find(|e| e.key.as_deref() == Some(key))
                    .expect("text")
                    .text
                    .clone()
                    .expect("texto pintado");
                assert!(long.starts_with(painted.trim_end_matches('…')), "{key}");
                assert_eq!(painted.matches('…').count(), 1, "{key}: una sola elipsis");
            }
        }
    }

    #[test]
    fn shared_scene_paints_coordinates_alert_strength_and_the_pause_band() {
        let state = input(Settings::eficiencia());
        let board = Arc::new(state.board.clone());
        let scene = Visual {
            rows: vec![VisualRow {
                row: board.slots[0].as_ref().expect("driver").clone(),
                slot: 71.25,
                opacity: 0.25,
                alert: Some(Alert {
                    kind: AlertKind::Gain,
                    opacity: 0.5,
                }),
                traffic_opacity: 0.75,
            }],
            board,
            strip: Vec::new(),
            paused: true,
        };
        for scale in [1.0, 1.25, 1.5] {
            let size = natural_size(&state.settings);
            let mut rt = Runtime::with_text(
                (scene.clone(), state.settings.clone()),
                |(scene, settings): &(Visual, Settings), _| {
                    view_scene(scene, settings, Language::Es)
                },
                (size.0, size.1 + 22.0),
                Env::new(true, scale),
                rune::text::TextSystem::new(kit::FONTS, ("Inter W400", "Inter W400")),
            );
            rt.frame(0.0);
            rt.settle_all();
            rt.frame(0.0);
            assert_eq!(rt.presented("car-0").expect("driver row").0[1], 71.25);
            assert_eq!(
                rt.presented("pause-band").expect("pause band").0,
                [0.0, size.1, size.0, 22.0]
            );
            assert!(
                rt.elements()
                    .iter()
                    .any(|e| e.fill == color(0x7fb686, 0.02)),
                "la fuerza del aviso se muestrea aparte de la opacidad de la fila"
            );
            assert_eq!(rt.state.0, scene, "the Look never advances motion");
            for _ in 0..30 {
                assert!(!rt.frame(1.0));
            }
        }
    }

    #[test]
    fn legacy_text_class_quality_and_translated_lap_badge_use_canonical_values() {
        let mut state = input(Settings::eficiencia());
        Arc::make_mut(state.board.slots[0].as_mut().unwrap()).gap_stale = true;
        let rt = runtime(state, 1.0);
        let elements = rt.elements();
        let cell = |key: &str| {
            elements
                .iter()
                .find(|e| e.key.as_deref() == Some(key))
                .unwrap()
        };
        assert_eq!(cell("car-0-cell-2").text.as_deref(), Some("ANDRÉ LOTTERER"));
        assert_eq!(cell("car-0-cell-3").text.as_deref(), Some("+1.20"));
        assert_eq!(cell("car-0-cell-4").text.as_deref(), Some("2:01.456"));
        assert_eq!(cell("car-0-lap-delta").text.as_deref(), Some("−2 V"));
        assert!((cell("car-0-cell-3").text_color.unwrap().a - 0.6).abs() < 0.001);
        assert!(
            rt.presented("car-3-lap-delta").is_none(),
            "el jugador no lleva badge de vuelta"
        );
        assert!(
            elements
                .iter()
                .any(|e| e.fill == color(class_color("Hypercar"), 1.0) && e.rect[2] == 3.0),
            "la clase se compara en mayúsculas"
        );
        let mut english = input(Settings::eficiencia());
        english.language = Language::En;
        assert!(
            runtime(english, 1.0)
                .elements()
                .iter()
                .any(|e| e.text.as_deref() == Some("−2 L"))
        );
    }

    #[test]
    fn configured_columns_filter_disabled_unknown_and_format_names_and_last_lap() {
        let settings = Settings {
            columns: Some(vec![
                ColumnSetting {
                    format: Format {
                        mode: "initial".into(),
                        ..Format::default()
                    },
                    ..col("driverName")
                },
                col("lastLap"),
                ColumnSetting {
                    enabled: false,
                    ..col("gap")
                },
                col("future"),
            ]),
            ..Settings::eficiencia()
        };
        let cols = columns(settings.columns.as_ref().unwrap());
        assert_eq!(cols.len(), 2);
        assert!((cols.iter().map(|c| c.w).sum::<f32>() - WIDTH).abs() < 0.001);
        let rt = runtime(input(settings), 1.0);
        let cells = rt.elements();
        assert!(
            cells
                .iter()
                .any(|e| e.text.as_deref() == Some("A. LOTTERER"))
        );
        assert!(cells.iter().any(|e| e.text.as_deref() == Some("2:02.789")));
        assert!(!cells.iter().any(|e| e.text.as_deref() == Some("+1.20")));
    }

    #[test]
    fn original_gpui_snapshot_uses_domain_projection_and_the_same_capture_view() {
        let snapshot = vantare_ipc::snapshot_from_saved_json(include_str!(
            "../../ui/fixtures/relative.snapshot.json"
        ))
        .expect("fixture guardado del Relative GPUI");
        for (ahead, behind, same_class) in [(3, 3, false), (3, 3, true)] {
            let settings = Settings {
                range_ahead: ahead,
                range_behind: behind,
                class_scope: if same_class { "sameClass" } else { "all" }.into(),
                ..Settings::eficiencia()
            };
            let board = vantare_domain::relative::project_cached(
                &snapshot,
                Preferences::default(),
                vantare_domain::relative::Content {
                    range_ahead: ahead,
                    range_behind: behind,
                    same_class,
                    include_player: true,
                },
                &[],
                None,
            );
            assert!(board.status.is_none());
            assert_eq!(board.track, "SEBRING", "el rótulo lo normaliza domain");
            assert!(board.slots.iter().flatten().any(|r| r.side == Side::Player));
            {
                let scale = 1.0;
                let rt = runtime(
                    Input {
                        board: (*board).clone(),
                        settings: settings.clone(),
                        language: Language::Es,
                    },
                    scale,
                );
                let elements = rt.elements();
                assert!(
                    elements
                        .iter()
                        .any(|e| e.text.as_deref() == Some("SEBRING"))
                );
                assert!(
                    elements
                        .iter()
                        .any(|e| e.key.as_deref() == Some("player-badge"))
                );
                assert!(
                    elements
                        .iter()
                        .any(|e| e.key.as_deref() == Some("relative-eficiencia"))
                );
            }
        }
    }

    #[test]
    fn constants_and_fonts_are_the_gpui_ones() {
        let _fonts = rune::text::with_families("Inter W400", "Inter W400");
        assert_eq!((WIDTH, BAND, FOOTER, ROW), (470.0, 36.0, 38.0, 29.0));
        assert_eq!(PAUSE_HEIGHT, 22.0, "banda del anfitrión de GPUI");
        assert_eq!(natural_size(&Settings::eficiencia()), (470.0, 277.0));
        let legacy = legacy_columns();
        assert_eq!(
            legacy.iter().map(|c| c.metric.as_str()).collect::<Vec<_>>(),
            ["position", "carNumber", "driverName", "gap", "bestLap"]
        );
        assert_eq!(
            legacy.iter().map(|c| (c.x, c.w)).collect::<Vec<_>>(),
            [
                (0.0, 30.0),
                (38.0, 30.0),
                (68.0, 232.0),
                (300.0, 64.0),
                (364.0, 106.0)
            ]
        );
        assert_eq!(
            legacy.iter().map(|c| c.font.size).collect::<Vec<_>>(),
            [13.0, 11.0, 14.0, 16.0, 13.0]
        );
        assert!((legacy[2].font.tracking - (-0.025 * 14.0)).abs() < 1e-6);
        for (class, rgb) in [
            ("hypercar", 0xc1121f),
            ("LMP2", 0x0055a4),
            ("lmp3", 0xf59e0b),
            ("LMGT3", 0x2ecc71),
            ("desconocida", 0x6b7280),
        ] {
            assert_eq!(class_color(class), rgb, "{class}");
        }
    }

    #[test]
    fn one_visible_change_repaints_and_the_shared_flip_leaves_no_clock() {
        let settings = Settings::eficiencia();
        let board = Arc::new(board(3, 3));
        let still = visual(board.clone(), &settings, false);
        let mut painter = Painter::new(&settings, Preferences::default(), &still);
        assert!(
            !painter.sync(&still).build,
            "la escena retenida no recompone"
        );
        let mut moved = still.clone();
        moved.rows[0].slot += ROW;
        assert!(painter.sync(&moved).build, "una fila distinta recompone");
        assert!(!painter.sync(&moved).build, "y solo una vez");
        let mut same_board = moved.clone();
        same_board.board = board.clone();
        assert_eq!(
            same_board, moved,
            "la foto y su contador no forman parte de la estructura"
        );

        let positions = targets(&board, &settings);
        let mut order = positions.clone();
        order.swap(0, 1);
        let mut motion = Motion::new(timing(), false, 5, 0.0);
        motion.update(&board, &positions, true, 0.0);
        assert_eq!(motion.next_wake(0.0, false), None, "asentado sin reloj");
        motion.update(&board, &order, false, 1.0);
        assert!(
            motion.next_wake(1.0, false).is_some(),
            "mientras dura la reordenación hay reloj"
        );
        motion.advance(&board, 2.0);
        assert_eq!(
            motion.next_wake(2.0, false),
            None,
            "cero despertares al acabar"
        );
        assert!(
            crate::relative::scene::visual_rows(&motion, 2.0)
                .iter()
                .all(|row| row.opacity == 1.0)
        );
        let mut reduced = Motion::new(timing(), true, 5, 0.0);
        reduced.update(&board, &positions, true, 0.0);
        reduced.update(&board, &order, false, 1.0);
        assert_eq!(
            reduced.next_wake(1.0, false),
            None,
            "movimiento reducido sin reloj"
        );
        assert!(
            crate::relative::scene::visual_rows(&reduced, 1.0)
                .iter()
                .all(|row| row.opacity == 1.0)
        );
    }
}
