//! Car damage visual: domain projection, the Car/Values views and the retained
//! Vantare 200 × 272 panel. The view comes from the `view` setting; there is no
//! keyboard path in the Rune host yet (see PARIDAD of the GPUI widget).
mod render;
pub mod scene;

use crate::widget::{Update, Widget};
use render::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    car_damage_visual::{self, ViewModel},
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings as WidgetSettings, car_damage_visual::Settings},
};

pub(crate) struct CarDamageVisual {
    settings: Settings,
    prefs: Preferences,
    vm: ViewModel,
    view: scene::View,
    scene: scene::Scene,
    painter: Painter,
}

impl CarDamageVisual {
    fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let vm = project(&Snapshot::default(), prefs, &settings);
        let view = scene::View::from_settings(&settings.view);
        let scene = sample(&vm, view, &settings, prefs);
        let painter = Painter::new(&scene);
        Self {
            settings,
            prefs,
            vm,
            view,
            scene,
            painter,
        }
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        matches!(settings, WidgetSettings::CarDamageVisual(s) if s.normalized() == self.settings)
            && self.prefs == prefs
    }
    fn size(&self) -> Size {
        Size {
            width: scene::WIDTH,
            height: scene::HEIGHT,
        }
    }
    /// The box is fixed in both views, so a snapshot never resizes the window.
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        self.size()
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        self.vm = project(snapshot, self.prefs, &self.settings);
        self.resample()
    }
    /// TEMPORAL(teclado del host): GPUI toggles the view with F1–F12. When the host
    /// delivers a key event this method flips the view; today only a test uses it.
    #[allow(dead_code)] // Se conectará al evento del host en #2430; hasta entonces solo lo cubre un test.
    fn toggle_view(&mut self) -> Update {
        self.view = self.view.toggled();
        self.resample()
    }
    fn resample(&mut self) -> Update {
        let scene = sample(&self.vm, self.view, &self.settings, self.prefs);
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

fn project(snapshot: &Snapshot, prefs: Preferences, settings: &Settings) -> ViewModel {
    let mut vm = car_damage_visual::project(snapshot, prefs);
    vm.show_aero = settings.show_aero;
    vm
}

fn sample(
    vm: &ViewModel,
    view: scene::View,
    settings: &Settings,
    prefs: Preferences,
) -> scene::Scene {
    scene::sample(vm, view, settings.show_percent, prefs.language)
}

impl Widget for CarDamageVisual {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::CarDamageVisual(settings) = settings else {
            return None;
        };
        Some(Box::new(CarDamageVisual::new(settings, prefs)))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        CarDamageVisual::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        CarDamageVisual::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        CarDamageVisual::size_for(self, snapshot)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        CarDamageVisual::update(self, snapshot, clock)
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        CarDamageVisual::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime, render::Instance, text::TextSystem};
    use vantare_domain::{Capability, Damage, Quality::Reliable, SourceState};

    fn live(damage: Damage) -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.epoch = 1;
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.damage = Capability::Fresh;
        snapshot.state.player.as_mut().expect("player").damage = damage;
        snapshot
    }

    fn damage() -> Damage {
        Damage {
            aero: Reliable(0.2),
            body: Reliable(0.7),
            suspension: Reliable(0.9),
            tyre_wear: [
                Reliable(0.98),
                Reliable(0.91),
                Reliable(0.87),
                Reliable(0.93),
            ],
        }
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
        widget: CarDamageVisual,
        next: Option<Snapshot>,
    }

    fn make_runtime(widget: CarDamageVisual) -> Runtime<Harness> {
        let size = widget.size();
        let mut runtime = Runtime::with_text(
            Harness { widget, next: None },
            |harness: &Harness, _| harness.widget.view(),
            (size.width, size.height),
            Env::new(true, 1.0),
            TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|harness, clock, tx| {
            tx.instant();
            let mut build = false;
            if let Some(snapshot) = harness.next.take() {
                build = harness.widget.update(&snapshot, clock).build;
            }
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
    fn both_views_keep_the_single_catalogue_box() {
        for view in ["car", "numbers"] {
            let widget = CarDamageVisual::new(
                &Settings {
                    view: view.into(),
                    ..Settings::default()
                },
                Preferences::default(),
            );
            assert_eq!((widget.size().width, widget.size().height), (200.0, 272.0));
            assert_eq!(widget.size_for(Some(&live(damage()))), widget.size());
        }
    }

    #[test]
    fn the_view_comes_from_the_setting_and_the_toggle_is_ready_for_the_host() {
        let mut widget = CarDamageVisual::new(&Settings::default(), Preferences::default());
        assert_eq!(widget.view, scene::View::Car);
        let update = widget.toggle_view();
        assert!(update.build, "la vista cambia");
        assert_eq!(widget.view, scene::View::Numbers);
        assert_eq!(widget.scene.view, scene::View::Numbers);
        assert!(widget.toggle_view().build);
        assert_eq!(widget.view, scene::View::Car);
        let configured = CarDamageVisual::new(
            &Settings {
                view: "numbers".into(),
                ..Settings::default()
            },
            Preferences::default(),
        );
        assert_eq!(configured.view, scene::View::Numbers);
        assert_eq!(configured.scene.view, scene::View::Numbers);
    }

    #[test]
    fn the_settings_reach_the_scene() {
        let widget = CarDamageVisual::new(
            &Settings {
                show_aero: false,
                show_percent: false,
                ..Settings::default()
            },
            Preferences::default(),
        );
        assert!(!widget.scene.show_aero);
        assert_eq!(widget.scene.aero_legend, None);
        assert_eq!(widget.scene.rows(), [1, 2, 3]);
    }

    #[test]
    fn update_follows_domain_and_repaints_only_visible_changes() {
        let prefs = Preferences::default();
        let mut widget = CarDamageVisual::new(&Settings::default(), prefs);
        widget.update(&live(damage()), 0.0);
        assert_eq!(widget.scene.percentages, ["80%", "30%", "10%"]);
        assert_eq!(widget.scene.tyre_percentages, ["2%", "9%", "13%", "7%"]);
        assert_eq!(widget.scene.status, "Integridad del coche");
        let mut lost = live(damage());
        lost.state.source_state = SourceState::Lost;
        assert!(widget.update(&lost, 0.1).build, "entra el aviso");
        assert_eq!(widget.scene.status, "DESCONECTADO");
    }

    #[test]
    fn a_visible_change_presents_one_image_and_repose_none() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut snapshot = live(damage());
        let mut runtime = make_runtime(CarDamageVisual::new(
            &Settings::default(),
            Preferences::default(),
        ));
        runtime.state.next = Some(snapshot.clone());
        assert!(frame(&mut runtime, 0.0), "primera imagen");
        runtime.state.next = Some(snapshot.clone());
        assert!(!frame(&mut runtime, 0.1), "reposo");
        snapshot.sequence += 1;
        runtime.state.next = Some(snapshot.clone());
        assert!(!frame(&mut runtime, 0.2), "la secuencia no se pinta");
        snapshot.state.player.as_mut().expect("player").damage.aero = Reliable(0.4);
        runtime.state.next = Some(snapshot);
        assert!(frame(&mut runtime, 0.3), "un cambio visible, una imagen");
        assert!(!frame(&mut runtime, 0.4), "vuelve el reposo");
        assert!(runtime.wake_deadline().is_none(), "sin reloj");
    }
}
