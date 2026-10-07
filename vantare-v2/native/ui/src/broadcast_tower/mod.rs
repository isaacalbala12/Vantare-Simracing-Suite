//! Broadcast Tower Eficiencia, composición horizontal de 1920 × 86 px.
//! Geometría y tipografía de `BroadcastTowerFunctional`; primitivas del kit.

mod motion;

use crate::app::{Paint, Wake};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{
    self, col, paint_rect, rect,
    text::{self, ink},
    tokens,
};
use gpui::{
    App, BorderStyle, ContentMask, Corners, Edges, PathBuilder, linear_color_stop, linear_gradient,
    point, px, quad,
};
use motion::{Card, Motion};
use std::time::Instant;
use vantare_domain::{
    FlagKind, SessionId, Snapshot,
    broadcast_tower::{self, Accent, Status, ViewModel},
    format::{Language, Preferences},
};

const SIZE: (f32, f32) = (1920.0, 86.0);

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub driver_carousel: bool,
    pub row_count: usize,
    pub show_weather: bool,
    /// SOF está desactivado también en el contrato Eficiencia productivo.
    pub show_sof: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            driver_carousel: false,
            row_count: 5,
            show_weather: true,
            show_sof: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showSof",
        "Eficiencia no ofrece SOF y Snapshot no transporta rating",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.row_count = value.row_count.clamp(3, 10);
        value.show_sof = false;
        value
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
    settings: Settings,
    carousel_start: Instant,
    motion: Motion,
    boundary: Option<(u64, SessionId)>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: broadcast_tower::project_rows(&Snapshot::default(), prefs, settings.row_count),
            settings: settings.normalized(),
            carousel_start: Instant::now(),
            motion: Motion::default(),
            boundary: None,
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let mut next = broadcast_tower::project_rows(snapshot, prefs, self.settings.row_count);
        if !self.settings.show_weather {
            next.weather.clear();
        }
        let boundary = (snapshot.epoch, snapshot.state.session.id);
        let changed = self.vm != next;
        let was_animating = self.motion.wake(Instant::now()) != Wake::Idle;
        if self.boundary == Some(boundary) {
            self.motion.ingest(&self.vm, &next, Instant::now());
        } else {
            self.motion.reset(&next, Instant::now());
            self.carousel_start = Instant::now();
        }
        self.boundary = Some(boundary);
        self.vm = next;
        changed || (was_animating && self.motion.wake(Instant::now()) == Wake::Idle)
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        let vm = self.vm.clone();
        let carousel =
            self.settings.driver_carousel && vm.status == Status::Ready && !vm.rows.is_empty();
        let cards = if carousel {
            carousel_cards(
                &vm,
                now.saturating_duration_since(self.carousel_start)
                    .as_secs_f32(),
            )
        } else {
            self.motion.frame(now)
        };
        let show_weather = self.settings.show_weather;
        (
            Box::new(move |window, cx| paint(&vm, &cards, show_weather, prefs, window, cx)),
            if carousel {
                Wake::Frame
            } else {
                self.motion.wake(now)
            },
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.motion.wake(Instant::now()) != Wake::Idle
    }
}

// La copia contigua hace el bucle de 30 s del CSS sin saltos ni una tarea propia.
fn carousel_cards(vm: &ViewModel, seconds: f32) -> Vec<Card> {
    let count = vm.rows.len() as f32;
    let offset = (seconds.rem_euclid(30.0) / 30.0) * count;
    (0..2)
        .flat_map(|copy| {
            vm.rows.iter().enumerate().map(move |(i, row)| Card {
                row: row.clone(),
                slot: i as f32 + copy as f32 * count - offset,
                opacity: 1.0,
                cue: 0.0,
            })
        })
        .collect()
}

fn label(language: Language, es: &'static str, en: &'static str) -> &'static str {
    match language {
        Language::Es => es,
        Language::En => en,
    }
}

fn paint(
    vm: &ViewModel,
    cards: &[Card],
    show_weather: bool,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
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

    let session_ink = ink(13.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
    let lap_ink = ink(17.0, 700.0, -0.02, col(tokens::INK, 1.0));
    let total_ink = ink(10.0, 600.0, -0.02, col(tokens::MUTED, 1.0));
    let weather_ink = ink(13.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
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
    let side = if show_weather {
        text::width(window, &weather, &weather_ink) + 29.0
    } else {
        0.0
    };
    let stream_end = width - side;
    paint_rect(window, lead - 1.0, 0.0, 1.0, height, col(tokens::INK, 0.10));
    paint_rect(window, stream_end, 0.0, 1.0, height, col(tokens::INK, 0.10));
    text::draw(
        window,
        cx,
        &vm.session,
        14.0,
        text::baseline(14.0, 22.0, 13.0),
        &session_ink,
    );
    let lap_base = text::baseline(36.0, 22.0, 17.0);
    text::draw(window, cx, &lap, 14.0, lap_base, &lap_ink);
    text::draw(
        window,
        cx,
        &total,
        14.0 + lap_width + 1.0,
        lap_base,
        &total_ink,
    );
    if show_weather {
        text::draw(
            window,
            cx,
            &weather,
            stream_end + 15.0,
            text::baseline(24.5, 22.0, 13.0),
            &weather_ink,
        );
    }

    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(lead, 0.0, stream_end - lead, height),
        }),
        |window| {
            if vm.status == Status::Ready && !vm.rows.is_empty() {
                let count = vm.rows.len();
                let player = vm.rows.iter().position(|row| row.is_player);
                for card in cards {
                    let (offset, card_width) =
                        card_bounds(card.slot, count, player, stream_end - lead);
                    let border = if card.slot >= 0.5 { 1.0 } else { 0.0 };
                    paint_card(
                        card,
                        lead + offset - border,
                        card_width + border,
                        border,
                        window,
                        cx,
                    );
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
    efficiency::paint_highlighted_frame(window, width, height);
}

// Rejilla continua: conserva vecinos durante interpolación y carrusel, con el jugador 1,4×.
fn card_bounds(slot: f32, count: usize, player: Option<usize>, width: f32) -> (f32, f32) {
    let count = count.max(1) as f32;
    let extra = if player.is_some() { 0.4 } else { 0.0 };
    let unit = (width - count + 1.0) / (count + extra);
    let edge = |slot: f32| {
        let cycle = (slot / count).floor();
        let local = slot - cycle * count;
        let weight = player.map_or(0.0, |index| (local - index as f32).clamp(0.0, 1.0) * 0.4);
        cycle * (width + 1.0) + (local + weight) * unit + local
    };
    let left = edge(slot);
    (left, edge(slot + 1.0) - left - 1.0)
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
    let gap_ink = ink(12.0, 650.0, 0.0, color(tokens::MUTED, 1.0));
    let name_ink = ink(16.0, 700.0, -0.01, color(tokens::INK, 1.0));
    let number_ink = ink(11.0, 600.0, 0.0, color(tokens::MUTED, 1.0));
    let (badge, badge_text) = match card.row.accent {
        Accent::Red => (0xe63946, 0xffffff),
        Accent::Blue => (0x5b8bd6, 0xffffff),
        Accent::Amber => (0xe2c568, 0x151612),
        Accent::Neutral => (0x8b93a7, 0xffffff),
    };
    let badge_ink = ink(11.0, 700.0, 0.0, color(badge_text, 1.0));
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
        text::baseline((SIZE.1 - 44.0) / 2.0, 44.0, 15.0),
        &place_ink,
    );
    let name = text::fit(
        window,
        &card.row.name,
        &name_ink,
        (x + width - 6.0 - identity).max(0.0),
    );
    let has_class = !card.row.class.is_empty() && card.row.class != "—";
    let has_number = !card.row.number.is_empty() && card.row.number != "—";
    let name_top = (SIZE.1 - 44.0) / 2.0;
    text::draw(
        window,
        cx,
        &name,
        identity,
        text::baseline(name_top, 22.0, 16.0),
        &name_ink,
    );
    let sub_top = name_top + 22.0;
    let mut number_x = identity;
    if has_class {
        let class = text::fit(
            window,
            &card.row.class,
            &badge_ink,
            (gap_x - identity - 14.0).max(0.0),
        );
        let badge_width = text::width(window, &class, &badge_ink) + 8.0;
        window.paint_quad(quad(
            rect(identity, sub_top, badge_width, 18.0),
            Corners::all(px(3.0)),
            color(badge, 1.0),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        text::draw(
            window,
            cx,
            &class,
            identity + 4.0,
            text::baseline(sub_top, 18.0, 11.0),
            &badge_ink,
        );
        number_x += badge_width + 6.0;
    }
    if has_number {
        let number = text::fit(
            window,
            &format!("#{}", card.row.number),
            &number_ink,
            (gap_x - number_x - 6.0).max(0.0),
        );
        text::draw(
            window,
            cx,
            &number,
            number_x,
            text::baseline(sub_top, 22.0, 11.0),
            &number_ink,
        );
    }
    text::draw(
        window,
        cx,
        &card.row.gap,
        gap_x,
        text::baseline(sub_top, 22.0, 12.0),
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

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            ClassGaps, Flags, Gaps, LapCount, LapTimes, PitStatus, Positions, SessionClock,
            SessionInfo, Weather,
        };
        let mut demand = crate::demand::signals(
            250,
            &[
                SessionInfo,
                SessionClock,
                Positions,
                LapTimes,
                Gaps,
                ClassGaps,
                PitStatus,
                Flags,
                LapCount,
            ],
        );
        if self.show_weather {
            demand.request(Weather, 500);
        }
        demand
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn weighted_cards_fill_the_stream_without_overlap_during_motion_and_carousel() {
        for count in 3..=10 {
            for player in 0..count {
                let (_, rival_width) =
                    card_bounds((player + 1) as f32, count, Some(player), 1600.0);
                let (_, player_width) = card_bounds(player as f32, count, Some(player), 1600.0);
                assert!((player_width / rival_width - 1.4).abs() < 0.0001);
                for slot in [-1.5, -1.0, 0.0, 0.5, player as f32, count as f32] {
                    let (left, width) = card_bounds(slot, count, Some(player), 1600.0);
                    let (next, _) = card_bounds(slot + 1.0, count, Some(player), 1600.0);
                    assert!(width > 0.0);
                    assert!((left + width + 1.0 - next).abs() < 0.001);
                }
                let (left, _) = card_bounds(0.0, count, Some(player), 1600.0);
                let (right, width) = card_bounds((count - 1) as f32, count, Some(player), 1600.0);
                assert_eq!(left, 0.0);
                assert!((right + width - 1600.0).abs() < 0.001);
            }
        }
    }

    #[test]
    fn configured_cards_weather_and_carousel_follow_product_options() {
        let prefs = Preferences::default();
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/standings.snapshot.json"))
                .expect("escena");
        for count in [3, 5, 10] {
            let mut widget = Widget::new(
                &Settings {
                    row_count: count,
                    show_weather: false,
                    driver_carousel: true,
                    ..Settings::default()
                },
                prefs,
            );
            widget.ingest(&snapshot, prefs);
            assert_eq!(widget.vm.rows.len(), count);
            assert!(widget.vm.weather.is_empty());
            let cards = carousel_cards(&widget.vm, 15.0);
            assert_eq!(cards.len(), count * 2);
            assert_eq!(cards[0].slot, -(count as f32) / 2.0);
            assert_eq!(widget.frame(prefs).1, Wake::Frame);
            let mut lost = snapshot.clone();
            lost.state.source_state = vantare_domain::SourceState::Lost;
            widget.ingest(&lost, prefs);
            assert_eq!(widget.frame(prefs).1, Wake::Idle);
        }
    }

    #[test]
    fn sequence_only_and_invisible_rows_do_not_repaint() {
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
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
        let mut widget = Widget::new(&Settings::default(), prefs);
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

    #[test]
    fn current_lap_uses_the_player_and_preserves_reference_absence() {
        let mut data = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/broadcast-tower.snapshot.json"
        ))
        .expect("escena DTO v4");
        let prefs = Preferences::default();
        assert_eq!(broadcast_tower::project(&data, prefs).lap, "—");
        let player_id = data.state.player.expect("jugador").car;
        data.state
            .cars
            .iter_mut()
            .find(|car| car.id == player_id)
            .expect("coche del jugador")
            .laps = vantare_domain::Quality::Reliable(127);
        assert_eq!(broadcast_tower::project(&data, prefs).lap, "128");
        data.state.source_state = vantare_domain::SourceState::Lost;
        assert_eq!(broadcast_tower::project(&data, prefs).lap, "—");
    }

    #[test]
    fn frozen_scene_decodes_and_preserves_the_product_texts_without_inventing_lap_or_gap() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/broadcast-tower.snapshot.json"
        ))
        .expect("escena Broadcast Tower DTO v4");
        let prefs = Preferences::default();
        let vm = broadcast_tower::project(&snapshot, prefs);
        assert_eq!(vm.status, Status::Ready);
        assert_eq!(vm.session, "CARRERA");
        assert_eq!(vm.lap, "—");
        assert_eq!(vm.total_laps, None);
        assert_eq!(vm.weather, "28°");
        assert_eq!(vm.flag, Some(FlagKind::Green));
        assert_eq!(
            snapshot.state.cars[0].gap_leader,
            vantare_domain::Quality::Unavailable
        );
        let texts: Vec<_> = vm
            .rows
            .iter()
            .map(|row| {
                (
                    row.name.as_str(),
                    row.class.as_str(),
                    row.gap.as_str(),
                    row.is_player,
                )
            })
            .collect();
        assert_eq!(
            texts,
            vec![
                ("A. LOTTERER", "HYP", "LÍDER", true),
                ("B. HANLEY", "LMP", "+1.234", false),
                ("K. ESTRE", "GTE", "+2.468", false),
                ("A. GIOVINAZZI", "HYP", "+3.702", false),
                ("F. ALBUQUERQUE", "LMP", "+4.936", false),
            ]
        );
        let mut widget = Widget::new(&Settings::default(), prefs);
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.size(), (1920.0, 86.0));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
