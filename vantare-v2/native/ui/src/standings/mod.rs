//! Widget Standings Eficiencia: modelo, movimiento y pintado.
//!
//! Los detalles de renderizado no forman parte del contrato público.
//! ```compile_fail
//! use vantare_ui::standings::model::Config;
//! ```
//! ```compile_fail
//! use vantare_ui::standings::motion;
//! ```
//! ```compile_fail
//! use vantare_ui::standings::view;
//! ```
//! ```compile_fail
//! let _ = vantare_ui::standings::options::ColumnSetting::default().column();
//! ```
//! Los ajustes y el ancho del rail usado por Workshop siguen públicos.
//! ```
//! use vantare_ui::standings::{Settings, model::PIT_RAIL_WIDTH, options::{ColumnSetting, Format}};
//! let _ = (Settings::default(), ColumnSetting::default(), Format::default(), PIT_RAIL_WIDTH);
//! ```

pub mod model;
pub(crate) mod motion;
pub mod options;
pub(crate) mod style;
pub(crate) mod vantare;
pub(crate) mod view;

use crate::app::Paint;
use model::{Config, Metric, Plan, Status, Vm};
use motion::{Motion, Wake};
use std::time::Instant;
use vantare_domain::{Snapshot, format::Preferences, standings};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Opciones productivas independientes, no estados excluyentes.
pub struct Settings {
    pub design_system: DesignSystem,
    pub style: Look,
    pub accent: Accent,
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

/// Sistema de diseño. Un valor desconocido usa Vantare, el principal.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DesignSystem {
    /// Sistema heredado del producto Wails (Signature/Broadcast).
    Eficiencia,
    #[default]
    #[serde(other)]
    Vantare,
}

/// Estilo Vantare del catálogo r10b.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Look {
    Carmin,
    Limpio,
    #[default]
    #[serde(other)]
    Neo,
}

/// Acento Vantare: fila propia, bordes y énfasis.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Accent {
    Amber,
    Green,
    White,
    #[default]
    #[serde(other)]
    Red,
}

/// Métricas de Standings Vantare que ocupan un hueco propio (P es fija).
const MOVABLE: &[&str] = &[
    "positionsGained",
    "driverNumber",
    "carNumber",
    "driverName",
    "tireCompound",
    "pit",
    "sectors",
    "lastLap",
    "bestLap",
    "interval",
    "gap",
];

/// Mueve `metric` delante de `before` (o al final); ver `vantare::columns`.
pub fn move_column(
    columns: &mut Vec<options::ColumnSetting>,
    metric: &str,
    before: Option<&str>,
) -> bool {
    crate::vantare::columns::move_column(columns, metric, before, MOVABLE)
}

/// Desplaza `metric` un puesto entre las columnas visibles.
pub fn shift_column(columns: &mut Vec<options::ColumnSetting>, metric: &str, step: i32) -> bool {
    crate::vantare::columns::shift_column(columns, metric, step, MOVABLE)
}

/// Plantillas Vantare del catálogo r10b: todas las columnas elegibles en su
/// orden, activas según el tamaño. `compact` (340 px), `standard` (520, el del
/// Studio) y `expanded` (900). Eficiencia ignora las métricas que no conoce.
#[must_use]
pub fn vantare_template(name: &str) -> Vec<options::ColumnSetting> {
    let (driver, on): (&str, &[&str]) = match name {
        "compact" => ("sm", &["position", "driverNumber", "driverName", "gap"]),
        "expanded" => (
            "lg",
            &[
                "position",
                "positionsGained",
                "driverNumber",
                "driverName",
                "vehicle",
                "tireCompound",
                "pit",
                "sectors",
                "lastLap",
                "bestLap",
                "gap",
            ],
        ),
        _ => (
            "md",
            &[
                "position",
                "positionsGained",
                "driverNumber",
                "driverName",
                "vehicle",
                "pit",
                "sectors",
                "gap",
            ],
        ),
    };
    [
        "position",
        "positionsGained",
        "driverNumber",
        "driverName",
        "vehicle",
        "tireCompound",
        "pit",
        "sectors",
        "lastLap",
        "bestLap",
        "interval",
        "gap",
    ]
    .iter()
    .map(|metric| options::ColumnSetting {
        id: (*metric).into(),
        metric_id: (*metric).into(),
        enabled: on.contains(metric),
        width_preset: if *metric == "driverName" {
            driver.into()
        } else {
            "auto".into()
        },
        ..options::ColumnSetting::default()
    })
    .collect()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            design_system: DesignSystem::Vantare,
            style: Look::Neo,
            accent: Accent::Red,
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
    /// Standings del sistema Eficiencia heredado (Signature por defecto).
    #[must_use]
    pub fn eficiencia() -> Self {
        Self {
            design_system: DesignSystem::Eficiencia,
            ..Self::default()
        }
    }

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
    /// Presente con el sistema Vantare; si no, se usa el renderer Eficiencia.
    vantare: Option<vantare::State>,
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
        let normalized = settings.normalized();
        Self {
            vantare: (normalized.design_system == DesignSystem::Vantare)
                .then(|| vantare::State::new(vantare::Options::from_settings(&normalized))),
            config,
            settings: settings.normalized(),
            vm,
            plan,
            motion: Motion::new(),
        }
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        if let Some(state) = &mut self.vantare {
            return state.ingest(vantare_domain::standings_vantare::project(snapshot, prefs));
        }
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
            self.config.height += bands as f32 * self.config.style.geometry.class_band_height;
        }
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
        if !self
            .config
            .columns
            .iter()
            .any(|column| column.metric == Metric::Interval)
        {
            for row in &mut next.rows {
                row.interval_text = vantare_domain::format::PLACEHOLDER.into();
            }
        }
        // paint_footer usa footer_cells con slots o metricas no legacy.
        // En esos casos el nombre visible, si se pide, ya esta en esas celdas.
        let legacy_track_visible = self.config.show_session_footer
            && self.config.footer_slots.is_empty()
            && self
                .config
                .footer_ids
                .iter()
                .all(|id| ["none", "track", "estimatedLaps"].contains(&id.as_str()))
            && [self.config.footer_first, self.config.footer_second]
                .contains(&model::InfoMetric::Track);
        if !legacy_track_visible {
            next.track = vantare_domain::format::PLACEHOLDER.into();
        }
        // El número de secuencia cambia siempre y no se ve: no cuenta.
        let sequence = std::mem::replace(&mut next.sequence, self.vm.sequence);
        let changed = {
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::VmDiff);
            next != self.vm
        };

        next.sequence = sequence;
        if changed {
            // El layout depende de la VM y de los ajustes fijos del widget.
            let plan = {
                #[cfg(feature = "paint-stats")]
                let _span = crate::profiling::begin(crate::profiling::Stage::Layout);
                model::plan(&self.config, &next)
            };
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
    pub(crate) fn set_study(&mut self, study: &str) {
        self.config.study = study.into();
    }

    pub(crate) fn set_style(&mut self, style: std::sync::Arc<style::Style>) {
        self.config.style = style;
        self.config.fit(self.config.row_count);
        if self.config.multiclass {
            let classes: std::collections::HashSet<_> = self
                .vm
                .rows
                .iter()
                .filter(|row| !row.vehicle_class.is_empty())
                .map(|row| &row.vehicle_class)
                .collect();
            self.config.height +=
                classes.len() as f32 * self.config.style.geometry.class_band_height;
        }
        self.plan = model::plan(&self.config, &self.vm);
    }

    /// Termina las animaciones Vantare en curso (Workshop reconstruye la historia).
    pub(crate) fn settle(&mut self) {
        if let Some(state) = &mut self.vantare {
            state.settle();
        }
    }

    /// Columnas Vantare colocadas; `None` en Eficiencia o sin filas.
    pub(crate) fn vantare_columns(&self) -> Option<crate::vantare::columns::ColumnBoxes> {
        self.vantare.as_ref().and_then(vantare::State::columns)
    }

    /// Estilo Vantare de Workshop en vivo; producto usa el compilado.
    pub(crate) fn set_vantare_style(
        &mut self,
        style: std::sync::Arc<crate::vantare::style::Style>,
    ) {
        if let Some(state) = &mut self.vantare {
            state.set_style(style);
        }
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        if let Some(state) = &self.vantare {
            return state.size();
        }
        (
            self.config.width
                + if self.plan.pit_enabled {
                    self.config.style.geometry.pit_rail_width
                } else {
                    0.0
                },
            self.config.height,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match &self.vantare {
            Some(state) => state.wake(Instant::now()) != Wake::Idle,
            None => self.motion.animating(Instant::now()),
        }
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        if let Some(state) = &self.vantare {
            let wake = state.wake(Instant::now());
            let state = state.clone();
            let language = prefs.language;
            return (
                Box::new(move |window, cx| state.paint(language, window, cx)),
                wake,
            );
        }
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
        if settings.design_system == DesignSystem::Vantare {
            use vantare_ipc::Signal::{Cars, LapCount, LapTimes, Sectors, Weather};
            return crate::demand::signals(
                250,
                &[
                    Cars,
                    Positions,
                    PitStatus,
                    SessionInfo,
                    SessionClock,
                    Flags,
                    ClassGaps,
                    LapCount,
                    LapTimes,
                    Sectors,
                    Weather,
                ],
            );
        }
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
    fn vantare_is_the_default_system_and_paints_its_own_board() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/telemetry-real/acc.snapshot.json"
        ))
        .expect("foto real ACC");
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.vantare.is_some());
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs), "misma foto, mismo dibujo");
        assert!(
            widget
                .vantare
                .as_ref()
                .is_some_and(|state| state.board.is_some()),
            "las filas sustituyen al esqueleto"
        );
        let demand = Settings::default().demand();
        assert!(demand.contains(vantare_ipc::Signal::Sectors));
        assert!(demand.contains(vantare_ipc::Signal::Weather));
        let unknown: Settings = serde_json::from_str(r#"{"designSystem":"otro","style":"carmin"}"#)
            .expect("valores desconocidos");
        assert_eq!(
            (unknown.design_system, unknown.style),
            (DesignSystem::Vantare, Look::Carmin)
        );
        assert!(
            Widget::new(&Settings::eficiencia(), prefs)
                .vantare
                .is_none()
        );
    }

    #[test]
    fn columns_move_between_visible_ones_and_keep_hidden_ones_and_position() {
        let order = |columns: &[options::ColumnSetting]| -> Vec<String> {
            columns
                .iter()
                .filter(|c| (c.enabled || c.metric_id == "driverName") && c.metric_id != "vehicle")
                .map(|c| c.metric_id.clone())
                .collect()
        };
        let mut columns = vantare_template("standard");
        let before = columns.clone();
        assert!(move_column(&mut columns, "gap", Some("driverName")));
        assert_eq!(
            order(&columns),
            [
                "position",
                "positionsGained",
                "driverNumber",
                "gap",
                "driverName",
                "pit",
                "sectors"
            ]
        );
        assert_eq!(columns.len(), before.len(), "no se pierde ni duplica nada");
        assert!(!move_column(&mut columns, "position", None), "P es fija");
        assert!(!move_column(&mut columns, "gap", Some("gap")));
        assert!(!move_column(&mut columns, "gap", Some("noExiste")));
        assert!(shift_column(&mut columns, "gap", 1));
        assert_eq!(order(&columns)[3..5], ["driverName", "gap"]);
        assert!(shift_column(&mut columns, "pit", -1));
        assert!(
            !shift_column(&mut columns, "positionsGained", -1),
            "ya es la primera"
        );
        let last = order(&columns).last().cloned().expect("columnas");
        assert!(!shift_column(&mut columns, &last, 1), "ya es la última");
        assert!(move_column(&mut columns, "positionsGained", None));
        assert_eq!(
            order(&columns).last().map(String::as_str),
            Some("positionsGained")
        );
        let options = vantare::Options::from_settings(&Settings {
            columns: Some(columns),
            ..Settings::default()
        });
        assert_eq!(options.cols.order.last(), Some(&vantare::Kind::Gained));
    }

    #[test]
    fn hidden_interval_changes_do_not_request_repaint() {
        let prefs = Preferences::default();
        let mut snapshot = source::fixed();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        snapshot.state.cars[3].gap_class_ahead =
            vantare_domain::Quality::Reliable(vantare_domain::Gap::Time { seconds: 1.23 });
        assert!(!widget.ingest(&snapshot, prefs), "intervalo oculto");

        let settings = Settings {
            columns: Some(
                serde_json::from_str(r#"[{"id":"interval","metricId":"interval"}]"#)
                    .expect("columna"),
            ),
            ..Settings::eficiencia()
        };
        let mut visible = Widget::new(&settings, prefs);
        visible.ingest(&snapshot, prefs);
        snapshot.state.cars[3].gap_class_ahead =
            vantare_domain::Quality::Reliable(vantare_domain::Gap::Time { seconds: 2.34 });
        assert!(visible.ingest(&snapshot, prefs), "intervalo visible");
    }

    /// Diagnóstico de invalidaciones ocultas, sin ventana ni medición de CPU.
    #[test]
    #[ignore = "benchmark manual sin pantalla"]
    fn benchmark_hidden_interval_projection() {
        let prefs = Preferences::default();
        let mut snapshot = source::fixed();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        widget.ingest(&snapshot, prefs);
        let start = Instant::now();
        let mut repaints = 0;
        for sequence in 1..=10_000 {
            snapshot.sequence = sequence;
            snapshot.state.cars[3].gap_class_ahead =
                vantare_domain::Quality::Reliable(vantare_domain::Gap::Time {
                    seconds: if sequence % 2 == 0 { 1.23 } else { 2.34 },
                });
            repaints += usize::from(std::hint::black_box(widget.ingest(&snapshot, prefs)));
        }
        eprintln!(
            "hidden_interval samples=10000 repaints={repaints} elapsed_us={}",
            start.elapsed().as_micros()
        );
    }
    /// Diagnóstico sin GPUI/ventana; no mide CPU del renderer ni del juego.
    #[test]
    #[ignore = "benchmark manual sin pantalla"]
    fn benchmark_unchanged_standings_projection() {
        let prefs = Preferences::default();
        let mut snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/standings.snapshot.json"))
                .expect("captura LMU");
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        widget.ingest(&snapshot, prefs);
        #[cfg(feature = "paint-stats")]
        crate::profiling::report();
        let start = Instant::now();
        let mut repaints = 0;
        for sequence in 1..=10_000 {
            snapshot.sequence = sequence;
            repaints += usize::from(std::hint::black_box(widget.ingest(&snapshot, prefs)));
        }
        eprintln!(
            "unchanged_standings samples=10000 repaints={repaints} elapsed_us={}",
            start.elapsed().as_micros()
        );
        #[cfg(feature = "paint-stats")]
        crate::profiling::report();
        assert_eq!(repaints, 0);
    }

    #[test]
    fn real_lmu_footer_slots_preserve_visible_vm_through_requested_pipe() {
        use std::{sync::Arc, time::Duration};
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/telemetry-real/lmu47.snapshot.json"
        ))
        .expect("foto LMU47 real");
        let settings: Settings = serde_json::from_str(r#"{"designSystem":"eficiencia","classScope":"all-classes","classificationMode":"multiclass","columns":[{"metricId":"position"},{"metricId":"carNumber"},{"metricId":"driverName"},{"metricId":"class"},{"metricId":"gap"},{"metricId":"interval"},{"metricId":"currentLap"},{"metricId":"lastLap"},{"metricId":"bestLap"},{"metricId":"pit"}],"footerSlots":["ambient","track","wind","rain","wetness","time","lap","position","bestLap"]}"#).expect("opciones de la issue #1475");
        let demand = settings.demand();
        assert!(!demand.contains(vantare_ipc::Signal::TrackName));
        let name = format!("vantare-standings-1475-{}", std::process::id());
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
        publisher
            .publish(Arc::new(snapshot.clone()))
            .expect("foto real");
        let photo = subscriber
            .next_photo(Duration::from_secs(2))
            .expect("foto pedida");
        let prefs = Preferences::default();
        let mut widget = Widget::new(&settings, prefs);
        assert!(widget.ingest(&snapshot, prefs));
        let visible_rows = widget.vm.rows.clone();
        let visible_footer = widget.vm.footer_cells.clone();
        assert_eq!(visible_footer.len(), 9);
        let mut requested = Widget::new(&settings, prefs);
        assert!(requested.ingest(&photo.snapshot, prefs));
        assert_eq!(requested.vm.rows, visible_rows);
        assert_eq!(requested.vm.footer_cells, visible_footer);
        assert!(
            !widget.ingest(&photo.snapshot, prefs),
            "mismo contenido visible: sin invalidacion por nombre de pista omitido"
        );
        assert_eq!(widget.vm, requested.vm);
    }

    #[test]
    fn track_name_invalidates_only_when_the_footer_draws_it() {
        let prefs = Preferences::default();
        for (settings, visible) in [
            (Settings::eficiencia(), true),
            (
                Settings {
                    footer_slots: Some(vec!["track".into()]),
                    ..Settings::eficiencia()
                },
                false,
            ),
            (
                Settings {
                    show_session_footer: false,
                    ..Settings::eficiencia()
                },
                false,
            ),
            (
                Settings {
                    footer_first: "none".into(),
                    ..Settings::eficiencia()
                },
                false,
            ),
            (
                Settings {
                    footer_second: "totalLaps".into(),
                    ..Settings::eficiencia()
                },
                true,
            ),
        ] {
            let mut snapshot = source::fixed();
            let mut widget = Widget::new(&settings, prefs);
            assert!(widget.ingest(&snapshot, prefs));
            snapshot.state.session.track_name =
                vantare_domain::Quality::Reliable("Otra pista".into());
            assert_eq!(widget.ingest(&snapshot, prefs), visible, "{settings:?}");
        }
    }

    #[test]
    fn live_style_reflows_rows_and_rail_without_changing_data() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/standings.snapshot.json"))
                .expect("escena");
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        widget.ingest(&snapshot, prefs);
        let rows = widget.vm.rows.clone();
        let before = widget.size();
        let tops = widget.plan.row_tops.clone();
        let mut style = style::Style::default();
        style.geometry.row_height = 40.0;
        style.geometry.session_header_height = 50.0;
        style.colors.panel = style::Color(0x123456);
        widget.set_style(std::sync::Arc::new(style));
        assert_eq!(widget.vm.rows, rows);
        assert_eq!(widget.plan.visible_rows, tops.len());
        assert_eq!(widget.size().0, before.0);
        assert_eq!(widget.size().1, before.1 + 208.0);
        assert_eq!(widget.plan.row_tops[1], 40.0);
        assert_eq!(widget.config.style.colors.panel.0, 0x123456);
    }

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
                        ..Settings::eficiencia()
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
                ..Settings::eficiencia()
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
                    ..Settings::eficiencia()
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
                ..Settings::eficiencia()
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
                ..Settings::eficiencia()
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
                ..Settings::eficiencia()
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
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
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
        let mut standings = Widget::new(&Settings::eficiencia(), Preferences::default());
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
        let mut standings = Widget::new(&Settings::eficiencia(), Preferences::default());
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
