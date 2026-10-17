//! Cara a cara (780 × 72). El productivo no tiene
//! animaciones ni avisos temporales: `Wake::Idle`, sin un reloj adicional.
//! La dirección configurada selecciona el rival en la proyección pura.
//! La escena por defecto conserva al líder mirando delante, SIN RIVAL; 20 coches.

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
use gpui::App;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    head_to_head::{self, Target, ViewModel},
};
pub const SIZE: (f32, f32) = (780.0, 72.0);

fn difference_color(value: &str, style: &Style) -> Color {
    let value = value.strip_prefix('−').map_or_else(
        || value.parse::<f64>().ok(),
        |v| v.parse::<f64>().ok().map(|v| -v),
    );
    match value.filter(|v| v.is_finite()) {
        Some(v) if v < 0.0 => style.colors.gain,
        Some(v) if v > 0.0 => style.colors.loss,
        _ => style.colors.muted,
    }
}
fn paint_comparison(
    value: &str,
    x: f32,
    top: f32,
    big: bool,
    kit: &Kit<'_>,
    mut draw: impl FnMut(crate::vantare::paint::Label<'_>),
) {
    let value = if value.is_empty() {
        vantare_domain::format::PLACEHOLDER
    } else {
        value
    };
    let (face, size, tracking, height) = if big {
        (Face::Display, 22.0, 0.5, 22.0)
    } else {
        (Face::Mono, 12.0, 0.0, 16.0)
    };
    draw(crate::vantare::paint::Label {
        value,
        x,
        right: None,
        top,
        height,
        face,
        ink: kit.ink(
            face,
            size,
            tracking,
            difference_color(value, kit.style).hsla(),
        ),
    });
}
pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    paint_content(vm, true, Preferences::default(), window, cx);
}
fn paint_content(
    vm: &ViewModel,
    show_sectors: bool,
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
    let Some(duel) = &vm.duel else {
        let ink = kit.ink(Face::Display, 13.0, 1.4, style.colors.muted.hsla());
        kit.label(
            window,
            cx,
            &vm.no_rival,
            330.0,
            None,
            26.0,
            20.0,
            Face::Display,
            &ink,
        );
        return;
    };
    for (i, (row, x)) in [(&duel.left, 8.0), (&duel.right, 392.0)]
        .into_iter()
        .enumerate()
    {
        if row.is_player {
            round_rect(
                window,
                x,
                6.0,
                200.0,
                60.0,
                6.0,
                Color(0xe14a54, 0.18).hsla(),
            );
        }
        let label = format!(
            "P{}  {}  #{}",
            row.place,
            if row.is_player {
                if kit.es() { "Tú" } else { "You" }
            } else {
                &row.name
            },
            row.number
        );
        let name = kit.ink(Face::Body, 13.0, 0.0, Color(0xfaf7f7, 1.0).hsla());
        let label = text::fit(window, &label, &name, 180.0);
        kit.label(
            window,
            cx,
            &label,
            x + 10.0,
            None,
            18.0,
            18.0,
            Face::Body,
            &name,
        );
        let lap = kit.ink(Face::Mono, 12.0, 0.0, style.colors.text.hsla());
        kit.label(
            window,
            cx,
            &duel.laps[i],
            x + 62.0,
            None,
            40.0,
            16.0,
            Face::Mono,
            &lap,
        );
        let small = kit.ink(Face::Body, 10.0, 0.3, style.colors.muted.hsla());
        kit.label(
            window,
            cx,
            match (duel.best_laps, kit.es()) {
                (true, true) => "MEJOR",
                (true, false) => "BEST",
                (false, true) => "ÚLTIMA",
                (false, false) => "LAST",
            },
            x + 10.0,
            None,
            40.0,
            16.0,
            Face::Body,
            &small,
        );
    }
    let mode = kit.ink(Face::Display, 10.0, 1.4, style.colors.muted.hsla());
    let title = vm.header.replace("H2H · ", "VS ");
    kit.label(
        window,
        cx,
        &title,
        265.0,
        None,
        6.0,
        12.0,
        Face::Display,
        &mode,
    );
    paint_comparison(&duel.gap, 300.0, 18.0, true, &kit, |mut label| {
        label.x -= text::width(window, label.value, &label.ink) / 2.0;
        label.paint(&kit, window, cx);
    });
    let trend = kit.ink(
        Face::Mono,
        10.0,
        0.0,
        if duel.trend.is_empty() || duel.trend == vantare_domain::format::PLACEHOLDER {
            style.colors.muted
        } else if duel.good {
            style.colors.gain
        } else {
            style.colors.loss
        }
        .hsla(),
    );
    kit.label(
        window,
        cx,
        &duel.trend,
        300.0 - text::width(window, &duel.trend, &trend) / 2.0,
        None,
        41.0,
        12.0,
        Face::Mono,
        &trend,
    );
    let small = kit.ink(Face::Mono, 10.0, 0.0, style.colors.muted.hsla());
    kit.label(
        window,
        cx,
        &duel.catch,
        300.0 - text::width(window, &duel.catch, &small) / 2.0,
        None,
        54.0,
        12.0,
        Face::Mono,
        &small,
    );
    round_rect(
        window,
        600.0,
        6.0,
        1.0,
        60.0,
        0.0,
        Color(0xffffff, 0.08).hsla(),
    );
    if show_sectors {
        for i in 0..3 {
            let x = 610.0 + i as f32 * 53.0;
            kit.label(
                window,
                cx,
                ["S1", "S2", "S3"][i],
                x,
                None,
                15.0,
                12.0,
                Face::Display,
                &mode,
            );
            let color = difference_color(&duel.sectors[i], &style);
            paint_comparison(&duel.sectors[i], x, 30.0, false, &kit, |label| {
                label.paint(&kit, window, cx);
            });
            round_rect(window, x, 51.0, 47.0, 3.0, 1.5, color.hsla());
        }
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub target: String,
    /// Muestra los sectores fiables de la última vuelta y la mejor vuelta.
    pub show_sectors: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            target: "ahead".into(),
            show_sectors: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    fn target(&self) -> Target {
        if self.target == "behind" {
            Target::Behind
        } else {
            Target::Ahead
        }
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut settings = self.clone();
        if settings.target != "behind" {
            settings.target = "ahead".into();
        }
        settings
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
    target: Target,
    show_sectors: bool,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: head_to_head::project(&Snapshot::default(), prefs, settings.target()),
            target: settings.target(),
            show_sectors: settings.show_sectors,
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(
            &mut self.vm,
            head_to_head::project(snapshot, prefs, self.target),
        )
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let show_sectors = self.show_sectors;
        (
            Box::new(move |window, cx| paint_content(&vm, show_sectors, prefs, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)]
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{LapTimes, Positions, Relative, Sectors, SessionInfo};
        let mut demand = crate::demand::signals(33, &[Positions, Relative, LapTimes, SessionInfo]);
        if self.show_sectors {
            demand.request(LapTimes, 250);
            demand.request(Sectors, 250);
        }
        demand
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Car, CarId, Player, Quality::Reliable};

    #[test]
    fn real_acc_has_reliable_rival_sectors_and_timing_demand() {
        use vantare_ipc::Signal::{LapTimes, Sectors};
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/telemetry-real/acc.snapshot.json"
        ))
        .expect("ACC real");
        assert!(
            snapshot
                .state
                .cars
                .iter()
                .all(|car| car.last_sectors_s.len() <= 3)
        );
        let settings = Settings::default();
        let demand = settings.demand();
        assert!(demand.contains(Sectors) && demand.contains(LapTimes));
        let vm = head_to_head::project(&snapshot, Preferences::default(), Target::Ahead);
        assert_eq!(vm.rows[0].name, "Luca Pirri");
        assert_eq!(vm.rows[0].sectors, ["37.860", "41.505", "38.987"]);
        assert_eq!(vm.rows[0].best_lap, "1:58.352");
        assert!(
            head_to_head::project(&snapshot, Preferences::default(), Target::Behind)
                .rows
                .is_empty()
        );
        let hidden = Settings {
            show_sectors: false,
            ..settings
        }
        .demand();
        assert!(
            !hidden.contains(Sectors) && hidden.contains(LapTimes),
            "las últimas vueltas siguen visibles sin sectores"
        );
    }

    #[test]
    fn real_relative_and_timing_survive_the_requested_pipe() {
        use std::{
            sync::Arc,
            time::{Duration, Instant},
        };
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/telemetry-real/lmu47.snapshot.json"
        ))
        .expect("DTO congelado del corpus real");
        let demand = Settings::default().demand();
        let name = format!("vantare-h2h-real-{}", std::process::id());
        let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("pipe");
        let source = publisher.demand_source();
        let mut subscriber =
            vantare_ipc::Subscriber::connect_requested(&name, demand.clone(), |_| true)
                .expect("suscriptor");
        let deadline = Instant::now() + Duration::from_secs(2);
        while source.mask() != demand.mask() {
            assert!(Instant::now() < deadline, "demanda no aceptada");
            std::thread::yield_now();
        }
        assert!(
            snapshot
                .state
                .cars
                .iter()
                .any(|car| car.relative_laps.current().is_some())
        );
        publisher
            .publish(Arc::new(snapshot.clone()))
            .expect("foto real");
        let photo = subscriber
            .next_photo(Duration::from_secs(2))
            .expect("foto pedida");
        assert_eq!(snapshot.state.cars.len(), photo.snapshot.state.cars.len());
        for (full, received) in snapshot.state.cars.iter().zip(&photo.snapshot.state.cars) {
            assert_eq!(full.id, received.id);
            assert_eq!(full.last_sectors_s, received.last_sectors_s);
            assert_eq!(full.best_lap_s, received.best_lap_s);
            assert_eq!(
                full.relative_laps, received.relative_laps,
                "progreso relativo perdido"
            );
            assert_eq!(full.relative_s, received.relative_s, "gap relativo perdido");
        }
        assert!(demand.contains(vantare_ipc::Signal::Relative));
    }

    #[test]
    fn fixed_strip_has_only_the_player_and_selected_rival_in_both_directions() {
        let mut snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/head-to-head.snapshot.json"
        ))
        .expect("escena");
        snapshot.state.player.as_mut().expect("jugador").car = snapshot.state.cars[1].id;
        for target in ["ahead", "behind"] {
            let mut widget = Widget::new(
                &Settings {
                    target: target.into(),
                    ..Settings::default()
                },
                Preferences::default(),
            );
            widget.ingest(&snapshot, Preferences::default());
            let duel = widget.vm.duel.as_ref().expect("pareja");
            assert_ne!(duel.left.is_player, duel.right.is_player);
            assert!(duel.left.selected || duel.right.selected);
            assert_eq!(widget.size(), (780.0, 72.0));
            let mut lost = snapshot.clone();
            lost.state.source_state = vantare_domain::SourceState::Lost;
            widget.ingest(&lost, Preferences::default());
            assert!(widget.vm.duel.is_none());
            assert_eq!(widget.size(), (780.0, 72.0));
        }
    }

    #[test]
    fn configured_direction_projects_the_selected_rival() {
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/head-to-head.snapshot.json"
        ))
        .expect("escena");
        let prefs = Preferences::default();
        let mut widget = Widget::new(
            &Settings {
                target: "behind".into(),
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.vm.header, "H2H · DETRÁS");
        assert_eq!(widget.vm.rows[1].name, "Ben Hanley");
        assert!(widget.vm.rows[1].selected);
        assert_eq!(
            widget.vm,
            head_to_head::project(&snapshot, prefs, Target::Behind)
        );
        assert_eq!(
            Settings {
                target: "invalid".into(),
                show_sectors: false
            }
            .normalized()
            .target,
            "ahead"
        );
    }

    #[test]
    fn frozen_workshop_scene_contains_the_rival_without_changing_the_player() {
        // El golden tiene al líder mirando delante: SIN RIVAL. Detrás sí está
        // Ben Hanley; no ocultar coches para conseguir la captura vacía.
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/head-to-head.snapshot.json"
        ))
        .expect("escena Workshop DTO v4 válida");
        let prefs = Preferences::default();
        assert_eq!(snapshot.state.cars.len(), 20);
        assert_eq!(
            snapshot.state.player_car().expect("jugador").driver.name,
            "André Lotterer"
        );
        assert!(
            head_to_head::project(&snapshot, prefs, Target::Ahead)
                .rows
                .is_empty()
        );
        let behind = head_to_head::project(&snapshot, prefs, Target::Behind);
        assert_eq!(behind.rows[1].name, "Ben Hanley");
        assert!(behind.rows[1].selected);
        // Gap reconstruido desde reference/head-to-head.geometry.json,
        // generado por tools/widget-reference/scene.tsx; no es telemetría live.
        assert_eq!(behind.rows[1].gap, "+4.500");
    }

    #[test]
    fn qa_player_p2_scene_has_a_rival_ahead() {
        let snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../../fixtures/head-to-head-player-p2.snapshot.json"
        ))
        .expect("escena P2 válida");
        assert_eq!(
            snapshot.state.player_car().expect("jugador").position,
            vantare_domain::Quality::Reliable(2)
        );
        let vm = head_to_head::project(&snapshot, Preferences::default(), Target::Ahead);
        assert!(!vm.rows.is_empty());
        assert!(vm.rows.iter().any(|row| row.name == "André Lotterer"));
    }

    #[test]
    fn only_visible_changes_repaint_and_frames_finish() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.cars = [1, 2]
            .map(|id| Car {
                id: CarId(id),
                position: Reliable(id),
                ..Car::default()
            })
            .into();
        snapshot.state.player = Some(Player {
            car: CarId(2),
            ..Player::default()
        });
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        snapshot.state.cars[1].best_lap_s = Reliable(90.0);
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.cars[0].best_lap_s = Reliable(90.0);
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.state.cars[0].driver.name = "Rival".into();
        assert!(widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}

#[cfg(test)]
mod comparison_render_tests {
    #[test]
    fn race_gap_paints_loss_ahead_and_gain_behind() {
        crate::paint_tests::with_kit(super::SIZE.0, vantare_domain::format::Language::Es, |kit| {
            for (value, color) in [
                ("+3.200", kit.style.colors.loss),
                ("-3.200", kit.style.colors.gain),
                ("−3.200", kit.style.colors.gain),
            ] {
                let painted = crate::paint_tests::observe(|draw| {
                    super::paint_comparison(value, 300.0, 18.0, true, kit, draw);
                });
                assert_eq!(painted[0].value, value);
                assert_eq!(painted[0].color, color.hsla());
            }
        });
    }
    #[test]
    fn missing_gap_and_sectors_paint_a_neutral_placeholder() {
        crate::paint_tests::with_kit(super::SIZE.0, vantare_domain::format::Language::Es, |kit| {
            for big in [true, false] {
                for value in ["", "—"] {
                    let painted = crate::paint_tests::observe(|draw| {
                        super::paint_comparison(value, 300.0, 18.0, big, kit, draw);
                    });
                    assert_eq!(painted[0].value, "—");
                    assert_eq!(painted[0].color, kit.style.colors.muted.hsla());
                }
            }
        });
    }
}
