//! Static Track Map, using the same closed demo and projection as GPUI.
mod render;
mod scene;

use crate::widget::{Update, Widget};
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    track_map,
    widget_settings::{Settings, track_map::Settings as MapSettings},
};

pub(crate) struct TrackMap {
    settings: MapSettings,
    prefs: Preferences,
    scene: track_map::ViewModel,
    labels: [String; 3],
    painter: render::Painter,
}

impl Widget for TrackMap {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::TrackMap(settings) = settings else {
            return None;
        };
        let photo = Snapshot::default();
        let scene = track_map::project_with_geometry(&photo, prefs, None);
        let labels = scene::labels(&photo, prefs);
        Some(Box::new(Self {
            settings: settings.normalized(),
            prefs,
            painter: render::Painter::new(settings.transparent, &scene, &labels, prefs),
            scene,
            labels,
        }))
    }
    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        matches!(settings, Settings::TrackMap(s) if s.normalized() == self.settings)
            && prefs == self.prefs
    }
    fn size(&self) -> Size {
        Size {
            width: 320.0,
            height: 248.0,
        }
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        self.size()
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let geometry = scene::geometry(snapshot);
        let scene = track_map::project_with_geometry(snapshot, self.prefs, geometry.as_ref());
        let labels = scene::labels(snapshot, self.prefs);
        if scene == self.scene && labels == self.labels {
            return Update::default();
        }
        let update = self.painter.sync(&scene, &labels);
        self.scene = scene;
        self.labels = labels;
        update
    }
    // GPUI has no map animation, including the player halo and the session clock.
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
    use vantare_domain::{SourceKind, format::Language};

    fn photos() -> Vec<Snapshot> {
        vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/track-map-design-system.sequence.json"
        ))
        .expect("canonical GPUI sequence")
    }

    fn widget(settings: MapSettings, prefs: Preferences) -> Box<dyn Widget> {
        TrackMap::new(&Settings::TrackMap(settings), prefs, false, 30, 0.0).unwrap()
    }

    fn rendered_frame<S: 'static>(rt: &mut Runtime<S>, dt: f64) -> bool {
        // CPU stream, not GPU presentation; frame() reports ongoing animation.
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
    fn canonical_photos_keep_the_fixed_box_without_a_clock_and_never_supply_live_geometry() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for language in [Language::Es, Language::En] {
            let prefs = Preferences {
                language,
                ..Default::default()
            };
            let mut rt = Runtime::with_text(
                widget(MapSettings::default(), prefs),
                |w, _| w.view(),
                (320.0, 248.0),
                Env::new(true, 1.0),
                rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
            );
            for photo in photos() {
                rt.update_if(|w, tx| {
                    tx.instant();
                    w.update(&photo, 0.0).build
                });
                assert!(rendered_frame(&mut rt, 0.0));
                assert!(rt.find("map-road-inner").is_some());
                assert_eq!(
                    rt.state.size_for(Some(&photo)),
                    Size {
                        width: 320.0,
                        height: 248.0
                    }
                );
                for reduced in [false, true] {
                    rt.set_system_reduced_motion(reduced);
                    for clock in 1..=30 {
                        rt.update_if(|w, tx| {
                            tx.instant();
                            assert!(!w.policy(reduced, 5, f64::from(clock)).pixels);
                            let u = w.animate(f64::from(clock));
                            assert!(!u.pixels && !u.build);
                            w.schedule(f64::from(clock), tx);
                            u.build
                        });
                        assert!(!rendered_frame(&mut rt, 1.0));
                        assert!(rt.wake_deadline().is_none());
                    }
                }
                let mut live = photo;
                live.origin.source.kind = SourceKind::Live;
                rt.update_if(|w, tx| {
                    tx.instant();
                    w.update(&live, 0.0).build
                });
                assert!(rendered_frame(&mut rt, 0.0));
                assert!(rt.find("map-road-inner").is_none());
                assert_eq!(rt.state.size().height, 248.0);
                let expected = if language == Language::Es {
                    "PISTA SIN MAPA"
                } else {
                    "TRACK NOT MAPPED"
                };
                assert!(
                    rt.elements()
                        .iter()
                        .any(|e| e.key.as_deref() == Some("map-empty")
                            && e.text.as_deref() == Some(expected))
                );
            }
        }
    }

    #[test]
    fn ignored_track_label_setting_does_not_change_the_drawing() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let photo = &photos()[0];
        let mut drawings = Vec::new();
        for show_track_label in [false, true] {
            let mut w = widget(
                MapSettings {
                    show_track_label,
                    transparent: false,
                },
                Preferences::default(),
            );
            w.update(photo, 0.0);
            let mut rt = Runtime::with_text(
                w,
                |w, _| w.view(),
                (320.0, 248.0),
                Env::new(true, 1.0),
                rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
            );
            rt.frame(0.0);
            drawings.push(
                rt.instances
                    .iter()
                    .map(|i| {
                        (
                            i.rect.map(f32::to_bits),
                            i.fill.map(f32::to_bits),
                            i.params.map(f32::to_bits),
                        )
                    })
                    .collect::<Vec<_>>(),
            );
        }
        assert_eq!(drawings[0], drawings[1]);
    }

    #[test]
    fn registered_widget_counts_photo_updates_and_duplicate_metadata_stays_quiet() {
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
        use vantare_domain::{Quality, motion_policy::MotionPolicy};
        let _fonts = rune::text::with_families("Inter", "Inter");
        let layout = vantare_ipc::layout::Layout::from_json(br#"{"version":2,"instances":[{"id":"m","x":0,"y":0,"settings":{"kind":"track-map"}}]}"#).unwrap();
        assert!(crate::renderer::supports(&layout.instances[0]));
        let mut scene = Scene::new(layout, Access::LocalPreview, true, MotionPolicy(false));
        let mut photo = photos()[1].clone();
        let start = Instant::now();
        assert!(scene.ingest(vantare_ipc::Photo::full(Arc::new(photo.clone())), start));
        let viewport = Viewport {
            origin: (0.0, 0.0),
            size: Size {
                width: 400.0,
                height: 300.0,
            },
        };
        let meter = Meter::new(Arc::default());
        let mut p = Painters::default();
        assert!(p.sync(
            Some(&scene.frames),
            &Access::LocalPreview,
            viewport,
            0.0,
            &meter
        ));
        let mut rt = Runtime::with_text(
            p,
            |p, _| p.view(),
            (400.0, 300.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        assert!(rendered_frame(&mut rt, 0.0));
        meter.presented(); // Simulated on_frame_drawn only after a changed CPU stream.
        assert!(rt.find("widget-m").is_some());
        photo.sequence += 1;
        photo.state.session.remaining_s = Quality::Reliable(521.0);
        assert!(scene.ingest(
            vantare_ipc::Photo::full(Arc::new(photo.clone())),
            start + Duration::from_secs(1)
        ));
        let before = meter.snapshot();
        assert!(rt.update_if(|p, tx| {
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
        photo.sequence += 1;
        assert!(scene.ingest(
            vantare_ipc::Photo::full(Arc::new(photo)),
            start + Duration::from_secs(2)
        ));
        assert!(!rt.update_if(|p, tx| {
            tx.instant();
            p.sync(
                Some(&scene.frames),
                &Access::LocalPreview,
                viewport,
                2.0,
                &meter,
            )
        }));
        assert!(!rendered_frame(&mut rt, 0.0));
        for clock in 3..33 {
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
}
