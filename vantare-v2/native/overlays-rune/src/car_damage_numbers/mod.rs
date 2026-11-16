//! Car damage numbers: domain projection, the notice lines and the retained
//! Eficiencia painter. The height follows the rows and the notice, as in GPUI.
mod render;
pub mod scene;

use crate::widget::{Update, Widget};
use render::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    car_damage_numbers::{self, ViewModel},
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings as WidgetSettings, car_damage_numbers::Settings},
};

pub(crate) struct CarDamageNumbers {
    settings: Settings,
    prefs: Preferences,
    scene: scene::Scene,
    painter: Painter,
}

impl CarDamageNumbers {
    fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let vm = project(&Snapshot::default(), prefs, &settings);
        let scene = scene::sample(&vm);
        let painter = Painter::new(&scene);
        Self {
            settings,
            prefs,
            scene,
            painter,
        }
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        matches!(settings, WidgetSettings::CarDamageNumbers(s) if s.normalized() == self.settings)
            && self.prefs == prefs
    }
    fn size(&self) -> Size {
        Size {
            width: scene::WIDTH,
            height: self.scene.height,
        }
    }
    /// The window height must follow the notice of the snapshot being painted.
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let height = snapshot.map_or(self.scene.height, |photo| {
            scene::sample(&project(photo, self.prefs, &self.settings)).height
        });
        Size {
            width: scene::WIDTH,
            height,
        }
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let scene = scene::sample(&project(snapshot, self.prefs, &self.settings));
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
    car_damage_numbers::project(snapshot, prefs, settings.show_tyres)
}

impl Widget for CarDamageNumbers {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::CarDamageNumbers(settings) = settings else {
            return None;
        };
        Some(Box::new(CarDamageNumbers::new(settings, prefs)))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        CarDamageNumbers::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        CarDamageNumbers::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        CarDamageNumbers::size_for(self, snapshot)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        CarDamageNumbers::update(self, snapshot, clock)
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        CarDamageNumbers::view(self)
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
            aero: Reliable(0.0),
            body: Reliable(0.87),
            suspension: Reliable(0.5),
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
        widget: CarDamageNumbers,
        next: Option<Snapshot>,
    }

    fn make_runtime(widget: CarDamageNumbers) -> Runtime<Harness> {
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
    fn the_catalogue_size_follows_the_tyre_row() {
        for (tyres, height) in [(true, 132.0), (false, 103.0)] {
            let prefs = Preferences::default();
            let mut widget = CarDamageNumbers::new(
                &Settings {
                    show_tyres: tyres,
                    ..Settings::default()
                },
                prefs,
            );
            widget.update(&live(damage()), 0.0);
            assert_eq!(
                (widget.size().width, widget.size().height),
                (164.0, height),
                "show_tyres {tyres}"
            );
            assert_eq!(widget.size_for(Some(&live(damage()))).height, height);
        }
    }

    #[test]
    fn the_initial_box_already_shows_the_missing_notice() {
        // GPUI projects `Snapshot::default()` at construction: one notice line, so
        // 16 + 20 + 24 + rows·29.
        let widget = CarDamageNumbers::new(&Settings::default(), Preferences::default());
        assert_eq!((widget.size().width, widget.size().height), (164.0, 176.0));
        let widget = CarDamageNumbers::new(
            &Settings {
                show_tyres: false,
                ..Settings::default()
            },
            Preferences::default(),
        );
        assert_eq!((widget.size().width, widget.size().height), (164.0, 147.0));
    }

    #[test]
    fn size_for_follows_the_notice_of_the_snapshot() {
        let widget = CarDamageNumbers::new(&Settings::default(), Preferences::default());
        let mut stale = live(damage());
        stale.state.source_state = SourceState::Stale;
        assert_eq!(widget.size_for(Some(&stale)).height, 200.0);
        let mut lost = live(damage());
        lost.state.source_state = SourceState::Lost;
        assert_eq!(widget.size_for(Some(&lost)).height, 176.0);
        assert_eq!(
            widget.size_for(Some(&Snapshot::default())).height,
            176.0,
            "SIN DATOS en el snapshot por defecto"
        );
        let hidden = CarDamageNumbers::new(
            &Settings {
                show_tyres: false,
                ..Settings::default()
            },
            Preferences::default(),
        );
        assert_eq!(hidden.size_for(Some(&stale)).height, 171.0);
        assert_eq!(hidden.size_for(Some(&lost)).height, 147.0);
    }

    #[test]
    fn update_keeps_the_widget_scene_in_step_with_domain() {
        let prefs = Preferences::default();
        let mut widget = CarDamageNumbers::new(&Settings::default(), prefs);
        let snapshot = live(damage());
        widget.update(&snapshot, 0.0);
        let vm = car_damage_numbers::project(&snapshot, prefs, true);
        assert_eq!(widget.scene.height, 132.0);
        assert_eq!(
            widget
                .scene
                .rows
                .iter()
                .map(|row| (row.label, row.value.as_str()))
                .collect::<Vec<_>>(),
            vm.labels
                .iter()
                .copied()
                .zip(vm.values.iter().map(String::as_str))
                .collect::<Vec<_>>()
        );
        let mut stale = snapshot;
        stale.state.source_state = SourceState::Stale;
        widget.update(&stale, 0.1);
        assert_eq!(widget.scene.notice, ["DATOS", "ANTIGUOS"]);
        assert_eq!(widget.size().height, widget.scene.height);
    }

    #[test]
    fn a_visible_change_presents_one_image_and_repose_none() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut snapshot = live(damage());
        let mut runtime = make_runtime(CarDamageNumbers::new(
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
