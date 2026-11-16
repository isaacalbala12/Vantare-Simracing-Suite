//! Pedals telemetry projection/controller; both the scene and the Look are shared.
mod render;
pub mod scene;
use crate::widget::{Update, Widget};
use render::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    pedals_telemetry::{ViewModel, WHEELS},
    widget_settings::{Settings as WidgetSettings, pedals_telemetry::Settings},
};

pub(crate) struct PedalsTelemetry {
    settings: Settings,
    prefs: Preferences,
    vm: ViewModel,
    motion: scene::Motion,
    scene: scene::Scene,
    painter: Painter,
}

fn project(settings: &Settings, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let mut vm = vantare_domain::pedals_telemetry::project(snapshot, prefs);
    vm.steering_wheel = WHEELS
        .iter()
        .copied()
        .find(|id| *id == settings.steering_wheel.as_str())
        .unwrap_or("generic");
    vm.show_clutch = settings.show_clutch;
    vm
}

impl PedalsTelemetry {
    fn new(settings: &Settings, prefs: Preferences, reduced: bool, clock: f64) -> Self {
        let settings = settings.normalized();
        let default = Snapshot::default();
        let vm = project(&settings, &default, prefs);
        let mut motion = scene::Motion::new(reduced);
        motion.update(&vm, default.epoch, clock);
        let scene = scene::sample(&vm, &motion, clock);
        let painter = Painter::new(prefs, &scene);
        Self {
            settings,
            prefs,
            vm,
            motion,
            scene,
            painter,
        }
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        matches!(settings, WidgetSettings::PedalsTelemetry(s) if s.normalized() == self.settings)
            && self.prefs == prefs
    }
    fn size(&self) -> Size {
        Size {
            width: scene::SIZE.0,
            height: scene::SIZE.1,
        }
    }
    fn settle(&mut self, clock: f64) -> Update {
        let scene = scene::sample(&self.vm, &self.motion, clock);
        if scene == self.scene {
            return Update::default();
        }
        let update = self.painter.sync(&scene);
        self.scene = scene;
        update
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let vm = project(&self.settings, snapshot, self.prefs);
        self.motion.update(&vm, snapshot.epoch, clock);
        self.vm = vm;
        self.settle(clock)
    }
    fn policy(&mut self, reduced: bool, clock: f64) -> Update {
        self.motion.policy(reduced);
        self.settle(clock)
    }
    fn view(&self) -> El {
        self.painter.view()
    }
}

impl Widget for PedalsTelemetry {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        reduced: bool,
        _hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::PedalsTelemetry(settings) = settings else {
            return None;
        };
        Some(Box::new(PedalsTelemetry::new(
            settings, prefs, reduced, clock,
        )))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        PedalsTelemetry::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        PedalsTelemetry::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        PedalsTelemetry::size(self)
    }
    fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> Update {
        PedalsTelemetry::policy(self, reduced, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        PedalsTelemetry::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        PedalsTelemetry::settle(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(wake) = self.motion.next_wake(clock) {
            tx.wake_at(wake);
        }
    }
    fn view(&self) -> El {
        PedalsTelemetry::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime, render::Instance, text::TextSystem};
    use vantare_domain::{Quality::Reliable, SourceState};

    fn live_snapshot() -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.epoch = 1;
        snapshot.state.source_state = SourceState::Live;
        let player = snapshot.state.player.as_mut().expect("jugador");
        player.telemetry.clutch = Reliable(0.06);
        player.telemetry.brake = Reliable(0.13);
        player.telemetry.throttle = Reliable(0.75);
        player.telemetry.steering = Reliable(0.08);
        player.telemetry.gear = Reliable(4);
        player.telemetry.speed_mps = Reliable(50.0);
        player.telemetry.engine_speed_rad_s = Reliable(7200.0 * std::f64::consts::PI / 30.0);
        snapshot
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

    struct Harness {
        widget: PedalsTelemetry,
        next: Option<Snapshot>,
        dirty: bool,
    }

    fn make_runtime(widget: PedalsTelemetry) -> Runtime<Harness> {
        let size = widget.size();
        let mut runtime = Runtime::with_text(
            Harness {
                widget,
                next: None,
                dirty: false,
            },
            |harness: &Harness, _| harness.widget.view(),
            (size.width, size.height),
            Env::new(true, 1.0),
            TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|harness, clock, tx| {
            // Como `host::poll`: sin muelles ni presencia implícita por datos.
            tx.instant();
            let mut build = harness.dirty;
            harness.dirty = false;
            if let Some(snapshot) = harness.next.take() {
                build |= harness.widget.update(&snapshot, clock).build;
            }
            build |= harness.widget.animate(clock).build;
            harness.widget.schedule(clock, tx);
            build
        });
        runtime
    }

    fn frame(runtime: &mut Runtime<Harness>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    #[test]
    fn a_visible_change_tweens_and_then_rests() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut snapshot = live_snapshot();
        let mut runtime = make_runtime(PedalsTelemetry::new(
            &Settings::default(),
            Preferences::default(),
            false,
            0.0,
        ));
        runtime.state.next = Some(snapshot.clone());
        assert!(frame(&mut runtime, 0.0), "primera imagen");

        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .throttle = Reliable(0.25);
        runtime.state.next = Some(snapshot);
        assert!(
            !frame(&mut runtime, 0.01),
            "el primer instante aún muestra el valor anterior"
        );
        assert!(
            runtime.wake_deadline().is_some(),
            "reloj mientras dura la transición"
        );
        assert!(frame(&mut runtime, 0.02), "a mitad de la transición");
        assert!(frame(&mut runtime, 0.2), "final");
        assert!(!frame(&mut runtime, 0.2), "reposo");
        assert!(
            runtime.wake_deadline().is_none(),
            "sin reloj sin transición"
        );
    }

    #[test]
    fn reduced_motion_lands_on_the_final_value_without_a_clock() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut snapshot = live_snapshot();
        let mut runtime = make_runtime(PedalsTelemetry::new(
            &Settings::default(),
            Preferences::default(),
            true,
            0.0,
        ));
        runtime.state.next = Some(snapshot.clone());
        assert!(frame(&mut runtime, 0.0), "primera imagen");
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .throttle = Reliable(0.25);
        runtime.state.next = Some(snapshot);
        assert!(frame(&mut runtime, 0.03), "valor final de una vez");
        assert!(!frame(&mut runtime, 0.03), "reposo");
        assert!(runtime.wake_deadline().is_none(), "sin reloj");
    }

    #[test]
    fn reduced_policy_settles_a_running_transition() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut snapshot = live_snapshot();
        let mut runtime = make_runtime(PedalsTelemetry::new(
            &Settings::default(),
            Preferences::default(),
            false,
            0.0,
        ));
        runtime.state.next = Some(snapshot.clone());
        assert!(frame(&mut runtime, 0.0));
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .throttle = Reliable(0.25);
        runtime.state.next = Some(snapshot);
        assert!(
            !frame(&mut runtime, 0.01),
            "el primer instante aún muestra el valor anterior"
        );
        assert!(runtime.state.widget.policy(true, runtime.clock).build);
        runtime.state.dirty = true;
        assert!(frame(&mut runtime, 0.001), "aterriza en el valor final");
        assert!(!frame(&mut runtime, 0.001), "reposo");
        assert!(runtime.wake_deadline().is_none(), "sin reloj");
    }
}
