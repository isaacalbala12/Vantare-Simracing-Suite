//! Instrumento Delta Eficiencia: geometría congelada 280 × 96.
//! Con el sistema Vantare (por defecto) pinta `vantare.rs` (#1497).

mod motion;
pub(crate) mod vantare;
mod view;

use crate::app::{Paint, Wake};
use motion::Motion;
use std::time::Instant;
use vantare_domain::{Snapshot, delta, format::Preferences};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::standings::DesignSystem,
    pub style: crate::standings::Look,
    pub accent: crate::standings::Accent,
    /// Formato Vantare: `pill` (el del Studio), `bar` (380) o `expanded` (520).
    pub size: String,
    /// Referencia Vantare: `best`, `optimal` o `leader`.
    pub reference: String,
    /// Marca Vantare: decisión inyectada por el host según la licencia.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
    pub template_id: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            design_system: crate::standings::DesignSystem::Vantare,
            style: crate::standings::Look::Neo,
            accent: crate::standings::Accent::Red,
            size: "pill".into(),
            reference: "best".into(),
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
            "Snapshot solo publica delta_best_s personal",
        ),
        (
            "reference=previous-lap",
            "Snapshot no publica una serie de la vuelta anterior",
        ),
    ];
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> delta::ViewModel {
        let mut vm = delta::project(snapshot, prefs);
        vm.capsule = self.template_id == "capsule";
        vm
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
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
            reference: match self.reference.as_str() {
                "optimal" | "leader" => self.reference.clone(),
                _ => "best".into(),
            },
            ..self.clone()
        }
    }
}

pub(crate) struct Widget {
    /// Presente con el sistema Vantare; si no, se usa el renderer Eficiencia.
    vantare: Option<vantare::State>,
    settings: Settings,
    vm: delta::ViewModel,
    motion: Motion,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            vantare: (settings.design_system == crate::standings::DesignSystem::Vantare)
                .then(|| vantare::State::new(vantare::Options::from_settings(&settings))),
            vm: settings.project(&Snapshot::default(), prefs),
            settings,
            motion: Motion::default(),
        }
    }

    /// Termina las animaciones Vantare en curso (Workshop reconstruye la historia).
    pub(crate) fn settle(&mut self) {
        if let Some(state) = &mut self.vantare {
            state.settle();
        }
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
        self.vantare
            .as_ref()
            .map_or((280.0, 96.0), vantare::State::size)
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        if let Some(state) = &mut self.vantare {
            let board = state.project(snapshot);
            return state.ingest(board);
        }
        let next = self.settings.project(snapshot, prefs);
        if next == self.vm {
            return false;
        }
        let now = Instant::now();
        let was_active = !matches!(self.motion.wake(now), Wake::Idle);
        self.motion.update(&self.vm, &next, now);
        let changed = self.vm.delta_text != next.delta_text
            || self.vm.tone != next.tone
            || self.vm.progress != next.progress
            || self.vm.status_text != next.status_text
            || self.vm.reference_notice != next.reference_notice
            || was_active
            || !matches!(self.motion.wake(now), Wake::Idle);
        self.vm = next;
        changed
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        if let Some(state) = &self.vantare {
            let wake = state.wake(now);
            let state = state.clone();
            let language = prefs.language;
            return (
                Box::new(move |window, cx| state.paint(language, window, cx)),
                wake,
            );
        }
        let vm = self.vm.clone();
        let frame = self.motion.frame(&vm, now);
        (
            Box::new(move |window, cx| view::paint(&vm, frame, window, cx)),
            self.motion.wake(now),
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match &self.vantare {
            Some(state) => state.wake(Instant::now()) != Wake::Idle,
            None => !matches!(self.motion.wake(Instant::now()), Wake::Idle),
        }
    }
}

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Delta, LapCount, LapTimes};
        if self.design_system == crate::standings::DesignSystem::Vantare {
            use vantare_ipc::Signal::{Cars, Flags, LapProgress, PitStatus, Positions, Sectors};
            // Cars y Positions: líder de la clase; Sectors y LapProgress: sectores
            // de la vuelta; PitStatus: boxes y vuelta de salida; Flags: FCY.
            return crate::demand::signals(
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
            );
        }
        crate::demand::signals(16, &[Delta, LapTimes, LapCount])
    }
}

#[cfg(test)]
mod tests {
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
        assert!(vm.capsule);
        assert_eq!(vm.delta_text, "+0.214");
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
                vm.delta_text.as_str(),
                vm.last_lap_text.as_str(),
                vm.best_lap_text.as_str()
            ),
            ("+0.214", "1:31.234", "1:30.964")
        );
        assert_eq!(vm.status, delta::Status::Ready);
        assert_eq!(vm.completed_lap, Some(127));
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.motion.wake(Instant::now()), Wake::Idle));
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
