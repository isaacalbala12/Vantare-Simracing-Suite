//! Broadcast Tower Eficiencia, composición horizontal de 1920 × 86 px.
//! Geometría y tipografía de `BroadcastTowerFunctional`; primitivas del kit.

mod motion;

use crate::app::{Paint, Wake};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{rect, text};
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
use gpui::{App, ContentMask};
use motion::{Card, Motion};
use std::{borrow::Cow, sync::Arc, time::Instant};
use vantare_domain::{
    SessionId, Snapshot,
    broadcast_tower::{self, Accent, Status, ViewModel},
    format::Preferences,
};

const SIZE: (f32, f32) = (1400.0, 56.0);

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
            row_count: 11,
            show_weather: false,
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
        value.row_count = value.row_count.clamp(3, 11);
        value.show_sof = false;
        value
    }
}

struct PaintLabels {
    lap: String,
    intervals: Vec<Option<String>>,
}
impl PaintLabels {
    fn new(vm: &ViewModel, prefs: Preferences) -> Self {
        let timed = ["clasi", "qual", "pr"].iter().any(|prefix| {
            vm.session
                .get(..prefix.len())
                .is_some_and(|value| value.eq_ignore_ascii_case(prefix))
        });
        let lap = if timed {
            vm.remaining.clone()
        } else {
            format!(
                "{} {}{} · {}",
                if prefs.language == vantare_domain::format::Language::Es {
                    "V"
                } else {
                    "L"
                },
                vm.lap,
                vm.total_laps.map_or_else(String::new, |n| format!("/{n}")),
                vm.remaining
            )
        };
        let parse = |value: &str| {
            if matches!(value, "LÍDER" | "LEADER") {
                Some(0.0)
            } else {
                value.parse::<f32>().ok()
            }
        };
        let intervals = vm
            .rows
            .windows(2)
            .map(|pair| {
                if pair[0].class != pair[1].class {
                    return None;
                }
                let (a, b) = parse(&pair[0].gap).zip(parse(&pair[1].gap))?;
                let interval = b - a;
                (interval > 0.0 && interval < 1.0).then(|| format!("{interval:.1}"))
            })
            .collect();
        Self { lap, intervals }
    }
}

pub(crate) struct Widget {
    vm: Arc<ViewModel>,
    labels: Arc<PaintLabels>,
    settings: Settings,
    carousel_start: Instant,
    motion: Motion,
    boundary: Option<(u64, SessionId)>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let vm = broadcast_tower::project_rows(
            &Snapshot::default(),
            prefs,
            settings.normalized().row_count,
        );
        let labels = Arc::new(PaintLabels::new(&vm, prefs));
        Self {
            vm: Arc::new(vm),
            labels,
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
        let changed = self.vm.as_ref() != &next;
        let was_animating = self.motion.wake(Instant::now()) != Wake::Idle;
        if self.boundary == Some(boundary) {
            self.motion.ingest(&self.vm, &next, Instant::now());
        } else {
            self.motion.reset(&next, Instant::now());
            self.carousel_start = Instant::now();
        }
        self.boundary = Some(boundary);
        if changed {
            self.labels = Arc::new(PaintLabels::new(&next, prefs));
            self.vm = Arc::new(next);
        }
        changed || (was_animating && self.motion.wake(Instant::now()) == Wake::Idle)
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let now = Instant::now();
        let vm = self.vm.clone();
        let labels = Arc::clone(&self.labels);
        let carousel = !reduced
            && self.settings.driver_carousel
            && vm.status == Status::Ready
            && !vm.rows.is_empty();
        if reduced {
            self.motion.reset(&vm, now);
        }
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
            Box::new(move |window, cx| {
                paint(&vm, &labels, &cards, show_weather, prefs, window, cx);
            }),
            if reduced {
                Wake::Idle
            } else if carousel {
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

fn paint_status_text(
    vm: &ViewModel,
    kit: &Kit<'_>,
    mut draw: impl FnMut(crate::vantare::paint::Label<'_>),
) {
    draw(crate::vantare::paint::Label {
        value: broadcast_tower::status_text(vm.status, kit.language),
        x: 190.0,
        right: None,
        top: 18.0,
        height: 20.0,
        face: Face::Body,
        ink: kit.ink(Face::Body, 12.0, 0.0, kit.style.colors.muted.hsla()),
    });
}
type ClassGroup<'a> = (usize, &'a str, Accent);
fn card_geometry(vm: &ViewModel, show_weather: bool) -> (Vec<ClassGroup<'_>>, f32) {
    let groups: Vec<_> = vm
        .rows
        .iter()
        .enumerate()
        .filter(|(i, row)| *i == 0 || vm.rows[*i - 1].class != row.class)
        .map(|(i, row)| (i, row.class.as_str(), row.accent))
        .collect();
    let available =
        SIZE.0 - 160.0 - if show_weather { 50.0 } else { 8.0 } - groups.len() as f32 * 40.0;
    let width = (available / vm.rows.len().max(1) as f32).clamp(1.0, 118.0);
    (groups, width)
}
fn card_left(slot: f32, width: f32, groups: &[ClassGroup<'_>]) -> f32 {
    160.0 + slot * width + groups.iter().filter(|(i, _, _)| *i as f32 <= slot).count() as f32 * 40.0
}

fn paint(
    vm: &ViewModel,
    labels: &PaintLabels,
    cards: &[Card],
    show_weather: bool,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    round_rect(
        window,
        1.0,
        1.0,
        150.0,
        54.0,
        9.0,
        Color(0xffffff, 0.04).hsla(),
    );
    let title = kit.ink(Face::Display, 18.0, 1.6, Color(0xfaf7f7, 1.0).hsla());
    kit.label(
        window,
        cx,
        &vm.session,
        16.0,
        None,
        9.0,
        20.0,
        Face::Display,
        &title,
    );
    let small = kit.ink(Face::Mono, 11.0, 0.0, style.colors.muted.hsla());
    kit.label(
        window,
        cx,
        &labels.lap,
        16.0,
        None,
        32.0,
        14.0,
        Face::Mono,
        &small,
    );
    if vm.status != Status::Ready {
        paint_status_text(vm, &kit, |label| {
            label.paint(&kit, window, cx);
        });
        return;
    }
    let (class_groups, card_width) = card_geometry(vm, show_weather);
    for (index, class, accent) in &class_groups {
        let groups = class_groups.iter().filter(|(i, _, _)| i < index).count() as f32;
        let x = 160.0 + *index as f32 * card_width + groups * 40.0;
        let color = class_color(*accent);
        round_rect(window, x, 17.0, 36.0, 22.0, 3.0, Color(color, 1.0).hsla());
        let text = kit.ink(Face::Display, 11.0, 1.2, Color(0xffffff, 1.0).hsla());
        let label = if *class == "HYP" {
            "HY"
        } else if *class == "LMG" {
            "GT3"
        } else {
            class
        };
        kit.label(
            window,
            cx,
            label,
            x + 5.0,
            None,
            17.0,
            22.0,
            Face::Display,
            &text,
        );
    }
    for (i, label) in labels.intervals.iter().enumerate() {
        if let Some(label) = label {
            let groups = class_groups.iter().filter(|(n, _, _)| *n <= i).count() as f32;
            let x = 160.0 + i as f32 * card_width + groups * 40.0;
            for (dx, y, w, h) in [
                (0.0, 10.0, card_width * 2.0 - 4.0, 1.0),
                (0.0, 45.0, card_width * 2.0 - 4.0, 1.0),
                (0.0, 10.0, 1.0, 36.0),
                (card_width * 2.0 - 5.0, 10.0, 1.0, 36.0),
            ] {
                round_rect(window, x + dx, y, w, h, 0.0, Color(0xffffff, 0.22).hsla());
            }
            round_rect(
                window,
                x + card_width - 14.0,
                2.0,
                28.0,
                12.0,
                6.0,
                Color(0xf2eeee, 1.0).hsla(),
            );
            let ink = kit.ink(Face::Mono, 9.0, 0.0, Color(0x161314, 1.0).hsla());
            kit.label(
                window,
                cx,
                label,
                x + card_width - text::width(window, label, &ink) / 2.0,
                None,
                1.0,
                12.0,
                Face::Mono,
                &ink,
            );
        }
    }
    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(156.0, 1.0, SIZE.0 - 164.0, 54.0),
        }),
        |window| {
            for card in cards {
                let x = card_left(card.slot, card_width, &class_groups);
                if card.row.is_player {
                    round_rect(
                        window,
                        x,
                        10.0,
                        card_width - 4.0,
                        36.0,
                        6.0,
                        Color(0xe14a54, 0.28 * card.opacity).hsla(),
                    );
                }
                if card.cue != 0.0 {
                    round_rect(
                        window,
                        x + 4.0,
                        44.0,
                        card_width - 8.0,
                        2.0,
                        1.0,
                        Color(
                            if card.cue > 0.0 { 0x4ade80 } else { 0xff7a82 },
                            card.cue.abs(),
                        )
                        .hsla(),
                    );
                }
                let place = card.row.place.map_or_else(|| "—".into(), |p| p.to_string());
                let pos = kit.ink(Face::Display, 15.0, 0.0, style.colors.muted.hsla());
                kit.label(
                    window,
                    cx,
                    &place,
                    x + 6.0,
                    None,
                    18.0,
                    20.0,
                    Face::Display,
                    &pos,
                );
                let code = driver_code(&card.row.name);
                let name = kit.ink(
                    Face::Display,
                    16.0,
                    1.2,
                    Color(0xfaf7f7, card.opacity).hsla(),
                );
                let code = text::fit_borrowed(window, &code, &name, (card_width - 29.0).max(0.0));
                kit.label(
                    window,
                    cx,
                    &code,
                    x + 25.0,
                    None,
                    18.0,
                    20.0,
                    Face::Display,
                    &name,
                );
                let gap = kit.ink(Face::Mono, 10.0, 0.0, style.colors.value.hsla());
                let gap_text = if card.row.in_pits {
                    "BOX"
                } else if card.row.gap == "LEADER" || card.row.gap == "LÍDER" {
                    "Líder"
                } else {
                    &card.row.gap
                };
                let gap_text =
                    text::fit_borrowed(window, gap_text, &gap, (card_width - 69.0).max(0.0));
                kit.label(
                    window,
                    cx,
                    &gap_text,
                    x + 65.0,
                    None,
                    19.0,
                    18.0,
                    Face::Mono,
                    &gap,
                );
            }
        },
    );
    if show_weather {
        kit.label(
            window,
            cx,
            &vm.weather,
            0.0,
            Some(1388.0),
            20.0,
            16.0,
            Face::Mono,
            &small,
        );
    }
}
fn driver_code(name: &str) -> Cow<'_, str> {
    let surname = name.rsplit_once(". ").map_or(name, |(_, surname)| surname);
    let end = surname
        .char_indices()
        .nth(3)
        .map_or(surname.len(), |(byte, _)| byte);
    let value = &surname[..end];
    if value.chars().any(char::is_lowercase) {
        Cow::Owned(value.to_uppercase())
    } else {
        Cow::Borrowed(value)
    }
}
fn class_color(accent: Accent) -> u32 {
    match accent {
        Accent::Red => 0xe14a54,
        Accent::Blue => 0x4f8ef7,
        Accent::Amber => 0x22c55e,
        Accent::Neutral => 0x8e8587,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;
    use vantare_domain::FlagKind;

    #[test]
    fn approved_strip_has_eleven_cars_and_keeps_its_frame_when_disconnected() {
        let photos = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/broadcast-tower-design-system.sequence.json"
        ))
        .expect("demo");
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        widget.ingest(&photos[0], Preferences::default());
        assert_eq!(widget.vm.rows.len(), 11);
        assert_eq!(widget.size(), (1400.0, 56.0));
        let mut qualifying = photos[0].clone();
        qualifying.state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Qualifying);
        qualifying.state.session.remaining_s = vantare_domain::Quality::Reliable(522.0);
        widget.ingest(&qualifying, Preferences::default());
        assert_eq!(widget.vm.rows[0].gap, "3:27.046");
        assert_eq!(widget.vm.rows[1].gap, "+0.265");
        assert!(widget.vm.remaining.ends_with("8:42"));
        assert_eq!(driver_code("A. PIER GUIDI"), "PIE");
        let mut lost = photos[0].clone();
        lost.state.source_state = vantare_domain::SourceState::Lost;
        widget.ingest(&lost, Preferences::default());
        assert_eq!(widget.size(), (1400.0, 56.0));
    }

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
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/standings.snapshot.json"
        ))
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
            assert_eq!(widget.frame(prefs, false).1, Wake::Frame);
            assert_eq!(widget.frame(prefs, true).1, Wake::Idle);
            assert_eq!(widget.frame(prefs, false).1, Wake::Frame);
            let mut lost = snapshot.clone();
            lost.state.source_state = vantare_domain::SourceState::Lost;
            widget.ingest(&lost, prefs);
            assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
        }
    }

    #[test]
    fn sequence_only_and_invisible_rows_do_not_repaint() {
        let mut widget = Widget::new(
            &Settings {
                row_count: 5,
                ..Settings::default()
            },
            Preferences::default(),
        );
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
        let mut data = vantare_ipc::snapshot_from_fixture_json(include_str!(
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
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
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
        assert_eq!(widget.size(), (1400.0, 56.0));
        assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}

#[cfg(test)]
mod render_contract_tests {
    use super::*;
    use vantare_domain::format::Language;
    #[test]
    fn every_supported_card_is_inside_the_paint_mask() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(
            &Settings {
                row_count: 20,
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&crate::source::fixed(), prefs);
        for weather in [false, true] {
            for distinct_classes in [false, true] {
                let mut vm = widget.vm.as_ref().clone();
                if distinct_classes {
                    for (i, row) in vm.rows.iter_mut().enumerate() {
                        row.class = format!("C{i}");
                    }
                }
                let (groups, width) = card_geometry(&vm, weather);
                let right = SIZE.0 - if weather { 50.0 } else { 8.0 };
                for slot in 0..vm.rows.len() {
                    let x = card_left(slot as f32, width, &groups);
                    assert!(
                        x >= 156.0 && x + width <= right + 0.01,
                        "tarjeta {slot} recortada: {x}+{width}>{right}"
                    );
                }
                assert_eq!(
                    vm.rows.len(),
                    11,
                    "todas las tarjetas admitidas se han comprobado"
                );
            }
        }
    }
    #[test]
    fn empty_tower_paints_the_localized_reason() {
        for (language, status, expected) in [
            (Language::En, Status::Disconnected, "DISCONNECTED"),
            (Language::En, Status::Missing, "NO DATA"),
            (Language::Es, Status::Stale, "DATOS ANTIGUOS"),
        ] {
            let mut vm = broadcast_tower::project(&Snapshot::default(), Preferences::default());
            vm.status = status;
            crate::paint_tests::with_kit(SIZE.0, language, |kit| {
                let painted = crate::paint_tests::observe(|draw| paint_status_text(&vm, kit, draw));
                assert_eq!(painted[0].value, expected);
            });
        }
    }
}

#[cfg(test)]
mod prepared_text_tests {
    #[test]
    fn productive_uppercase_driver_code_is_borrowed_not_allocated() {
        assert!(matches!(
            super::driver_code("A. PIER GUIDI"),
            std::borrow::Cow::Borrowed("PIE")
        ));
        assert_eq!(super::driver_code("A. B. SMITH"), "SMI");
        assert_eq!(super::driver_code("É. Müller"), "MÜL");
    }
}
