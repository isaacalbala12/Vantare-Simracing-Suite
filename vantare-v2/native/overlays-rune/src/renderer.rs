//! One retained painter per visible instance; monitor windows coalesce their work.
use crate::{
    car_damage_numbers::CarDamageNumbers,
    car_damage_visual::CarDamageVisual,
    host::Access,
    input_telemetry::InputTelemetry,
    pedals::Pedals,
    pedals_telemetry::PedalsTelemetry,
    relative::Relative,
    scene::{FrameSet, Placement, Viewport},
    stats::{Cause, Meter},
    tower::Tower,
    track_weather::TrackWeather,
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

pub(crate) fn constructor(settings: &Settings) -> Option<Constructor> {
    match settings {
        Settings::Standings(s) if s.design_system == Look::Vantare => {
            Some(<crate::standings::Standings as Widget>::new)
        }
        Settings::DeltaTrace(_) => Some(<crate::delta_trace::DeltaTrace as Widget>::new),
        Settings::TrackMap(_) => Some(<crate::track_map::TrackMap as Widget>::new),
        Settings::FastestLap(_) => Some(<crate::fastest_lap::FastestLap as Widget>::new),
        Settings::Radar(_) => Some(<crate::radar::Radar as Widget>::new),
        Settings::HeadToHead(_) => Some(<crate::head_to_head::HeadToHead as Widget>::new),
        Settings::SessionAlerts(_) => Some(<crate::session_alerts::SessionAlerts as Widget>::new),
        Settings::Relative(s) if matches!(s.design_system, Look::Vantare | Look::Eficiencia) => {
            Some(<Relative as Widget>::new)
        }
        Settings::MulticlassRelative(_) => {
            Some(<crate::multiclass_relative::MulticlassRelative as Widget>::new)
        }
        Settings::Delta(s) if s.design_system == Look::Vantare => {
            Some(<crate::delta::Delta as Widget>::new)
        }
        Settings::Delta(s) if s.design_system == Look::Eficiencia => {
            Some(<crate::delta::eficiencia::DeltaEficiencia as Widget>::new)
        }
        Settings::Pedals(_) => Some(<Pedals as Widget>::new),
        Settings::FuelStrategy(s)
            if matches!(s.design_system, Look::Vantare | Look::Eficiencia) =>
        {
            Some(<crate::fuel::Fuel as Widget>::new)
        }
        Settings::PedalsTelemetry(_) => Some(<PedalsTelemetry as Widget>::new),
        Settings::TrackWeather(_) => Some(<TrackWeather as Widget>::new),
        Settings::CarDamageNumbers(_) => Some(<CarDamageNumbers as Widget>::new),
        Settings::CarDamageVisual(_) => Some(<CarDamageVisual as Widget>::new),
        Settings::BroadcastTower(_) => Some(<Tower as Widget>::new),
        Settings::InputTelemetry(_) => Some(<InputTelemetry as Widget>::new),
        Settings::RacingFlags(_) => Some(<crate::racing_flags::RacingFlags as Widget>::new),
        _ => None,
    }
}

pub(crate) fn supports(instance: &Instance) -> bool {
    constructor(&instance.settings).is_some()
}
struct Entry {
    painter: Box<dyn Widget>,
    placement: Placement,
    shortcut: Option<u8>,
    key_down: bool,
    /// Last agenda this instance saw: a fresh painter must still receive it.
    calendar: Option<Arc<Vec<vantare_domain::session_alerts::CalendarInput>>>,
}
#[derive(Default)]
pub(crate) struct Painters {
    entries: BTreeMap<String, Entry>,
    order: Vec<String>,
    assets: Option<Arc<rune::ImageCache>>,
    assets_changed: bool,
    /// One speaker per process: the widget only decides which tone, the host plays it.
    sound: crate::session_alerts::sound::Speaker,
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
                    self.entries.insert(
                        instance.id.clone(),
                        Entry {
                            painter,
                            placement,
                            shortcut: match settings {
                                Settings::CarDamageVisual(s) => s
                                    .normalized()
                                    .toggle_key
                                    .strip_prefix('f')
                                    .and_then(|n| n.parse().ok()),
                                _ => None,
                            },
                            key_down: false,
                            calendar: None,
                        },
                    );
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
                if !entry
                    .calendar
                    .as_ref()
                    .is_some_and(|old| Arc::ptr_eq(old, &frames.calendar))
                {
                    entry.painter.calendar(&frames.calendar);
                    entry.calendar = Some(frames.calendar.clone());
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
    pub fn shortcut_keys(&self) -> u16 {
        self.entries
            .values()
            .filter_map(|e| e.shortcut)
            .fold(0, |mask, key| mask | (1 << (key - 1)))
    }
    pub fn shortcuts(&mut self, down: u16, meter: &Meter) -> bool {
        let mut build = false;
        for entry in self.entries.values_mut() {
            let pressed = entry
                .shortcut
                .is_some_and(|key| down & (1 << (key - 1)) != 0);
            if pressed && !entry.key_down {
                let update = entry.painter.shortcut();
                if update.build || update.pixels {
                    meter.mark(Cause::Data);
                }
                build |= update.build;
            }
            entry.key_down = pressed;
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
            for (tone, volume) in entry.painter.sound() {
                self.sound.play(tone, volume);
            }
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
                    shortcut: None,
                    key_down: false,
                    calendar: None,
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
        let efficiency = Settings::Relative(relative.clone());
        let pedals = Settings::Pedals(Default::default());
        let efi = constructor(&efficiency).expect("Eficiencia constructor")(
            &efficiency,
            prefs,
            true,
            15,
            0.0,
        )
        .expect("Relative Eficiencia instance");
        assert!(efi.configured(&efficiency, prefs));
        assert_eq!(efi.size().width, 470.0);
        assert_eq!(efi.size().height, 277.0);
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

    #[test]
    fn dispatch_constructs_track_weather_in_both_layouts() {
        let prefs = Preferences::default();
        for (vertical, size) in [(false, (280.0, 210.0)), (true, (132.0, 440.0))] {
            let settings =
                Settings::TrackWeather(vantare_domain::widget_settings::track_weather::Settings {
                    vertical,
                    ..Default::default()
                });
            let painter =
                constructor(&settings).expect("Track weather")(&settings, prefs, true, 15, 0.0)
                    .expect("instancia");
            assert!(painter.configured(&settings, prefs));
            assert_eq!(
                (painter.size().width, painter.size().height),
                size,
                "vertical {vertical}"
            );
        }
    }

    #[test]
    fn dispatch_constructs_car_damage_numbers_with_its_catalogue_size() {
        let prefs = Preferences::default();
        let mut photo = crate::testdata::snapshot();
        photo.state.capabilities.damage = vantare_domain::Capability::Fresh;
        photo.state.player.as_mut().expect("player").damage = vantare_domain::Damage {
            aero: vantare_domain::Quality::Reliable(0.0),
            ..Default::default()
        };
        for (show_tyres, height) in [(true, 132.0), (false, 103.0)] {
            let settings = Settings::CarDamageNumbers(
                vantare_domain::widget_settings::car_damage_numbers::Settings {
                    show_tyres,
                    ..Default::default()
                },
            );
            let painter = constructor(&settings).expect("Car damage numbers")(
                &settings, prefs, true, 15, 0.0,
            )
            .expect("instancia");
            assert!(painter.configured(&settings, prefs));
            let size = painter.size_for(Some(&photo));
            assert_eq!(
                (size.width, size.height),
                (164.0, height),
                "show_tyres {show_tyres}"
            );
        }
    }

    #[test]
    fn dispatch_constructs_car_damage_visual_with_its_single_box() {
        let prefs = Preferences::default();
        for view in ["car", "numbers"] {
            let settings = Settings::CarDamageVisual(
                vantare_domain::widget_settings::car_damage_visual::Settings {
                    view: view.into(),
                    ..Default::default()
                },
            );
            let painter =
                constructor(&settings).expect("Car damage visual")(&settings, prefs, true, 15, 0.0)
                    .expect("instancia");
            assert!(painter.configured(&settings, prefs));
            assert_eq!(
                (painter.size().width, painter.size().height),
                (200.0, 272.0),
                "{view}"
            );
            assert_eq!(
                painter.size_for(Some(&crate::testdata::snapshot())),
                painter.size()
            );
        }
    }
    /// Reproductor compartido con el test: apunta lo que el bucle pediría reproducir.
    #[derive(Clone, Default)]
    struct Sharing(
        std::rc::Rc<std::cell::RefCell<Vec<(vantare_domain::session_alerts::Tone, u8)>>>,
    );
    impl crate::session_alerts::sound::Player for Sharing {
        fn play(&mut self, tone: vantare_domain::session_alerts::Tone, volume: u8) {
            self.0.borrow_mut().push((tone, volume));
        }
    }
    fn lmu_photo() -> vantare_domain::Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.origin.source.simulator = "lmu";
        snapshot.origin.source.kind = vantare_domain::SourceKind::Live;
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Practice);
        snapshot.state.session.elapsed_s = vantare_domain::Quality::Reliable(0.0);
        snapshot.state.session.timing.scheduled_end_s = vantare_domain::Quality::Reliable(300.0);
        snapshot
    }

    #[test]
    fn the_animate_loop_hands_each_requested_tone_to_the_speaker() {
        let design = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"avisos","x":0,"y":0,"settings":{"kind":"session-alerts"}}]}"#,
        )
        .expect("diseño");
        let frames = crate::scene::FrameSet {
            layout: Arc::new(design),
            photos: std::collections::BTreeMap::from([(
                "avisos".to_owned(),
                vantare_ipc::Photo::full(Arc::new(lmu_photo())),
            )]),
            visible: std::collections::BTreeSet::from(["avisos".to_owned()]),
            shown: true,
            reduced_motion: false,
            calendar: Arc::default(),
        };
        let shared = Sharing::default();
        let mut painters = Painters {
            sound: crate::session_alerts::sound::Speaker::with(Box::new(shared.clone())),
            ..Default::default()
        };
        let meter = crate::stats::Meter::new(Arc::new(crate::stats::Counts::default()));
        let viewport = crate::scene::Viewport {
            origin: (0.0, 0.0),
            size: vantare_domain::geometry::Size {
                width: 1920.0,
                height: 1080.0,
            },
        };
        assert!(painters.sync(
            Some(&frames),
            &crate::host::Access::LocalPreview,
            viewport,
            0.0,
            &meter
        ));
        let mut tx = rune::Tx::default();
        painters.animate(0.0, &mut tx, &meter);
        assert_eq!(
            shared.0.borrow().as_slice(),
            [(vantare_domain::session_alerts::Tone::Mild, 70)],
            "el bucle entrega al reproductor el tono que pide el aviso"
        );
    }
    /// Hora de pared inyectada: este test no lee el reloj real.
    const WALL: u64 = 1_000_000;
    fn agenda() -> Arc<Vec<vantare_domain::session_alerts::CalendarInput>> {
        Arc::new(vec![vantare_domain::session_alerts::CalendarInput {
            id: "race".into(),
            label: "Spa".into(),
            starts_at_ms: WALL + 300_000,
        }])
    }
    fn frames_with(
        layout: Arc<vantare_ipc::layout::Layout>,
        calendar: Arc<Vec<vantare_domain::session_alerts::CalendarInput>>,
    ) -> crate::scene::FrameSet {
        let mut snapshot = lmu_photo();
        // La sesión termina dentro de una hora: el único aviso es el del calendario.
        snapshot.state.session.timing.scheduled_end_s = vantare_domain::Quality::Reliable(4_000.0);
        let ids: Vec<String> = layout
            .instances
            .iter()
            .map(|instance| instance.id.clone())
            .collect();
        crate::scene::FrameSet {
            layout,
            photos: ids
                .iter()
                .map(|id| {
                    (
                        id.clone(),
                        vantare_ipc::Photo::full(Arc::new(snapshot.clone())),
                    )
                })
                .collect(),
            visible: ids.into_iter().collect(),
            shown: true,
            reduced_motion: false,
            calendar,
        }
    }
    fn viewport() -> crate::scene::Viewport {
        crate::scene::Viewport {
            origin: (0.0, 0.0),
            size: vantare_domain::geometry::Size {
                width: 1920.0,
                height: 1080.0,
            },
        }
    }

    /// La agenda que llega por `FrameSet` acaba en el widget: su aviso suena una vez.
    #[test]
    fn the_calendar_agenda_reaches_the_widget_through_sync() {
        crate::session_alerts::inject_wall(Some(WALL));
        let design = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"avisos","x":0,"y":0,"settings":{"kind":"session-alerts"}}]}"#,
        )
        .expect("diseño");
        let frames = frames_with(Arc::new(design), agenda());
        let shared = Sharing::default();
        let mut painters = Painters {
            sound: crate::session_alerts::sound::Speaker::with(Box::new(shared.clone())),
            ..Default::default()
        };
        let meter = crate::stats::Meter::new(Arc::new(crate::stats::Counts::default()));
        painters.sync(
            Some(&frames),
            &crate::host::Access::LocalPreview,
            viewport(),
            0.0,
            &meter,
        );
        let mut tx = rune::Tx::default();
        painters.animate(0.0, &mut tx, &meter);
        assert_eq!(
            shared.0.borrow().as_slice(),
            [(vantare_domain::session_alerts::Tone::Mild, 70)],
            "el aviso del calendario llega al widget y suena"
        );
        crate::session_alerts::inject_wall(None);
    }

    /// Una instancia nueva con la MISMA agenda también la recibe: el `Arc` se recuerda
    /// por instancia, no una vez para todo el proceso.
    #[test]
    fn a_second_instance_receives_the_same_agenda() {
        crate::session_alerts::inject_wall(Some(WALL));
        let mut design = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"avisos","x":0,"y":0,"settings":{"kind":"session-alerts"}}]}"#,
        )
        .expect("diseño");
        let agenda = agenda();
        let shared = Sharing::default();
        let mut painters = Painters {
            sound: crate::session_alerts::sound::Speaker::with(Box::new(shared.clone())),
            ..Default::default()
        };
        let meter = crate::stats::Meter::new(Arc::new(crate::stats::Counts::default()));
        let frames = frames_with(Arc::new(design.clone()), agenda.clone());
        painters.sync(
            Some(&frames),
            &crate::host::Access::LocalPreview,
            viewport(),
            0.0,
            &meter,
        );
        let mut tx = rune::Tx::default();
        painters.animate(0.0, &mut tx, &meter);
        assert_eq!(shared.0.borrow().len(), 1, "la primera instancia avisa");
        // La segunda aparece después, con el mismo `Arc` de agenda.
        let mut second = design.instances[0].clone();
        second.id = "avisos2".into();
        second.y = 100.0;
        design.instances.push(second);
        let frames = frames_with(Arc::new(design), agenda);
        painters.sync(
            Some(&frames),
            &crate::host::Access::LocalPreview,
            viewport(),
            0.0,
            &meter,
        );
        painters.animate(0.0, &mut tx, &meter);
        assert_eq!(
            shared.0.borrow().len(),
            2,
            "la instancia nueva recibe la agenda que ya estaba publicada"
        );
        crate::session_alerts::inject_wall(None);
    }
}
