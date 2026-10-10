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

#[cfg(test)]
mod contract_tests;
mod eficiencia;
pub mod model;
pub(crate) mod motion;
pub mod options;
pub(crate) mod style;
pub(crate) mod vantare;
pub(crate) mod view;

use crate::app::Paint;
use crate::session::Session;
use model::{Config, Metric};
use motion::Wake;
use std::time::Instant;
use vantare_domain::{Snapshot, format::Preferences, standings};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Opciones productivas independientes, no estados excluyentes.
pub struct Settings {
    pub design_system: DesignSystem,
    /// V1: contenido normalizado antes de separar su Look (layouts antiguos migran en memoria).
    #[serde(default)]
    pub content_version: u8,
    pub style: Look,
    pub accent: Accent,
    pub row_count: usize,
    /// Columnas de carrera y, en layouts anteriores a #1564, de todas las sesiones.
    pub columns: Option<Vec<options::ColumnSetting>>,
    /// Pestañas Práctica y Qualy (#1564); `None` usa `columns`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub practice_columns: Option<Vec<options::ColumnSetting>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qualifying_columns: Option<Vec<options::ColumnSetting>>,
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

/// Alias público para layouts/inspector anteriores; los Looks viven en UI.
pub use crate::look::Look as DesignSystem;

/// Estilo Vantare del catálogo r10b.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Look {
    /// Neo con fondos en escala de grises, sin subtono rojo.
    Neutro,
    #[default]
    #[serde(other)]
    Neo,
}

impl Look {
    pub fn name(self) -> &'static str {
        match self {
            Self::Neo => "neo",
            Self::Neutro => "neutro",
        }
    }
    pub fn from_name(name: &str) -> Self {
        if name == "neutro" {
            Self::Neutro
        } else {
            Self::Neo
        }
    }
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

/// Preset de columnas de cada pestaña (#1564), en el orden de las plantillas.
#[must_use]
pub fn session_preset(session: Session) -> Vec<options::ColumnSetting> {
    let on: &[&str] = match session {
        Session::Practice | Session::Qualifying => &[
            "position",
            "driverNumber",
            "driverName",
            "bestLap",
            "gap",
            "lastLap",
            "sectors",
        ],
        Session::Race => &[
            "position",
            "driverNumber",
            "driverName",
            "gap",
            "interval",
            "lastLap",
            "pit",
            "positionsGained",
            "tireCompound",
        ],
    };
    let mut columns = vantare_template("standard");
    for column in &mut columns {
        column.enabled = on.contains(&column.metric_id.as_str());
    }
    columns.sort_by_key(|column| {
        on.iter()
            .position(|metric| *metric == column.metric_id)
            .unwrap_or(on.len())
    });
    columns
}

impl Default for Settings {
    fn default() -> Self {
        Self::for_look(crate::look::Look::default())
    }
}

impl Settings {
    /// Ejemplo nativo del inspector con los presets de sesión.
    #[cfg(feature = "parity-capture")]
    pub fn apply_session_preview(&mut self) {
        self.design_system = DesignSystem::Vantare;
        self.apply_session_presets();
    }

    /// Widgets nuevos: cada pestaña con su preset.
    pub fn apply_session_presets(&mut self) {
        for session in Session::ALL {
            *self.session_columns_slot(session) = Some(session_preset(session));
        }
    }

    /// Columnas guardadas de una pestaña, con la herencia de `columns`.
    #[must_use]
    pub fn session_columns(&self, session: Session) -> Option<&Vec<options::ColumnSetting>> {
        match session {
            Session::Practice => self.practice_columns.as_ref(),
            Session::Qualifying => self.qualifying_columns.as_ref(),
            Session::Race => None,
        }
        .or(self.columns.as_ref())
    }

    /// Editar una pestaña la independiza: copia antes lo que heredaba.
    pub fn session_columns_mut(&mut self, session: Session) -> &mut Vec<options::ColumnSetting> {
        // Editing Race must first detach the other tabs from legacy `columns`.
        if session == Session::Race {
            let inherited = self
                .columns
                .clone()
                .unwrap_or_else(|| self.legacy_columns());
            if self.practice_columns.is_none() {
                self.practice_columns = Some(inherited.clone());
            }
            if self.qualifying_columns.is_none() {
                self.qualifying_columns = Some(inherited);
            }
        }
        let inherited = self
            .session_columns(session)
            .cloned()
            .unwrap_or_else(|| self.legacy_columns());
        self.session_columns_slot(session).get_or_insert(inherited)
    }

    fn legacy_columns(&self) -> Vec<options::ColumnSetting> {
        if self.design_system == DesignSystem::Vantare {
            return vantare_template("standard");
        }
        // Eficiencia Signature without explicit columns: the existing config.
        [
            ("position", "xs"),
            ("driverNumber", "sm"),
            ("driverName", "lg"),
            ("gap", "md"),
            ("lastLap", "lg"),
        ]
        .into_iter()
        .map(|(metric, width)| options::ColumnSetting {
            id: metric.into(),
            metric_id: metric.into(),
            width_preset: width.into(),
            ..options::ColumnSetting::default()
        })
        .collect()
    }

    fn session_columns_slot(
        &mut self,
        session: Session,
    ) -> &mut Option<Vec<options::ColumnSetting>> {
        match session {
            Session::Practice => &mut self.practice_columns,
            Session::Qualifying => &mut self.qualifying_columns,
            Session::Race => &mut self.columns,
        }
    }

    /// Ajustes efectivos de una pestaña: sus columnas en `columns`.
    #[must_use]
    pub fn for_session(&self, session: Session) -> Self {
        let mut settings = self.clone();
        settings.columns = self.session_columns(session).cloned();
        settings.practice_columns = None;
        settings.qualifying_columns = None;
        settings
    }
}

impl Settings {
    pub(crate) fn workshop_defaults(look: crate::look::Look) -> Self {
        let mut s = Self::for_look(look);
        s.brand_visible = Some(true);
        match look {
            crate::look::Look::Vantare => {
                s.row_count = 8;
                s.columns = Some(vantare_template("standard"));
            }
            crate::look::Look::Eficiencia => {
                s.row_count = 10;
                s.columns = Some(crate::workshop::default_columns(crate::Kind::Standings));
                s.player_window = true;
                s.class_scope = "all-classes".into();
            }
        }
        s
    }

    /// Única fuente de los ajustes base: el Look cambia solo la presentación.
    #[must_use]
    pub fn for_look(design_system: crate::look::Look) -> Self {
        Self {
            design_system,
            content_version: 1,
            style: Look::Neo,
            accent: Accent::Red,
            row_count: 20,
            columns: None,
            practice_columns: None,
            qualifying_columns: None,
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

    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "headerFirst/headerSecond",
        "claves legacy: Eficiencia eliminó la segunda banda de información",
    )];
    /// Standings del sistema Eficiencia heredado (Signature por defecto).
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(crate::look::Look::Eficiencia)
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
        if settings.content_version == 0 && settings.design_system == DesignSystem::Vantare {
            settings.class_scope = if settings.classification_mode == "multiclass" {
                "all-classes"
            } else {
                "player-class"
            }
            .into();
        }
        settings.content_version = 1;
        if ![0, 2, 4, 6, 8].contains(&settings.window_around) {
            settings.window_around = 4;
        }
        for columns in [
            &mut settings.columns,
            &mut settings.practice_columns,
            &mut settings.qualifying_columns,
        ]
        .into_iter()
        .flatten()
        {
            columns.truncate(12);
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

/// Un Board y un Motion activo; los pintores no poseen historial.
pub(crate) struct Widget {
    /// Ajustes completos (tres pestañas) y los efectivos de `session`.
    all: Settings,
    session: Session,
    settings: Settings,
    content: standings::Content,
    board: Option<std::sync::Arc<standings::Board>>,
    boundary: (u64, u64, u64),
    presentation: Presentation,
}

/// Un solo pintor activo conserva el Motion común completo.
enum Presentation {
    Eficiencia {
        visual: Box<eficiencia::Visual>,
        motion: std::sync::Arc<motion::Motion>,
    },
    Vantare {
        visual: vantare::Visual,
        motion: std::sync::Arc<motion::Motion>,
    },
}
#[cfg(test)]
impl Presentation {
    fn notices(
        &self,
    ) -> Vec<(
        vantare_domain::CarId,
        crate::vantare::motion::Flash,
        Instant,
        i64,
    )> {
        match self {
            Self::Eficiencia { motion: m, .. } | Self::Vantare { motion: m, .. } => m.notices(),
        }
    }
    fn restore_notices(
        &mut self,
        notices: &[(
            vantare_domain::CarId,
            crate::vantare::motion::Flash,
            Instant,
            i64,
        )],
    ) {
        match self {
            Self::Eficiencia { motion: m, .. } | Self::Vantare { motion: m, .. } => {
                std::sync::Arc::make_mut(m).restore_notices(notices);
            }
        }
    }
}
impl Settings {
    fn content(&self) -> standings::Content {
        let config = self.config();
        let lap_format = |metric: &str| {
            self.columns
                .as_ref()
                .and_then(|columns| columns.iter().find(|c| c.enabled && c.metric_id == metric))
                .map(|c| standings::LapFormat {
                    compact: c.format.display.as_deref() == Some("compact"),
                    decimals: c.format.decimals.unwrap_or(3),
                })
                .filter(|f| f.compact || f.decimals != 3)
        };
        standings::Content {
            row_count: self.row_count,
            player_window: self.player_window,
            window_around: self.window_around,
            multiclass: self.classification_mode == "multiclass",
            last_lap_format: lap_format("lastLap"),
            best_lap_format: lap_format("bestLap"),
            lap_visible: config
                .columns
                .iter()
                .any(|c| c.metric == Metric::CurrentLap),
            interval_visible: config.columns.iter().any(|c| c.metric == Metric::Interval),
            footer_visible: self.show_session_footer,
            legacy_track_visible: self.show_session_footer
                && config.footer_slots.is_empty()
                && config
                    .footer_ids
                    .iter()
                    .all(|id| ["none", "track", "estimatedLaps"].contains(&id.as_str()))
                && [config.footer_first, config.footer_second].contains(&model::InfoMetric::Track),
            player_class: self.class_scope != "all-classes",
            class_gaps: self.class_scope != "all-classes"
                || self.classification_mode == "multiclass",
            footer_ids: if self.footer_slots.as_ref().is_some_and(|s| !s.is_empty()) {
                self.footer_slots.clone().unwrap_or_default()
            } else {
                vec![self.footer_first.clone(), self.footer_second.clone()]
            },
            footer_slots: self.footer_slots.as_ref().is_some_and(|s| !s.is_empty()),
        }
    }
}
impl Widget {
    fn presentation(
        settings: &Settings,
        prefs: Preferences,
        motion: std::sync::Arc<motion::Motion>,
    ) -> Presentation {
        match settings.design_system {
            DesignSystem::Eficiencia => Presentation::Eficiencia {
                visual: Box::new(eficiencia::Visual::new(settings, prefs)),
                motion,
            },
            DesignSystem::Vantare => Presentation::Vantare {
                visual: vantare::Visual::new(vantare::Options::from_settings(settings)),
                motion,
            },
        }
    }
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let all = settings.normalized();
        // Sin dato de sesión se usa Carrera (#1564).
        let session = Session::Race;
        let settings = all.for_session(session);
        let presentation = Self::presentation(&settings, prefs, std::sync::Arc::default());
        Self {
            all,
            session,
            content: settings.content(),
            settings,
            board: None,
            boundary: (0, 0, 0),
            presentation,
        }
    }
    fn content(&self) -> &standings::Content {
        &self.content
    }
    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        self.ingest_using(snapshot, prefs, standings::project_cached)
    }
    fn ingest_using(
        &mut self,
        snapshot: &Snapshot,
        prefs: Preferences,
        project: impl FnOnce(
            &Snapshot,
            Preferences,
            &standings::Content,
            Option<&std::sync::Arc<standings::Board>>,
        ) -> std::sync::Arc<standings::Board>,
    ) -> bool {
        if let Some(session) = Session::of(&snapshot.state.session.kind)
            && session != self.session
        {
            self.switch_session(session, prefs);
        }
        let next = project(snapshot, prefs, self.content(), self.board.as_ref());
        let boundary = (
            snapshot.epoch,
            snapshot.state.session.id.0,
            snapshot.sequence,
        );
        let same_facts = self
            .board
            .as_ref()
            .is_some_and(|old| std::sync::Arc::ptr_eq(old, &next));
        let continuous = self.boundary.0 == boundary.0
            && self.boundary.1 == boundary.1
            && boundary.2 >= self.boundary.2;
        self.boundary = boundary;
        if same_facts && continuous {
            return false;
        }
        let changed = self.present(next.clone(), prefs);
        self.board = Some(next);
        changed
    }
    fn present(&mut self, board: std::sync::Arc<standings::Board>, _prefs: Preferences) -> bool {
        match &mut self.presentation {
            Presentation::Eficiencia {
                visual: v,
                motion: m,
            } => {
                let content = std::sync::Arc::new(standings::Plan::new(
                    board,
                    format!("{}:{}", self.boundary.1, self.boundary.0),
                    self.boundary.2,
                ));
                v.ingest(content, Some(std::sync::Arc::make_mut(m)))
            }
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => v.ingest_shared(board, std::sync::Arc::make_mut(m)),
        }
    }
    /// Cambia a las columnas de otra pestaña conservando el Motion; la foto
    /// siguiente proyecta con el contenido nuevo.
    fn switch_session(&mut self, session: Session, prefs: Preferences) {
        let motion = match &self.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.clone()
            }
        };
        self.session = session;
        self.settings = self.all.for_session(session);
        self.content = self.settings.content();
        self.presentation = Self::presentation(&self.settings, prefs, motion);
        self.board = None;
    }
    /// Cambiar Look conserva la foto, `CarIds` y el reloj de los avisos; no proyecta.
    pub(crate) fn set_look(&mut self, look: crate::look::Look, prefs: Preferences) {
        if self.settings.design_system == look {
            return;
        }
        let motion = match &self.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.clone()
            }
        };
        self.settings.design_system = look;
        self.all.design_system = look;
        self.presentation = Self::presentation(&self.settings, prefs, motion);
        if let Some(board) = self.board.clone() {
            match &mut self.presentation {
                Presentation::Eficiencia { visual, motion } => {
                    let content = std::sync::Arc::new(standings::Plan::new(
                        board,
                        format!("{}:{}", self.boundary.1, self.boundary.0),
                        self.boundary.2,
                    ));
                    visual.ingest(content.clone(), None);
                    std::sync::Arc::make_mut(motion).resume_content(&content);
                }
                Presentation::Vantare { visual, motion } => {
                    visual.attach(board, std::sync::Arc::make_mut(motion));
                }
            }
        }
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        match &self.presentation {
            Presentation::Eficiencia { visual: v, .. } => v.size(),
            Presentation::Vantare { visual: v, .. } => v.size(),
        }
    }
    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        self.frame_with_motion(prefs, false)
    }
    pub(crate) fn frame_with_motion(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        match &mut self.presentation {
            Presentation::Eficiencia {
                visual: v,
                motion: m,
            } => v.frame_with_motion(prefs, reduced, std::sync::Arc::make_mut(m)),
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => {
                if reduced {
                    std::sync::Arc::make_mut(m).settle();
                }
                let wake = m.wake_rows(v.style.motion.timing(), Instant::now());
                let visual = v.clone();
                let motion = m.clone();
                (
                    Box::new(move |window, cx| visual.paint(&motion, prefs.language, window, cx)),
                    wake,
                )
            }
        }
    }
    pub(crate) fn settle(&mut self) {
        if let Presentation::Vantare { motion: m, .. } = &mut self.presentation {
            std::sync::Arc::make_mut(m).settle();
        }
    }
    pub(crate) fn set_study(&mut self, study: &str) {
        if let Presentation::Eficiencia { visual: v, .. } = &mut self.presentation {
            v.set_study(study);
        }
    }
    pub(crate) fn set_style(&mut self, style: std::sync::Arc<style::Style>) {
        if let Presentation::Eficiencia { visual: v, .. } = &mut self.presentation {
            v.set_style(style);
        }
    }
    pub(crate) fn set_vantare_style(
        &mut self,
        style: std::sync::Arc<crate::vantare::style::Style>,
    ) {
        if let Presentation::Vantare {
            visual: v,
            motion: m,
        } = &mut self.presentation
        {
            v.set_style(style, std::sync::Arc::make_mut(m));
        }
    }
    pub(crate) fn vantare_columns(&self) -> Option<crate::vantare::columns::ColumnBoxes> {
        match &self.presentation {
            Presentation::Eficiencia { visual: _, .. } => None,
            Presentation::Vantare { visual: v, .. } => v.columns(),
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match &self.presentation {
            Presentation::Eficiencia { motion: m, .. } => m.animating(Instant::now()),
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => m.wake_rows(v.style.motion.timing(), Instant::now()) != Wake::Idle,
        }
    }
}

// Los tests históricos inspeccionan geometría y celdas del pintor Eficiencia.
#[cfg(test)]
impl std::ops::Deref for Widget {
    type Target = eficiencia::Visual;
    fn deref(&self) -> &Self::Target {
        match &self.presentation {
            Presentation::Eficiencia { visual: v, .. } => v,
            Presentation::Vantare { visual: _, .. } => panic!("test Eficiencia sobre otro Look"),
        }
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
        let mut demand = crate::demand::signals(
            250,
            &[
                vantare_ipc::Signal::Cars,
                Positions,
                PitStatus,
                SessionInfo,
                SessionClock,
                Flags,
                Gaps,
                ClassGaps,
                LapCount,
                LapTimes,
                vantare_ipc::Signal::Sectors,
                vantare_ipc::Signal::Weather,
            ],
        );
        if settings.classification_mode == "multiclass" {
            demand.request(ClassGaps, 250);
        }
        // Señales de las tres pestañas: el cambio de sesión no espera a la demanda.
        let tabs: Vec<Config> = Session::ALL
            .iter()
            .map(|session| settings.for_session(*session).config())
            .collect();
        for column in tabs.iter().flat_map(|tab| &tab.columns) {
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

    #[test]
    fn look_switch_preserves_all_motion_channels_and_their_clocks() {
        let prefs = Preferences::default();
        let mut photo = crate::source::fixed();
        let mut widget = Widget::new(
            &Settings {
                class_scope: "all-classes".into(),
                ..Settings::eficiencia()
            },
            prefs,
        );
        widget.ingest(&photo, prefs);
        let p0 = photo.state.cars[0].position;
        photo.state.cars[0].position = photo.state.cars[1].position;
        photo.state.cars[1].position = p0;
        photo.state.cars[0].in_pits = vantare_domain::Quality::Reliable(true);
        photo.sequence += 1;
        widget.ingest(&photo, prefs);
        let clocks = match &widget.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.clock_signature()
            }
        };
        assert!(clocks.iter().any(|c| c.0.starts_with("flips:")));
        assert!(clocks.iter().any(|c| c.0.starts_with("pit-alpha:")));
        for look in [
            DesignSystem::Vantare,
            DesignSystem::Eficiencia,
            DesignSystem::Vantare,
            DesignSystem::Eficiencia,
        ] {
            widget.set_look(look, prefs);
            let after = match &widget.presentation {
                Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                    motion.clock_signature()
                }
            };
            assert_eq!(clocks, after, "todos los canales, no solo los avisos");
        }
    }

    use super::*;
    use crate::source;

    #[test]
    fn standard_vantare_is_player_class_and_only_multiclass_shows_all() {
        let settings: Settings =
            serde_json::from_str(r#"{"classScope":"all-classes"}"#).expect("layout anterior");
        assert_eq!(settings.normalized().class_scope, "player-class");
        let settings: Settings = serde_json::from_str(
            r#"{"classificationMode":"multiclass","classScope":"player-class"}"#,
        )
        .expect("layout anterior");
        assert_eq!(settings.normalized().class_scope, "all-classes");
    }
    #[test]
    fn vantare_is_the_default_system_and_paints_its_own_board() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/telemetry-real/acc.snapshot.json"
        ))
        .expect("foto real ACC");
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(matches!(
            widget.presentation,
            Presentation::Vantare { visual: _, .. }
        ));
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs), "misma foto, mismo dibujo");
        assert!(widget.board.is_some(), "las filas sustituyen al esqueleto");
        let demand = Settings::default().demand();
        assert!(demand.contains(vantare_ipc::Signal::Sectors));
        assert!(demand.contains(vantare_ipc::Signal::Weather));
        let unknown: Settings = serde_json::from_str(r#"{"designSystem":"otro","style":"carmin"}"#)
            .expect("valores desconocidos");
        assert_eq!(
            (unknown.design_system, unknown.style),
            (DesignSystem::Vantare, Look::Neo)
        );
        assert!(matches!(
            Widget::new(&Settings::eficiencia(), prefs).presentation,
            Presentation::Eficiencia { visual: _, .. }
        ));
    }

    #[test]
    fn each_ingest_runs_one_projection_for_every_look() {
        let prefs = Preferences::default();
        let snapshot = source::fixed();
        for &look in crate::look::Look::ALL {
            let mut widget = Widget::new(
                &Settings {
                    design_system: look,
                    ..Settings::default()
                },
                prefs,
            );
            let mut count = 0;
            for _ in 0..3 {
                widget.ingest_using(&snapshot, prefs, |snapshot, prefs, content, previous| {
                    count += 1;
                    standings::project_cached(snapshot, prefs, content, previous)
                });
            }
            assert_eq!(count, 3, "una sola proyección por ingest con {look:?}");
        }
    }

    #[test]
    fn changing_look_preserves_board_content_demand_and_active_notices() {
        let prefs = Preferences::default();
        let snapshot = source::fixed();
        for &look in crate::look::Look::ALL {
            let mut widget = Widget::new(
                &Settings {
                    design_system: look,
                    class_scope: "all-classes".into(),
                    ..Settings::default()
                },
                prefs,
            );
            widget.ingest(&snapshot, prefs);
            let board = widget.board.clone().expect("foto");
            let content = widget.content().clone();
            let demand = widget.settings.demand();
            let notice = (
                board.groups[0].rows[0].id,
                crate::vantare::motion::Flash::Gain,
                Instant::now(),
                2,
            );
            let personal = (
                board.groups[0].rows[1].id,
                crate::vantare::motion::Flash::PersonalBest,
                notice.2,
                0,
            );
            let hidden = (
                vantare_domain::CarId(98765),
                crate::vantare::motion::Flash::Best,
                notice.2,
                0,
            );
            widget
                .presentation
                .restore_notices(&[notice, personal, hidden]);
            for &next in crate::look::Look::ALL
                .iter()
                .rev()
                .chain(crate::look::Look::ALL)
            {
                widget.set_look(next, prefs);
                assert!(std::sync::Arc::ptr_eq(
                    &board,
                    widget.board.as_ref().expect("misma foto")
                ));
                assert_eq!(widget.content(), &content);
                assert_eq!(widget.settings.demand(), demand);
                assert!(
                    widget.presentation.notices().contains(&notice),
                    "no reiniciar reloj del aviso"
                );
                assert!(
                    widget.presentation.notices().contains(&personal),
                    "conservar tipo personal y reloj"
                );
                assert!(
                    widget.presentation.notices().contains(&hidden),
                    "avisos de filas fuera del Look activo"
                );
            }
        }
    }

    #[test]
    fn saved_layout_keeps_look_and_migrated_content_after_switching() {
        let bytes = br#"{"version":1,"instances":[{"id":"saved","x":73,"y":41,"opacity":0.6,"settings":{"kind":"standings","designSystem":"vantare","style":"neutro","accent":"green","classScope":"all-classes","classificationMode":"normal","columns":[{"metricId":"driverName"},{"metricId":"interval","enabled":false}]}}]}"#;
        let mut layout = crate::layout::Layout::from_json(bytes).expect("layout histórico");
        let original = layout.clone();
        for &look in crate::look::Look::ALL {
            layout.instances[0].settings.set_look(look);
            let saved = serde_json::to_vec(&layout).expect("guardar");
            layout = crate::layout::Layout::from_json(&saved).expect("recargar");
            assert_eq!(layout.instances[0].settings.look(), Some(look));
            let Settings {
                class_scope,
                content_version,
                columns,
                style,
                accent,
                ..
            } = match &layout.instances[0].settings {
                crate::Settings::Standings(s) => s.clone(),
                _ => panic!("layout Standings"),
            };
            assert_eq!(class_scope, "player-class");
            assert_eq!(content_version, 1);
            assert_eq!(columns.as_ref().expect("columnas").len(), 2);
            assert_eq!(style, Look::Neutro);
            assert_eq!(accent, Accent::Green);
            assert_eq!(layout.instances[0].geometry, original.instances[0].geometry);
        }
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
        let visible_rows = widget.content_plan.rows.clone();
        let visible_footer = widget.content_plan.board.footer_cells.clone();
        assert_eq!(visible_footer.len(), 9);
        let mut requested = Widget::new(&settings, prefs);
        assert!(requested.ingest(&photo.snapshot, prefs));
        assert_eq!(requested.content_plan.rows, visible_rows);
        assert_eq!(requested.content_plan.board.footer_cells, visible_footer);
        assert!(
            !widget.ingest(&photo.snapshot, prefs),
            "mismo contenido visible: sin invalidacion por nombre de pista omitido"
        );
        assert!(widget.content_plan.same_visible(&requested.content_plan));
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
        let rows = widget.content_plan.rows.clone();
        let before = widget.size();
        let tops = widget.plan.row_tops.clone();
        let mut style = style::Style::default();
        style.geometry.row_height = 40.0;
        style.geometry.session_header_height = 50.0;
        style.colors.panel = style::Color(0x123456);
        widget.set_style(std::sync::Arc::new(style));
        assert_eq!(widget.content_plan.rows, rows);
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
                    assert_eq!(widget.content_plan.rows.len(), 3);
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
        assert_eq!(widget.content_plan.board.footer_cells.len(), 3);
        let player = widget
            .content_plan
            .rows
            .iter()
            .find(|row| row.is_player)
            .expect("jugador");
        assert_eq!(
            widget.content_plan.board.footer_cells[0].value,
            player.position.to_string()
        );
        assert_eq!(
            widget.content_plan.board.footer_cells[1].value,
            player.classification_gap
        );
        assert_eq!(
            widget.content_plan.board.footer_cells[2].value,
            widget.content_plan.last_lap(player)
        );
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
            assert_eq!(widget.content_plan.board.footer_cells[0].id, metric);
            assert_eq!(widget.content_plan.board.footer_cells.len(), 1);
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
        assert_eq!(widget.content_plan.rows.len(), 4);
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
                .content_plan
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
                .content_plan
                .rows
                .iter()
                .map(|r| r.position)
                .collect::<Vec<_>>(),
            [1, 4, 7, 10, 13, 16, 19]
        );
        assert_eq!(
            widget.content_plan.last_lap(&widget.content_plan.rows[0]),
            "1:49.667"
        );
        assert_eq!(widget.content_plan.rows[1].classification_gap, "—");
        assert_eq!(widget.content_plan.rows[3].classification_gap, "+11.11s");
        assert_eq!(widget.content_plan.rows[6].classification_gap, "+1 V");
        assert_eq!(widget.content_plan.estimated_laps(), "≈79");
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
        assert_eq!(widget.content_plan.rows.len(), 7);
        assert_eq!(widget.content_plan.rows[0].position, 2);
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

#[cfg(test)]
mod session_tests;
