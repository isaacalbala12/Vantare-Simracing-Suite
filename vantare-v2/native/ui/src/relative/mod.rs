//! Relative común: un Board y Motion activos, con pintores por Look.

#[cfg(test)]
mod contract_tests;
mod eficiencia;
mod motion;
pub(crate) mod vantare;

use crate::app::{Paint, Wake};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text::{self, Ink, ink};
use crate::efficiency::{col, paint_rect, rect, tokens};
use gpui::{
    App, BorderStyle, ContentMask, Corners, Edges, linear_color_stop, linear_gradient, px, quad,
};
use motion::Motion;
use std::time::Instant;
use vantare_domain::{
    Snapshot,
    format::{Language, Preferences},
    relative::{self, Side, ViewModel},
};

pub const SIZE: (f32, f32) = (470.0, 277.0);
const SCALE: f32 = 1.0;
const BAND: f32 = 36.0;
const FOOTER: f32 = 38.0;
const ROW: f32 = 29.0;
// Conserva las señales Vantare (número y mejor vuelta), sin inventar ratings.
const EDGES: [f32; 7] = [0.0, 30.0, 38.0, 68.0, 300.0, 364.0, 470.0];

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::standings::DesignSystem,
    #[serde(default)]
    pub content_version: u8,
    pub style: crate::standings::Look,
    pub accent: crate::standings::Accent,
    pub columns: Option<Vec<crate::standings::options::ColumnSetting>>,
    pub range_ahead: usize,
    pub range_behind: usize,
    pub class_scope: String,
    pub include_player: bool,
    pub row_height_mode: String,
    pub footer_slots: Vec<String>,
    /// Marca Vantare: decisión inyectada por el host según la licencia
    /// (como en Standings). Sin decisión no se pinta.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            design_system: crate::standings::DesignSystem::Vantare,
            content_version: 1,
            style: crate::standings::Look::Neo,
            accent: crate::standings::Accent::Red,
            columns: None,
            range_ahead: 3,
            range_behind: 3,
            class_scope: "sameClass".into(),
            include_player: true,
            row_height_mode: "compact".into(),
            footer_slots: Vec::new(),
            brand_visible: None,
        }
    }
}
/// Métricas de Relative Vantare que ocupan un hueco propio (el punto de clase
/// es fijo; el coche y la tira de pista son complementos).
const MOVABLE: &[&str] = &[
    "position",
    "carNumber",
    "driverNumber",
    "driverName",
    "lapDelta",
    "driverRating",
    "safetyRating",
    "trend",
    "gap",
];

/// Plantillas Relative Vantare del catálogo r10b: `compact` (±2, 280 px),
/// `standard` (±3, 420 px, el del Studio) y `expanded` (±4, 600 px, con tira).
#[must_use]
pub fn vantare_template(name: &str) -> Vec<crate::standings::options::ColumnSetting> {
    let (driver, on): (&str, &[&str]) = match name {
        "compact" => ("sm", &["carNumber", "driverName", "gap"]),
        "expanded" => (
            "md",
            &[
                "position",
                "carNumber",
                "driverName",
                "vehicle",
                "lapDelta",
                "driverRating",
                "safetyRating",
                "trend",
                "gap",
                "trackStrip",
            ],
        ),
        _ => (
            "lg",
            &["position", "driverName", "vehicle", "lapDelta", "gap"],
        ),
    };
    [
        "position",
        "carNumber",
        "driverName",
        "vehicle",
        "lapDelta",
        "driverRating",
        "safetyRating",
        "trend",
        "gap",
        "trackStrip",
    ]
    .iter()
    .map(|metric| crate::standings::options::ColumnSetting {
        id: (*metric).into(),
        metric_id: (*metric).into(),
        enabled: on.contains(metric),
        width_preset: if *metric == "driverName" {
            driver.into()
        } else {
            "auto".into()
        },
        ..crate::standings::options::ColumnSetting::default()
    })
    .collect()
}

/// Mueve `metric` delante de `before` (o al final); ver `vantare::columns`.
pub fn move_column(
    columns: &mut Vec<crate::standings::options::ColumnSetting>,
    metric: &str,
    before: Option<&str>,
) -> bool {
    crate::vantare::columns::move_column(columns, metric, before, MOVABLE)
}

/// Desplaza `metric` un puesto entre las columnas visibles.
pub fn shift_column(
    columns: &mut Vec<crate::standings::options::ColumnSetting>,
    metric: &str,
    step: i32,
) -> bool {
    crate::vantare::columns::shift_column(columns, metric, step, MOVABLE)
}

impl Settings {
    /// Relative del sistema Eficiencia heredado.
    #[must_use]
    pub fn eficiencia() -> Self {
        Self {
            design_system: crate::standings::DesignSystem::Eficiencia,
            ..Self::default()
        }
    }

    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "includePlayer",
            "parseRelativeContent conserva siempre al jugador; el inspector productivo no ofrece ocultarlo",
        ),
        (
            "rowHeightMode",
            "RelativeFunctional conserva filas de 28 px; fill solo figura en su clave de presentación",
        ),
        (
            "columns.format.display/decimals",
            "el VM v2 productivo siempre formatea la vuelta completa con tres decimales",
        ),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.range_ahead = value.range_ahead.min(8);
        value.range_behind = value.range_behind.min(8);
        value.include_player = true;
        if value.content_version == 0
            && value.design_system == crate::standings::DesignSystem::Vantare
        {
            value.class_scope = "sameClass".into();
        } else if value.class_scope != "sameClass" {
            value.class_scope = "all".into();
        }
        if value.row_height_mode != "fill" {
            value.row_height_mode = "compact".into();
        }
        value.footer_slots.truncate(9);
        if value.content_version == 0
            && value.design_system == crate::standings::DesignSystem::Eficiencia
            && let Some(columns) = &mut value.columns
        {
            columns.truncate(7);
            columns.retain(|c| {
                [
                    "position",
                    "class",
                    "carNumber",
                    "driverName",
                    "gap",
                    "bestLap",
                    "lastLap",
                ]
                .contains(&c.metric_id.as_str())
            });
        }
        value.content_version = 1;
        value
    }
    fn content(&self) -> relative::Content {
        relative::Content {
            range_ahead: self.range_ahead,
            range_behind: self.range_behind,
            same_class: self.class_scope == "sameClass",
            include_player: self.include_player,
        }
    }
    fn slot_count(&self) -> usize {
        self.range_ahead + self.range_behind + usize::from(self.include_player)
    }
    fn size(&self) -> (f32, f32) {
        (SIZE.0, SIZE.1 + (self.slot_count() as f32 - 7.0) * ROW)
    }
}

/// Board y Motion activos comunes: los pintores solo reciben datos proyectados.
pub(crate) struct Widget {
    settings: Settings,
    board: std::sync::Arc<relative::Board>,
    visual: Painter,
    motion: Engine,
    boundary: Option<(u64, u64, Preferences)>,
    workshop: bool,
}
enum Painter {
    Eficiencia(Box<eficiencia::Visual>),
    Vantare(vantare::Visual),
}
enum Engine {
    Eficiencia(Motion),
    Vantare(std::sync::Arc<vantare::Movement>),
}
impl Widget {
    fn presentation(
        settings: &Settings,
        board: std::sync::Arc<relative::Board>,
    ) -> (Painter, Engine) {
        match settings.design_system {
            crate::standings::DesignSystem::Eficiencia => (
                Painter::Eficiencia(Box::new(eficiencia::Visual::new(settings, board))),
                Engine::Eficiencia(Motion::default()),
            ),
            crate::standings::DesignSystem::Vantare => (
                Painter::Vantare(vantare::Visual::new(vantare::Options::from_settings(
                    settings,
                ))),
                Engine::Vantare(std::sync::Arc::new(vantare::Movement::default())),
            ),
        }
    }
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let board = std::sync::Arc::new(relative::project_configured(
            &Snapshot::default(),
            prefs,
            settings.content(),
            &settings.footer_slots,
        ));
        let (visual, motion) = Self::presentation(&settings, board.clone());
        Self {
            settings,
            board,
            visual,
            motion,
            boundary: None,
            workshop: false,
        }
    }
    pub(crate) fn workshop_layout(&mut self) {
        self.workshop = true;
        if let Painter::Eficiencia(v) = &mut self.visual {
            v.workshop_layout();
        }
    }
    pub(crate) fn settle(&mut self) {
        if let Engine::Vantare(m) = &mut self.motion {
            std::sync::Arc::make_mut(m).settle();
        }
    }
    pub(crate) fn set_vantare_style(
        &mut self,
        style: std::sync::Arc<crate::vantare::style::Style>,
    ) {
        if let (Painter::Vantare(v), Engine::Vantare(m)) = (&mut self.visual, &mut self.motion) {
            v.set_style(style, std::sync::Arc::make_mut(m));
        }
    }
    pub(crate) fn vantare_columns(&self) -> Option<crate::vantare::columns::ColumnBoxes> {
        match &self.visual {
            Painter::Eficiencia(_) => None,
            Painter::Vantare(v) => v.columns(),
        }
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        match &self.visual {
            Painter::Eficiencia(v) => v.size(),
            Painter::Vantare(v) => v.size(),
        }
    }
    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        self.ingest_using(snapshot, prefs, relative::project_cached)
    }
    fn ingest_using(
        &mut self,
        snapshot: &Snapshot,
        prefs: Preferences,
        project: impl FnOnce(
            &Snapshot,
            Preferences,
            relative::Content,
            &[String],
            Option<&std::sync::Arc<relative::Board>>,
        ) -> std::sync::Arc<relative::Board>,
    ) -> bool {
        let next = project(
            snapshot,
            prefs,
            self.settings.content(),
            &self.settings.footer_slots,
            Some(&self.board),
        );
        let boundary = Some((snapshot.epoch, snapshot.state.session.id.0, prefs));
        let continuous = self.boundary == boundary;
        self.boundary = boundary;
        let changed = self.present(next.clone(), continuous);
        self.board = next;
        changed
    }
    fn present(&mut self, board: std::sync::Arc<relative::Board>, continuous: bool) -> bool {
        if continuous && std::sync::Arc::ptr_eq(&self.board, &board) {
            return false;
        }
        match (&mut self.visual, &mut self.motion) {
            (Painter::Eficiencia(v), Engine::Eficiencia(m)) => v.ingest(board, m, continuous),
            (Painter::Vantare(v), Engine::Vantare(m)) => v.ingest_shared(board, m),
            _ => unreachable!("pintor y política se seleccionan juntos"),
        }
    }
    pub(crate) fn set_look(&mut self, look: crate::look::Look, _prefs: Preferences) {
        if self.settings.design_system == look {
            return;
        }
        let notices = match &self.motion {
            Engine::Eficiencia(m) => m.notices(),
            Engine::Vantare(m) => m.rows.notices(),
        };
        self.settings.design_system = look;
        (self.visual, self.motion) = Self::presentation(&self.settings, self.board.clone());
        if self.workshop {
            self.workshop_layout();
        }
        self.present(self.board.clone(), false);
        match &mut self.motion {
            Engine::Eficiencia(m) => m.restore_notices(&notices),
            Engine::Vantare(m) => std::sync::Arc::make_mut(m).rows.restore_notices(&notices),
        }
    }
    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        self.frame_with_motion(prefs, false)
    }
    pub(crate) fn frame_with_motion(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        match (&mut self.visual, &mut self.motion) {
            (Painter::Eficiencia(v), Engine::Eficiencia(m)) => v.frame(prefs, reduced, m),
            (Painter::Vantare(v), Engine::Vantare(m)) => {
                v.presentation(prefs.language);
                if reduced {
                    std::sync::Arc::make_mut(m).settle();
                }
                let wake = v.wake(m, Instant::now());
                let v = v.clone();
                let m = m.clone();
                (
                    Box::new(move |window, cx| v.paint(&m, prefs.language, window, cx)),
                    wake,
                )
            }
            _ => unreachable!("pintor y política se seleccionan juntos"),
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match (&self.visual, &self.motion) {
            (Painter::Eficiencia(_), Engine::Eficiencia(m)) => m.animating(Instant::now()),
            (Painter::Vantare(v), Engine::Vantare(m)) => v.wake(m, Instant::now()) != Wake::Idle,
            _ => unreachable!(),
        }
    }
}
#[cfg(test)]
impl std::ops::Deref for Widget {
    type Target = eficiencia::Visual;
    fn deref(&self) -> &Self::Target {
        match &self.visual {
            Painter::Eficiencia(v) => v,
            Painter::Vantare(_) => panic!("test Eficiencia sobre otro Look"),
        }
    }
}

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            LapTimes, PitStatus, Positions, Relative, SessionClock, SessionInfo, TrackName, Weather,
        };
        let settings = self.normalized();
        let mut demand = crate::demand::signals(
            33,
            &[
                vantare_ipc::Signal::Cars,
                Relative,
                Positions,
                PitStatus,
                SessionInfo,
                TrackName,
                vantare_ipc::Signal::Flags,
                LapTimes,
            ],
        );
        if settings.columns.as_ref().is_none_or(|cols| {
            cols.iter()
                .any(|c| c.enabled && matches!(c.metric_id.as_str(), "bestLap" | "lastLap"))
        }) {
            demand.request(LapTimes, 250);
        }
        // Con estado stale, paint usa el pie común incluso con slots configurados.
        demand.request(SessionClock, 250);
        demand.request(Weather, 500);
        for id in &settings.footer_slots {
            crate::demand::information(&mut demand, id, true);
        }
        demand
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn every_look_projects_once_per_ingest_and_switches_on_the_same_board() {
        let photo = source::fixed();
        let prefs = Preferences::default();
        for &look in crate::look::Look::ALL {
            let settings = Settings {
                design_system: look,
                class_scope: "all".into(),
                ..Settings::default()
            };
            let mut widget = Widget::new(&settings, prefs);
            let mut calls = 0;
            widget.ingest_using(&photo, prefs, |s, p, c, ids, previous| {
                calls += 1;
                relative::project_cached(s, p, c, ids, previous)
            });
            assert_eq!(calls, 1);
            let board = widget.board.clone();
            let demand = widget.settings.demand();
            let content = widget.settings.content();
            let notice = (
                vantare_domain::CarId(98765),
                crate::vantare::motion::Flash::Gain,
                Instant::now(),
                1,
            );
            match &mut widget.motion {
                Engine::Eficiencia(m) => m.restore_notices(&[notice]),
                Engine::Vantare(m) => std::sync::Arc::make_mut(m).rows.restore_notices(&[notice]),
            }
            for &next in crate::look::Look::ALL
                .iter()
                .rev()
                .chain(crate::look::Look::ALL)
            {
                widget.set_look(next, prefs);
                assert!(std::sync::Arc::ptr_eq(&board, &widget.board));
                assert_eq!(content, widget.settings.content());
                assert_eq!(demand, widget.settings.demand());
                let notices = match &widget.motion {
                    Engine::Eficiencia(m) => m.notices(),
                    Engine::Vantare(m) => m.rows.notices(),
                };
                assert!(
                    notices.contains(&notice),
                    "mantener CarId, kind y reloj aunque la fila no se pinte"
                );
            }
            widget.ingest_using(&photo, prefs, |s, p, c, ids, previous| {
                calls += 1;
                relative::project_cached(s, p, c, ids, previous)
            });
            assert_eq!(calls, 2);
        }
    }

    #[test]
    fn saved_relative_keeps_look_migrated_scope_columns_and_geometry() {
        let json=br#"{"version":1,"instances":[{"id":"relative","x":17,"y":29,"opacity":0.8,"settings":{"kind":"relative","designSystem":"vantare","style":"neutro","accent":"amber","classScope":"all","columns":[{"metricId":"driverName"},{"metricId":"gap","enabled":false}]}}]}"#;
        let mut layout = crate::layout::Layout::from_json(json).expect("layout histórico");
        let original = layout.clone();
        for &look in crate::look::Look::ALL {
            layout.instances[0].settings.set_look(look);
            layout =
                crate::layout::Layout::from_json(&serde_json::to_vec(&layout).expect("guardar"))
                    .expect("recargar");
            let crate::Settings::Relative(s) = &layout.instances[0].settings else {
                panic!("tipo relativo")
            };
            assert_eq!(s.design_system, look);
            assert_eq!(s.class_scope, "sameClass");
            assert_eq!(s.content_version, 1);
            assert_eq!(s.columns.as_ref().expect("columnas").len(), 2);
            assert_eq!(s.style, crate::standings::Look::Neutro);
            assert_eq!(s.accent, crate::standings::Accent::Amber);
            assert_eq!(layout.instances[0].geometry, original.instances[0].geometry);
        }
    }

    #[test]
    fn normalized_content_keeps_columns_for_future_looks() {
        let columns: Vec<_> = (0..14)
            .map(|id| crate::standings::options::ColumnSetting {
                id: format!("column-{id}"),
                metric_id: "driverName".into(),
                ..Default::default()
            })
            .collect();
        for &look in crate::look::Look::ALL {
            let settings = Settings {
                design_system: look,
                columns: Some(columns.clone()),
                ..Default::default()
            };
            let saved = serde_json::to_vec(&settings.normalized()).expect("guardar");
            let reloaded: Settings = serde_json::from_slice(&saved).expect("recargar");
            assert_eq!(reloaded.normalized().columns.as_ref(), Some(&columns));
        }
    }

    #[test]
    fn standard_vantare_relative_always_uses_player_class_even_in_old_documents() {
        let scene: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/relative-vantare.scene.json"))
                .expect("escena multiclase");
        let photo = vantare_ipc::snapshot_from_json(&scene["frames"][0]["snapshot"].to_string())
            .expect("foto multiclase");
        let settings = Settings {
            class_scope: "all".into(),
            content_version: 0,
            ..Settings::default()
        };
        assert_eq!(settings.normalized().class_scope, "sameClass");
        let board = relative::project_content(
            &photo,
            Preferences::default(),
            settings.normalized().content(),
        );
        let own_class = photo.state.player_car().expect("jugador").class.as_ref();
        assert!(board.slots.iter().flatten().any(|row| !row.is_player));
        assert!(board.slots.iter().flatten().all(|row| {
            photo
                .state
                .cars
                .iter()
                .find(|car| car.id == row.id)
                .expect("fila de la foto")
                .class
                .as_ref()
                == own_class
        }));
    }
    #[test]
    fn real_custom_footers_keep_visible_fresh_and_stale_data_through_requested_pipe() {
        use std::sync::Arc;
        let mut lost = Vec::new();
        for (index, scene) in [
            include_str!("../../fixtures/telemetry-real/acc.snapshot.json"),
            include_str!("../../fixtures/telemetry-real/lmu-stale.snapshot.json"),
        ]
        .into_iter()
        .enumerate()
        {
            let snapshot = vantare_ipc::snapshot_from_json(scene).expect("foto real intacta");
            for id in ["track", "ambient", "time"] {
                let settings = Settings {
                    footer_slots: vec![id.into()],
                    ..Settings::eficiencia()
                };
                let prefs = Preferences::default();
                let mut full = Widget::new(&settings, prefs);
                full.ingest(&snapshot, prefs);
                assert_eq!(full.vm.footer_cells.len(), 1);
                assert_ne!(
                    full.vm.footer_cells[0].value,
                    vantare_domain::format::PLACEHOLDER
                );

                let name = format!(
                    "vantare-relative-footer-real-{}-{index}-{id}",
                    std::process::id()
                );
                let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("pipe");
                let source = publisher.demand_source();
                let demand = settings.demand();
                let mut subscriber =
                    vantare_ipc::Subscriber::connect_requested(&name, demand.clone(), |_| true)
                        .expect("suscriptor");
                let deadline = Instant::now() + std::time::Duration::from_secs(2);
                while source.mask() != demand.mask() {
                    assert!(Instant::now() < deadline, "demanda no aceptada");
                    std::thread::yield_now();
                }
                publisher
                    .publish(Arc::new(snapshot.clone()))
                    .expect("foto real");
                let photo = subscriber
                    .next_photo(std::time::Duration::from_secs(2))
                    .expect("foto pedida");
                let mut requested = Widget::new(&settings, prefs);
                requested.ingest(&photo.snapshot, prefs);
                if full.vm.footer_cells != requested.vm.footer_cells {
                    lost.push(format!(
                        "foto {index}, slot {id}: {:?} -> {:?}",
                        full.vm.footer_cells, requested.vm.footer_cells
                    ));
                }
                if full.vm.status.is_some() {
                    // Con estado stale, paint usa el pie común (reloj + clima).
                    let visible = |vm: &relative::ViewModel| {
                        (
                            vm.remaining.clone(),
                            vm.air.clone(),
                            vm.track_temperature.clone(),
                            vm.wind.clone(),
                        )
                    };
                    if visible(&full.vm) != visible(&requested.vm) {
                        lost.push(format!(
                            "foto {index}, slot {id}, pie stale: {:?} -> {:?}",
                            visible(&full.vm),
                            visible(&requested.vm)
                        ));
                    }
                }
            }
        }
        assert!(lost.is_empty(), "datos reales visibles perdidos: {lost:#?}");
    }

    #[test]
    fn row_count_changes_height_without_changing_row_proportions() {
        for ahead in 0..=8 {
            for behind in 0..=8 {
                let settings = Settings {
                    range_ahead: ahead,
                    range_behind: behind,
                    ..Settings::eficiencia()
                };
                let (width, height) = settings.size();
                assert_eq!(width, 470.0);
                assert_eq!(height, BAND + FOOTER + settings.slot_count() as f32 * 29.0);
            }
        }
    }

    #[test]
    fn configured_columns_fill_and_slots_reach_the_rendered_model() {
        let prefs = Preferences::default();
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/relative.snapshot.json"))
                .expect("escena");
        let settings: Settings = serde_json::from_str(r#"{"designSystem":"eficiencia","rangeAhead":1,"rangeBehind":2,"classScope":"sameClass","rowHeightMode":"fill","footerSlots":["time","lastLap","track"],"columns":[{"id":"driverName","metricId":"driverName","format":{"mode":"initial"}},{"id":"lastLap","metricId":"lastLap","widthPreset":"md"}]}"#).expect("ajustes");
        let mut widget = Widget::new(&settings, prefs);
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.vm.slots.len(), 4);
        assert_eq!(widget.vm.footer_cells.len(), 3);
        assert_eq!(widget.vm.footer_cells[0].value, "01:59:58");
        assert_eq!(widget.settings.row_height_mode, "fill");
        assert_eq!(
            widget.settings.columns.as_ref().expect("columnas")[0].driver_name("André Lotterer"),
            "A. Lotterer"
        );
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        assert!(
            Settings {
                include_player: false,
                ..Settings::eficiencia()
            }
            .normalized()
            .include_player
        );
    }

    #[test]
    fn unchanged_drawing_does_not_repaint_and_first_snapshot_is_quiet() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
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
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        let mut snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/relative.snapshot.json"))
                .expect("escena reconstruida v4");
        assert!(widget.ingest(&snapshot, prefs));
        // Mover un rival visible de la clase del jugador; cambiar otra clase
        // ya no demuestra una animación en Relative estándar (#1496).
        let rival = widget
            .vm
            .slots
            .iter()
            .flatten()
            .find(|row| row.side != vantare_domain::relative::Side::Player)
            .expect("rival visible")
            .id;
        snapshot
            .state
            .cars
            .iter_mut()
            .find(|car| car.id == rival)
            .expect("rival en la foto")
            .relative_s = vantare_domain::Quality::Reliable(-0.1);
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
