//! H2H Eficiencia (388 × 110). El productivo no tiene
//! animaciones ni avisos temporales: `Wake::Idle`, sin un reloj adicional.
//! La dirección configurada selecciona el rival en la proyección pura.
//! La escena por defecto conserva al líder mirando delante, SIN RIVAL; 20 coches.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    head_to_head::{self, Target, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, paint_rect, rect, tokens};

pub const SIZE: (f32, f32) = (388.0, 110.0);

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    paint_panel(window, width, height, 0.87);
    // Igual que Standings: el segundo brillo es < 1 % y queda pendiente para
    // el kit junto con el marco superior al 24 % (segundo consumidor real).
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));

    let header = ink(11.0, 600.0, 0.08, col(tokens::MUTED, 1.0));
    if vm.rows.is_empty() {
        text::draw(
            window,
            cx,
            &vm.header,
            6.0,
            text::baseline(0.0, 18.0, 11.0),
            &header,
        );
        let status = ink(14.0, 700.0, 0.0, col(0xe2c568, 1.0));
        text::draw(
            window,
            cx,
            &vm.no_rival,
            6.0,
            text::baseline(18.0, 92.0, 14.0),
            &status,
        );
    }
    let player_index = vm.rows.iter().position(|row| row.is_player).unwrap_or(0);
    for (index, row) in vm.rows.iter().enumerate() {
        let (y, row_height) = row_bounds(row.is_player, index < player_index);
        if row.is_player {
            paint_rect(window, 1.0, y, width - 2.0, row_height, col(0xbfc2ca, 0.23));
        }
        let line_top = y + if row.is_player { 7.0 } else { 0.0 };
        let class_name = row.class_name.to_uppercase();
        let player_columns = [
            (&row.place, 6.0, 22.0, false),
            (&row.name, 34.0, 270.0, false),
        ];
        let rival_columns = [
            (&row.place, 6.0, 22.0, false),
            (&row.name, 34.0, 154.0, false),
            (&class_name, 194.0, 78.0, false),
            (&row.label, 278.0, 46.0, false),
            (&row.gap, 330.0, 52.0, true),
        ];
        let columns = if row.is_player {
            &player_columns[..]
        } else {
            &rival_columns[..]
        };
        for &(value, left, cell_width, right) in columns {
            let style = ink(
                14.0,
                650.0,
                0.0,
                col(
                    if right && row.selected {
                        tokens::LOSS
                    } else {
                        tokens::INK
                    },
                    1.0,
                ),
            );
            let value = text::fit(window, value, &style, cell_width);
            let x = if right {
                left + cell_width - text::width(window, &value, &style)
            } else {
                left
            };
            text::draw(
                window,
                cx,
                &value,
                x,
                text::baseline(line_top, 24.0, 14.0),
                &style,
            );
        }
        if row.is_player {
            let secondary = ink(14.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
            let label = text::fit(
                window,
                &format!("{class_name} · {}", vm.header),
                &secondary,
                width - 40.0,
            );
            text::draw(
                window,
                cx,
                &label,
                34.0,
                text::baseline(y + 31.0, 24.0, 14.0),
                &secondary,
            );
        }
        paint_rect(
            window,
            1.0,
            y + row_height - 1.0,
            width - 2.0,
            1.0,
            col(tokens::INK, 0.10),
        );
    }
    paint_frame(window, width, height);
    // CSS ::after: blanco 24 % arriba sobre el mismo panel redondeado.
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0x000000, 0.0),
        Edges {
            top: px(1.0),
            ..Edges::all(px(0.0))
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
}

fn row_bounds(player: bool, ahead: bool) -> (f32, f32) {
    if player {
        (24.0, 62.0)
    } else if ahead {
        (0.0, 24.0)
    } else {
        (86.0, 24.0)
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub target: String,
    /// Compatibilidad: Eficiencia tampoco dibuja sectorComparisons.
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
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showSectors",
        "HeadToHeadFunctional no dibuja sectores; no se inventa una variante",
    )];
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
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: head_to_head::project(&Snapshot::default(), prefs, settings.target()),
            target: settings.target(),
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

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        (
            Box::new(move |window, cx| paint(&vm, window, cx)),
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
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Positions, Relative};
        crate::demand::signals(33, &[Positions, Relative])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Car, CarId, Player, Quality::Reliable};

    #[test]
    fn real_relative_progress_survives_the_requested_pipe() {
        use std::{
            sync::Arc,
            time::{Duration, Instant},
        };
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
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
            assert_eq!(
                full.relative_laps, received.relative_laps,
                "progreso relativo perdido"
            );
            assert_eq!(full.relative_s, received.relative_s, "gap relativo perdido");
        }
        assert!(demand.contains(vantare_ipc::Signal::Relative));
    }

    #[test]
    fn rivals_and_player_fit_without_gaps_for_both_target_directions() {
        let mut snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/head-to-head.snapshot.json"
        ))
        .expect("escena");
        snapshot.state.player.as_mut().expect("jugador").car = snapshot.state.cars[1].id;
        for target in [Target::Ahead, Target::Behind] {
            let vm = head_to_head::project(&snapshot, Preferences::default(), target);
            assert_eq!(vm.rows.len(), 3);
            let player = vm
                .rows
                .iter()
                .position(|row| row.is_player)
                .expect("jugador");
            let mut bottom = 0.0;
            for (index, row) in vm.rows.iter().enumerate() {
                let (top, height) = row_bounds(row.is_player, index < player);
                assert_eq!(top, bottom);
                assert_eq!(height, if row.is_player { 62.0 } else { 24.0 });
                bottom = top + height;
            }
            assert_eq!(bottom, SIZE.1);
        }
    }

    #[test]
    fn configured_direction_projects_the_selected_rival() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
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
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
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
        snapshot.state.cars[0].driver.name = "Rival".into();
        assert!(widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
