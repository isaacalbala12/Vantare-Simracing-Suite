//! Estado de datos del proceso; sin ventanas, persistencia ni proyecciones gráficas.
use crate::host::Access;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
    time::Instant,
};
use vantare_domain::{
    geometry::Size, motion_policy::MotionPolicy, performance::Cadence, widget_session::Session,
};
use vantare_ipc::{
    Demand, Photo,
    layout::{Instance, Layout},
    widget_demand::SettingsDemand as _,
};

#[derive(Clone)]
pub struct FrameSet {
    pub layout: Arc<Layout>,
    pub photos: BTreeMap<String, Photo>,
    pub visible: BTreeSet<String>,
    pub shown: bool,
    pub reduced_motion: bool,
}
impl FrameSet {
    pub fn visible_instances<'a>(
        &'a self,
        access: &'a Access,
    ) -> impl Iterator<Item = &'a Instance> {
        self.layout.instances.iter().filter(move |i| {
            self.visible.contains(&i.id) && access.allows_widget(i.settings.kind().name())
        })
    }
}

/// Coordenadas lógicas de un monitor fijo. Topología en caliente pertenece a B.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Viewport {
    pub origin: (f32, f32),
    pub size: Size,
}
impl Viewport {
    pub fn of(display: &rune::Display) -> Self {
        let scale = display.scale as f32;
        Self {
            origin: (
                display.position.0 as f32 / scale,
                display.position.1 as f32 / scale,
            ),
            size: Size {
                width: display.size.0 as f32 / scale,
                height: display.size.1 as f32 / scale,
            },
        }
    }
    pub fn place(self, instance: &Instance, natural: Size) -> Option<Placement> {
        let size = instance.geometry.size.unwrap_or(natural);
        let x = instance.x - self.origin.0;
        let y = instance.y - self.origin.1;
        (size.valid()
            && x < self.size.width
            && y < self.size.height
            && x + size.width > 0.0
            && y + size.height > 0.0)
            .then_some(Placement {
                x,
                y,
                size,
                opacity: instance.opacity,
            })
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub x: f32,
    pub y: f32,
    pub size: Size,
    pub opacity: f32,
}

pub(crate) struct Scene {
    pub frames: FrameSet,
    cadences: BTreeMap<String, Cadence>,
    last: Option<Photo>,
    access: Access,
}
impl Scene {
    pub fn new(layout: Layout, access: Access, shown: bool, appearance: MotionPolicy) -> Self {
        let reduced_motion = MotionPolicy::select(layout.reduced_motion, appearance).0;
        Self {
            frames: FrameSet {
                layout: Arc::new(layout),
                photos: BTreeMap::new(),
                visible: BTreeSet::new(),
                shown,
                reduced_motion,
            },
            cadences: BTreeMap::new(),
            last: None,
            access,
        }
    }
    /// La primera familia conectada es Relative. No adquirir datos de widgets sin migrar.
    fn supported(instance: &Instance) -> bool {
        crate::renderer::supports(instance)
    }
    pub fn required(&self) -> Demand {
        let mut demand = Demand::default();
        if !self.frames.shown {
            return demand;
        }
        for i in self.frames.layout.instances.iter().filter(|i| {
            i.visible && Self::supported(i) && self.access.allows_widget(i.settings.kind().name())
        }) {
            demand.union(&i.settings.demand());
            if !i.show_in.is_all() {
                demand.request(vantare_ipc::Signal::SessionInfo, 250);
            }
        }
        demand
    }
    fn refresh_visibility(&mut self) -> bool {
        let snapshot = self.last.as_ref().map(|p| &*p.snapshot);
        let session = snapshot.and_then(|s| Session::of(&s.state.session.kind));
        let visible = self
            .frames
            .layout
            .instances
            .iter()
            .filter(|i| {
                self.frames.shown
                    && i.visible
                    && i.opacity > 0.0
                    && Self::supported(i)
                    && self.access.allows_widget(i.settings.kind().name())
                    && i.show_in.allows(session)
                    && !snapshot.is_some_and(|s| {
                        i.hidden_off_track(
                            self.frames.layout.hide_off_track,
                            s.state.driving_situation,
                        )
                    })
            })
            .map(|i| i.id.clone())
            .collect();
        if self.frames.visible == visible {
            return false;
        }
        self.frames.visible = visible;
        true
    }
    pub fn set_access(&mut self, access: Access, now: Instant) -> bool {
        if self.access == access {
            return false;
        }
        self.access = access;
        self.frames.photos.clear();
        self.refresh(now);
        true
    }
    pub fn set_layout(&mut self, layout: Layout, appearance: MotionPolicy, now: Instant) -> bool {
        let reduced = MotionPolicy::select(layout.reduced_motion, appearance).0;
        if *self.frames.layout == layout && self.frames.reduced_motion == reduced {
            return false;
        }
        let changed = *self.frames.layout != layout;
        if changed {
            self.frames.layout = Arc::new(layout);
            self.frames.photos.clear();
            self.cadences.clear();
        }
        self.frames.reduced_motion = reduced;
        self.refresh(now);
        true
    }
    pub fn set_shown(&mut self, shown: bool, now: Instant) -> bool {
        if self.frames.shown == shown {
            return false;
        }
        self.frames.shown = shown;
        self.frames.photos.clear();
        self.refresh(now);
        true
    }
    pub fn refresh(&mut self, now: Instant) {
        self.cadences.clear();
        self.refresh_visibility();
        if let Some(photo) = self.last.clone() {
            self.ingest(photo, now);
        }
    }
    pub fn ingest(&mut self, photo: Photo, now: Instant) -> bool {
        if !photo.demand.covers(&self.required()) {
            return false;
        }
        self.last = Some(photo.clone());
        let before = self.frames.visible.clone();
        let mut changed = self.refresh_visibility();
        for i in self
            .frames
            .layout
            .instances
            .iter()
            .filter(|i| self.frames.visible.contains(&i.id))
        {
            let hz = self.frames.layout.performance.hz(&i.id, i.settings.kind());
            let due = self.cadences.entry(i.id.clone()).or_default().due(
                hz,
                (photo.snapshot.epoch, photo.snapshot.state.source_state),
                now,
            );
            if due || !before.contains(&i.id) {
                let same = self.frames.photos.get(&i.id).is_some_and(|old| {
                    Arc::ptr_eq(&old.snapshot, &photo.snapshot) && old.demand == photo.demand
                });
                if !same {
                    self.frames.photos.insert(i.id.clone(), photo.clone());
                    changed = true;
                }
            }
        }
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use vantare_domain::widget_settings::Settings;
    fn layout() -> Layout {
        Layout::from_json(br#"{"version":1,"instances":[{"id":"relative","x":-200,"y":20,"settings":{"kind":"relative"}}],"performance":{"widgets":{"relative":5}}}"#).expect("layout")
    }
    fn photo(sequence: u64) -> Photo {
        let mut snapshot = vantare_ipc::source::fixed();
        snapshot.sequence = sequence;
        Photo::full(Arc::new(snapshot))
    }
    #[test]
    fn data_is_limited_by_shared_widget_cadence_before_publication() {
        let start = Instant::now();
        let mut scene = Scene::new(layout(), Access::LocalPreview, true, MotionPolicy(false));
        let accepted = (0..1000)
            .filter(|ms| scene.ingest(photo(*ms), start + Duration::from_millis(*ms)))
            .count();
        assert_eq!(accepted, 5);
        assert_eq!(scene.frames.photos["relative"].snapshot.sequence, 800);
        let mut incomplete = photo(1001);
        incomplete.demand = Demand::default();
        assert!(!scene.ingest(incomplete, start + Duration::from_secs(1)));
        assert_eq!(scene.frames.photos["relative"].snapshot.sequence, 800);
    }
    #[test]
    fn design_and_visibility_take_effect_without_waiting_for_another_photo() {
        let now = Instant::now();
        let mut scene = Scene::new(layout(), Access::LocalPreview, false, MotionPolicy(true));
        assert_eq!(scene.required(), Demand::default());
        assert!(!scene.ingest(photo(1), now));
        assert!(scene.set_shown(true, now));
        assert!(scene.frames.visible.contains("relative"));
        assert!(scene.frames.photos.contains_key("relative"));
        let mut changed = layout();
        changed.version = 2;
        changed.reduced_motion = Some(false);
        assert!(scene.set_layout(changed, MotionPolicy(true), now));
        assert!(!scene.frames.reduced_motion);
        assert!(scene.set_access(Access::at(&vantare_ipc::control::Policy::default(), 0), now));
        assert!(scene.frames.visible.is_empty());
        assert_eq!(scene.required(), Demand::default());
    }
    #[test]
    fn each_instance_keeps_its_own_cadence_and_restarts_on_source_identity() {
        let now = Instant::now();
        let mut design = layout();
        let mut second = design.instances[0].clone();
        second.id = "fast".into();
        design.instances.push(second);
        design.performance.widgets.insert("fast".into(), 20);
        let mut scene = Scene::new(design, Access::LocalPreview, true, MotionPolicy(false));
        for ms in 0..=199 {
            scene.ingest(photo(ms), now + Duration::from_millis(ms));
        }
        assert_eq!(scene.frames.photos["relative"].snapshot.sequence, 0);
        assert_eq!(scene.frames.photos["fast"].snapshot.sequence, 150);
        let mut restarted = photo(1);
        Arc::make_mut(&mut restarted.snapshot).epoch += 1;
        assert!(scene.ingest(restarted, now + Duration::from_millis(199)));
        assert_eq!(scene.frames.photos["relative"].snapshot.sequence, 1);
    }
    #[test]
    fn session_and_driving_visibility_are_independent_of_data_throttling() {
        let now = Instant::now();
        let mut design = layout();
        design.hide_off_track = true;
        design.instances[0].show_in = vantare_domain::widget_session::ShowIn {
            practice: true,
            qualifying: false,
            race: false,
        };
        let mut scene = Scene::new(design, Access::LocalPreview, true, MotionPolicy(false));
        let mut incoming = photo(1);
        Arc::make_mut(&mut incoming.snapshot).state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Race);
        scene.ingest(incoming.clone(), now);
        assert!(scene.frames.visible.is_empty());
        Arc::make_mut(&mut incoming.snapshot).state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Practice);
        Arc::make_mut(&mut incoming.snapshot)
            .state
            .driving_situation = vantare_domain::DrivingSituation::OnTrack;
        assert!(scene.ingest(incoming.clone(), now + Duration::from_millis(1)));
        assert!(scene.frames.visible.contains("relative"));
        Arc::make_mut(&mut incoming.snapshot)
            .state
            .driving_situation = vantare_domain::DrivingSituation::Garage;
        assert!(scene.ingest(incoming, now + Duration::from_millis(2)));
        assert!(scene.frames.visible.is_empty());
        assert!(
            scene.required().contains(vantare_ipc::Signal::SessionInfo),
            "keep the signal that can reveal it again"
        );
    }
    #[test]
    fn unsupported_widgets_are_not_acquired_and_unchanged_updates_do_not_publish() {
        let now = Instant::now();
        let mut design = layout();
        design.instances[0].settings =
            Settings::default_for(vantare_domain::widget_settings::Kind::DeltaTrace);
        let mut scene = Scene::new(
            design.clone(),
            Access::LocalPreview,
            true,
            MotionPolicy(false),
        );
        assert_eq!(scene.required(), Demand::default());
        assert!(!scene.ingest(photo(1), now));
        assert!(scene.frames.photos.is_empty());
        assert!(!scene.set_layout(design, MotionPolicy(false), now));
        assert!(!scene.set_shown(true, now));
        assert!(!scene.set_access(Access::LocalPreview, now));
    }
    #[test]
    fn geometry_maps_negative_origins_and_clips_spanning_widgets() {
        let viewport = Viewport {
            origin: (-2048.0, 0.0),
            size: Size {
                width: 2048.0,
                height: 1152.0,
            },
        };
        let mut instance = layout().instances.remove(0);
        let size = Size {
            width: 420.0,
            height: 265.0,
        };
        let placed = viewport.place(&instance, size).expect("partially visible");
        assert_eq!((placed.x, placed.y), (1848.0, 20.0));
        instance.x = 0.0;
        assert!(viewport.place(&instance, size).is_none());
    }
}
