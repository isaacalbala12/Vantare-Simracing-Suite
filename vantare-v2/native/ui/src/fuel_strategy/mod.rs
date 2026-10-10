//! Fuel y stint: una proyección y un historial; un pintor y Motion activos.
use crate::app::{Paint, Wake};
use std::sync::Arc;
use std::time::Instant;
use vantare_domain::{Snapshot, format::Preferences, fuel_strategy};
#[cfg(test)]
mod contract_tests;
mod eficiencia;
pub(crate) mod vantare;
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::standings::DesignSystem,
    pub style: crate::standings::Look,
    pub accent: crate::standings::Accent,
    /// Tamaño Vantare: `compact` (230), `standard` (300) o `expanded` (460).
    pub size: String,
    /// Marca Vantare: decisión inyectada por el host según la licencia.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
    #[serde(default)]
    pub content_version: u8,
    pub history_rows: u8,
    pub show_projection: bool,
    pub source: String,
    pub units: String,
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
            style: crate::standings::Look::Neo,
            accent: crate::standings::Accent::Red,
            size: "standard".into(),
            brand_visible: None,
            content_version: 1,
            history_rows: fuel_strategy::Config::default().history_rows,
            show_projection: fuel_strategy::Config::default().show_projection,
            source: "fuel".into(),
            units: "liters".into(),
        }
    }

    /// Ajustes por defecto del sistema Eficiencia heredado.
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(crate::look::Look::Eficiencia)
    }

    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "source=virtual-energy:live",
        "El Look Eficiencia conserva el estado histórico no disponible",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let legacy_rich =
            self.content_version == 0 && self.design_system == crate::look::Look::Vantare;
        Self {
            content_version: 1,
            history_rows: if legacy_rich {
                4
            } else {
                self.history_rows.clamp(1, 8)
            },
            show_projection: if legacy_rich {
                true
            } else {
                self.show_projection
            },
            source: if !legacy_rich && self.source == "virtual-energy" {
                "virtual-energy"
            } else {
                "fuel"
            }
            .into(),
            units: "liters".into(),
            size: match self.size.as_str() {
                "compact" | "expanded" => self.size.clone(),
                _ => "standard".into(),
            },
            ..self.clone()
        }
    }
    fn content(&self) -> fuel_strategy::Config {
        fuel_strategy::Config {
            history_rows: self.history_rows,
            show_projection: self.show_projection,
            virtual_energy: self.source == "virtual-energy",
        }
    }
    #[cfg(test)]
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> eficiencia::Labels {
        eficiencia::Labels::new(
            &fuel_strategy::project_with_config(snapshot, prefs, self.content()),
            prefs,
        )
    }
}

enum Presentation {
    Eficiencia {
        visual: Arc<eficiencia::Labels>,
        motion: Arc<vantare::Movement>,
    },
    Vantare {
        visual: vantare::Visual,
        motion: Arc<vantare::Movement>,
    },
}

pub(crate) struct Widget {
    settings: Settings,
    content: fuel_strategy::Config,
    board: Arc<fuel_strategy::Board>,
    presentation: Presentation,
    prefs: Preferences,
}
impl Widget {
    fn presentation(
        settings: &Settings,
        prefs: Preferences,
        board: &Arc<fuel_strategy::Board>,
        mut motion: Arc<vantare::Movement>,
    ) -> Presentation {
        match settings.design_system {
            crate::look::Look::Eficiencia => Presentation::Eficiencia {
                visual: Arc::new(eficiencia::Labels::new(board, prefs)),
                motion,
            },
            crate::look::Look::Vantare => {
                let mut visual = vantare::Visual::new(vantare::Options::from_settings(settings));
                visual.ingest_shared(board.clone(), Arc::make_mut(&mut motion));
                visual.presentation(prefs.language);
                Presentation::Vantare { visual, motion }
            }
        }
    }
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let content = settings.content();
        let board = Arc::new(fuel_strategy::project_with_config(
            &Snapshot::default(),
            prefs,
            content,
        ));
        let started = Instant::now();
        let presentation = Self::presentation(
            &settings,
            prefs,
            &board,
            Arc::new(vantare::Movement::new(started)),
        );
        Self {
            settings,
            content,
            board,
            presentation,
            prefs,
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn freeze_for_capture(&mut self) {
        if let Presentation::Vantare { motion: m, .. } = &mut self.presentation {
            Arc::make_mut(m).freeze_for_capture();
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
            Presentation::Eficiencia { visual: _, .. } => eficiencia::SIZE,
            Presentation::Vantare { visual: v, .. } => v.size(),
        }
    }
    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        self.ingest_using(snapshot, prefs, fuel_strategy::project_with_config)
    }
    fn ingest_using(
        &mut self,
        snapshot: &Snapshot,
        prefs: Preferences,
        project: impl FnOnce(&Snapshot, Preferences, fuel_strategy::Config) -> fuel_strategy::Board,
    ) -> bool {
        let next = project(snapshot, prefs, self.content);
        if next == *self.board && prefs == self.prefs {
            return false;
        }
        let next = Arc::new(next);
        let changed = match &mut self.presentation {
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => {
                let changed = v.ingest_shared(next.clone(), Arc::make_mut(m));
                changed | v.presentation(prefs.language)
            }
            Presentation::Eficiencia {
                visual: labels,
                motion: _,
            } => {
                let next_labels = eficiencia::Labels::new(&next, prefs);
                let changed = **labels != next_labels;
                if changed {
                    *labels = Arc::new(next_labels);
                }
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
        let motion = match &self.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.clone()
            }
        };
        self.settings.design_system = look;
        self.presentation = Self::presentation(&self.settings, prefs, &self.board, motion);
    }
    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        match &mut self.presentation {
            Presentation::Eficiencia {
                visual: labels,
                motion: _,
            } => {
                let labels = labels.clone();
                (
                    Box::new(move |w, cx| {
                        labels.prepare(w);
                        eficiencia::paint(&labels, w, cx);
                    }),
                    Wake::Idle,
                )
            }
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => {
                v.presentation(prefs.language);
                let wake = v.wake(m, Instant::now());
                let v = v.clone();
                let m = m.clone();
                (
                    Box::new(move |w, cx| {
                        v.prepare(w);
                        v.paint(&m, prefs.language, w, cx);
                    }),
                    wake,
                )
            }
        }
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match &self.presentation {
            Presentation::Vantare {
                visual: v,
                motion: m,
            } => v.wake(m, Instant::now()) != Wake::Idle,
            Presentation::Eficiencia { .. } => false,
        }
    }
}
impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            Cars, Flags, FuelEstimate, FuelLevel, LapCount, LapsRemaining, PitStatus, SessionInfo,
        };
        crate::demand::signals(
            250,
            &[
                FuelLevel,
                FuelEstimate,
                LapsRemaining,
                Cars,
                LapCount,
                PitStatus,
                SessionInfo,
                Flags,
            ],
        )
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn look_switch_preserves_all_bar_interpolations_and_pulse_state() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(
            &Settings {
                size: "expanded".into(),
                ..Settings::default()
            },
            prefs,
        );
        let mut photo =
            vantare_ipc::snapshot_from_json(include_str!("scenes/eight-laps.snapshot.json"))
                .expect("escena existente con capacidad e historial");
        widget.ingest(&photo, prefs);
        photo
            .state
            .player
            .as_mut()
            .expect("jugador de la escena")
            .fuel
            .level_l = vantare_domain::Quality::Reliable(30.0);
        photo.sequence += 1;
        widget.ingest(&photo, prefs);
        let state = match &widget.presentation {
            Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                motion.state_signature()
            }
        };
        assert!(
            state.1.iter().any(|b| b.1 != b.2),
            "interpolación de barra activa"
        );
        for look in [
            crate::look::Look::Eficiencia,
            crate::look::Look::Vantare,
            crate::look::Look::Eficiencia,
            crate::look::Look::Vantare,
        ] {
            widget.set_look(look, prefs);
            let after = match &widget.presentation {
                Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                    motion.state_signature()
                }
            };
            assert_eq!(
                state, after,
                "se conservan from, to, start y reloj del pulso"
            );
        }
    }

    use super::*;
    #[test]
    fn every_look_projects_once_and_switches_without_a_second_history_or_clock_reset() {
        let photo = crate::source::fixed();
        let prefs = Preferences::default();
        for &look in crate::look::Look::ALL {
            let mut widget = Widget::new(
                &Settings {
                    design_system: look,
                    ..Settings::default()
                },
                prefs,
            );
            let mut calls = 0;
            widget.ingest_using(&photo, prefs, |s, p, c| {
                calls += 1;
                fuel_strategy::project_with_config(s, p, c)
            });
            assert_eq!(calls, 1);
            let board = widget.board.clone();
            let started = match &widget.presentation {
                Presentation::Eficiencia { motion, .. } | Presentation::Vantare { motion, .. } => {
                    motion.started
                }
            };
            let history = widget.board.history.as_ptr();
            let content = widget.content;
            let demand = widget.settings.demand();
            for &next in crate::look::Look::ALL
                .iter()
                .rev()
                .chain(crate::look::Look::ALL)
            {
                widget.set_look(next, prefs);
                assert!(Arc::ptr_eq(&board, &widget.board));
                assert_eq!(history, widget.board.history.as_ptr());
                let actual_started = match &widget.presentation {
                    Presentation::Eficiencia { motion, .. }
                    | Presentation::Vantare { motion, .. } => motion.started,
                };
                assert_eq!(started, actual_started);
                assert_eq!(content, widget.content);
                assert_eq!(demand, widget.settings.demand());
                if let Presentation::Vantare { motion: m, .. } = &widget.presentation {
                    assert_eq!(m.started, started);
                }
            }
            assert!(!widget.ingest_using(&photo, prefs, |s, p, c| {
                calls += 1;
                fuel_strategy::project_with_config(s, p, c)
            }));
            assert_eq!(calls, 2);
        }
    }
    #[test]
    fn saved_content_migrates_once_and_then_survives_look_changes() {
        let old = Settings {
            content_version: 0,
            history_rows: 8,
            show_projection: false,
            source: "virtual-energy".into(),
            ..Settings::default()
        };
        let migrated = old.normalized();
        assert_eq!(migrated.content_version, 1);
        assert_eq!(migrated.content(), fuel_strategy::Config::default());
        let modern = Settings {
            content_version: 1,
            history_rows: 8,
            show_projection: false,
            source: "virtual-energy".into(),
            ..Settings::default()
        }
        .normalized();
        let mut opposite = modern.clone();
        opposite.design_system = crate::look::Look::Eficiencia;
        assert_eq!(modern.content(), opposite.normalized().content());
        let old_efi = Settings {
            design_system: crate::look::Look::Eficiencia,
            ..old
        }
        .normalized();
        assert_eq!(old_efi.history_rows, 8);
        assert!(!old_efi.show_projection);
        assert!(old_efi.content().virtual_energy);
    }

    #[test]
    fn idle_frame_reuses_plan_and_labels_and_fact_changes_invalidate_them() {
        let photo = crate::source::fixed();
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        widget.ingest(&photo, prefs);
        let Presentation::Vantare { visual: v, .. } = &widget.presentation else {
            unreachable!()
        };
        let saved = v.clone();
        for _ in 0..3 {
            drop(widget.frame(prefs));
        }
        let Presentation::Vantare { visual: v, .. } = &widget.presentation else {
            unreachable!()
        };
        assert!(v.reuses_preparation(&saved));
        let mut changed = photo.clone();
        changed.state.source_state = vantare_domain::SourceState::Lost;
        assert!(widget.ingest(&changed, prefs));
        let Presentation::Vantare { visual: v, .. } = &widget.presentation else {
            unreachable!()
        };
        assert!(!v.reuses_preparation(&saved));
    }

    #[test]
    fn saved_layout_keeps_look_content_and_geometry_after_switching() {
        let bytes=br#"{"version":1,"instances":[{"id":"saved-fuel","x":73,"y":41,"opacity":0.6,"settings":{"kind":"fuel-strategy","designSystem":"eficiencia","style":"neutro","accent":"green","historyRows":8,"showProjection":false,"source":"virtual-energy","size":"expanded"}}]}"#;
        let mut layout = crate::layout::Layout::from_json(bytes).expect("layout histórico");
        let original = layout.clone();
        let crate::Settings::FuelStrategy(before) = &original.instances[0].settings else {
            unreachable!()
        };
        for &look in crate::look::Look::ALL {
            layout.instances[0].settings.set_look(look);
            layout =
                crate::layout::Layout::from_json(&serde_json::to_vec(&layout).expect("guardar"))
                    .expect("recargar");
            let crate::Settings::FuelStrategy(after) = &layout.instances[0].settings else {
                unreachable!()
            };
            assert_eq!(after.design_system, look);
            assert_eq!(after.content(), before.content());
            assert_eq!(after.content_version, 1);
            assert_eq!(after.style, before.style);
            assert_eq!(after.accent, before.accent);
            assert_eq!(after.size, before.size);
            assert_eq!(layout.instances[0].geometry, original.instances[0].geometry);
            assert_eq!(layout.instances[0].opacity, original.instances[0].opacity);
        }
    }
    #[test]
    fn eight_lap_scene_projects_all_canonical_rows() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("scenes/eight-laps.snapshot.json"))
                .expect("escena DTO v4 de variante");
        let settings = Settings {
            history_rows: 8,
            ..Settings::default()
        };
        let vm = settings.project(&snapshot, Preferences::default());
        assert_eq!(vm.history.len(), 8);
        assert!(eficiencia::HISTORY_TOP + 4.0 * eficiencia::ROW_HEIGHT <= eficiencia::SIZE.1 - 6.0);
        assert_eq!(vm.history.len().div_ceil(4), 2);
    }

    use vantare_domain::{Capabilities, Capability, Fuel, Player, Quality, State};

    #[test]
    fn real_corpus_without_measured_laps_never_invents_extremes_or_stops() {
        for json in [
            include_str!("../../fixtures/telemetry-real/lmu47.snapshot.json"),
            include_str!("../../fixtures/telemetry-real/acc.snapshot.json"),
        ] {
            let snapshot = vantare_ipc::snapshot_from_json(json).expect("corpus real");
            let vm = Settings::default().project(&snapshot, Preferences::default());
            assert_eq!(
                (vm.minimum.as_str(), vm.maximum.as_str(), vm.stops.as_str()),
                ("—", "—", "—")
            );
        }
    }

    #[test]
    fn reference_scene_preserves_fuel_and_does_not_turn_session_laps_into_range() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/fuel-strategy.snapshot.json"
        ))
        .expect("escena Workshop de combustible en DTO v4");
        let player = snapshot.state.player.expect("jugador de la escena");
        assert_eq!(snapshot.state.capabilities.fuel, Capability::Fresh);
        assert_eq!(player.fuel.level_l, Quality::Reliable(42.0));
        assert_eq!(player.fuel.capacity_l, Quality::Reliable(100.0));
        assert_eq!(player.fuel.per_lap_l, Quality::Reliable(2.14));
        assert_eq!(player.fuel.laps_left, Quality::Unavailable);
        assert_eq!(snapshot.state.session.laps_remaining, Quality::Reliable(79));
        let vm = Settings::eficiencia().project(&snapshot, Preferences::default());
        assert_eq!(vm.status, None);
        assert_eq!(
            (vm.fuel.as_str(), vm.average.as_str()),
            ("42.0 L", "2.14 L")
        );
        assert_eq!(vm.laps, "79.0");
        assert_eq!(vm.laps_basis, Some(fuel_strategy::LapsBasis::Session));
        assert_eq!(vm.history.len(), 4);
        assert_eq!(vm.required, "169.1 L");
    }

    #[test]
    fn only_visual_changes_repaint_and_frames_are_idle() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::eficiencia(), prefs);
        let mut data = Snapshot {
            state: State {
                source_state: vantare_domain::SourceState::Live,
                capabilities: Capabilities {
                    fuel: Capability::Fresh,
                    ..Capabilities::default()
                },
                player: Some(Player {
                    fuel: Fuel {
                        level_l: Quality::Reliable(42.0),
                        ..Fuel::default()
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        };
        assert!(widget.ingest(&data, prefs));
        data.sequence += 1;
        assert!(!widget.ingest(&data, prefs));
        if let Some(player) = &mut data.state.player {
            player.fuel.level_l = Quality::Reliable(42.01);
            player.fuel.capacity_l = Quality::Reliable(100.0);
        }
        assert!(
            !widget.ingest(&data, prefs),
            "mismo texto, porcentaje ausente"
        );
        if let Some(player) = &mut data.state.player {
            player.fuel.level_l = Quality::Unavailable;
        }
        assert!(widget.ingest(&data, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        let english = Preferences {
            language: vantare_domain::format::Language::En,
            ..prefs
        };
        assert!(widget.ingest(&data, english));
        assert_eq!(widget.frame(english).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
