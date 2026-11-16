//! Banderas: proyección live y pintura Vantare (340 × 88).
//! Sin reloj: GPUI calculaba un pulso de 920 ms que `paint_content` no usaba
//! (`_pulse`), así que no cambia ningún píxel. Placas de sanción de la demo
//! fuera por ahora: paridad en demo pendiente (ver README del PR).
mod render;
pub mod scene;

use crate::widget::{Update, Widget};
use render::Painter;
use std::sync::Arc;
use vantare_domain::{
    FlagKind, Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    racing_flags::{self, ViewModel},
    widget_session::Session,
    widget_settings::{Settings, racing_flags::Settings as Config},
};

pub(crate) struct RacingFlags {
    settings: Config,
    prefs: Preferences,
    painter: Painter,
    vm: Arc<ViewModel>,
    projection_key: Option<(u64, u64, u64, SourceState, Preferences)>,
    waiting: bool,
    session: scene::SessionInfo,
    visual: Option<scene::Scene>,
}

impl RacingFlags {
    pub fn new(
        settings: &Config,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Self {
        let settings = settings.normalized();
        let vm = Arc::new(project(&settings, &Snapshot::default(), prefs));
        // Como GPUI: sin foto todavía se ve la tarjeta de espera.
        let waiting = true;
        let session = scene::SessionInfo::default();
        let visual = scene::sample(&vm, waiting, &session, prefs);
        let painter = Painter::new(visual.as_ref());
        Self {
            settings,
            prefs,
            painter,
            vm,
            projection_key: None,
            waiting,
            session,
            visual,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        let Settings::RacingFlags(settings) = settings else {
            return false;
        };
        self.settings == settings.normalized() && self.prefs == prefs
    }

    pub fn size(&self) -> Size {
        self.size_for(None)
    }

    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Size {
            width: render::WIDTH,
            height: render::HEIGHT,
        }
    }

    /// Sin animación visible no hay política que aplicar.
    pub fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }

    /// Proyección y estado del aviso; el muestreo de la tarjeta es de `animate`.
    pub fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let key = (
            snapshot.epoch,
            snapshot.sequence,
            snapshot.state.session.id.0,
            snapshot.state.source_state,
            self.prefs,
        );
        let fresh = self.projection_key != Some(key);
        if fresh {
            self.vm = Arc::new(project(&self.settings, snapshot, self.prefs));
            self.projection_key = Some(key);
        }
        let waiting = matches!(
            snapshot.state.source_state,
            SourceState::Waiting | SourceState::Lost
        );
        let kind = Session::of(&snapshot.state.session.kind);
        let finish = if !waiting
            && kind == Some(Session::Race)
            && self.vm.flag.as_ref() == Some(&FlagKind::Checkered)
            && self.vm.penalty.is_none()
        {
            snapshot.state.player_car().and_then(|car| {
                car.class_position
                    .current()
                    .copied()
                    .filter(|position| *position > 0)
                    .zip(car.class.as_ref())
                    .map(|(position, class)| (position, class.name.clone()))
            })
        } else {
            None
        };
        let session = scene::SessionInfo { kind, finish };
        let same = !fresh && self.waiting == waiting && self.session == session;
        self.waiting = waiting;
        self.session = session;
        if same {
            return Update::default();
        }
        let visual = scene::sample(&self.vm, waiting, &self.session, self.prefs);
        if visual == self.visual {
            return Update::default();
        }
        self.visual = visual;
        Update {
            build: false,
            pixels: true,
        }
    }

    /// La tarjeta se recompone aquí, una sola vez por cambio visible. Sin reloj.
    pub fn animate(&mut self, _clock: f64) -> Update {
        self.painter.sync(self.visual.as_ref())
    }

    pub fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}

    pub fn view(&self) -> rune::El {
        self.painter.view()
    }
}

fn project(settings: &Config, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    racing_flags::project_with_config(
        snapshot,
        prefs,
        racing_flags::Config {
            text_color: u32::from_str_radix(settings.text_color.trim_start_matches('#'), 16)
                .unwrap_or(0),
            show_sector_flags: settings.show_sector_flags,
            hide_when_green: settings.hide_when_green,
        },
    )
}

impl Widget for RacingFlags {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::RacingFlags(settings) = settings else {
            return None;
        };
        Some(Box::new(RacingFlags::new(
            settings, prefs, reduced, hz, clock,
        )))
    }

    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        RacingFlags::configured(self, settings, prefs)
    }

    fn size(&self) -> Size {
        RacingFlags::size(self)
    }

    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        RacingFlags::size_for(self, snapshot)
    }

    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        RacingFlags::policy(self, reduced, hz, clock)
    }

    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        RacingFlags::update(self, snapshot, clock)
    }

    fn animate(&mut self, clock: f64) -> Update {
        RacingFlags::animate(self, clock)
    }

    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        RacingFlags::schedule(self, clock, tx);
    }

    fn view(&self) -> rune::El {
        RacingFlags::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{
        Capability, Car, CarId, Class, ClassId, Flag, FlagScope, Player, Quality, SessionKind,
    };

    fn session_flag(kind: FlagKind) -> Flag {
        Flag {
            kind,
            scope: FlagScope::Session,
        }
    }

    fn photo(sequence: u64, source: SourceState, flags: Vec<Flag>) -> Snapshot {
        let mut snapshot = Snapshot {
            epoch: 1,
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.source_state = source;
        snapshot.state.capabilities.flags = Capability::Fresh;
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot.state.flags = Quality::Reliable(flags);
        snapshot
    }

    fn runtime(widget: RacingFlags) -> Runtime<RacingFlags> {
        let mut runtime = Runtime::with_text(
            widget,
            |widget, _| widget.view(),
            (render::WIDTH, render::HEIGHT),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|widget, clock, tx| {
            let update = widget.animate(clock);
            widget.schedule(clock, tx);
            update.build
        });
        runtime
    }

    fn payload(instance: &rune::render::Instance) -> [[u32; 4]; 8] {
        [
            instance.rect.map(f32::to_bits),
            instance.radii.map(f32::to_bits),
            instance.fill.map(f32::to_bits),
            instance.border.map(f32::to_bits),
            instance.params.map(f32::to_bits),
            instance.uv.map(f32::to_bits),
            instance.clip.map(f32::to_bits),
            instance.fade,
        ]
    }

    /// Cuenta cambios reales del flujo CPU, como el anfitrión; sin ventana.
    fn rendered(runtime: &mut Runtime<RacingFlags>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    /// Deja asentar una recompostura de texto antes de exigir reposo.
    fn settle(runtime: &mut Runtime<RacingFlags>) {
        for _ in 0..3 {
            rendered(runtime, 0.05);
        }
    }

    fn element<'a>(elements: &'a [rune::ElementInfo], key: &str) -> &'a rune::ElementInfo {
        elements
            .iter()
            .find(|element| element.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("falta el elemento {key}"))
    }

    #[test]
    fn dispatch_builds_the_widget_with_its_settings() {
        let layout = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"f","x":0,"y":0,"settings":{"kind":"racing-flags"}}]}"#,
        )
        .expect("design");
        let instance = &layout.instances[0];
        assert!(crate::renderer::supports(instance));
        let prefs = Preferences::default();
        let painter = <RacingFlags as Widget>::new(&instance.settings, prefs, false, 15, 0.0)
            .expect("widget");
        assert!(painter.configured(&instance.settings, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: 340.0,
                height: 88.0
            }
        );
        let hidden = Settings::RacingFlags(Config {
            hide_when_green: true,
            ..Config::default()
        });
        assert!(!painter.configured(&hidden, prefs));
    }

    #[test]
    fn still_data_draws_nothing_and_a_flag_change_draws_once() {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        assert!(rendered(&mut runtime, 0.05), "la espera inicial se pinta");
        for _ in 0..20 {
            assert!(!rendered(&mut runtime, 0.05), "reposo sin imagen");
        }
        assert!(runtime.wake_deadline().is_none(), "sin reloj");
        runtime.state.update(
            &photo(2, SourceState::Live, vec![session_flag(FlagKind::Green)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "entra la bandera verde");
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "quieta no repinta");
        assert!(runtime.wake_deadline().is_none(), "ni pulso ni reloj");
    }

    #[test]
    fn hidden_green_removes_the_card_and_waiting_always_shows_it() {
        let prefs = Preferences::default();
        let settings = Config {
            hide_when_green: true,
            ..Config::default()
        };
        let mut runtime = runtime(RacingFlags::new(&settings, prefs, false, 15, 0.0));
        assert!(rendered(&mut runtime, 0.05), "espera inicial");
        runtime.state.update(
            &photo(2, SourceState::Live, vec![session_flag(FlagKind::Green)]),
            runtime.clock,
        );
        assert!(
            rendered(&mut runtime, 0.05),
            "el verde oculto retira la tarjeta"
        );
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "sigue oculta");
        runtime.state.update(
            &photo(3, SourceState::Waiting, vec![session_flag(FlagKind::Green)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "la espera vuelve a verse");
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "vuelve al reposo");
    }

    #[test]
    fn source_interruptions_and_recovery_keep_the_card_semantics() {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        rendered(&mut runtime, 0.05);
        runtime.state.update(
            &photo(2, SourceState::Live, vec![session_flag(FlagKind::Yellow)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "amarilla");
        settle(&mut runtime);
        runtime.state.update(
            &photo(
                3,
                SourceState::Waiting,
                vec![session_flag(FlagKind::Yellow)],
            ),
            runtime.clock,
        );
        assert!(
            rendered(&mut runtime, 0.05),
            "la espera sustituye la bandera"
        );
        assert!(runtime.state.waiting);
        settle(&mut runtime);
        runtime.state.update(
            &photo(4, SourceState::Lost, vec![session_flag(FlagKind::Yellow)]),
            runtime.clock,
        );
        assert!(!rendered(&mut runtime, 0.05), "la espera no cambia");
        runtime.state.update(
            &photo(5, SourceState::Live, vec![session_flag(FlagKind::Yellow)]),
            runtime.clock,
        );
        assert!(rendered(&mut runtime, 0.05), "recupera la bandera");
        settle(&mut runtime);
        assert!(!rendered(&mut runtime, 0.05), "reposo tras recuperar");
        assert!(runtime.wake_deadline().is_none());
    }

    #[test]
    fn display_texts_use_the_display_baseline() {
        let prefs = Preferences::default();
        let mut runtime = runtime(RacingFlags::new(&Config::default(), prefs, false, 15, 0.0));
        let mut yellow = photo(2, SourceState::Live, vec![session_flag(FlagKind::Yellow)]);
        yellow.state.flags = Quality::Reliable(vec![
            session_flag(FlagKind::Yellow),
            Flag {
                kind: FlagKind::Yellow,
                scope: FlagScope::Sector(0),
            },
        ]);
        runtime.state.update(&yellow, runtime.clock);
        assert!(rendered(&mut runtime, 0.05), "amarilla con sectores");
        settle(&mut runtime);
        let elements = runtime.elements();
        let baseline = crate::vantare::Style::compiled().fonts.display_baseline;
        assert!(baseline > 0.0, "el estilo canónico desplaza la Display");
        assert_eq!(element(&elements, "title").rect[1], 11.0 + baseline);
        assert_eq!(
            element(&elements, "sector-label-0").rect[1],
            59.0 + baseline
        );
        assert_eq!(
            element(&elements, "message").rect[1],
            37.0,
            "Body sin desplazamiento"
        );
    }

    #[test]
    fn checkered_race_reads_the_player_finish_position_and_class() {
        let prefs = Preferences::default();
        let mut widget = RacingFlags::new(&Config::default(), prefs, false, 15, 0.0);
        widget.update(&photo(1, SourceState::Live, vec![]), 0.0);
        let mut finish = photo(
            2,
            SourceState::Live,
            vec![session_flag(FlagKind::Checkered)],
        );
        finish.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        finish.state.cars = vec![Car {
            id: CarId(1),
            class: Some(Class {
                id: ClassId(1),
                name: "GT3".into(),
            }),
            class_position: Quality::Reliable(3),
            ..Car::default()
        }];
        widget.update(&finish, 1.0);
        assert_eq!(
            &*widget.visual.as_ref().expect("tarjeta").message,
            "Fin de la carrera · P3 en GT3"
        );
    }
}
