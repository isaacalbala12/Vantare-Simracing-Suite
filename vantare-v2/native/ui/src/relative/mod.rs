//! Renderer Relative Eficiencia, sobre el kit común y la geometría congelada.
//! La proyección usa las señales relativas v4 del núcleo.

mod motion;

use crate::app::{Paint, Wake};
use crate::efficiency::text::{self, Ink, ink};
use crate::efficiency::{col, paint_rect, rect, tokens};
use gpui::{
    App, BorderStyle, ContentMask, Corners, Edges, Window, linear_color_stop, linear_gradient, px,
    quad,
};
use motion::{Motion, Visual};
use std::time::Instant;
use vantare_domain::{
    Snapshot,
    format::{Language, Preferences},
    relative::{self, Side, ViewModel},
};

pub const SIZE: (f32, f32) = (304.0, 285.0);
const SCALE: f32 = SIZE.0 / 430.0;
const BAND: f32 = 30.0 * SCALE;
const ROW: f32 = 28.0 * SCALE;
// Tabla fixed: colgroup 20/6/36/90/60/60 distribuido en todo el ancho.
const EDGES: [f32; 7] = [0.0, 20.0, 26.0, 62.0, 152.0, 212.0, 272.0];

empty_settings!();

pub(crate) struct Widget {
    vm: ViewModel,
    motion: Motion,
    boundary: Option<(u64, u64, Preferences)>,
}

impl Widget {
    pub(crate) fn new(_settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: relative::project(&Snapshot::default(), prefs),
            motion: Motion::default(),
            boundary: None,
        }
    }

    #[allow(clippy::unused_self)] // Contrato del registro.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let next = relative::project(snapshot, prefs);
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
        crate::app::replace_if_changed(&mut self.vm, next) || interrupted
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
        (
            Box::new(move |window, cx| paint(&vm, &rows, prefs, window, cx)),
            wake,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.motion.animating(Instant::now())
    }
}

fn paint(vm: &ViewModel, rows: &[Visual], prefs: Preferences, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
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
        item(window, cx, 12.0 * SCALE, 0.0, label, &vm.track);
        let font = ink(11.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
        let x = width - 12.0 * SCALE - text::width(window, &vm.player_badge, &font);
        text::draw(window, cx, &vm.player_badge, x, 18.5 * SCALE, &font);
    }
    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(0.0, top, width, height - BAND - top),
        }),
        |window| {
            for row in rows {
                paint_row(row, top, prefs.language, window, cx);
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
    if !visible.is_empty() {
        let y = height - BAND;
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
    let label_font = ink(9.0 * SCALE, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let font = ink(11.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
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
    let label_font = ink(9.0 * SCALE, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let font = ink(11.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
    let advance = if label.is_empty() {
        0.0
    } else {
        text::width(window, label, &label_font) + 6.0 * SCALE
    };
    text::draw(window, cx, label, x, y + 18.5 * SCALE, &label_font);
    text::draw(window, cx, value, x + advance, y + 18.5 * SCALE, &font);
}

fn paint_row(visual: &Visual, top: f32, language: Language, window: &mut Window, cx: &mut App) {
    let row = &visual.row;
    let y = top + visual.y * ROW;
    let opacity = visual.opacity;
    let player = row.side == Side::Player;
    if player {
        paint_rect(window, 0.0, y, SIZE.0, ROW, col(0xbfc2ca, 0.23 * opacity));
        window.paint_quad(quad(
            rect(0.0, y, SIZE.0, ROW),
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
        paint_rect(window, 0.0, y, SIZE.0, ROW, col(color, alpha * opacity));
    }
    if visual.y < 6.0 {
        let (color, alpha) = if player {
            (0xffffff, 0.08)
        } else {
            (tokens::INK, 0.1)
        };
        line(window, y + ROW - SCALE, color, alpha * opacity);
    }
    let edges = EDGES.map(|x| x * SIZE.0 / 272.0);
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
        y + 18.25 * SCALE,
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
        y + 7.0 * SCALE,
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
        y + 17.75 * SCALE,
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
    // Baseline de la línea de 21px centrada en la fila CSS de 28px.
    text::draw(window, cx, &value, edges[3], y + 20.0 * SCALE, &name);
    if let Some(value) = badge {
        let x = edges[4] - 10.0 * SCALE - badge_width;
        window.paint_quad(quad(
            rect(x, y + 7.0 * SCALE, badge_width, 14.0 * SCALE),
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
        13.0 * SCALE,
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
        y + 18.25 * SCALE,
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
        y + 18.25 * SCALE,
        &lap,
        false,
    );
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
    let fitted = text::fit(window, value, font, right - left - 20.0 * SCALE);
    let width = text::width(window, &fitted, font);
    let x = if centered {
        (left + right - width) / 2.0
    } else {
        right - 10.0 * SCALE - width
    };
    text::draw(window, cx, &fitted, x, baseline, font);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn unchanged_drawing_does_not_repaint_and_first_snapshot_is_quiet() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings, prefs);
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
        let mut widget = Widget::new(&Settings, prefs);
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
