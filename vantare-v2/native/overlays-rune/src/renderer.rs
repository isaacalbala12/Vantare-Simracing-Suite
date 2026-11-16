//! One retained painter per visible instance; monitor windows coalesce their work.
use crate::{
    host::Access,
    relative::Relative,
    scene::{FrameSet, Placement, Viewport},
    stats::{Cause, Meter},
    widget::Widget,
};
use rune::{El, Tx, el};
use std::collections::BTreeMap;
use vantare_domain::{
    format::Preferences,
    widget_settings::{Settings, look::Look},
};
use vantare_ipc::layout::Instance;

type Constructor = fn(&Settings, Preferences, bool, u16, f64) -> Option<Box<dyn Widget>>;

fn constructor(settings: &Settings) -> Option<Constructor> {
    match settings {
        Settings::Radar(_) => Some(<crate::radar::Radar as Widget>::new),
        Settings::Relative(s) if s.design_system == Look::Vantare => {
            Some(<Relative as Widget>::new)
        }
        Settings::MulticlassRelative(_) => {
            Some(<crate::multiclass_relative::MulticlassRelative as Widget>::new)
        }
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
}
impl Painters {
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
                    let Some(painter) = new(
                        settings,
                        frames.layout.preferences,
                        frames.reduced_motion,
                        hz,
                        clock,
                    ) else {
                        continue;
                    };
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
        let mut build = false;
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
mod tests {
    use super::*;

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
        assert!(constructor(&pedals).is_none());
        assert!(!painter.configured(&efficiency, prefs));
        assert!(!painter.configured(&pedals, prefs));
    }
}
