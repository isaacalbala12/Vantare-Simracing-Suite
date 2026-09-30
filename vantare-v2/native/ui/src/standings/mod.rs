//! Widget Standings Eficiencia: modelo, movimiento y pintado.

pub mod model;
pub mod motion;
pub mod view;

use crate::app::Paint;
use model::{Config, Metric, Plan, Status, Vm};
use motion::{Motion, Wake};
use std::time::Instant;
use vantare_domain::{Snapshot, format::Preferences, standings};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_session_header: bool,
    pub template_id: String,
    pub header_first: String,
    pub header_second: String,
    pub show_session_footer: bool,
    pub footer_first: String,
    pub footer_second: String,
    pub show_brand: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer_slots: Option<Vec<String>>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            show_session_header: true,
            template_id: "signature".into(),
            header_first: "none".into(),
            header_second: "none".into(),
            show_session_footer: true,
            footer_first: "track".into(),
            footer_second: "estimatedLaps".into(),
            show_brand: false,
            brand_visible: None,
            footer_slots: None,
        }
    }
}

impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut settings = self.clone();
        if !["signature", "broadcast"].contains(&settings.template_id.as_str()) {
            settings.template_id = "signature".into();
        }
        let choices = [
            "none",
            "trackTemperature",
            "airTemperature",
            "estimatedLaps",
            "totalLaps",
            "track",
            "remaining",
            "rain",
            "wetness",
        ];
        for (value, fallback) in [
            (&mut settings.header_first, "none"),
            (&mut settings.header_second, "none"),
            (&mut settings.footer_first, "track"),
            (&mut settings.footer_second, "estimatedLaps"),
        ] {
            if !choices.contains(&value.as_str()) {
                *value = fallback.into();
            }
        }
        settings
    }

    fn config(&self) -> Config {
        let mut config = Config::reference();
        config.show_session_header = self.show_session_header;
        config.show_session_footer = self.show_session_footer;
        config.brand_visible = self.brand_visible;
        let info = |value: &str| match value {
            "track" => model::InfoMetric::Track,
            "estimatedLaps" => model::InfoMetric::EstimatedLaps,
            _ => model::InfoMetric::None,
        };
        config.footer_first = info(&self.footer_first);
        config.footer_second = info(&self.footer_second);
        // Signature de la referencia de fase 2: 20 filas reservadas, sin columna
        // de boxes y con la última vuelta en lugar de la mejor.
        config.row_count = 20;
        config.columns.retain(|column| column.metric != Metric::Pit);
        for column in &mut config.columns {
            if column.metric == Metric::BestLap {
                column.metric = Metric::LastLap;
            }
        }
        config
    }
}

pub(crate) struct Widget {
    config: Config,
    vm: Vm,
    plan: Plan,
    motion: Motion,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, _prefs: Preferences) -> Self {
        let mut config = settings.normalized().config();
        // Signature reserva la capacidad completa aunque haya menos coches.
        config.fit(config.row_count);
        let vm = Vm::unavailable(Status::Disconnected);
        let plan = model::plan(&config, &vm);
        Self {
            config,
            vm,
            plan,
            motion: Motion::new(),
        }
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let domain = standings::project_player_class(snapshot, prefs);
        let identity = format!("{}:{}", snapshot.state.session.id.0, snapshot.epoch);
        let mut next = Vm::from_domain(
            &domain,
            prefs,
            self.config.row_count,
            identity,
            snapshot.sequence,
        );
        // Wails reserva 20 filas aunque su filtro de clase muestre menos coches.
        self.config.fit(self.config.row_count);
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
        let mut widget = Widget::new(&Settings::default(), prefs);
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
    fn standings_repaint_only_when_what_is_drawn_changes() {
        let prefs = Preferences::default();
        let mut standings = Widget::new(&Settings::default(), Preferences::default());
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
        let mut standings = Widget::new(&Settings::default(), Preferences::default());
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
        // Signature solo muestra la clase del jugador y sin boxes ni mejor vuelta:
        // el feed de estrés repinta menos que con la clasificación completa, pero
        // bastante más que el realista.
        let synthetic = standings_repaints(source::synthetic);
        assert!(
            synthetic > 2 * realistic,
            "el de estrés repinta mucho más: {synthetic} frente a {realistic}"
        );
    }
}
