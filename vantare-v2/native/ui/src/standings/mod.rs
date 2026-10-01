//! Widget Standings Eficiencia: modelo, movimiento y pintado.

pub mod model;
pub mod motion;
pub mod options;
pub mod view;

use crate::app::Paint;
use model::{Config, Metric, Plan, Status, Vm};
use motion::{Motion, Wake};
use std::time::Instant;
use vantare_domain::{Snapshot, format::Preferences, standings};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Opciones productivas independientes, no estados excluyentes.
pub struct Settings {
    pub row_count: usize,
    pub columns: Option<Vec<options::ColumnSetting>>,
    pub class_scope: String,
    pub classification_mode: String,
    pub player_window: bool,
    pub window_around: usize,
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
            row_count: 20,
            columns: None,
            class_scope: "player-class".into(),
            classification_mode: "normal".into(),
            player_window: false,
            window_around: 4,
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
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "headerFirst/headerSecond",
            "claves legacy: Eficiencia eliminó la segunda banda de información",
        ),
        (
            "columns.tireCompound",
            "Snapshot no publica compuesto; no se inventa",
        ),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut settings = self.clone();
        settings.row_count = settings.row_count.clamp(1, 30);
        if settings.class_scope != "all-classes" {
            settings.class_scope = "player-class".into();
        }
        if settings.classification_mode != "multiclass" {
            settings.classification_mode = "normal".into();
        }
        if ![0, 2, 4, 6, 8].contains(&settings.window_around) {
            settings.window_around = 4;
        }
        if let Some(columns) = &mut settings.columns {
            columns.truncate(11);
        }
        if let Some(slots) = &mut settings.footer_slots {
            slots.truncate(9);
        }

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
        config.broadcast = self.template_id == "broadcast";
        config.multiclass = self.classification_mode == "multiclass";
        config.footer_slots = self.footer_slots.clone().unwrap_or_default();
        config.footer_ids = vec![self.footer_first.clone(), self.footer_second.clone()];
        config.show_session_header = self.show_session_header;
        config.show_session_footer = self.show_session_footer;
        config.brand_visible = self.brand_visible.or(self.show_brand.then_some(true));
        let info = |value: &str| match value {
            "track" => model::InfoMetric::Track,
            "estimatedLaps" => model::InfoMetric::EstimatedLaps,
            _ => model::InfoMetric::None,
        };
        config.footer_first = info(&self.footer_first);
        config.footer_second = info(&self.footer_second);
        // Signature de la referencia de fase 2: 20 filas reservadas, sin columna
        // de boxes y con la última vuelta en lugar de la mejor.
        config.row_count = self.row_count;
        config.columns.retain(|column| column.metric != Metric::Pit);
        for column in &mut config.columns {
            if column.metric == Metric::BestLap {
                column.metric = Metric::LastLap;
            }
        }
        if let Some(columns) = &self.columns {
            config.columns = columns
                .iter()
                .filter_map(options::ColumnSetting::column)
                .collect();
        }
        config
    }
}

pub(crate) struct Widget {
    config: Config,
    settings: Settings,
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
            settings: settings.normalized(),
            vm,
            plan,
            motion: Motion::new(),
        }
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let domain = standings::project_classification(
            snapshot,
            prefs,
            self.settings.class_scope != "all-classes",
            self.settings.class_scope != "all-classes" || self.config.multiclass,
        );
        let identity = format!("{}:{}", snapshot.state.session.id.0, snapshot.epoch);
        let mut next = Vm::from_domain(&domain, prefs, 104, identity, snapshot.sequence);
        if self.settings.player_window {
            let count = next.rows.len();
            let around = self.settings.window_around;
            let index = next.rows.iter().position(|row| row.is_player).unwrap_or(0);
            let fixed = count.min(3);
            let mut start = fixed.max(index.saturating_sub(around / 2));
            let end = (start + around + 1).min(count);
            start = fixed.max(end.saturating_sub(around + 1));
            next.rows = next
                .rows
                .into_iter()
                .enumerate()
                .filter_map(|(i, row)| {
                    (if index < fixed {
                        i < fixed + around
                    } else {
                        i < fixed || (start..end).contains(&i)
                    })
                    .then_some(row)
                })
                .collect();
        } else {
            next.rows.truncate(self.config.row_count);
        }
        let player_gap = domain
            .rows
            .iter()
            .find(|r| r.is_player)
            .map(|r| r.gap.as_str());
        let ids = if self.config.footer_slots.is_empty() {
            &self.config.footer_ids
        } else {
            &self.config.footer_slots
        };
        if self.config.show_session_footer {
            next.footer_cells = standings::information(
                snapshot,
                prefs,
                ids,
                !self.config.footer_slots.is_empty(),
                player_gap,
            );
        }
        if self.config.multiclass {
            let mut classes = Vec::<String>::new();
            for row in &next.rows {
                if !row.vehicle_class.is_empty() && !classes.contains(&row.vehicle_class) {
                    classes.push(row.vehicle_class.clone());
                }
            }
            next.rows.sort_by_key(|row| {
                classes
                    .iter()
                    .position(|class| class == &row.vehicle_class)
                    .unwrap_or(usize::MAX)
            });
            for row in &mut next.rows {
                if let Some(car) = snapshot
                    .state
                    .cars
                    .iter()
                    .find(|c| c.id.0.to_string() == row.id)
                {
                    row.position = car
                        .class_position
                        .current()
                        .copied()
                        .map_or(row.position, i64::from);
                }
            }
        }
        if let Some(columns) = &self.settings.columns {
            for row in &mut next.rows {
                let Some(car) = snapshot
                    .state
                    .cars
                    .iter()
                    .find(|c| c.id.0.to_string() == row.id)
                else {
                    continue;
                };
                for column in columns.iter().filter(|c| c.enabled) {
                    let text = match column.metric_id.as_str() {
                        "lastLap" => &mut row.last_lap_text,
                        "bestLap" => &mut row.best_lap_text,
                        _ => continue,
                    };
                    let seconds = if column.metric_id == "lastLap" {
                        car.last_lap_s.current().copied()
                    } else {
                        car.best_lap_s.current().copied()
                    };
                    *text = standings::lap_time_column(
                        seconds,
                        column.format.display.as_deref() == Some("compact"),
                        column.format.decimals.unwrap_or(3),
                    );
                }
            }
        }
        // Wails reserva la capacidad aunque su filtro de clase muestre menos coches.
        self.config.footer_rows = 1;
        if self.config.footer_slots.len() > 5 {
            let inner = (self.config.width - 24.0).max(80.0);
            let total = next
                .footer_cells
                .iter()
                .map(|cell| {
                    cell.label.chars().count() as f32 * 5.5
                        + cell.value.chars().count() as f32 * 7.5
                        + 12.0
                        + 14.0
                })
                .sum::<f32>();
            self.config.footer_rows = (total / inner).ceil() as usize;
        }
        self.config.fit(self.config.row_count);
        if self.config.multiclass {
            let mut classes = std::collections::HashSet::new();
            let bands = next
                .rows
                .iter()
                .filter(|row| !row.vehicle_class.is_empty() && classes.insert(&row.vehicle_class))
                .count();
            self.config.height += bands as f32 * 28.0;
        }
        let plan = model::plan(&self.config, &next);
        // Una columna oculta no debe cambiar la firma del contenido visible.
        if !self
            .config
            .columns
            .iter()
            .any(|column| column.metric == Metric::CurrentLap)
        {
            for row in &mut next.rows {
                row.current_lap_text = vantare_domain::format::PLACEHOLDER.into();
            }
        }
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

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            ClassGaps, Flags, Gaps, LapCount, LapTimes, PitStatus, Positions, SessionClock,
            SessionInfo,
        };
        let settings = self.normalized();
        let config = settings.config();
        let mut demand = crate::demand::signals(250, &[Positions, PitStatus, SessionInfo]);
        if settings.classification_mode == "multiclass" {
            demand.request(ClassGaps, 250);
        }
        for column in &config.columns {
            match column.metric {
                Metric::Gap | Metric::Interval => {
                    demand.request(
                        if settings.class_scope != "all-classes" || config.multiclass {
                            ClassGaps
                        } else {
                            Gaps
                        },
                        250,
                    );
                    // En práctica y clasificación el gap compara mejores vueltas.
                    demand.request(LapTimes, 250);
                }
                Metric::LastLap | Metric::BestLap => demand.request(LapTimes, 250),
                Metric::CurrentLap => demand.request(LapCount, 250),
                _ => {}
            }
        }
        if settings.show_session_header {
            demand.request(SessionClock, 250);
            demand.request(Flags, 250);
        }
        if settings.show_session_footer {
            let slots = !config.footer_slots.is_empty();
            let ids = if slots {
                &config.footer_slots
            } else {
                &config.footer_ids
            };
            for id in ids {
                crate::demand::information(&mut demand, id, slots);
                if id == "gap" {
                    demand.request(
                        if settings.class_scope != "all-classes" || config.multiclass {
                            ClassGaps
                        } else {
                            Gaps
                        },
                        250,
                    );
                    demand.request(LapTimes, 250);
                }
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
    fn variants_project_templates_content_footer_and_brand() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/standings.snapshot.json"))
                .expect("escena");
        let prefs = Preferences::default();
        for template in ["signature", "broadcast"] {
            for header in [true, false] {
                for footer in [true, false] {
                    let settings = Settings {
                        template_id: template.into(),
                        show_session_header: header,
                        show_session_footer: footer,
                        row_count: 3,
                        brand_visible: Some(false),
                        ..Settings::default()
                    };
                    let mut widget = Widget::new(&settings, prefs);
                    widget.ingest(&snapshot, prefs);
                    assert_eq!(widget.vm.rows.len(), 3);
                    assert_eq!(widget.plan.visible_rows, 3);
                    assert_eq!(widget.plan.has_header, header);
                    assert!(!widget.plan.brand_visible);
                    assert_eq!(widget.config.broadcast, template == "broadcast");
                    assert_eq!(
                        widget.config.width,
                        if template == "broadcast" {
                            460.0
                        } else {
                            440.0
                        }
                    );
                    assert_eq!(widget.config.footer_height() > 0.0, footer);
                }
            }
        }
        let mut widget = Widget::new(
            &Settings {
                footer_slots: Some(vec!["position".into(), "gap".into(), "lastLap".into()]),
                show_session_header: false,
                brand_visible: Some(true),
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.plan.brand_band, 22.0);
        assert_eq!(widget.vm.footer_cells.len(), 3);
        let player = widget
            .vm
            .rows
            .iter()
            .find(|row| row.is_player)
            .expect("jugador");
        assert_eq!(widget.vm.footer_cells[0].value, player.position.to_string());
        assert_eq!(widget.vm.footer_cells[1].value, player.gap_text);
        assert_eq!(widget.vm.footer_cells[2].value, player.last_lap_text);
        for metric in [
            "trackTemperature",
            "airTemperature",
            "totalLaps",
            "remaining",
            "rain",
            "wetness",
        ] {
            let mut widget = Widget::new(
                &Settings {
                    footer_first: metric.into(),
                    footer_second: "none".into(),
                    ..Settings::default()
                },
                prefs,
            );
            widget.ingest(&snapshot, prefs);
            assert_eq!(widget.vm.footer_cells[0].id, metric);
            assert_eq!(widget.vm.footer_cells.len(), 1);
        }
    }

    #[test]
    fn configured_columns_scope_and_player_window_keep_canonical_data() {
        let mut snapshot = source::synthetic(0);
        let player = snapshot
            .state
            .cars
            .iter()
            .find(|car| car.position.current() == Some(&8))
            .expect("P8 canónica")
            .id;
        snapshot.state.player.as_mut().expect("jugador").car = player;
        let prefs = Preferences::default();
        let columns: Vec<options::ColumnSetting> = serde_json::from_str(r#"[{"id":"name","metricId":"driverName","widthPreset":"sm","format":{"mode":"surname"}},{"id":"interval","metricId":"interval","widthPreset":"md","style":{"align":"left"}},{"id":"pit","metricId":"pit"}]"#).expect("columnas");
        let mut widget = Widget::new(
            &Settings {
                columns: Some(columns),
                class_scope: "all-classes".into(),
                row_count: 4,
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.plan.columns.len(), 2);
        assert!(widget.plan.pit_enabled);
        assert_eq!(widget.plan.widths, [156.0, 82.0]);
        assert_eq!(widget.vm.rows.len(), 4);
        let mut widget = Widget::new(
            &Settings {
                class_scope: "all-classes".into(),
                player_window: true,
                window_around: 2,
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&snapshot, prefs);
        assert_eq!(
            widget
                .vm
                .rows
                .iter()
                .map(|row| row.position)
                .collect::<Vec<_>>(),
            [1, 2, 3, 7, 8, 9]
        );
        let mut widget = Widget::new(
            &Settings {
                class_scope: "all-classes".into(),
                classification_mode: "multiclass".into(),
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&snapshot, prefs);
        assert!(!widget.plan.class_bands.is_empty());
        assert_eq!(widget.plan.row_tops[0], 28.0);
    }

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
