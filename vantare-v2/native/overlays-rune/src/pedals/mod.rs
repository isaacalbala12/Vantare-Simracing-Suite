//! Pedals projection/controller. Both Looks consume the same sampled scene.
mod render;
pub mod scene;
use crate::widget::{Update, Widget};
use render::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    pedals::ViewModel,
    widget_settings::{Settings as WidgetSettings, pedals::Settings},
};

pub(crate) struct Pedals {
    settings: Settings,
    prefs: Preferences,
    state: scene::State,
    scene: scene::Scene,
    painter: Painter,
}

fn project(settings: &Settings, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let mut vm = vantare_domain::pedals::project(snapshot, prefs);
    vm.transparent_background = settings.transparent_background;
    vm
}

impl Pedals {
    fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let default = Snapshot::default();
        let vm = project(&settings, &default, prefs);
        let mut state = scene::State::default();
        state.update(&default, &vm);
        let scene = scene::sample(&vm, &state);
        let painter = Painter::new(&settings, prefs, &scene);
        Self {
            settings,
            prefs,
            state,
            scene,
            painter,
        }
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        matches!(settings, WidgetSettings::Pedals(s) if s.normalized() == self.settings)
            && self.prefs == prefs
    }
    fn size(&self) -> Size {
        Size {
            width: scene::width_for_gap(self.settings.design_system, self.settings.gap),
            height: scene::HEIGHT,
        }
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let vm = project(&self.settings, snapshot, self.prefs);
        self.state.update(snapshot, &vm);
        let scene = scene::sample(&vm, &self.state);
        if scene == self.scene {
            return Update::default();
        }
        let update = self.painter.sync(&scene);
        self.scene = scene;
        update
    }
    fn view(&self) -> El {
        self.painter.view()
    }
}

impl Widget for Pedals {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::Pedals(settings) = settings else {
            return None;
        };
        Some(Box::new(Pedals::new(settings, prefs)))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        Pedals::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Pedals::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Pedals::size(self)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        Pedals::update(self, snapshot, clock)
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        Pedals::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime, render::Instance, text::TextSystem};
    use vantare_domain::{Quality::Reliable, widget_settings::look::Look};

    fn for_look(look: Look) -> Settings {
        Settings {
            design_system: look,
            ..Settings::for_look(look)
        }
    }

    fn live_snapshot() -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        let telemetry = &mut snapshot.state.player.as_mut().expect("jugador").telemetry;
        telemetry.throttle = Reliable(0.5);
        telemetry.brake = Reliable(0.25);
        telemetry.clutch = Reliable(0.75);
        telemetry.gear = Reliable(3);
        telemetry.speed_mps = Reliable(10.0);
        telemetry.engine_speed_rad_s = Reliable(100.0);
        snapshot
    }

    fn set_brake(snapshot: &mut Snapshot, value: f64) {
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .brake = Reliable(value);
    }

    fn payload(instance: &Instance) -> [[u32; 4]; 8] {
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

    /// `Runtime::frame` returns "still animating"; an image only changes the CPU paint stream.
    fn frame(runtime: &mut Runtime<Harness>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    /// The real host path: `poll` returns the build flag, so the view is rebuilt only then.
    struct Harness {
        pedals: Pedals,
        next: Option<Snapshot>,
    }

    fn make_runtime(pedals: Pedals) -> Runtime<Harness> {
        let size = pedals.size();
        let mut runtime = Runtime::with_text(
            Harness { pedals, next: None },
            |harness: &Harness, _| harness.pedals.view(),
            (size.width, size.height),
            Env::new(true, 1.0),
            TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|harness, clock, tx| {
            let mut build = false;
            if let Some(snapshot) = harness.next.take() {
                build = harness.pedals.update(&snapshot, clock).build;
            }
            build |= harness.pedals.animate(clock).build;
            harness.pedals.schedule(clock, tx);
            build
        });
        runtime
    }

    #[test]
    fn both_looks_keep_their_width_and_accept_their_settings() {
        for (look, width) in [(Look::Vantare, 96.0), (Look::Eficiencia, 108.0)] {
            let settings = for_look(look);
            let widget = Pedals::new(&settings, Preferences::default());
            assert_eq!(widget.size().width, width, "{look:?}");
            assert_eq!(widget.size().height, scene::HEIGHT);
            let all = WidgetSettings::Pedals(settings.clone());
            assert!(widget.configured(&all, Preferences::default()));
            let mut hidden = settings;
            hidden.transparent_background = !hidden.transparent_background;
            assert!(!widget.configured(&WidgetSettings::Pedals(hidden), Preferences::default()));
        }
    }

    #[test]
    fn a_visible_change_presents_one_image_and_repose_none() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for look in [Look::Vantare, Look::Eficiencia] {
            let mut snapshot = live_snapshot();
            let mut runtime = make_runtime(Pedals::new(&for_look(look), Preferences::default()));
            runtime.state.next = Some(snapshot.clone());
            assert!(frame(&mut runtime, 0.0), "{look:?}: primera imagen");
            runtime.state.next = Some(snapshot.clone());
            assert!(!frame(&mut runtime, 0.1), "{look:?}: reposo");
            snapshot.sequence += 1;
            runtime.state.next = Some(snapshot.clone());
            assert!(
                !frame(&mut runtime, 0.2),
                "{look:?}: la secuencia no se pinta"
            );
            snapshot
                .state
                .player
                .as_mut()
                .expect("jugador")
                .telemetry
                .throttle = Reliable(0.93);
            runtime.state.next = Some(snapshot.clone());
            assert!(
                frame(&mut runtime, 0.3),
                "{look:?}: un cambio visible, una imagen"
            );
            assert!(!frame(&mut runtime, 0.4), "{look:?}: vuelve el reposo");
            assert!(runtime.wake_deadline().is_none(), "{look:?}: sin reloj");
        }
    }

    #[test]
    fn hidden_peak_and_efficiency_limiter_do_not_present_images() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        // Vantare con el pico apagado: cambia el pico, no lo visible.
        let mut options = for_look(Look::Vantare);
        options.show_brake_peak = false;
        let mut snapshot = live_snapshot();
        set_brake(&mut snapshot, 0.50);
        let mut runtime = make_runtime(Pedals::new(&options, Preferences::default()));
        runtime.state.next = Some(snapshot.clone());
        assert!(frame(&mut runtime, 0.0));
        set_brake(&mut snapshot, 0.504);
        snapshot.sequence += 1;
        runtime.state.next = Some(snapshot.clone());
        assert!(!frame(&mut runtime, 0.1), "pico oculto");

        // Eficiencia no pinta el limitador.
        let mut snapshot = live_snapshot();
        let mut runtime = make_runtime(Pedals::new(
            &for_look(Look::Eficiencia),
            Preferences::default(),
        ));
        runtime.state.next = Some(snapshot.clone());
        assert!(frame(&mut runtime, 0.0));
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .pit_limiter_active = Reliable(true);
        snapshot.sequence += 1;
        runtime.state.next = Some(snapshot.clone());
        assert!(
            !frame(&mut runtime, 0.1),
            "limitador invisible en Eficiencia"
        );
    }
}
