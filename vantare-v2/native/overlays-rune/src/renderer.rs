//! One retained painter per visible instance; monitor windows coalesce their work.
use crate::{
    host::Access,
    input_telemetry::InputTelemetry,
    pedals::Pedals,
    pedals_telemetry::PedalsTelemetry,
    relative::Relative,
    scene::{FrameSet, Placement, Viewport},
    stats::{Cause, Meter},
    tower::Tower,
    widget::Widget,
};
use rune::{El, Tx, el};
use std::{collections::BTreeMap, sync::Arc};
use vantare_domain::{
    format::Preferences,
    widget_settings::{Settings, look::Look},
};
use vantare_ipc::layout::Instance;

type Constructor = fn(&Settings, Preferences, bool, u16, f64) -> Option<Box<dyn Widget>>;

fn constructor(settings: &Settings) -> Option<Constructor> {
    match settings {
        Settings::TrackMap(_) => Some(<crate::track_map::TrackMap as Widget>::new),
        Settings::FastestLap(_) => Some(<crate::fastest_lap::FastestLap as Widget>::new),
        Settings::Radar(_) => Some(<crate::radar::Radar as Widget>::new),
        Settings::HeadToHead(_) => Some(<crate::head_to_head::HeadToHead as Widget>::new),
        Settings::Relative(s) if s.design_system == Look::Vantare => {
            Some(<Relative as Widget>::new)
        }
        Settings::MulticlassRelative(_) => {
            Some(<crate::multiclass_relative::MulticlassRelative as Widget>::new)
        }
        Settings::Pedals(_) => Some(<Pedals as Widget>::new),
        Settings::FuelStrategy(s) if s.design_system == Look::Vantare => {
            Some(<crate::fuel::Fuel as Widget>::new)
        }
        Settings::PedalsTelemetry(_) => Some(<PedalsTelemetry as Widget>::new),
        Settings::BroadcastTower(_) => Some(<Tower as Widget>::new),
        Settings::InputTelemetry(_) => Some(<InputTelemetry as Widget>::new),
        _ => None,
    }
}

pub(crate) fn supports(instance: &Instance) -> bool {
    constructor(&instance.settings).is_some()
}
struct Entry {
    painter: Box<dyn Widget>,
    placement: Placement,
}
#[derive(Default)]
pub(crate) struct Painters {
    entries: BTreeMap<String, Entry>,
    order: Vec<String>,
    assets: Option<Arc<rune::ImageCache>>,
    assets_changed: bool,
}
impl Painters {
    pub fn attach_assets(&mut self, assets: &Arc<rune::ImageCache>) {
        if self
            .assets
            .as_ref()
            .is_some_and(|old| Arc::ptr_eq(old, assets))
        {
            return;
        }
        self.assets = Some(assets.clone());
        for entry in self.entries.values_mut() {
            entry.painter.attach_assets(assets);
        }
        // Setup can follow the first view: rebuild once to include its images.
        self.assets_changed |= !self.entries.is_empty();
    }
    pub fn sync(
        &mut self,
        frames: Option<&FrameSet>,
        access: &Access,
        viewport: Viewport,
        clock: f64,
        meter: &Meter,
    ) -> bool {
        let mut build = false;
        let mut order = Vec::new();
        if let Some(frames) = frames
            && frames.shown
        {
            for instance in frames.visible_instances(access) {
                let Some(new) = constructor(&instance.settings) else {
                    continue;
                };
                let settings = &instance.settings;
                let hz = frames
                    .layout
                    .performance
                    .hz(&instance.id, instance.settings.kind());
                // Determine overlap without keeping or animating off-monitor painters.
                let mut fresh = None;
                let size = if let Some(entry) = self.entries.get(&instance.id)
                    && entry
                        .painter
                        .configured(settings, frames.layout.preferences)
                {
                    entry
                        .painter
                        .size_for(frames.photos.get(&instance.id).map(|p| p.snapshot.as_ref()))
                } else {
                    let Some(mut painter) = new(
                        settings,
                        frames.layout.preferences,
                        frames.reduced_motion,
                        hz,
                        clock,
                    ) else {
                        continue;
                    };
                    if let Some(assets) = &self.assets {
                        painter.attach_assets(assets);
                    }
                    let size = painter
                        .size_for(frames.photos.get(&instance.id).map(|p| p.snapshot.as_ref()));
                    fresh = Some(painter);
                    size
                };
                let Some(placement) = viewport.place(instance, size) else {
                    continue;
                };
                if let Some(painter) = fresh {
                    self.entries
                        .insert(instance.id.clone(), Entry { painter, placement });
                    build = true;
                    meter.mark(Cause::Design);
                }
                let entry = self.entries.get_mut(&instance.id).expect("visible painter");
                if entry.placement != placement {
                    entry.placement = placement;
                    build = true;
                    meter.mark(Cause::Design);
                }
                let policy = entry.painter.policy(frames.reduced_motion, hz, clock);
                if policy.build || policy.pixels {
                    meter.mark(Cause::Design);
                }
                build |= policy.build;
                if let Some(photo) = frames.photos.get(&instance.id) {
                    let update = entry.painter.update(&photo.snapshot, clock);
                    if update.build || update.pixels {
                        meter.mark(Cause::Data);
                    }
                    build |= update.build;
                }
                order.push(instance.id.clone());
            }
        }
        self.entries.retain(|id, _| order.contains(id));
        if self.order != order {
            self.order = order;
            build = true;
            meter.mark(Cause::Design);
        }
        build
    }
    pub fn animate(&mut self, clock: f64, tx: &mut Tx, meter: &Meter) -> bool {
        let mut build = std::mem::take(&mut self.assets_changed);
        if build {
            meter.mark(Cause::Design);
        }
        for entry in self.entries.values_mut() {
            let update = entry.painter.animate(clock);
            if update.pixels || update.build {
                meter.mark(Cause::Animation);
            }
            build |= update.build;
            entry.painter.schedule(clock, tx);
        }
        build
    }
    pub fn view(&self) -> El {
        let mut root = el()
            .key("overlay-root")
            .w_full()
            .h_full()
            .clip_rounded(0.0)
            .motion(rune::Spring::NONE);
        for id in &self.order {
            let entry = &self.entries[id];
            let p = entry.placement;
            let natural = entry.painter.size();
            root = root.child(
                el().key(format!("widget-{id}"))
                    .size(p.size.width, p.size.height)
                    .pin(Some(p.x), Some(p.y), None, None)
                    .opacity(p.opacity)
                    .clip_rounded(0.0)
                    .child(
                        entry
                            .painter
                            .view()
                            .origin(0.0, 0.0)
                            .scale(p.size.width / natural.width),
                    ),
            );
        }
        root
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::sync::Mutex;
    use vantare_domain::{Snapshot, geometry::Size};

    pub(crate) type AttachedAssets = Arc<Mutex<Vec<Arc<rune::ImageCache>>>>;

    struct ImageWidget {
        attached: AttachedAssets,
        assets: Option<Arc<rune::ImageCache>>,
    }
    impl Widget for ImageWidget {
        fn new(_: &Settings, _: Preferences, _: bool, _: u16, _: f64) -> Option<Box<dyn Widget>> {
            None // The fixture installs these widgets before setup, outside the product registry.
        }
        fn attach_assets(&mut self, assets: &Arc<rune::ImageCache>) {
            self.assets = Some(assets.clone());
            self.attached.lock().unwrap().push(assets.clone());
        }
        fn configured(&self, _: &Settings, _: Preferences) -> bool {
            true
        }
        fn size(&self) -> Size {
            Size {
                width: 1.0,
                height: 1.0,
            }
        }
        fn size_for(&self, _: Option<&Snapshot>) -> Size {
            self.size()
        }
        fn policy(&mut self, _: bool, _: u16, _: f64) -> crate::widget::Update {
            Default::default()
        }
        fn update(&mut self, _: &Snapshot, _: f64) -> crate::widget::Update {
            Default::default()
        }
        fn animate(&mut self, _: f64) -> crate::widget::Update {
            Default::default()
        }
        fn schedule(&self, _: f64, _: &mut Tx) {}
        fn view(&self) -> El {
            el()
        }
    }

    pub(crate) fn image_widgets() -> (Painters, AttachedAssets) {
        let attached = AttachedAssets::default();
        let mut painters = Painters::default();
        for id in ["first", "second"] {
            let painter = ImageWidget {
                attached: attached.clone(),
                assets: None,
            };
            let placement = Placement {
                x: 0.0,
                y: 0.0,
                size: painter.size(),
                opacity: 1.0,
            };
            painters.entries.insert(
                id.into(),
                Entry {
                    painter: Box::new(painter),
                    placement,
                },
            );
            painters.order.push(id.into());
        }
        (painters, attached)
    }

    #[test]
    fn dispatch_constructs_vantare_relative_and_rejects_unmigrated_looks_and_kinds() {
        let mut relative = vantare_domain::widget_settings::relative::Settings {
            design_system: Look::Vantare,
            ..Default::default()
        };
        let settings = Settings::Relative(relative.clone());
        let prefs = Preferences::default();
        let painter =
            constructor(&settings).expect("Vantare constructor")(&settings, prefs, true, 15, 0.0)
                .expect("Relative instance");
        assert!(painter.configured(&settings, prefs));
        assert_eq!(
            painter.size(),
            Relative::new(&relative, prefs, true, 15, 0.0).size()
        );
        relative.design_system = Look::Eficiencia;
        let efficiency = Settings::Relative(relative);
        let pedals = Settings::Pedals(Default::default());
        assert!(constructor(&efficiency).is_none());
        assert!(constructor(&pedals).is_some());
        assert!(!painter.configured(&efficiency, prefs));
        assert!(!painter.configured(&pedals, prefs));
    }

    #[test]
    fn dispatch_constructs_both_pedals_looks_with_their_width() {
        let prefs = Preferences::default();
        for (look, width) in [(Look::Vantare, 96.0), (Look::Eficiencia, 108.0)] {
            let settings = Settings::Pedals(vantare_domain::widget_settings::pedals::Settings {
                design_system: look,
                ..Default::default()
            });
            let painter = constructor(&settings).expect("Pedals")(&settings, prefs, true, 40, 0.0)
                .expect("instancia");
            assert!(painter.configured(&settings, prefs));
            assert_eq!(painter.size().width, width, "{look:?}");
            assert_eq!(painter.size().height, 160.0);
        }
    }

    #[test]
    fn dispatch_constructs_pedals_telemetry_with_its_fixed_size() {
        let settings = Settings::PedalsTelemetry(Default::default());
        let prefs = Preferences::default();
        let painter =
            constructor(&settings).expect("Pedals telemetry")(&settings, prefs, true, 15, 0.0)
                .expect("instancia");
        assert!(painter.configured(&settings, prefs));
        assert_eq!((painter.size().width, painter.size().height), (380.0, 64.0));
    }
}
