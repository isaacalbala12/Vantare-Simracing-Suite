//! Instrumento Delta Eficiencia: geometría congelada 280 × 96.
//! Con el sistema Vantare (por defecto) pinta `vantare.rs` (#1497).

#[cfg(test)]
mod contract_tests;
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
        Self::for_look(crate::look::Look::default())
    }
}

impl Settings {
    pub(crate) fn workshop_defaults(look: crate::look::Look) -> Self {
        let mut s = Self::for_look(look);
        if look == crate::look::Look::Vantare {
            s.brand_visible = Some(true);
        }
        s
    }

    /// Única fuente de los ajustes base: el Look cambia solo la presentación.
    #[must_use]
    pub fn for_look(design_system: crate::look::Look) -> Self {
        Self {
            design_system,
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

    /// Ajustes por defecto del sistema Eficiencia heredado.
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(crate::look::Look::Eficiencia)
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
            reference: match if self.content_version == 0
                && self.design_system == crate::look::Look::Eficiencia
            {
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

enum Presentation {
    Eficiencia {
        visual: Arc<eficiencia::Labels>,
        motion: Arc<Motion>,
    },
    Vantare {
        visual: vantare::Visual,
        motion: Arc<Motion>,
    },
}

pub(crate) struct Widget {
    settings: Settings,
    reference: delta::Reference,
    board: Arc<delta::Board>,
    presentation: Presentation,
    prefs: Preferences,
    idle_frame: Option<motion::Frame>,
}
impl Widget {
    fn presentation(
        settings: &Settings,
        prefs: Preferences,
        board: &Arc<delta::Board>,
        motion: Arc<Motion>,
    ) -> Presentation {
        match settings.design_system {
            crate::look::Look::Eficiencia => Presentation::Eficiencia {
                visual: Arc::new(eficiencia::Labels::new(
                    board,
                    prefs,
                    settings.template_id == "capsule",
                )),
                motion,
            },
            crate::look::Look::Vantare => Presentation::Vantare {
                visual: vantare::Visual::new(vantare::Options::from_settings(settings)),
                motion,
            },
        }
    }
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let board = Arc::new(settings.project(&Snapshot::default(), prefs));
        let presentation = Self::presentation(&settings, prefs, &board, Arc::default());
        Self {
            reference: settings.reference(),
            settings,
            board,
            presentation,
            prefs,
            idle_frame: None,
        }
    }
    pub(crate) fn settle(&mut self) {
        if let Presentation::Vantare { motion: m, .. } = &mut self.presentation {
            Arc::make_mut(m).settle();
        }
    }
    pub(crate) fn set_vantare_style(&mut self, style: Arc<crate::vantare::style::Style>) {
        if let Presentation::Vantare { visual: v, .. } = &mut self.presentation {
            v.set_style(style);
        }
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        match &self.presentation {
            Presentation::Eficiencia { visual: _, .. } => (280.0, 96.0),
            Presentation::Vantare { visual: v, .. } => v.size(),
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
        let changed = match &mut self.presentation {
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => v.ingest_shared(next.clone(), Arc::make_mut(m)),
            Presentation::Eficiencia {
                visual: labels,
                motion: m,
            } => {
                let active = m.wake(now) != Wake::Idle;
                Arc::make_mut(m).update(&self.board, &next, now);
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
        let motion = match &self.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.clone()
            }
        };
        self.settings.design_system = look;
        self.presentation = Self::presentation(&self.settings, prefs, &self.board, motion);
        if let Presentation::Vantare { visual, .. } = &mut self.presentation {
            visual.attach(self.board.clone());
        }
    }
    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        self.frame_with_motion(prefs, false)
    }
    pub(crate) fn frame_with_motion(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let now = Instant::now();
        match &mut self.presentation {
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => {
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
            Presentation::Eficiencia {
                visual: labels,
                motion: m,
            } => {
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
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match &self.presentation {
            Presentation::Eficiencia {
                visual: _,
                motion: m,
            } => m.wake(Instant::now()) != Wake::Idle,
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => v.wake(m, Instant::now()) != Wake::Idle,
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
    fn look_switch_moves_the_complete_interpolation_and_notices() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        widget.ingest(&crate::source::fixed(), prefs);
        let now = Instant::now();
        let motion = match &mut widget.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                Arc::make_mut(motion)
            }
        };
        motion.retarget_bar(-0.5, 0.7, now, std::time::Duration::from_millis(400));
        motion.notices.notify(now, delta::Event::PersonalBest);
        let shared = match &widget.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.clone()
            }
        };
        let at = now + std::time::Duration::from_millis(50);
        let before = shared.frame(&widget.board, at);
        for look in [
            crate::look::Look::Vantare,
            crate::look::Look::Eficiencia,
            crate::look::Look::Vantare,
        ] {
            widget.set_look(look, prefs);
            let after = match &widget.presentation {
                Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                    motion
                }
            };
            assert!(Arc::ptr_eq(&shared, after));
            assert_eq!(before, after.frame(&widget.board, at));
        }
    }

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
            match &mut widget.presentation {
                Presentation::Eficiencia { motion: m, .. }
                | Presentation::Vantare { motion: m, .. } => Arc::make_mut(m)
                    .notices
                    .notify(at, delta::Event::PersonalBest),
            }
            let board = widget.board.clone();
            for &next in crate::look::Look::ALL {
                widget.set_look(next, prefs);
                assert!(Arc::ptr_eq(&board, &widget.board));
                assert_eq!(calls.get(), 1, "cambiar Look no proyecta");
                let clock = match &widget.presentation {
                    Presentation::Eficiencia { motion: m, .. }
                    | Presentation::Vantare { motion: m, .. } => m.notices.record(),
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
        assert!(settings.design_system == crate::look::Look::Eficiencia);
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
            matches!(&widget.presentation, Presentation::Eficiencia { motion: m, .. } if m.wake(Instant::now()) == Wake::Idle)
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
