//! Static GPUI multiclass Relative, using the domain ViewModel as its scene.
mod render;

use crate::widget::{Update, Widget};
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    multiclass_relative::{self, ClassMode, Content, ViewModel},
    widget_settings::multiclass_relative::Settings,
};

/// The domain ViewModel is already the complete, pure scene. No motion or history.
pub(crate) struct MulticlassRelative {
    settings: Settings,
    prefs: Preferences,
    scene: ViewModel,
    painter: render::Painter,
}

fn content(settings: &Settings) -> Content {
    Content {
        row_count: settings.row_count,
        class_mode: match settings.class_mode.as_str() {
            "same" => ClassMode::Same,
            "other" => ClassMode::Other,
            _ => ClassMode::All,
        },
        show_class_divider: settings.show_class_divider,
    }
}

impl MulticlassRelative {
    pub fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let scene = multiclass_relative::project(&Snapshot::default(), prefs, content(&settings));
        let painter = render::Painter::new(settings.row_count, prefs, &scene);
        Self {
            settings,
            prefs,
            scene,
            painter,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }

    pub fn size(&self) -> Size {
        Size {
            width: 440.0,
            height: 77.0 + 24.0 * self.settings.row_count as f32,
        }
    }

    pub fn update(&mut self, snapshot: &Snapshot) -> Update {
        let scene = multiclass_relative::project(snapshot, self.prefs, content(&self.settings));
        if scene == self.scene {
            return Update::default();
        }
        let update = self.painter.sync(&scene);
        self.scene = scene;
        update
    }

    pub fn view(&self) -> El {
        self.painter.view(&self.scene, self.size())
    }
}

impl Widget for MulticlassRelative {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let vantare_domain::widget_settings::Settings::MulticlassRelative(settings) = settings
        else {
            return None;
        };
        Some(Box::new(Self::new(settings, prefs)))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::MulticlassRelative(settings) = settings
        else {
            return false;
        };
        Self::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Self::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Self::size(self)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        Self::update(self, snapshot)
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        Self::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{CarId, Quality, SourceState, format::Language};

    fn snapshot() -> Snapshot {
        vantare_ipc::snapshot_from_json(include_str!(
            "../../../ui/fixtures/multiclass-relative.snapshot.json"
        ))
        .expect("existing GPUI fixture")
    }

    /// La ventana mide lo que pide el widget, no una caja fija.
    #[test]
    fn no_layer_falls_outside_the_window() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for row_count in [7, 9] {
            for photo in [Snapshot::default(), snapshot()] {
                let settings = Settings {
                    row_count,
                    ..Settings::default()
                };
                let mut widget = MulticlassRelative::new(&settings, Preferences::default());
                widget.update(&photo);
                let size = widget.size();
                let mut rt = Runtime::with_text(
                    widget,
                    |widget: &MulticlassRelative, _| widget.view(),
                    (size.width, size.height),
                    Env::new(true, 1.0),
                    rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
                );
                rt.frame(0.0);
                crate::testdata::assert_inside_window(&mut rt, (size.width, size.height));
            }
        }
    }

    #[test]
    fn settings_and_physical_slots_match_the_existing_projection() {
        for count in [3, 7, 9] {
            for mode in ["all", "same", "other"] {
                for divider in [false, true] {
                    let settings = Settings {
                        row_count: count,
                        class_mode: mode.into(),
                        show_class_divider: divider,
                    };
                    let mut widget = MulticlassRelative::new(&settings, Preferences::default());
                    widget.update(&snapshot());
                    let count = if count >= 9 { 9 } else { 7 };
                    assert_eq!(
                        widget.size(),
                        Size {
                            width: 440.0,
                            height: 77.0 + 24.0 * count as f32
                        }
                    );
                    assert_eq!(
                        widget.scene,
                        multiclass_relative::project(
                            &snapshot(),
                            Preferences::default(),
                            content(&settings.normalized())
                        )
                    );
                    assert_eq!(
                        widget
                            .scene
                            .rows
                            .iter()
                            .find(|r| r.is_player)
                            .expect("anchor")
                            .slot,
                        count / 2
                    );
                    assert!(widget.configured(&settings, Preferences::default()));
                }
            }
        }
    }

    #[test]
    fn metadata_and_hidden_cars_do_not_change_the_scene() {
        let mut photo = snapshot();
        let mut widget = MulticlassRelative::new(&Settings::default(), Preferences::default());
        assert!(widget.update(&photo).build);
        let unchanged = widget.update(&photo);
        assert!(!unchanged.build && !unchanged.pixels);
        let before = widget.scene.clone();
        photo.sequence += 1;
        photo.epoch += 1;
        photo.state.session.remaining_s = Quality::Reliable(42.0);
        photo
            .state
            .cars
            .iter_mut()
            .find(|c| !before.rows.iter().any(|r| r.id == c.id))
            .expect("hidden car")
            .driver
            .name = "Other name".into();
        let unchanged = widget.update(&photo);
        assert!(!unchanged.build && !unchanged.pixels);
        assert_eq!(widget.scene, before);
    }

    #[test]
    fn gpui_fixture_keeps_the_signed_one_decimal_gaps_and_class_positions() {
        let mut widget = MulticlassRelative::new(&Settings::default(), Preferences::default());
        widget.update(&snapshot());
        let rows: Vec<_> = widget
            .scene
            .rows
            .iter()
            .map(|r| {
                (
                    r.id.0,
                    r.slot,
                    r.place.as_str(),
                    r.class_label.as_str(),
                    r.gap.as_str(),
                )
            })
            .collect();
        assert_eq!(
            rows,
            [
                (4, 0, "P2", "HY", "-13.5"),
                (3, 1, "P1", "GTE", "-9.0"),
                (2, 2, "P1", "LMP2", "-4.5"),
                (1, 3, "P1", "HY", "0.0"),
                (20, 4, "P7", "LMP2", "+4.5"),
                (19, 5, "P7", "HY", "+9.0"),
                (18, 6, "P6", "GTE", "+13.5"),
            ]
        );
    }

    fn runtime(settings: &Settings, prefs: Preferences) -> Runtime<MulticlassRelative> {
        Runtime::with_text(
            MulticlassRelative::new(settings, prefs),
            |widget, _| widget.view(),
            (440.0, 293.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        )
    }

    fn rendered_frame<S: 'static>(runtime: &mut Runtime<S>, dt: f64) -> bool {
        // CPU drawing stream only: frame() reports ongoing animation, not changed pixels.
        fn payload(i: &rune::render::Instance) -> [[u32; 4]; 8] {
            [
                i.rect.map(f32::to_bits),
                i.radii.map(f32::to_bits),
                i.fill.map(f32::to_bits),
                i.border.map(f32::to_bits),
                i.params.map(f32::to_bits),
                i.uv.map(f32::to_bits),
                i.clip.map(f32::to_bits),
                i.fade,
            ]
        }
        let before: Vec<_> = runtime.instances.iter().map(payload).collect();
        runtime.frame(dt);
        before != runtime.instances.iter().map(payload).collect::<Vec<_>>()
    }

    fn update(runtime: &mut Runtime<MulticlassRelative>, photo: &Snapshot) {
        runtime.update_if(|widget, tx| {
            tx.instant(); // Same transaction as host::poll: no implicit Rune presence animation.
            widget.update(photo).build
        });
    }

    #[test]
    fn rendered_frame_changes_for_visible_data_without_starting_a_clock() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut rt = runtime(&Settings::default(), Preferences::default());
        assert!(rendered_frame(&mut rt, 0.0));
        let mut photo = snapshot();
        update(&mut rt, &photo);
        assert!(rendered_frame(&mut rt, 0.0));
        update(&mut rt, &photo);
        assert!(!rendered_frame(&mut rt, 1.0));
        let id = rt
            .state
            .scene
            .rows
            .iter()
            .find(|r| !r.is_player)
            .expect("rival")
            .id;
        photo
            .state
            .cars
            .iter_mut()
            .find(|c| c.id == id)
            .expect("car")
            .relative_s = Quality::Reliable(1.9);
        update(&mut rt, &photo);
        assert!(rendered_frame(&mut rt, 0.0));
        for reduced in [false, true] {
            rt.set_system_reduced_motion(reduced);
            rendered_frame(&mut rt, 0.0);
            for _ in 0..30 {
                assert!(!rendered_frame(&mut rt, 1.0));
                assert!(rt.wake_deadline().is_none());
            }
        }
    }

    #[test]
    fn faster_traffic_is_static_and_its_removal_leaves_no_clock() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut photo = snapshot();
        let player = photo.state.player.expect("player").car;
        let own_class = photo
            .state
            .cars
            .iter()
            .find(|c| c.id == player)
            .expect("player car")
            .class
            .as_ref()
            .expect("class")
            .id;
        for car in &mut photo.state.cars {
            car.best_lap_s =
                Quality::Reliable(if car.class.as_ref().is_some_and(|c| c.id == own_class) {
                    100.0
                } else {
                    90.0
                });
        }
        let mut rt = runtime(&Settings::default(), Preferences::default());
        update(&mut rt, &photo);
        rendered_frame(&mut rt, 0.0);
        assert!(rt.state.scene.rows.iter().any(|r| r.fast_traffic));
        for reduced in [false, true] {
            rt.set_system_reduced_motion(reduced);
            rendered_frame(&mut rt, 0.0);
            for _ in 0..30 {
                assert!(!rendered_frame(&mut rt, 1.0));
                assert!(rt.wake_deadline().is_none());
            }
        }
        for car in &mut photo.state.cars {
            car.best_lap_s = Quality::Reliable(100.0);
        }
        update(&mut rt, &photo);
        assert!(rendered_frame(&mut rt, 0.0));
        assert!(rt.state.scene.rows.iter().all(|r| !r.fast_traffic));
        assert!(!rendered_frame(&mut rt, 30.0));
        assert!(rt.wake_deadline().is_none());
    }

    #[test]
    fn source_states_keep_the_fixed_box_and_the_domain_status() {
        for language in [Language::Es, Language::En] {
            let prefs = Preferences {
                language,
                ..Default::default()
            };
            let mut widget = MulticlassRelative::new(&Settings::default(), prefs);
            for state in [
                SourceState::Live,
                SourceState::Stale,
                SourceState::Waiting,
                SourceState::Lost,
            ] {
                let mut photo = snapshot();
                photo.state.source_state = state;
                widget.update(&photo);
                assert_eq!(
                    widget.scene,
                    multiclass_relative::project(&photo, prefs, Content::default())
                );
                assert_eq!(
                    widget.size(),
                    Size {
                        width: 440.0,
                        height: 245.0
                    }
                );
            }
        }
    }

    #[test]
    fn missing_neighbors_keep_skeleton_slots_and_player_centered() {
        let mut photo = snapshot();
        let player = photo.state.player.expect("player").car;
        photo.state.cars.retain(|c| c.id == player);
        let mut widget = MulticlassRelative::new(&Settings::default(), Preferences::default());
        widget.update(&photo);
        assert_eq!(widget.scene.rows.len(), 1);
        assert_eq!(widget.scene.rows[0].id, CarId(player.0));
        assert_eq!(widget.scene.rows[0].slot, 3);
    }

    #[test]
    fn registered_widget_accepts_photos_and_counts_live_gap_changes_without_a_clock() {
        use crate::{
            host::Access,
            renderer::Painters,
            scene::{Scene, Viewport},
            stats::Meter,
        };
        use std::{
            sync::Arc,
            time::{Duration, Instant},
        };
        use vantare_domain::motion_policy::MotionPolicy;
        let _fonts = rune::text::with_families("Inter", "Inter");
        let layout = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"m","x":0,"y":0,"settings":{"kind":"multiclass-relative"}}]}"#
        ).expect("existing layout kind");
        assert!(crate::renderer::supports(&layout.instances[0]));
        let start = Instant::now();
        let mut scene = Scene::new(layout, Access::LocalPreview, true, MotionPolicy(false));
        let mut photo = snapshot();
        assert!(scene.ingest(vantare_ipc::Photo::full(Arc::new(photo.clone())), start));
        let viewport = Viewport {
            origin: (0.0, 0.0),
            size: Size {
                width: 500.0,
                height: 400.0,
            },
        };
        let meter = Meter::new(Arc::default());
        let mut painters = Painters::default();
        assert!(painters.sync(
            Some(&scene.frames),
            &Access::LocalPreview,
            viewport,
            0.0,
            &meter
        ));
        let mut rt = Runtime::with_text(
            painters,
            |painters, _| painters.view(),
            (500.0, 400.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        assert!(rendered_frame(&mut rt, 0.0));
        meter.presented(); // Simulated callback after an actual change in the CPU paint stream.
        assert!(rt.find("widget-m").is_some());
        assert!(rt.find("multiclass-relative").is_some());
        photo.sequence += 1;
        photo
            .state
            .cars
            .iter_mut()
            .find(|car| car.id == CarId(4))
            .expect("visible car")
            .relative_s = Quality::Reliable(14.5);
        assert!(scene.ingest(
            vantare_ipc::Photo::full(Arc::new(photo)),
            start + Duration::from_secs(1)
        ));
        let before = meter.snapshot();
        assert!(
            !rt.update_if(|painters, tx| {
                tx.instant();
                painters.sync(
                    Some(&scene.frames),
                    &Access::LocalPreview,
                    viewport,
                    1.0,
                    &meter,
                )
            }),
            "a fixed gap changes pixels without rebuilding"
        );
        assert!(rendered_frame(&mut rt, 0.0));
        meter.presented();
        assert_eq!(meter.snapshot().data, before.data + 1);
        assert_eq!(meter.snapshot().frames, before.frames + 1);
        for clock in 2..32 {
            rt.update_if(|painters, tx| {
                tx.instant();
                painters.animate(f64::from(clock), tx, &meter)
            });
            assert!(!rendered_frame(&mut rt, 1.0));
            assert!(rt.wake_deadline().is_none());
        }
        assert_eq!(meter.snapshot().animation, 0);
        assert_eq!(meter.snapshot().unattributed, 0);
    }
}
