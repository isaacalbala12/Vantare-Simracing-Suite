//! Vuelta rápida: proyección, aviso y pintura Vantare (480 × 104).
//! Demo/parity-capture (récord fijo del taller): paridad en demo pendiente,
//! va en el PR de seguimiento de demos.
mod render;
pub mod scene;

use crate::widget::{Update, Widget};
use render::Painter;
use std::sync::Arc;
use vantare_domain::{
    Snapshot, fastest_lap,
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings, fastest_lap::Settings as Config},
};

pub(crate) struct FastestLap {
    settings: Config,
    prefs: Preferences,
    motion: scene::Motion,
    painter: Painter,
    projected: Arc<fastest_lap::ViewModel>,
    projection_key: Option<(u64, u64, u64, Preferences)>,
    visual: Option<scene::Scene>,
}

impl FastestLap {
    pub fn new(settings: &Config, prefs: Preferences, reduced: bool, _hz: u16, clock: f64) -> Self {
        let settings = settings.normalized();
        let motion = scene::Motion::new(f64::from(settings.duration_seconds), reduced);
        let mut vm = fastest_lap::project(&Snapshot::default(), prefs);
        vm.show_driver = settings.show_driver;
        let visual = scene::sample(&motion, prefs, clock);
        let painter = Painter::new(visual.as_ref());
        Self {
            settings,
            prefs,
            motion,
            painter,
            projected: Arc::new(vm),
            projection_key: None,
            visual,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        let Settings::FastestLap(settings) = settings else {
            return false;
        };
        self.settings == settings.normalized() && self.prefs == prefs
    }

    pub fn size(&self) -> Size {
        self.size_for(None)
    }

    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Size {
            width: render::WIDTH,
            height: render::HEIGHT,
        }
    }

    pub fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> Update {
        if self
            .motion
            .policy(reduced, f64::from(self.settings.duration_seconds))
        {
            self.animate(clock)
        } else {
            Update::default()
        }
    }

    /// Proyección y estado del aviso. Muestrear y recomponer toca a `animate`,
    /// que el anfitrión llama justo después en el mismo marco.
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let vm = self.projection(snapshot);
        let changed = self.motion.update(
            snapshot,
            &vm,
            self.prefs,
            self.settings.show_class,
            self.settings.show_personal,
            clock,
        );
        Update {
            build: false,
            pixels: changed,
        }
    }

    pub fn animate(&mut self, clock: f64) -> Update {
        self.motion.advance(clock);
        let visual = scene::sample(&self.motion, self.prefs, clock);
        if self.visual == visual {
            return Update::default();
        }
        let update = self.painter.sync(visual.as_ref());
        self.visual = visual;
        update
    }

    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock) {
            tx.wake_at(due);
        }
    }

    pub fn view(&self) -> rune::El {
        self.painter.view()
    }

    /// Reutiliza la proyección mientras no cambien época, secuencia, sesión ni
    /// idioma; así la escena puede comparar con `Arc::ptr_eq`.
    fn projection(&mut self, snapshot: &Snapshot) -> Arc<fastest_lap::ViewModel> {
        let key = (
            snapshot.epoch,
            snapshot.sequence,
            snapshot.state.session.id.0,
            self.prefs,
        );
        if self.projection_key != Some(key) {
            let mut vm = fastest_lap::project(snapshot, self.prefs);
            vm.show_driver = self.settings.show_driver;
            self.projected = Arc::new(vm);
            self.projection_key = Some(key);
        }
        Arc::clone(&self.projected)
    }
}

impl Widget for FastestLap {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::FastestLap(settings) = settings else {
            return None;
        };
        Some(Box::new(FastestLap::new(
            settings, prefs, reduced, hz, clock,
        )))
    }

    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        FastestLap::configured(self, settings, prefs)
    }

    fn size(&self) -> Size {
        FastestLap::size(self)
    }

    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        FastestLap::size_for(self, snapshot)
    }

    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        FastestLap::policy(self, reduced, hz, clock)
    }

    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        FastestLap::update(self, snapshot, clock)
    }

    fn animate(&mut self, clock: f64) -> Update {
        FastestLap::animate(self, clock)
    }

    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        FastestLap::schedule(self, clock, tx);
    }

    fn view(&self) -> rune::El {
        FastestLap::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{
        Capability, Car, CarId, Class, ClassId, Driver, Player, Quality, SourceKind, SourceState,
        format::Preferences,
    };

    fn car(id: u32, name: &str, class: u32, class_name: &str, best: f64) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            vehicle: "Car".into(),
            driver: Driver {
                name: name.into(),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(class),
                name: class_name.into(),
            }),
            laps: Quality::Reliable(4),
            last_lap_s: Quality::Reliable(best),
            best_lap_s: Quality::Reliable(best),
            ..Car::default()
        }
    }

    /// Foto con el jugador y un rival en GT3; el tercer coche es de otra clase.
    fn photo(sequence: u64, best: f64) -> Snapshot {
        let mut snapshot = Snapshot {
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.lap_times = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars = vec![
            car(1, "Player", 1, "GT3", best),
            car(2, "Rival", 1, "GT3", 91.0),
            car(3, "Other", 2, "HYPERCAR", 80.0),
        ];
        snapshot
    }

    fn widget(settings: &Config, prefs: Preferences, reduced: bool) -> FastestLap {
        FastestLap::new(settings, prefs, reduced, 15, 0.0)
    }

    fn runtime(widget: FastestLap) -> Runtime<FastestLap> {
        let mut runtime = Runtime::with_text(
            widget,
            |widget, _| widget.view(),
            (render::WIDTH, render::HEIGHT),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|widget, clock, tx| {
            let update = widget.animate(clock);
            widget.schedule(clock, tx);
            update.build
        });
        runtime
    }

    fn payload(instance: &rune::render::Instance) -> [[u32; 4]; 8] {
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

    /// Cuenta cambios reales del flujo CPU, como el anfitrión; sin ventana.
    fn rendered(runtime: &mut Runtime<FastestLap>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    #[test]
    fn dispatch_builds_the_widget_with_its_settings() {
        let layout = vantare_ipc::layout::Layout::from_json(
            br#"{"version":2,"instances":[{"id":"f","x":0,"y":0,"settings":{"kind":"fastest-lap"}}]}"#,
        )
        .expect("design");
        let instance = &layout.instances[0];
        assert!(crate::renderer::supports(instance));
        let prefs = Preferences::default();
        let painter =
            <FastestLap as Widget>::new(&instance.settings, prefs, true, 15, 0.0).expect("widget");
        assert!(painter.configured(&instance.settings, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: 480.0,
                height: 104.0
            }
        );
        let longer = Settings::FastestLap(Config {
            duration_seconds: 9,
            ..Config::default()
        });
        assert!(!painter.configured(&longer, prefs));
        let english = Preferences {
            language: vantare_domain::format::Language::En,
            ..prefs
        };
        assert!(!painter.configured(&instance.settings, english));
    }

    #[test]
    fn still_data_draws_nothing_and_a_visible_notice_draws_once() {
        let prefs = Preferences::default();
        let mut runtime = runtime(widget(&Config::default(), prefs, false));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        assert!(!rendered(&mut runtime, 0.0), "la primera foto es silencio");
        for _ in 0..20 {
            assert!(!rendered(&mut runtime, 0.05), "reposo sin imagen");
        }
        assert!(runtime.wake_deadline().is_none(), "sin aviso no hay reloj");
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        assert!(rendered(&mut runtime, 0.11), "entra el fundido");
        assert!(rendered(&mut runtime, 0.2), "sigue el fundido");
        for _ in 0..3 {
            rendered(&mut runtime, 0.5);
        }
        assert!(!rendered(&mut runtime, 0.5), "quieto no repinta");
        assert!(runtime.wake_deadline().is_some(), "pide la salida");
    }

    #[test]
    fn reduced_motion_keeps_the_final_state_and_one_expiry_wake() {
        let prefs = Preferences::default();
        let mut runtime = runtime(widget(&Config::default(), prefs, true));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        assert!(!rendered(&mut runtime, 0.0));
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        assert!(rendered(&mut runtime, 0.05), "aparece entero");
        for _ in 0..10 {
            rendered(&mut runtime, 0.5);
            assert_eq!(
                runtime.state.visual.as_ref().map(|scene| scene.opacity),
                Some(1.0),
                "sin fundido ni deslizamiento"
            );
            assert_eq!(runtime.wake_deadline(), Some(6.0), "un solo despertar");
        }
        assert!(rendered(&mut runtime, 1.0), "caduca al final de su vida");
        assert!(runtime.state.visual.is_none(), "ya no hay aviso");
        assert!(runtime.wake_deadline().is_none(), "después no hay reloj");
        assert!(!rendered(&mut runtime, 1.0), "reposo");
    }

    #[test]
    fn pause_clears_the_notice_without_animating() {
        // La retirada es estado y señal de recomposición; la imagen la decide el
        // anfitrión al rehacer la vista vacía (mismo camino que la caducidad).
        let prefs = Preferences::default();
        let mut widget = widget(&Config::default(), prefs, false);
        widget.update(&photo(1, 90.0), 0.0);
        widget.update(&photo(2, 89.94), 1.0);
        assert!(widget.animate(1.3).build, "aviso visible");
        assert!(widget.visual.is_some());
        let mut paused = photo(3, 89.0);
        paused.state.source_state = SourceState::Paused;
        widget.update(&paused, 1.3);
        let update = widget.animate(1.35);
        assert!(update.build && update.pixels, "se retira de golpe");
        assert!(widget.visual.is_none(), "sin aviso en pausa");
        assert_eq!(widget.motion.next_wake(1.35), None, "sin reloj");
    }

    #[test]
    fn the_workshop_demo_previews_its_record_without_notice_or_clock() {
        let prefs = Preferences::default();
        let demo = demo_photo();
        let mut widget = widget(&Config::default(), prefs, false);
        assert!(
            widget.update(&demo, 0.0).pixels,
            "la demo entra como imagen"
        );
        assert!(widget.animate(0.0).build, "una imagen");
        let scene = widget.visual.as_ref().expect("récord fijo");
        assert_eq!(scene.opacity, 1.0);
        assert_ne!(scene.time.as_ref(), "—");
        assert_eq!(widget.motion.next_wake(0.0), None, "sin reloj");
        assert!(!widget.update(&demo, 0.1).pixels, "la misma foto reposa");
    }

    #[test]
    fn a_live_photo_or_another_sequence_is_never_a_preview() {
        let prefs = Preferences::default();
        // El origen forma parte de la igualdad exacta de GPUI: una foto viva no
        // coincide con la de la demo aunque su estado sea idéntico.
        let mut live = demo_photo();
        live.origin.source.kind = SourceKind::Live;
        let mut widget = widget(&Config::default(), prefs, false);
        widget.update(&live, 0.0);
        widget.animate(0.0);
        assert!(widget.visual.is_none(), "sin aviso no hay vista previa");
        let mut other = demo_photo();
        other.sequence += 1;
        widget.update(&other, 0.1);
        widget.animate(0.1);
        assert!(widget.visual.is_none(), "solo la foto exacta de la demo");
    }

    fn demo_photo() -> Snapshot {
        vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/fastest-lap-design-system.sequence.json"
        ))
        .expect("secuencia canónica")
        .pop()
        .expect("foto final")
    }

    fn element<'a>(elements: &'a [rune::ElementInfo], key: &str) -> &'a rune::ElementInfo {
        elements
            .iter()
            .find(|element| element.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("falta el elemento {key}"))
    }

    /// Aviso visible listo para inspeccionar, en reposo.
    fn notice_runtime(prefs: Preferences) -> Runtime<FastestLap> {
        let mut runtime = runtime(widget(&Config::default(), prefs, false));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        rendered(&mut runtime, 0.0);
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        rendered(&mut runtime, 0.2);
        runtime
    }

    #[test]
    fn display_texts_sit_one_display_baseline_lower() {
        let prefs = Preferences::default();
        let runtime = notice_runtime(prefs);
        let baseline = crate::vantare::Style::compiled().fonts.display_baseline;
        assert!(baseline > 0.0, "el estilo canónico desplaza la Display");
        let elements = runtime.elements();
        assert_eq!(element(&elements, "title").rect[1], 12.0 + baseline);
        assert_eq!(element(&elements, "class-label").rect[1], 12.0 + baseline);
        assert_eq!(element(&elements, "time").rect[1], 30.0 + baseline);
        assert_eq!(element(&elements, "improvement").rect[1], 12.0 + baseline);
        assert_eq!(
            element(&elements, "sector-label-0").rect[1],
            55.0 + baseline
        );
        assert_eq!(
            element(&elements, "driver").rect[1],
            74.0,
            "Body sin desplazamiento"
        );
    }

    #[test]
    fn class_chip_uses_the_truncated_name_and_cuts_at_92_px() {
        let prefs = Preferences::default();
        let style = crate::vantare::Style::compiled();
        let class = Some(Class {
            id: ClassId(1),
            name: "ULTRA LONG CLASS NAME FOR THE METRIC TEST WITH A GT3 SUFFIX".into(),
        });
        let mut runtime = runtime(widget(&Config::default(), prefs, false));
        let mut base = photo(1, 90.0);
        base.state.cars[0].class = class.clone();
        runtime.state.update(&base, runtime.clock);
        rendered(&mut runtime, 0.0);
        let mut improved = photo(2, 89.94);
        improved.state.cars[0].class = class;
        runtime.state.update(&improved, runtime.clock);
        assert!(rendered(&mut runtime, 0.2));
        let elements = runtime.elements();
        let chip = element(&elements, "class");
        let label = element(&elements, "class-label");
        let text = label.text.clone().expect("etiqueta del chip");
        assert!(text.ends_with('…'), "el chip se corta con puntos: {text:?}");
        assert!(
            chip.rect[2] <= 92.0 + 12.0,
            "el chip no pasa de 92 px de texto: {}",
            chip.rect[2]
        );
        let fallback = style.classes.last().expect("clase de reserva").dot;
        assert_ne!(
            style
                .class("ULTRA LONG CLASS NAME FOR THE METRIC TEST WITH A GT3 SUFFIX")
                .dot,
            fallback,
            "el nombre completo sí coincide con GT"
        );
        assert_eq!(
            chip.fill, fallback,
            "el color se busca con el nombre ya recortado"
        );
    }

    #[test]
    fn chip_and_mono_texts_stay_out_of_the_fading_layer() {
        // Contrato estable: el mono y los chips cuelgan del grupo fijo, no del
        // nodo con `live_opacity`. Sin geometría de glifos.
        let prefs = Preferences::default();
        let mut runtime = runtime(widget(&Config::default(), prefs, false));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        rendered(&mut runtime, 0.0);
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        assert!(rendered(&mut runtime, 0.11), "fundido a media entrada");
        let elements = runtime.elements();
        let path = |key: &str| element(&elements, key).path.clone();
        for key in ["title", "time", "driver", "improvement", "class-label"] {
            assert!(
                path(key).contains("/notice/"),
                "{key} se funde con el aviso: {}",
                path(key)
            );
        }
        for key in ["caption", "lap", "sector-label-0"] {
            assert!(
                path(key).contains("/steady/") && !path(key).contains("/notice"),
                "{key} queda fuera de la capa que se funde: {}",
                path(key)
            );
        }
        let instances = runtime.instances.clone();
        let start = instances
            .iter()
            .position(|instance| instance.params[1] == rune::render::KIND_LAYER)
            .expect("capa del fundido");
        let end = instances
            .iter()
            .position(|instance| instance.params[1] == rune::render::KIND_LAYER_END)
            .expect("fin de la capa");
        let opacity = instances[start].fill[3];
        assert!(
            opacity > 0.0 && opacity < 1.0,
            "la capa se funde: {opacity}"
        );
        let chip = instances
            .iter()
            .position(|instance| {
                (instance.rect[0] - 371.0).abs() < 0.5
                    && (instance.rect[1] - 55.0).abs() < 0.5
                    && (instance.rect[2] - 30.0).abs() < 0.5
                    && (instance.rect[3] - 16.0).abs() < 0.5
            })
            .expect("chip S1");
        assert!(start < end, "la capa se abre antes de cerrarse");
        assert!(chip > end, "los chips van fuera de la capa que se funde");
    }

    /// La ventana mide lo que pide el widget, no una caja fija.
    #[test]
    fn no_layer_falls_outside_the_window() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for photo in [Snapshot::default(), photo(1, 91.5)] {
            let mut widget = widget(&Config::default(), Preferences::default(), true);
            widget.update(&photo, 0.0);
            let size = widget.size_for(Some(&photo));
            let mut runtime = Runtime::with_text(
                widget,
                |widget: &FastestLap, _| widget.view(),
                (size.width, size.height),
                Env::new(true, 1.0),
                rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
            );
            runtime.poll = Some(|widget, clock, tx| {
                let update = widget.animate(clock);
                widget.schedule(clock, tx);
                update.build
            });
            runtime.frame(0.0);
            crate::testdata::assert_inside_window(&mut runtime, (size.width, size.height));
        }
    }

    #[test]
    fn long_subtitle_truncates_with_ellipsis_and_recomposes_once() {
        let prefs = Preferences::default();
        let style = crate::vantare::Style::compiled();
        let mut runtime = runtime(widget(&Config::default(), prefs, false));
        runtime.state.update(&photo(1, 90.0), runtime.clock);
        rendered(&mut runtime, 0.0);
        runtime.state.update(&photo(2, 89.94), runtime.clock);
        rendered(&mut runtime, 0.2);
        for _ in 0..3 {
            rendered(&mut runtime, 0.5);
        }
        assert!(!rendered(&mut runtime, 0.5), "reposo con el nombre corto");
        // El vehículo no forma parte del Timing: el aviso se conserva y solo
        // se recompone el subtítulo, una vez.
        let long = "A VERY LONG VEHICLE NAME THAT DOES NOT FIT THE SUBTITLE BOX EVEN WITH NARROWER WINDOWS FONT METRICS";
        let mut improved = photo(3, 89.94);
        improved.state.cars[0].vehicle = long.into();
        runtime.state.update(&improved, runtime.clock);
        assert!(
            rendered(&mut runtime, 0.11),
            "recompone con el nombre largo"
        );
        for _ in 0..3 {
            rendered(&mut runtime, 0.5);
        }
        assert!(!rendered(&mut runtime, 0.5), "vuelve al reposo");
        assert!(!rendered(&mut runtime, 1.0), "sigue en reposo");
        let elements = runtime.elements();
        let driver = element(&elements, "driver");
        let text = driver.text.clone().expect("subtítulo");
        assert!(
            text.contains(long),
            "el texto fuente sigue completo: {text:?}"
        );
        assert_eq!(driver.rect[2], 320.0, "la caja corta a 320 px");
        let ink = crate::vantare::paint::font(
            style.as_ref(),
            crate::vantare::paint::Face::Body,
            style.fonts.small,
            16.0,
            0.0,
            style.fonts.regular_weight,
        );
        assert!(
            rune::text::measure(&text, &[], ink, None).0 > 320.0,
            "no cabe en 320: Rune lo corta con «…»"
        );
    }
}
