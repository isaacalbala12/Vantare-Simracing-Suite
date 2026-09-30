//! Widget Standings Eficiencia: modelo, movimiento y pintado.

pub mod model;
pub mod motion;
pub mod view;

use crate::app::Paint;
use model::{Config, Metric, Plan, Status, Vm};
use motion::{Motion, Wake};
use std::time::Instant;
use vantare_domain::{Snapshot, format::Preferences, standings};

pub(crate) struct Widget {
    legacy: bool,
    config: Config,
    vm: Vm,
    plan: Plan,
    motion: Motion,
}

impl Widget {
    pub(crate) fn new(_prefs: Preferences) -> Self {
        // Preferencia de presentación, independiente del nombre o datos de escena.
        Self::with_layout(std::env::var_os("VANTARE_STANDINGS_LEGACY").is_some())
    }

    fn with_layout(legacy: bool) -> Self {
        let mut config = Config::reference();
        if !legacy {
            config.row_count = 20;
            config.columns.retain(|column| column.metric != Metric::Pit);
            for column in &mut config.columns {
                if column.metric == Metric::BestLap {
                    column.metric = Metric::LastLap;
                }
            }
        }
        // Signature reserva la capacidad del documento; el histórico ajusta filas.
        config.fit(config.row_count);
        let vm = Vm::unavailable(Status::Disconnected);
        let plan = model::plan(&config, &vm);
        Self {
            legacy,
            config,
            vm,
            plan,
            motion: Motion::new(),
        }
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let domain = if self.legacy {
            standings::project(snapshot, prefs)
        } else {
            standings::project_player_class(snapshot, prefs)
        };
        let identity = format!("{}:{}", snapshot.state.session.id.0, snapshot.epoch);
        let mut next = Vm::from_domain(
            &domain,
            prefs,
            self.config.row_count,
            identity,
            snapshot.sequence,
        );
        // Wails reserva 20 filas aunque su filtro de clase muestre menos coches.
        self.config.fit(if self.legacy {
            next.rows.len()
        } else {
            self.config.row_count
        });
        let plan = model::plan(&self.config, &next);
        // El número de secuencia cambia siempre y no se ve: no cuenta.
        let sequence = std::mem::replace(&mut next.sequence, self.vm.sequence);
        let changed = next != self.vm || plan.visible_rows != self.plan.visible_rows;
        next.sequence = sequence;
        if changed {
            let lap_visible = plan.columns.iter().any(|c| c.metric == Metric::BestLap);
            self.motion
                .update(&next, plan.visible_rows, lap_visible, Instant::now());
            self.vm = next;
            self.plan = plan;
        }
        changed
    }
}

impl Widget {
    pub(crate) fn size(&self) -> (f32, f32) {
        (
            self.config.width
                + if self.plan.pit_enabled {
                    model::PIT_RAIL_WIDTH
                } else {
                    0.0
                },
            self.config.height,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.motion.animating(Instant::now())
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        let frame = self.motion.frame(&self.vm, self.plan.visible_rows, now);
        let wake = self.motion.wake(now);
        let scene = view::Scene {
            config: self.config.clone(),
            vm: self.vm.clone(),
            plan: self.plan.clone(),
            frame,
            language: prefs.language,
            height: self.config.height,
        };
        (
            Box::new(move |window, cx| view::paint(&scene, window, cx)),
            wake,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn phase_two_uses_player_class_last_lap_and_reserved_height() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/standings.snapshot.json"))
                .expect("escena fase 2");
        let prefs = Preferences::default();
        let mut widget = Widget::with_layout(false);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.size(), (440.0, 664.0));
        assert!(!widget.plan.pit_enabled);
        assert_eq!(widget.plan.visible_rows, 7);
        assert_eq!(
            widget
                .vm
                .rows
                .iter()
                .map(|r| r.position)
                .collect::<Vec<_>>(),
            [1, 4, 7, 10, 13, 16, 19]
        );
        assert_eq!(widget.vm.rows[0].last_lap_text, "1:49.667");
        assert_eq!(widget.vm.rows[1].gap_text, "—");
        assert_eq!(widget.vm.rows[3].gap_text, "+11.11s");
        assert_eq!(widget.vm.rows[6].gap_text, "+1 V");
        assert_eq!(widget.vm.estimated_laps, "≈79");
        assert_eq!(
            widget.plan.columns.last().map(|c| c.metric),
            Some(Metric::LastLap)
        );

        let mut other_class = snapshot.clone();
        other_class.sequence += 1;
        other_class.state.cars[1].driver.name = "OTRO".into();
        assert!(!widget.ingest(&other_class, prefs));
        other_class.state.player = Some(vantare_domain::Player {
            car: vantare_domain::CarId(2),
            ..vantare_domain::Player::default()
        });
        assert!(widget.ingest(&other_class, prefs));
        assert_eq!(widget.vm.rows.len(), 7);
        assert_eq!(widget.vm.rows[0].position, 2);
        assert_eq!(widget.size(), (440.0, 664.0));
    }

    #[test]
    fn historical_scene_and_configuration_remain_reproducible() {
        let legacy = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/standings-legacy.snapshot.json"
        ))
        .expect("escena histórica");
        assert_eq!(legacy, source::fixed());
        assert_eq!(
            include_bytes!("../../fixtures/standings-legacy.snapshot.json"),
            include_bytes!("../../fixtures/standings-44.snapshot.json")
        );
        let mut widget = Widget::with_layout(true);
        widget.ingest(&legacy, Preferences::default());
        assert_eq!(widget.size(), (474.0, 364.0));
        assert!(widget.plan.pit_enabled);
        assert_eq!(widget.plan.visible_rows, 10);
        assert!(
            widget
                .plan
                .columns
                .iter()
                .any(|c| c.metric == Metric::BestLap)
        );
    }
    #[test]
    fn standings_repaint_only_when_what_is_drawn_changes() {
        let prefs = Preferences::default();
        let mut standings = Widget::with_layout(true);
        let first = source::fixed();
        assert!(standings.ingest(&first, prefs), "el primer estado se pinta");

        let mut same = first.clone();
        same.sequence += 1;
        assert!(
            !standings.ingest(&same, prefs),
            "otra secuencia, mismo dibujo"
        );

        let mut hidden = first.clone();
        hidden.sequence += 2;
        hidden.state.cars[30].driver.name = "OTRO".into();
        assert!(
            !standings.ingest(&hidden, prefs),
            "un coche fuera de las filas visibles"
        );

        let mut clock = first;
        clock.sequence += 3;
        clock.state.session.remaining_s = vantare_domain::Quality::Reliable(3491.0);
        assert!(standings.ingest(&clock, prefs), "el reloj cambió");
    }

    /// Cuántas veces pediría repintar Standings en un minuto a 30 Hz.
    fn standings_repaints(scene: fn(u64) -> Snapshot) -> usize {
        let mut standings = Widget::with_layout(true);
        (0..30 * 60)
            .filter(|&tick| standings.ingest(&scene(tick), Preferences::default()))
            .count()
    }

    #[test]
    fn realistic_feed_repaints_standings_rarely() {
        let realistic = standings_repaints(source::realistic);
        assert!(
            (30..=240).contains(&realistic),
            "reloj cada segundo y algún gap o adelantamiento: {realistic}"
        );
        assert_eq!(
            standings_repaints(source::quiet),
            1,
            "solo el primer estado"
        );
        assert!(
            standings_repaints(source::synthetic) > 900,
            "el de estrés lo cambia casi todo"
        );
    }
}
