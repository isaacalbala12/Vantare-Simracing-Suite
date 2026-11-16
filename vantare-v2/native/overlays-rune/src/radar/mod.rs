//! Static Radar: domain projects positions; the Look only paints that projection.
mod render;

use crate::widget::{Update, Widget};
use rune::El;
use vantare_domain::{
    CarId, Snapshot,
    format::Preferences,
    geometry::Size,
    radar,
    widget_settings::{Settings, radar::Settings as RadarSettings},
};

pub(crate) struct Radar {
    settings: RadarSettings,
    prefs: Preferences,
    scene: radar::ViewModel,
    classes: Vec<(CarId, String)>,
    painter: render::Painter,
}

impl Widget for Radar {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::Radar(settings) = settings else {
            return None;
        };
        let scene = radar::project(&Snapshot::default());
        Some(Box::new(Self {
            settings: settings.clone(),
            prefs,
            painter: render::Painter::new(settings.show_phrases, prefs, &scene),
            scene,
            classes: Vec::new(),
        }))
    }

    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        matches!(settings, Settings::Radar(s) if *s == self.settings) && prefs == self.prefs
    }

    fn size(&self) -> Size {
        Size {
            width: 220.0,
            height: 220.0,
        }
    }

    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        self.size()
    }

    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let scene = radar::project(snapshot);
        let classes: Vec<_> = scene
            .cars
            .iter()
            .filter_map(|r| {
                snapshot.state.cars.iter().find(|c| c.id == r.id).map(|c| {
                    (
                        c.id,
                        c.class
                            .as_ref()
                            .map_or_else(String::new, |c| c.name.clone()),
                    )
                })
            })
            .collect();
        if scene == self.scene && classes == self.classes {
            return Update::default();
        }
        let update = self.painter.sync(&scene, &classes);
        self.scene = scene;
        self.classes = classes;
        update
    }

    // GPUI Radar is static, including its overlap glow; there is no Tween to advance.
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }

    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }

    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}

    fn view(&self) -> El {
        self.painter.view()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{Capability, Car, Player, Pose, Quality, SourceState};

    fn snapshot() -> Snapshot {
        vantare_ipc::snapshot_from_json(include_str!("../../../ui/fixtures/radar.snapshot.json"))
            .expect("current GPUI fixture")
    }

    fn widget(show_phrases: bool) -> Box<dyn Widget> {
        Radar::new(
            &Settings::Radar(RadarSettings { show_phrases }),
            Preferences::default(),
            false,
            30,
            0.0,
        )
        .expect("Radar constructor")
    }

    fn runtime(show_phrases: bool) -> Runtime<Box<dyn Widget>> {
        Runtime::with_text(
            widget(show_phrases),
            |widget, _| widget.view(),
            (220.0, 220.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        )
    }

    fn update(rt: &mut Runtime<Box<dyn Widget>>, snapshot: &Snapshot) -> bool {
        rt.update_if(|widget, tx| {
            tx.instant(); // Host::poll uses this transaction too: no implicit presence animation.
            widget.update(snapshot, 0.0).build
        })
    }

    fn rendered_frame<S: 'static>(rt: &mut Runtime<S>, dt: f64) -> bool {
        // Compare the CPU drawing stream; frame() reports animation, not presentation.
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
        let before: Vec<_> = rt.instances.iter().map(payload).collect();
        rt.frame(dt);
        before != rt.instances.iter().map(payload).collect::<Vec<_>>()
    }

    #[test]
    fn world_axes_follow_player_yaw_and_only_domain_projects_positions() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for yaw in [
            0.0,
            std::f64::consts::FRAC_PI_2,
            std::f64::consts::PI,
            -std::f64::consts::FRAC_PI_2,
        ] {
            let (sin, cos) = yaw.sin_cos();
            let mut photo = Snapshot::default();
            photo.state.source_state = SourceState::Live;
            photo.state.capabilities.spatial = Capability::Fresh;
            photo.state.player = Some(Player {
                car: CarId(1),
                ..Default::default()
            });
            photo.state.cars.push(Car {
                id: CarId(1),
                pose: Quality::Reliable(Pose {
                    x_m: 100.0,
                    y_m: -30.0,
                    yaw_rad: yaw,
                }),
                ..Default::default()
            });
            for (id, ahead, right) in [(2, 4.0, -3.0), (3, -6.0, 2.0)] {
                photo.state.cars.push(Car {
                    id: CarId(id),
                    pose: Quality::Estimated(Pose {
                        x_m: 100.0 + ahead * cos + right * sin,
                        y_m: -30.0 + ahead * sin - right * cos,
                        yaw_rad: 0.7, // Rival yaw does not rotate its marker.
                    }),
                    ..Default::default()
                });
            }
            let scene = radar::project(&photo);
            let mut painter = render::Painter::new(false, Preferences::default(), &scene);
            assert!(!painter.sync(&scene, &[]).build);
            let mut rt = Runtime::with_text(
                painter,
                |p, _| p.view(),
                (220.0, 220.0),
                Env::new(true, 1.0),
                rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
            );
            rt.frame(0.0);
            for (key, x, y) in [("radar-car-2", 86.0, 78.0), ("radar-car-3", 126.0, 158.0)] {
                let element = rt
                    .elements()
                    .into_iter()
                    .find(|e| e.key.as_deref() == Some(key))
                    .expect("marker");
                assert!((element.rect[0] - (x - 8.0)).abs() < 0.001);
                assert!((element.rect[1] - (y - 19.2)).abs() < 0.001);
                assert_eq!(element.rect[2..], [16.0, 38.4]);
                assert_eq!(rt.presented_pose(key).expect("pose").rotation(), 0.0);
            }
        }
    }

    #[test]
    fn fixture_live_positions_repaint_without_rebuilding_or_retaining_lost_cars() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut photo = snapshot();
        let mut rt = runtime(false);
        update(&mut rt, &photo);
        assert!(rendered_frame(&mut rt, 0.0));
        assert!(rt.find("radar-car-100").is_some());
        assert!(rt.find("radar-car-101").is_none());
        assert!(rt.find("radar-car-102").is_none());
        let id = radar::project(&photo).cars[0].id;
        let car = photo.state.cars.iter_mut().find(|c| c.id == id).unwrap();
        let mut pose = *car.pose.current().unwrap();
        pose.x_m += 0.5;
        car.pose = Quality::Reliable(pose);
        assert!(!update(&mut rt, &photo), "position stays in Live");
        assert!(rendered_frame(&mut rt, 0.0));
        assert!(!update(&mut rt, &photo));
        assert!(!rendered_frame(&mut rt, 1.0));
        photo.sequence += 1;
        photo.state.cars[0].driver.name = "irrelevant driver name".into();
        assert!(!update(&mut rt, &photo));
        assert!(!rendered_frame(&mut rt, 1.0));
        photo.state.source_state = SourceState::Lost;
        assert!(update(&mut rt, &photo));
        assert!(rendered_frame(&mut rt, 0.0));
        assert!(rt.find("radar-player").is_none());
        assert!(rt.find("radar-car-100").is_none());
        assert!(rt.find("radar-placeholder").is_some());
        assert!(
            rt.find("radar-phrase-bar").is_some(),
            "unavailable ignores show_phrases=false"
        );
    }

    #[test]
    fn overlap_is_static_for_both_motion_policies_and_hz_changes() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut rt = runtime(true);
        update(&mut rt, &snapshot());
        rendered_frame(&mut rt, 0.0);
        for reduced in [false, true] {
            rt.set_system_reduced_motion(reduced);
            for hz in [0, 5, 30, 60] {
                rt.update_if(|widget, tx| {
                    tx.instant();
                    let policy = widget.policy(reduced, hz, 0.0);
                    assert!(!policy.build && !policy.pixels);
                    widget.schedule(0.0, tx);
                    false
                });
                for clock in 1..=30 {
                    rt.update_if(|widget, tx| {
                        tx.instant();
                        let update = widget.animate(f64::from(clock));
                        assert!(!update.build && !update.pixels);
                        widget.schedule(f64::from(clock), tx);
                        update.build
                    });
                    assert!(!rendered_frame(&mut rt, 1.0));
                    assert!(rt.wake_deadline().is_none());
                    assert!(rt.elements().iter().all(|e| !e.moving));
                }
            }
        }
        update(&mut rt, &Snapshot::default());
        assert!(rendered_frame(&mut rt, 0.0));
        assert!(!rendered_frame(&mut rt, 30.0));
        assert!(rt.wake_deadline().is_none());
    }

    #[test]
    fn registered_widget_accepts_photos_counts_data_and_stays_idle() {
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
            br#"{"version":2,"instances":[{"id":"r","x":0,"y":0,"settings":{"kind":"radar"}}]}"#,
        )
        .expect("existing settings");
        assert!(crate::renderer::supports(&layout.instances[0]));
        let mut scene = Scene::new(layout, Access::LocalPreview, true, MotionPolicy(false));
        let start = Instant::now();
        let mut photo = snapshot();
        assert!(scene.ingest(vantare_ipc::Photo::full(Arc::new(photo.clone())), start));
        let viewport = Viewport {
            origin: (0.0, 0.0),
            size: Size {
                width: 300.0,
                height: 300.0,
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
            |p, _| p.view(),
            (300.0, 300.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        assert!(rendered_frame(&mut rt, 0.0));
        meter.presented(); // Simulate on_frame_drawn only after a changed CPU drawing stream.
        assert!(rt.find("widget-r").is_some());
        let id = radar::project(&photo).cars[0].id;
        let car = photo.state.cars.iter_mut().find(|c| c.id == id).unwrap();
        let mut pose = *car.pose.current().unwrap();
        pose.x_m += 0.5;
        car.pose = Quality::Reliable(pose);
        photo.sequence += 1;
        assert!(scene.ingest(
            vantare_ipc::Photo::full(Arc::new(photo)),
            start + Duration::from_secs(1)
        ));
        let before = meter.snapshot();
        assert!(!rt.update_if(|p, tx| {
            tx.instant();
            p.sync(
                Some(&scene.frames),
                &Access::LocalPreview,
                viewport,
                1.0,
                &meter,
            )
        }));
        assert!(rendered_frame(&mut rt, 0.0));
        meter.presented();
        assert_eq!(meter.snapshot().data, before.data + 1);
        assert_eq!(meter.snapshot().frames, before.frames + 1);
        for clock in 2..32 {
            rt.update_if(|p, tx| {
                tx.instant();
                p.animate(f64::from(clock), tx, &meter)
            });
            assert!(!rendered_frame(&mut rt, 1.0));
            assert!(rt.wake_deadline().is_none());
        }
        assert_eq!(meter.snapshot().animation, 0);
        assert_eq!(meter.snapshot().unattributed, 0);
    }

    #[test]
    fn fixed_size_and_settings_remain_the_existing_contract() {
        let mut radar = widget(false);
        for photo in [snapshot(), Snapshot::default()] {
            radar.update(&photo, 0.0);
            assert_eq!(
                radar.size(),
                Size {
                    width: 220.0,
                    height: 220.0
                }
            );
            assert_eq!(radar.size_for(Some(&photo)), radar.size());
        }
        assert!(radar.configured(
            &Settings::Radar(RadarSettings {
                show_phrases: false
            }),
            Preferences::default()
        ));
        assert!(!radar.configured(
            &Settings::Radar(RadarSettings::default()),
            Preferences::default()
        ));
        assert!(
            Radar::new(
                &Settings::CarDamageNumbers(Default::default()),
                Preferences::default(),
                false,
                30,
                0.0
            )
            .is_none()
        );
    }
}
