//! Track weather projection/controller. Session label and wind heading come from
//! `domain::track_weather`; the wet fraction is `ViewModel::wet_percent`.
mod render;
pub mod scene;
use crate::widget::{Update, Widget};
use render::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    track_weather::{self, ViewModel},
    widget_settings::{Settings as WidgetSettings, track_weather::Settings},
};

pub(crate) struct TrackWeather {
    settings: Settings,
    prefs: Preferences,
    vm: ViewModel,
    layout: scene::Layout,
    scene: scene::Scene,
    painter: Painter,
    /// Etiqueta de sesión cacheada de `track_weather::session_label`.
    session: String,
    /// Rumbo del viento cacheado de `track_weather::wind_heading`.
    wind_heading: Option<f32>,
}

impl TrackWeather {
    fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let default = Snapshot::default();
        let vm = track_weather::project(&default, prefs);
        let layout = if settings.vertical {
            scene::Layout::Vertical
        } else {
            scene::Layout::Wide
        };
        let session = track_weather::session_label(&default, prefs);
        let wind_heading = track_weather::wind_heading(&default);
        let scene = scene::sample(&vm, layout, prefs.language, &session, wind_heading);
        let painter = Painter::new(prefs, &scene);
        Self {
            settings,
            prefs,
            vm,
            layout,
            scene,
            painter,
            session,
            wind_heading,
        }
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        matches!(settings, WidgetSettings::TrackWeather(s) if s.normalized() == self.settings)
            && self.prefs == prefs
    }
    fn size(&self) -> Size {
        let (width, height) = self.layout.size();
        Size { width, height }
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        self.vm = track_weather::project(snapshot, self.prefs);
        self.session = track_weather::session_label(snapshot, self.prefs);
        self.wind_heading = track_weather::wind_heading(snapshot);
        let scene = scene::sample(
            &self.vm,
            self.layout,
            self.prefs.language,
            &self.session,
            self.wind_heading,
        );
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

impl Widget for TrackWeather {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::TrackWeather(settings) = settings else {
            return None;
        };
        Some(Box::new(TrackWeather::new(settings, prefs)))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        TrackWeather::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        TrackWeather::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        TrackWeather::size(self)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        TrackWeather::update(self, snapshot, clock)
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        TrackWeather::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime, render::Instance, text::TextSystem};
    use vantare_domain::{Capability, Quality::Reliable, SourceState};

    fn live_snapshot() -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.epoch = 1;
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.weather = Capability::Fresh;
        let weather = &mut snapshot.state.session.weather;
        weather.track_temperature_k = Reliable(301.15);
        weather.air_temperature_k = Reliable(295.15);
        weather.wind_speed_mps = Reliable(14.0 / 3.6);
        weather.wind_direction_rad = Reliable(7.0 * std::f64::consts::FRAC_PI_4);
        weather.rain = Reliable(0.0);
        weather.track_wetness = Reliable(0.25);
        weather.pressure_pa = Reliable(101_325.0);
        snapshot
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
        widget: TrackWeather,
        next: Option<Snapshot>,
    }

    fn make_runtime(widget: TrackWeather) -> Runtime<Harness> {
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
    fn both_layouts_keep_their_catalogue_size() {
        let wide = TrackWeather::new(&Settings::default(), Preferences::default());
        assert_eq!((wide.size().width, wide.size().height), (280.0, 210.0));
        let vertical = TrackWeather::new(
            &Settings {
                vertical: true,
                ..Settings::default()
            },
            Preferences::default(),
        );
        assert_eq!(
            (vertical.size().width, vertical.size().height),
            (132.0, 440.0)
        );
    }

    #[test]
    fn a_visible_change_presents_one_image_and_repose_none() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut snapshot = live_snapshot();
        let mut runtime = make_runtime(TrackWeather::new(
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
        snapshot.state.session.weather.air_temperature_k = Reliable(300.15);
        runtime.state.next = Some(snapshot);
        assert!(frame(&mut runtime, 0.3), "un cambio visible, una imagen");
        assert!(!frame(&mut runtime, 0.4), "vuelve el reposo");
        assert!(runtime.wake_deadline().is_none(), "sin reloj");
    }

    #[test]
    fn the_domain_presentation_helpers_feed_the_scene() {
        let prefs = Preferences::default();
        let mut snapshot = live_snapshot();
        snapshot.state.session.kind = Reliable(vantare_domain::SessionKind::Qualifying);
        snapshot.state.session.remaining_s = Reliable(522.0);
        snapshot.state.session.weather.wind_direction_rad = Reliable(1.25);
        let mut widget = TrackWeather::new(&Settings::default(), prefs);
        widget.update(&snapshot, 0.0);
        assert_eq!(
            widget.session,
            track_weather::session_label(&snapshot, prefs)
        );
        assert!(widget.session.ends_with(" · 08:42"));
        assert_eq!(widget.wind_heading, track_weather::wind_heading(&snapshot));
        assert_eq!(widget.scene.session, widget.session);
        assert_eq!(widget.scene.wind_heading, widget.wind_heading);
        assert_eq!(widget.scene.wet, Some(25.0), "wet_percent de la PISTA");
    }
}
