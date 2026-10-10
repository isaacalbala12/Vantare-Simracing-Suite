//! Instrumento Delta Eficiencia: geometría congelada 280 × 96.
//! Con el sistema Vantare (por defecto) pinta `vantare.rs` (#1497).

mod eficiencia;
mod motion;
pub(crate) mod vantare;
mod view;

use crate::app::{Paint, Wake};
use motion::Motion;
use std::{sync::Arc, time::Instant};
use vantare_domain::{Snapshot, delta, format::Preferences};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::standings::DesignSystem,
    #[serde(default)]
    pub content_version: u8,
    pub style: crate::standings::Look,
    pub accent: crate::standings::Accent,
    /// Formato Vantare: `pill` (el del Studio), `bar` (380) o `expanded` (520).
    pub size: String,
    /// Referencia Vantare: `best`, `optimal` o `leader`.
    pub reference: String,
    pub show_bar: bool,
    pub show_sectors: bool,
    /// Marca Vantare: decisión inyectada por el host según la licencia.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
    pub template_id: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            design_system: crate::standings::DesignSystem::Vantare,
            content_version: 1,
            style: crate::standings::Look::Neo,
            accent: crate::standings::Accent::Red,
            size: "pill".into(),
            reference: "best".into(),
            show_bar: true,
            show_sectors: true,
            brand_visible: None,
            template_id: "instrument".into(),
        }
    }
}
impl Settings {
    /// Ajustes por defecto del sistema Eficiencia heredado.
    #[must_use]
    pub fn eficiencia() -> Self {
        Self {
            design_system: crate::standings::DesignSystem::Eficiencia,
            ..Self::default()
        }
    }

    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "reference=session-best",
            "No hay delta independiente frente a la mejor vuelta absoluta de la sesión; la mejor propia, óptima y líder sí están disponibles",
        ),
        (
            "reference=previous-lap",
            "Snapshot no publica una serie de la vuelta anterior",
        ),
    ];
    fn reference(&self) -> delta::Reference {
        match self.reference.as_str() {
            "optimal" => delta::Reference::Optimal,
            "leader" => delta::Reference::Leader,
            _ => delta::Reference::PersonalBest,
        }
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> delta::Board {
        delta::project_reference(snapshot, prefs, self.reference())
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            content_version: 1,
            template_id: if self.template_id == "capsule" {
                "capsule"
            } else {
                "instrument"
            }
            .into(),
            size: match self.size.as_str() {
                "bar" | "expanded" => self.size.clone(),
                _ => "pill".into(),
            },
            reference: match if self.content_version == 0 && self.design_system.legacy() {
                "best"
            } else {
                self.reference.as_str()
            } {
                "optimal" | "leader" => self.reference.clone(),
                _ => "best".into(),
            },
            ..self.clone()
        }
    }
}

enum Painter {
    Eficiencia(Arc<eficiencia::Labels>),
    Vantare(vantare::Visual),
}
enum Engine {
    Eficiencia(Motion),
    Vantare(Arc<vantare::Movement>),
}
pub(crate) struct Widget {
    settings: Settings,
    reference: delta::Reference,
    board: Arc<delta::Board>,
    visual: Painter,
    motion: Engine,
    prefs: Preferences,
    idle_frame: Option<motion::Frame>,
}
impl Widget {
    fn presentation(
        settings: &Settings,
        prefs: Preferences,
        board: &Arc<delta::Board>,
    ) -> (Painter, Engine) {
        match settings.design_system {
            crate::look::Look::Eficiencia => (
                Painter::Eficiencia(Arc::new(eficiencia::Labels::new(
                    board,
                    prefs,
                    settings.template_id == "capsule",
                ))),
                Engine::Eficiencia(Motion::default()),
            ),
            crate::look::Look::Vantare => (
                Painter::Vantare(vantare::Visual::new(vantare::Options::from_settings(
                    settings,
                ))),
                Engine::Vantare(Arc::new(vantare::Movement::default())),
            ),
        }
    }
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let board = Arc::new(settings.project(&Snapshot::default(), prefs));
        let (visual, motion) = Self::presentation(&settings, prefs, &board);
        Self {
            reference: settings.reference(),
            settings,
            board,
            visual,
            motion,
            prefs,
            idle_frame: None,
        }
    }
    pub(crate) fn settle(&mut self) {
        if let Engine::Vantare(m) = &mut self.motion {
            Arc::make_mut(m).settle();
        }
    }
    pub(crate) fn set_vantare_style(&mut self, style: Arc<crate::vantare::style::Style>) {
        if let Painter::Vantare(v) = &mut self.visual {
            v.set_style(style);
        }
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        match &self.visual {
            Painter::Eficiencia(_) => (280.0, 96.0),
            Painter::Vantare(v) => v.size(),
        }
    }
    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        self.ingest_using(snapshot, prefs, delta::project_reference)
    }
    fn ingest_using(
        &mut self,
        snapshot: &Snapshot,
        prefs: Preferences,
        project: impl FnOnce(&Snapshot, Preferences, delta::Reference) -> delta::Board,
    ) -> bool {
        let next = project(snapshot, prefs, self.reference);
        if next == *self.board && prefs == self.prefs {
            return false;
        }
        self.idle_frame = None;
        let next = Arc::new(next);
        let now = Instant::now();
        let changed = match (&mut self.visual, &mut self.motion) {
            (Painter::Vantare(v), Engine::Vantare(m)) => {
                v.ingest_shared(next.clone(), Arc::make_mut(m))
            }
            (Painter::Eficiencia(labels), Engine::Eficiencia(m)) => {
                let active = m.wake(now) != Wake::Idle;
                m.update(&self.board, &next, now);
                let labels_next =
                    eficiencia::Labels::new(&next, prefs, self.settings.template_id == "capsule");
                let changed = labels.delta_text != labels_next.delta_text
                    || labels.tone != labels_next.tone
                    || self.board.progress != next.progress
                    || labels.status_text != labels_next.status_text
                    || labels.reference_notice != labels_next.reference_notice
                    || active
                    || m.wake(now) != Wake::Idle;
                *labels = Arc::new(labels_next);
                changed
            }
            _ => unreachable!("un solo pintor y Motion activos"),
        };
        self.board = next;
        self.prefs = prefs;
        changed
    }
    pub(crate) fn set_look(&mut self, look: crate::look::Look, prefs: Preferences) {
        if self.settings.design_system == look {
            return;
        }
        self.idle_frame = None;
        let notices = match &self.motion {
            Engine::Eficiencia(m) => m.notices.clone(),
            Engine::Vantare(m) => m.notices.clone(),
        };
        self.settings.design_system = look;
        (self.visual, self.motion) = Self::presentation(&self.settings, prefs, &self.board);
        match (&mut self.visual, &mut self.motion) {
            (Painter::Vantare(v), Engine::Vantare(m)) => {
                v.ingest_shared(self.board.clone(), Arc::make_mut(m));
                Arc::make_mut(m).notices = notices;
            }
            (Painter::Eficiencia(_), Engine::Eficiencia(m)) => m.notices = notices,
            _ => unreachable!(),
        }
    }
    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        self.frame_with_motion(prefs, false)
    }
    pub(crate) fn frame_with_motion(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let now = Instant::now();
        match (&mut self.visual, &mut self.motion) {
            (Painter::Vantare(v), Engine::Vantare(m)) => {
                v.presentation(prefs.language);
                if reduced {
                    Arc::make_mut(m).settle();
                }
                let wake = v.wake(m, now);
                let v = v.clone();
                let m = m.clone();
                (
                    Box::new(move |window, cx| v.paint(&m, prefs.language, window, cx)),
                    wake,
                )
            }
            (Painter::Eficiencia(labels), Engine::Eficiencia(m)) => {
                let (frame, wake) = if reduced {
                    m.reduced_frame(&self.board, now)
                } else {
                    let wake = m.wake(now);
                    let frame = if wake == Wake::Idle {
                        *self
                            .idle_frame
                            .get_or_insert_with(|| m.frame(&self.board, now))
                    } else {
                        self.idle_frame = None;
                        m.frame(&self.board, now)
                    };
                    (frame, wake)
                };
                let labels = labels.clone();
                (
                    Box::new(move |window, cx| view::paint(&labels, frame, window, cx)),
                    wake,
                )
            }
            _ => unreachable!(),
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match (&self.visual, &self.motion) {
            (Painter::Eficiencia(_), Engine::Eficiencia(m)) => m.wake(Instant::now()) != Wake::Idle,
            (Painter::Vantare(v), Engine::Vantare(m)) => v.wake(m, Instant::now()) != Wake::Idle,
            _ => unreachable!(),
        }
    }
}

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Cars, Flags, LapProgress, PitStatus, Positions, Sectors};
        use vantare_ipc::Signal::{Delta, LapCount, LapTimes};
        crate::demand::signals(
            16,
            &[
                Delta,
                LapTimes,
                LapCount,
                Cars,
                Positions,
                Sectors,
                LapProgress,
                PitStatus,
                Flags,
            ],
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn idle_motion_frame_is_reused_until_facts_change() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        let mut snapshot = crate::source::fixed();
        widget.ingest(&snapshot, prefs);
        drop(widget.frame(prefs));
        assert!(widget.idle_frame.is_some());
        drop(widget.frame(prefs));
        assert!(widget.idle_frame.is_some());
        snapshot.state.source_state = vantare_domain::SourceState::Lost;
        widget.ingest(&snapshot, prefs);
        assert!(widget.idle_frame.is_none());
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        assert!(widget.idle_frame.is_some());
    }

    #[test]
    fn one_projection_per_ingest_and_switch_preserves_board_and_notice_clocks() {
        let prefs = Preferences::default();
        let mut snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/delta.snapshot.json"))
                .expect("escena");
        for &look in crate::look::Look::ALL {
            let mut widget = Widget::new(
                &Settings {
                    design_system: look,
                    ..Default::default()
                },
                prefs,
            );
            let calls = std::cell::Cell::new(0);
            widget.ingest_using(&snapshot, prefs, |s, p, r| {
                calls.set(calls.get() + 1);
                delta::project_reference(s, p, r)
            });
            assert_eq!(calls.get(), 1);
            let at = Instant::now()
                .checked_sub(std::time::Duration::from_millis(200))
                .expect("reloj de aviso");
            match &mut widget.motion {
                Engine::Eficiencia(m) => m.notices.notify(at, delta::Event::PersonalBest),
                Engine::Vantare(m) => Arc::make_mut(m)
                    .notices
                    .notify(at, delta::Event::PersonalBest),
            }
            let board = widget.board.clone();
            for &next in crate::look::Look::ALL {
                widget.set_look(next, prefs);
                assert!(Arc::ptr_eq(&board, &widget.board));
                assert_eq!(calls.get(), 1, "cambiar Look no proyecta");
                let clock = match &widget.motion {
                    Engine::Eficiencia(m) => m.notices.record(),
                    Engine::Vantare(m) => m.notices.record(),
                };
                assert_eq!(clock, Some(at));
            }
            snapshot.sequence += 1;
        }
    }
    #[test]
    fn saved_layout_migrates_content_once_and_preserves_look() {
        let old: Settings = serde_json::from_str(
            r#"{"designSystem":"eficiencia","reference":"optimal","templateId":"capsule"}"#,
        )
        .expect("layout histórico");
        let mut settings = old.normalized();
        assert_eq!(
            settings.reference, "best",
            "Eficiencia histórico ignoraba referencia"
        );
        assert_eq!(settings.template_id, "capsule");
        assert!(settings.design_system.legacy());
        for &look in crate::look::Look::ALL {
            settings.design_system = look;
            assert_eq!(settings.normalized().reference, "best");
        }
        settings.reference = "leader".into();
        for &look in crate::look::Look::ALL {
            settings.design_system = look;
            assert_eq!(settings.normalized().reference, "leader");
        }
        let json = serde_json::to_string(&settings).expect("guardar");
        let restored: Settings = serde_json::from_str(&json).expect("recargar");
        assert_eq!(restored.normalized(), settings);
    }

    #[test]
    fn settings_project_capsule_without_changing_delta_values() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/delta.snapshot.json"))
                .expect("escena");
        let settings = Settings {
            template_id: "capsule".into(),
            ..Settings::eficiencia()
        };
        let vm = settings.project(&snapshot, Preferences::default());
        assert!(
            eficiencia::Labels::new(
                &vm,
                Preferences::default(),
                settings.template_id == "capsule"
            )
            .capsule
        );
        assert_eq!(vm.delta_text(), "+0.214");
    }

    use super::*;

    #[test]
    fn frozen_workshop_scene_decodes_into_the_production_projection() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/delta.snapshot.json"))
                .expect("escena Delta DTO v3 válida");
        let prefs = Preferences::default();
        let vm = delta::project(&snapshot, prefs);
        assert_eq!(
            (
                vm.delta_text().as_str(),
                vm.last_text().as_str(),
                vm.best_text().as_str()
            ),
            ("+0.214", "1:31.234", "1:30.964")
        );
        assert_eq!(vm.status, delta::Status::Ready);
        assert_eq!(vm.completed_lap, Some(127));
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(
            matches!(&widget.motion, Engine::Eficiencia(m) if m.wake(Instant::now()) == Wake::Idle)
        );
    }

    #[test]
    fn repaint_only_for_display_changes() {
        use vantare_domain::{Player, Quality};
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        let mut s = Snapshot::default();
        s.state.source_state = vantare_domain::SourceState::Live;
        s.state.player = Some(Player {
            delta_best_s: Quality::Reliable(0.214),
            ..Player::default()
        });
        assert!(widget.ingest(&s, prefs));
        s.sequence += 1;
        assert!(!widget.ingest(&s, prefs));
        s.state
            .player
            .as_mut()
            .expect("player fixture")
            .delta_best_s = Quality::Reliable(-0.214);
        assert!(widget.ingest(&s, prefs));
    }

    #[test]
    fn hidden_lap_text_updates_without_repainting_until_an_event() {
        use vantare_domain::{Car, CarId, Player, Quality};
        let prefs = Preferences::default();
        let mut s = Snapshot::default();
        s.state.source_state = vantare_domain::SourceState::Live;
        s.state.player = Some(Player {
            car: CarId(1),
            delta_best_s: Quality::Reliable(0.214),
            ..Player::default()
        });
        s.state.cars.push(Car {
            id: CarId(1),
            laps: Quality::Reliable(127),
            ..Car::default()
        });
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        assert!(widget.ingest(&s, prefs));
        s.state.cars[0].last_lap_s = Quality::Reliable(91.234);
        s.state.cars[0].best_lap_s = Quality::Reliable(90.964);
        assert!(!widget.ingest(&s, prefs));
        s.state.cars[0].laps = Quality::Reliable(128);
        assert!(widget.ingest(&s, prefs));
    }
}
