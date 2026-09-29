//! Broadcast Tower Eficiencia, composición horizontal de 1920 × 71 px.
//! Geometría y tipografía de `BroadcastTowerFunctional`; primitivas del kit.

mod motion;

use crate::app::{Paint, Wake};
use crate::efficiency::{
    self, col, paint_rect, rect,
    text::{self, ink},
    tokens,
};
use gpui::{
    App, BorderStyle, ContentMask, Corners, Edges, PathBuilder, Window, linear_color_stop,
    linear_gradient, point, px, quad,
};
use motion::{Card, Motion};
use std::time::Instant;
use vantare_domain::{
    FlagKind, SessionId, Snapshot,
    broadcast_tower::{self, Accent, Status, ViewModel},
    format::{Language, Preferences},
};

const SIZE: (f32, f32) = (1920.0, 71.0);

pub(crate) struct Widget {
    vm: ViewModel,
    motion: Motion,
    boundary: Option<(u64, SessionId)>,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: broadcast_tower::project(&Snapshot::default(), prefs),
            motion: Motion::default(),
            boundary: None,
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let next = broadcast_tower::project(snapshot, prefs);
        let boundary = (snapshot.epoch, snapshot.state.session.id);
        let changed = self.vm != next;
        let was_animating = self.motion.wake(Instant::now()) != Wake::Idle;
        if self.boundary == Some(boundary) {
            self.motion.ingest(&self.vm, &next, Instant::now());
        } else {
            self.motion.reset(&next, Instant::now());
        }
        self.boundary = Some(boundary);
        self.vm = next;
        changed || (was_animating && self.motion.wake(Instant::now()) == Wake::Idle)
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        let vm = self.vm.clone();
        let cards = self.motion.frame(now);
        (
            Box::new(move |window, cx| paint(&vm, &cards, prefs, window, cx)),
            self.motion.wake(now),
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.motion.wake(Instant::now()) != Wake::Idle
    }
}

fn label(language: Language, es: &'static str, en: &'static str) -> &'static str {
    match language {
        Language::Es => es,
        Language::En => en,
    }
}

fn paint(vm: &ViewModel, cards: &[Card], prefs: Preferences, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    efficiency::paint_panel(window, width, height, 0.87);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));
    paint_flag(window, vm.flag.as_ref());

    let session_ink = ink(8.0, 600.0, 0.16, col(tokens::MUTED, 1.0));
    let lap_ink = ink(17.0, 700.0, -0.02, col(tokens::INK, 1.0));
    let total_ink = ink(10.0, 600.0, -0.02, col(tokens::MUTED, 1.0));
    let weather_ink = ink(8.0, 600.0, 0.12, col(tokens::MUTED, 1.0));
    let lap = format!("{} {}", label(prefs.language, "VUELTA", "LAP"), vm.lap);
    let total = vm
        .total_laps
        .map_or_else(String::new, |laps| format!("/{laps}"));
    let lap_width = text::width(window, &lap, &lap_ink);
    let total_width = if total.is_empty() {
        0.0
    } else {
        1.0 + text::width(window, &total, &total_ink)
    };
    let lead = (lap_width + total_width).max(text::width(window, &vm.session, &session_ink)) + 29.0;
    let weather = format!("{} {}", label(prefs.language, "PISTA", "TRACK"), vm.weather);
    let side = text::width(window, &weather, &weather_ink) + 29.0;
    let stream_end = width - side;
    paint_rect(window, lead - 1.0, 0.0, 1.0, height, col(tokens::INK, 0.10));
    paint_rect(window, stream_end, 0.0, 1.0, height, col(tokens::INK, 0.10));
    text::draw(
        window,
        cx,
        &vm.session,
        14.0,
        text::baseline(21.0, 8.0, 8.0),
        &session_ink,
    );
    let lap_base = text::baseline(33.0, 17.0, 17.0);
    text::draw(window, cx, &lap, 14.0, lap_base, &lap_ink);
    text::draw(
        window,
        cx,
        &total,
        14.0 + lap_width + 1.0,
        lap_base,
        &total_ink,
    );
    text::draw(
        window,
        cx,
        &weather,
        stream_end + 15.0,
        text::baseline(31.5, 8.0, 8.0),
        &weather_ink,
    );

    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(lead, 0.0, stream_end - lead, height),
        }),
        |window| {
            if vm.status == Status::Ready && !vm.rows.is_empty() {
                let count = vm.rows.len() as f32;
                let inner = (stream_end - lead - count + 1.0) / count;
                for card in cards {
                    let border = if card.slot >= 0.5 { 1.0 } else { 0.0 };
                    let left = lead + card.slot * (inner + 1.0) - border;
                    paint_card(card, left, inner + border, border, window, cx);
                }
            } else {
                let status = broadcast_tower::status_text(vm.status, prefs.language);
                let style = ink(9.0, 600.0, 0.14, col(tokens::MUTED, 1.0));
                let x = lead + (stream_end - lead - text::width(window, status, &style)) / 2.0;
                text::draw(
                    window,
                    cx,
                    status,
                    x,
                    text::baseline(31.0, 9.0, 9.0),
                    &style,
                );
            }
        },
    );
    efficiency::paint_frame(window, width, height);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0),
        Corners {
            top_left: px(6.0),
            top_right: px(6.0),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0, 0.0),
        Edges {
            top: px(1.0),
            ..Edges::all(px(0.0))
        },
        col(0xffffff, 0.24),
        BorderStyle::default(),
    ));
}

fn paint_card(card: &Card, x: f32, width: f32, border: f32, window: &mut Window, cx: &mut App) {
    let alpha = card.opacity;
    let color = |hex, opacity| col(hex, opacity * alpha);
    if card.row.is_player {
        paint_rect(
            window,
            x + border,
            0.0,
            width - border,
            SIZE.1,
            color(0xbfc2ca, 0.23),
        );
        paint_rect(
            window,
            x + border,
            0.0,
            width - border,
            1.0,
            color(0xffffff, 0.13),
        );
        paint_rect(
            window,
            x + border,
            SIZE.1 - 1.0,
            width - border,
            1.0,
            color(0xffffff, 0.08),
        );
    }
    paint_rect(window, x, 0.0, border, SIZE.1, color(tokens::INK, 0.10));
    let cue_color = if card.cue > 0.0 {
        0x7fb686
    } else {
        tokens::LOSS
    };
    paint_rect(
        window,
        x + border,
        0.0,
        width - border,
        SIZE.1,
        color(cue_color, card.cue.abs() * 0.05),
    );
    let place_ink = ink(15.0, 650.0, 0.0, color(tokens::MUTED, 1.0));
    let gap_ink = ink(10.0, 650.0, 0.0, color(tokens::MUTED, 1.0));
    let name_ink = ink(12.0, 700.0, -0.01, color(tokens::INK, 1.0));
    let number_ink = ink(8.0, 600.0, 0.08, color(tokens::MUTED, 1.0));
    let (badge, badge_text) = match card.row.accent {
        Accent::Red => (0xe63946, 0xffffff),
        Accent::Blue => (0x5b8bd6, 0xffffff),
        Accent::Amber => (0xe2c568, 0x151612),
        Accent::Neutral => (0x8b93a7, 0xffffff),
    };
    let badge_ink = ink(7.0, 700.0, 0.0, color(badge_text, 1.0));
    let place = card
        .row
        .place
        .map_or_else(|| "—".into(), |place| place.to_string());
    let left = x + border + 12.0;
    let identity = left + text::width(window, &place, &place_ink) + 9.0;
    let gap_x = x + width - 12.0 - text::width(window, &card.row.gap, &gap_ink);
    text::draw(
        window,
        cx,
        &place,
        left,
        text::baseline(28.0, 15.0, 15.0),
        &place_ink,
    );
    let name = text::fit(
        window,
        &card.row.name,
        &name_ink,
        (gap_x - identity - 9.0).max(0.0),
    );
    let has_class = !card.row.class.is_empty() && card.row.class != "—";
    let has_number = !card.row.number.is_empty() && card.row.number != "—";
    let sub_height = if has_class {
        11.0
    } else if has_number {
        8.0
    } else {
        0.0
    };
    let name_top = (SIZE.1 - 12.0 - 4.0 - sub_height) / 2.0;
    text::draw(
        window,
        cx,
        &name,
        identity,
        text::baseline(name_top, 12.0, 12.0),
        &name_ink,
    );
    let sub_top = name_top + 16.0;
    let mut number_x = identity;
    if has_class {
        let badge_width = text::width(window, &card.row.class, &badge_ink) + 8.0;
        window.paint_quad(quad(
            rect(identity, sub_top, badge_width, 11.0),
            Corners::all(px(3.0)),
            color(badge, 1.0),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        text::draw(
            window,
            cx,
            &card.row.class,
            identity + 4.0,
            text::baseline(sub_top + 2.0, 7.0, 7.0),
            &badge_ink,
        );
        number_x += badge_width + 6.0;
    }
    if has_number {
        text::draw(
            window,
            cx,
            &format!("#{}", card.row.number),
            number_x,
            text::baseline(sub_top + (sub_height - 8.0) / 2.0, 8.0, 8.0),
            &number_ink,
        );
    }
    text::draw(
        window,
        cx,
        &card.row.gap,
        gap_x,
        text::baseline(30.5, 10.0, 10.0),
        &gap_ink,
    );
}

// El kit no tiene todavía bandas diagonales ni colores de bandera; quedan locales.
fn paint_flag(window: &mut Window, flag: Option<&FlagKind>) {
    let rgb = match flag {
        Some(FlagKind::Green) => 0x29c36f,
        Some(FlagKind::Yellow) => 0xffd03d,
        Some(FlagKind::Blue) => 0x4391ff,
        Some(FlagKind::Red) => 0xef303e,
        Some(FlagKind::White) => 0xffffff,
        Some(FlagKind::Black) => 0x0c0c0e,
        Some(FlagKind::Checkered) => 0xd1d1d6,
        _ => 0xb1b4bc,
    };
    let angle = 131.0_f32.to_radians();
    let (nx, ny) = (angle.sin(), -angle.cos());
    let extent = nx * 130.0 + ny * SIZE.1;
    for (start, end, alpha) in [(0.37, 0.54, 0.28), (0.62, 0.79, 0.17)] {
        let band = |poly: Vec<(f32, f32)>| {
            clip(
                &clip(&poly, nx, ny, start * extent),
                -nx,
                -ny,
                -end * extent,
            )
        };
        if matches!(flag, Some(FlagKind::Checkered)) {
            for y in 0..12 {
                for x in 0..22 {
                    let (x0, y0) = (x as f32 * 6.0, y as f32 * 6.0);
                    let poly = band(vec![
                        (x0, y0),
                        ((x0 + 6.0).min(130.0), y0),
                        ((x0 + 6.0).min(130.0), (y0 + 6.0).min(SIZE.1)),
                        (x0, (y0 + 6.0).min(SIZE.1)),
                    ]);
                    polygon(
                        window,
                        &poly,
                        if (x + y) % 2 == 0 { 0xd1d1d6 } else { 0x191a1d },
                        0.5,
                    );
                }
            }
        } else {
            let poly = band(vec![
                (0.0, 0.0),
                (130.0, 0.0),
                (130.0, SIZE.1),
                (0.0, SIZE.1),
            ]);
            if matches!(flag, Some(FlagKind::Black)) {
                let outline: Vec<_> = poly.iter().map(|(x, y)| (x + 1.0, *y)).collect();
                polygon(window, &outline, 0xa4a4aa, alpha);
            }
            polygon(window, &poly, rgb, alpha);
        }
    }
}

fn clip(poly: &[(f32, f32)], nx: f32, ny: f32, d: f32) -> Vec<(f32, f32)> {
    let mut out = Vec::new();
    for (i, a) in poly.iter().enumerate() {
        let b = poly[(i + 1) % poly.len()];
        let (da, db) = (nx * a.0 + ny * a.1 - d, nx * b.0 + ny * b.1 - d);
        if da >= 0.0 {
            out.push(*a);
        }
        if (da >= 0.0) != (db >= 0.0) {
            let t = da / (da - db);
            out.push((a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t));
        }
    }
    out
}

fn polygon(window: &mut Window, poly: &[(f32, f32)], rgb: u32, alpha: f32) {
    if poly.len() < 3 {
        return;
    }
    let (ox, oy) = text::origin();
    let pt = |p: (f32, f32)| point(px(p.0 + ox), px(p.1 + oy));
    let mut path = PathBuilder::fill();
    path.move_to(pt(poly[0]));
    for p in &poly[1..] {
        path.line_to(pt(*p));
    }
    path.close();
    if let Ok(path) = path.build() {
        window.paint_path(path, col(rgb, alpha));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn sequence_only_and_invisible_rows_do_not_repaint() {
        let mut widget = Widget::new(Preferences::default());
        let mut snapshot = source::synthetic(0);
        assert!(widget.ingest(&snapshot, Preferences::default()));
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        snapshot.state.cars[10].driver.name = "Invisible".into();
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        snapshot.state.cars[0].driver.name = "Visible".into();
        assert!(widget.ingest(&snapshot, Preferences::default()));
    }

    #[test]
    fn a_new_epoch_cancels_in_flight_movement_even_when_the_rows_are_identical() {
        let now = Instant::now();
        let prefs = Preferences::default();
        let mut widget = Widget::new(prefs);
        let mut snapshot = source::synthetic(0);
        widget.ingest(&snapshot, prefs);
        snapshot.state.cars[0].position = vantare_domain::Quality::Reliable(2);
        snapshot.state.cars[1].position = vantare_domain::Quality::Reliable(1);
        widget.ingest(&snapshot, prefs);
        // Reloj previo a los inicios: saturating_duration_since devuelve cero;
        // ninguna espera del scheduler puede hacer caducar esta comprobación.
        assert_eq!(widget.motion.wake(now), Wake::Frame);
        snapshot.epoch += 1;
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.motion.wake(now), Wake::Idle);
        assert!(
            widget
                .motion
                .frame(now)
                .iter()
                .all(|card| card.cue.abs() < 0.001)
        );
    }
}
