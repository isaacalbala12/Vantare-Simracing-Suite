//! Vuelta rápida: proyección, aviso y pintura Vantare (480 × 104).
mod render;
pub mod scene;

use crate::widget::{Update, Widget};
use render::Painter;
use std::sync::Arc;
use vantare_domain::{
    Snapshot, fastest_lap,
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings, fastest_lap::Settings as Config},
};

pub(crate) struct FastestLap {
    settings: Config,
    prefs: Preferences,
    motion: scene::Motion,
    painter: Painter,
    projected: Option<Arc<fastest_lap::ViewModel>>,
    projection_key: Option<(u64, u64, u64, Preferences)>,
    visual: Option<scene::Scene>,
}

impl FastestLap {
    pub fn new(settings: &Config, prefs: Preferences, reduced: bool, _hz: u16, clock: f64) -> Self {
        let settings = settings.normalized();
        let motion = scene::Motion::new(f64::from(settings.duration_seconds), reduced);
        let visual = scene::sample(&motion, prefs, clock);
        let painter = Painter::new(visual.as_ref());
        Self {
            settings,
            prefs,
            motion,
            painter,
            projected: None,
            projection_key: None,
            visual,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        let Settings::FastestLap(settings) = settings else {
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

    pub fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> Update {
        if self
            .motion
            .policy(reduced, f64::from(self.settings.duration_seconds))
        {
            self.animate(clock)
        } else {
            Update::default()
        }
    }

    /// Proyección y estado del aviso. Muestrear y recomponer toca a `animate`,
    /// que el anfitrión llama justo después en el mismo marco.
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let vm = self.projection(snapshot);
        let changed = self.motion.update(
            snapshot,
            &vm,
            self.prefs,
            self.settings.show_class,
            self.settings.show_personal,
            clock,
        );
        Update {
            build: false,
            pixels: changed,
        }
    }

    pub fn animate(&mut self, clock: f64) -> Update {
        self.motion.advance(clock);
        let visual = scene::sample(&self.motion, self.prefs, clock);
        if self.visual == visual {
            return Update::default();
        }
        let update = self.painter.sync(visual.as_ref());
        self.visual = visual;
        update
    }

    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock) {
            tx.wake_at(due);
        }
    }

    pub fn view(&self) -> rune::El {
        self.painter.view()
    }

    /// Reutiliza la proyección mientras no cambien época, secuencia, sesión ni
    /// idioma; así la escena puede comparar con `Arc::ptr_eq`.
    fn projection(&mut self, snapshot: &Snapshot) -> Arc<fastest_lap::ViewModel> {
        let key = (
            snapshot.epoch,
            snapshot.sequence,
            snapshot.state.session.id.0,
            self.prefs,
        );
        if self.projection_key != Some(key) {
            let mut vm = fastest_lap::project(snapshot, self.prefs);
            vm.show_driver = self.settings.show_driver;
            self.projected = Some(Arc::new(vm));
            self.projection_key = Some(key);
        }
        self.projected
            .as_ref()
            .map(Arc::clone)
            .expect("proyección vigente")
    }
}

impl Widget for FastestLap {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::FastestLap(settings) = settings else {
            return None;
        };
        Some(Box::new(FastestLap::new(
            settings, prefs, reduced, hz, clock,
        )))
    }

    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        FastestLap::configured(self, settings, prefs)
    }

    fn size(&self) -> Size {
        FastestLap::size(self)
    }

    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        FastestLap::size_for(self, snapshot)
    }

    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        FastestLap::policy(self, reduced, hz, clock)
    }

    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        FastestLap::update(self, snapshot, clock)
    }

    fn animate(&mut self, clock: f64) -> Update {
        FastestLap::animate(self, clock)
    }

    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        FastestLap::schedule(self, clock, tx);
    }

    fn view(&self) -> rune::El {
        FastestLap::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{
        Capability, Car, CarId, Class, ClassId, Driver, Player, Quality, SourceState,
        format::Preferences,
    };

    fn car(id: u32, name: &str, class: u32, class_name: &str, best: f64) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            vehicle: "Car".into(),
            driver: Driver {
                name: name.into(),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(class),
                name: class_name.into(),
            }),
            laps: Quality::Reliable(4),
            last_lap_s: Quality::Reliable(best),
            best_lap_s: Quality::Reliable(best),
            ..Car::default()
        }
    }

    /// Foto con el jugador y un rival en GT3; el tercer coche es de otra clase.
    fn photo(sequence: u64, best: f64) -> Snapshot {
        let mut snapshot = Snapshot {
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.lap_times = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars = vec![
            car(1, "Player", 1, "GT3", best),
            car(2, "Rival", 1, "GT3", 91.0),
            car(3, "Other", 2, "HYPERCAR", 80.0),
        ];
        snapshot
    }

    fn widget(settings: &Config, prefs: Preferences, reduced: bool) -> FastestLap {
        FastestLap::new(settings, prefs, reduced, 15, 0.0)
    }

    fn runtime(widget: FastestLap) -> Runtime<FastestLap> {
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
    fn rendered(runtime: &mut Runtime<FastestLap>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    #[test]
    fn dispatch_builds_the_widget_with_its_settings() {
        let layout = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"f","x":0,"y":0,"settings":{"kind":"fastest-lap"}}]}"#,
        )
        .expect("design");
        let instance = &layout.instances[0];
        assert!(crate::renderer::supports(instance));
        let prefs = Preferences::default();
        let painter =
            <FastestLap as Widget>::new(&instance.settings, prefs, true, 15, 0.0).expect("widget");
        assert!(painter.configured(&instance.settings, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: 480.0,
                height: 104.0
            }
        );
        let longer = Settings::FastestLap(Config {
            duration_seconds: 9,
            ..Config::default()
        });
        assert!(!painter.configured(&longer, prefs));
        let english = Preferences {
            language: vantare_domain::format::Language::En,
            ..prefs
        };
        assert!(!painter.configured(&instance.settings, english));
    }

    #[test]
    fn still_data_draws_nothing_and_a_visible_notice_draws_once() {
        let prefs = Preferences::default();
        let mut runtime = runtime(widget(&Config::default(), prefs, false));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        assert!(!rendered(&mut runtime, 0.0), "la primera foto es silencio");
        for _ in 0..20 {
            assert!(!rendered(&mut runtime, 0.05), "reposo sin imagen");
        }
        assert!(runtime.wake_deadline().is_none(), "sin aviso no hay reloj");
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        assert!(rendered(&mut runtime, 0.11), "entra el fundido");
        assert!(rendered(&mut runtime, 0.2), "sigue el fundido");
        for _ in 0..3 {
            rendered(&mut runtime, 0.5);
        }
        assert!(!rendered(&mut runtime, 0.5), "quieto no repinta");
        assert!(runtime.wake_deadline().is_some(), "pide la salida");
    }

    #[test]
    fn reduced_motion_keeps_the_final_state_and_one_expiry_wake() {
        let prefs = Preferences::default();
        let mut runtime = runtime(widget(&Config::default(), prefs, true));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        assert!(!rendered(&mut runtime, 0.0));
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        assert!(rendered(&mut runtime, 0.05), "aparece entero");
        for _ in 0..10 {
            rendered(&mut runtime, 0.5);
            assert_eq!(
                runtime.state.visual.as_ref().map(|scene| scene.opacity),
                Some(1.0),
                "sin fundido ni deslizamiento"
            );
            assert_eq!(runtime.wake_deadline(), Some(6.0), "un solo despertar");
        }
        assert!(rendered(&mut runtime, 1.0), "caduca al final de su vida");
        assert!(runtime.state.visual.is_none(), "ya no hay aviso");
        assert!(runtime.wake_deadline().is_none(), "después no hay reloj");
        assert!(!rendered(&mut runtime, 1.0), "reposo");
    }

    #[test]
    fn pause_clears_the_notice_without_animating() {
        // La retirada es estado y señal de recomposición; la imagen la decide el
        // anfitrión al rehacer la vista vacía (mismo camino que la caducidad).
        let prefs = Preferences::default();
        let mut widget = widget(&Config::default(), prefs, false);
        widget.update(&photo(1, 90.0), 0.0);
        widget.update(&photo(2, 89.94), 1.0);
        assert!(widget.animate(1.3).build, "aviso visible");
        assert!(widget.visual.is_some());
        let mut paused = photo(3, 89.0);
        paused.state.source_state = SourceState::Paused;
        widget.update(&paused, 1.3);
        let update = widget.animate(1.35);
        assert!(update.build && update.pixels, "se retira de golpe");
        assert!(widget.visual.is_none(), "sin aviso en pausa");
        assert_eq!(widget.motion.next_wake(1.35), None, "sin reloj");
    }
}
