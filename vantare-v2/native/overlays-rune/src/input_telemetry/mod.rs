//! Telemetría de entrada: controlador con la historia observada de domain.
mod render;
pub mod scene;
use crate::widget::Update;
use rune::El;
use scene::Motion;
use std::cell::Cell;
use std::sync::Arc;
use std::time::Duration;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    input_telemetry::{Sample, SettingsPresentation as _, Trace, ViewModel},
    widget_settings::input_telemetry::Settings,
};

pub const SIZE: Size = Size {
    width: 600.0,
    height: 84.0,
};

pub(crate) struct InputTelemetry {
    settings: Settings,
    prefs: Preferences,
    view: Arc<ViewModel>,
    trace: Trace,
    samples: Arc<Vec<Sample>>,
    segments: Arc<Vec<scene::Segment>>,
    clutch_shown: bool,
    motion: Motion,
    painter: render::Painter,
    visual: scene::Scene,
    identity: Option<(u64, u64, Option<u32>)>,
    /// Un cambio de estructura pedido por el pintor y aún no presentado.
    pending: Cell<bool>,
}

impl InputTelemetry {
    pub fn new(settings: &Settings, prefs: Preferences, reduced: bool, clock: f64) -> Self {
        let settings = settings.normalized();
        let view = Arc::new(settings.project(&Snapshot::default(), prefs));
        let motion = Motion::new(reduced);
        let samples = Arc::new(Vec::new());
        let segments = Arc::new(Vec::new());
        let visual = scene::sample(
            view.clone(),
            samples.clone(),
            segments.clone(),
            &motion,
            settings.history_seconds,
            view.show_clutch,
            clock,
        );
        let painter = render::Painter::new(&visual);
        let clutch_shown = view.show_clutch;
        Self {
            settings,
            prefs,
            view,
            trace: Trace::default(),
            samples,
            segments,
            clutch_shown,
            motion,
            painter,
            visual,
            identity: None,
            pending: Cell::new(true),
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.painter.size()
    }
    pub fn view(&self) -> El {
        self.pending.set(false);
        self.painter.view()
    }
    pub fn policy(&mut self, reduced: bool, clock: f64) -> Update {
        if self.motion.policy(reduced) {
            self.animate(clock)
        } else {
            Update::default()
        }
    }
    /// Cada foto entra en la historia, en orden, aunque la cola entregue varias seguidas.
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let projected = self.settings.project(snapshot, self.prefs);
        let view = if *self.view == projected {
            self.view.clone()
        } else {
            Arc::new(projected)
        };
        let identity = (
            snapshot.epoch,
            snapshot.state.session.id.0,
            snapshot.state.player.map(|player| player.car.0),
        );
        let snap = self.identity != Some(identity);
        self.identity = Some(identity);
        let seconds = Duration::from_secs(u64::from(self.settings.history_seconds));
        let changed = self.trace.push_with_window(snapshot, seconds);
        let clutch = view.show_clutch;
        if changed || clutch != self.clutch_shown {
            self.samples = Arc::new(self.trace.samples().iter().copied().collect());
            self.segments = Arc::new(scene::segments(
                &self.samples,
                self.settings.history_seconds,
                clutch,
            ));
            self.clutch_shown = clutch;
        }
        self.motion.sync(view.pedals, snap, clock);
        self.view = view;
        self.animate(clock)
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        let visual = scene::sample(
            self.view.clone(),
            self.samples.clone(),
            self.segments.clone(),
            &self.motion,
            self.settings.history_seconds,
            self.view.show_clutch,
            clock,
        );
        let same = Arc::ptr_eq(&self.visual.view, &visual.view)
            && Arc::ptr_eq(&self.visual.segments, &visual.segments)
            && self.visual.pedals == visual.pedals
            && self.visual.throttle_dot == visual.throttle_dot
            && self.visual.seconds == visual.seconds
            && self.visual.show_clutch == visual.show_clutch;
        if same {
            return Update::default();
        }
        let update = self.painter.sync(&visual);
        self.visual = visual;
        self.pending.set(self.pending.get() || update.build);
        Update {
            build: self.pending.get(),
            pixels: update.pixels,
        }
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock) {
            tx.wake_at(due);
        }
    }
}

impl crate::widget::Widget for InputTelemetry {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        reduced: bool,
        _hz: u16,
        clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let vantare_domain::widget_settings::Settings::InputTelemetry(settings) = settings else {
            return None;
        };
        Some(Box::new(InputTelemetry::new(
            settings, prefs, reduced, clock,
        )))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::InputTelemetry(settings) = settings else {
            return false;
        };
        InputTelemetry::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        InputTelemetry::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        InputTelemetry::size(self)
    }
    fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> Update {
        InputTelemetry::policy(self, reduced, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        InputTelemetry::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        InputTelemetry::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        InputTelemetry::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        InputTelemetry::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;
    use vantare_domain::{
        Capability, Player, Quality::Reliable, SourceState, Telemetry,
        widget_settings::Settings as AnySettings,
    };

    fn photo(sequence: u64, ms: u64, throttle: f64) -> Snapshot {
        let mut snapshot = Snapshot {
            sequence,
            ..Snapshot::default()
        };
        snapshot.origin.received_at = Duration::from_millis(ms);
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.player = Some(Player {
            telemetry: Telemetry {
                throttle: Reliable(throttle),
                brake: Reliable(0.5),
                clutch: Reliable(0.25),
                gear: Reliable(3),
                speed_mps: Reliable(50.0),
                engine_speed_rad_s: Reliable(240.0 * PI),
                ..Telemetry::default()
            },
            ..Player::default()
        });
        snapshot
    }
    fn widget(settings: &Settings, reduced: bool) -> InputTelemetry {
        let _fonts = rune::text::with_families("Inter", "Inter");
        InputTelemetry::new(settings, Preferences::default(), reduced, 0.0)
    }

    #[test]
    fn photos_accumulate_one_by_one_in_order() {
        let mut widget = widget(&Settings::default(), false);
        for index in 0..5 {
            widget.update(&photo(index + 1, index * 100, 0.25), index as f64 / 10.0);
        }
        assert_eq!(widget.trace.samples().len(), 5);
        let last = widget.samples.last().expect("muestra");
        assert_eq!(last.throttle, Some(25.0));
        // La misma foto otra vez no añade muestra; la cola no se descarta por `sequence`.
        widget.update(&photo(5, 400, 0.25), 0.5);
        assert_eq!(widget.trace.samples().len(), 5);
        widget.update(&photo(6, 500, 0.25), 0.6);
        assert_eq!(widget.trace.samples().len(), 6);
    }

    #[test]
    fn quiet_photo_paints_nothing_and_a_new_sample_rebuilds_once() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut widget = widget(&Settings::default(), false);
        let first = photo(1, 0, 0.2);
        assert!(widget.update(&first, 0.0).pixels);
        let _presented = widget.view();
        let quiet = widget.update(&first, 1.0);
        assert!(
            !quiet.build && !quiet.pixels,
            "sin datos nuevos, sin imagen"
        );
        assert_eq!(widget.motion.next_wake(1.0), None, "sin reloj en reposo");
        let grown = widget.update(&photo(2, 100, 0.8), 2.0);
        assert!(grown.build, "muestra nueva: se rehacen las trazas");
        let _presented = widget.view();
        let moving = widget.animate(2.02);
        assert!(
            moving.pixels && !moving.build,
            "las barras se mueven sin rebuild"
        );
        assert_eq!(widget.motion.next_wake(2.02), Some(2.02));
        widget.animate(2.5);
        assert!(!widget.animate(2.5).pixels);
        assert_eq!(widget.motion.next_wake(2.5), None);
    }

    #[test]
    fn reduced_motion_snaps_the_bars_and_never_arms_a_clock() {
        let mut widget = widget(&Settings::default(), true);
        widget.update(&photo(1, 0, 0.2), 0.0);
        widget.update(&photo(2, 100, 0.9), 0.1);
        assert_eq!(widget.motion.sample(0.1)[2], Some(90.0));
        assert_eq!(widget.motion.next_wake(0.1), None);
    }

    #[test]
    fn the_effective_clutch_rule_lives_in_one_place() {
        let mut snapshot = photo(1, 0, 0.2);
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .clutch = vantare_domain::Quality::Unavailable;
        let settings = Settings {
            show_clutch: true,
            ..Settings::default()
        };
        let view = settings.project(&snapshot, Preferences::default());
        assert!(!view.show_clutch, "sin dato de embrague no se muestra");
        assert_eq!(view.pedals[0], None);
        let view = settings.project(&photo(1, 0, 0.2), Preferences::default());
        assert!(view.show_clutch);
        assert_eq!(view.pedals[0], Some(25.0));
    }

    fn dense(settings: &Settings) -> rune::Runtime<Box<dyn crate::widget::Widget>> {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut widget = widget(settings, false);
        for index in 1..=8 {
            let throttle = 0.1 * index as f64;
            widget.update(&photo(index, (index - 1) * 20, throttle), 0.0);
        }
        let mut runtime = rune::Runtime::with_text(
            Box::new(widget) as Box<dyn crate::widget::Widget>,
            |state, _| state.view(),
            (SIZE.width, SIZE.height),
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|widget, clock, tx| {
            let update = widget.animate(clock);
            widget.schedule(clock, tx);
            update.build
        });
        runtime.frame(1.0);
        runtime
    }

    #[test]
    fn the_painted_layout_matches_the_approved_strip() {
        let runtime = dense(&Settings {
            show_clutch: true,
            ..Settings::default()
        });
        let elements = runtime.elements();
        let find = |key: &str| {
            elements
                .iter()
                .find(|element| element.key.as_deref() == Some(key))
                .unwrap_or_else(|| panic!("falta {key}"))
        };
        for (index, fraction) in [0.25_f32, 0.5, 0.75, 1.0].into_iter().enumerate() {
            let grid = find(&format!("grid-{index}"));
            assert_eq!(
                grid.target[1],
                scene::PLOT.1 + fraction * scene::PLOT.3 - 0.5,
                "rejilla {index}"
            );
        }
        let plot = find("plot");
        assert_eq!(
            (
                plot.target[0],
                plot.target[1],
                plot.target[2],
                plot.target[3]
            ),
            (scene::PLOT.0, scene::PLOT.1, scene::PLOT.2, scene::PLOT.3)
        );
        let mut traces = 0;
        for element in &elements {
            if element
                .key
                .as_deref()
                .is_some_and(|key| key.starts_with("trace-"))
            {
                traces += 1;
                assert!(
                    element.rect[0] >= plot.rect[0] - 0.01
                        && element.rect[1] >= plot.rect[1] - 0.01
                        && element.rect[0] + element.rect[2] <= plot.rect[0] + plot.rect[2] + 0.01
                        && element.rect[1] + element.rect[3] <= plot.rect[1] + plot.rect[3] + 0.01,
                    "traza fuera del recuadro: {:?}",
                    element.rect
                );
            }
        }
        assert_eq!(traces, 3, "las tres señales en la misma caja");
        let dot = find("dot");
        assert_eq!(dot.rect[0], 448.0);
        assert!((dot.rect[1] - (70.0 - 62.0 * 80.0 / 100.0)).abs() < 0.01);
        for index in 0..3 {
            let track = find(&format!("track-{index}"));
            assert_eq!(track.target[0], 462.0 + 12.0 * index as f32);
            let bar = find(&format!("bar-{index}"));
            assert_eq!(bar.rect[0], 462.0 + 12.0 * index as f32);
            // Embrague 25 %, freno 50 %, acelerador 80 % (último dato de `dense`).
            let percent = [25.0, 50.0, 80.0][index];
            // El acelerador aún se asienta (suavizado de la foto): holgura de 0,1 px.
            assert!(
                (bar.rect[3] - 64.0 * percent / 100.0).abs() < 0.1,
                "barra {index}: {}",
                bar.rect[3]
            );
        }
        let gear = find("gear");
        assert_eq!(
            gear.rect[0] + gear.rect[2] / 2.0,
            550.0,
            "centro con embrague"
        );
        let speed = find("speed");
        assert_eq!(speed.rect[1], 60.0);
        assert_eq!(speed.rect[3], 14.0);
    }

    #[test]
    fn nothing_is_painted_outside_the_window() {
        let runtime = dense(&Settings {
            show_clutch: true,
            ..Settings::default()
        });
        for element in runtime.elements() {
            let [x, y, width, height] = element.rect;
            assert!(
                x >= -0.01
                    && y >= -0.01
                    && x + width <= SIZE.width + 0.01
                    && y + height <= SIZE.height + 0.01,
                "elemento fuera: {:?} {:?}",
                element.key,
                element.rect
            );
        }
    }

    #[test]
    fn a_new_identity_clears_the_observed_history() {
        let mut widget = widget(&Settings::default(), false);
        widget.update(&photo(1, 0, 0.2), 0.0);
        widget.update(&photo(2, 20, 0.3), 0.1);
        assert_eq!(widget.trace.samples().len(), 2);
        let mut epoch = photo(3, 40, 0.4);
        epoch.epoch += 1;
        widget.update(&epoch, 0.2);
        assert_eq!(widget.trace.samples().len(), 1, "época");
        let mut session = photo(4, 60, 0.5);
        session.state.session.id = vantare_domain::SessionId(9);
        widget.update(&session, 0.3);
        assert_eq!(widget.trace.samples().len(), 1, "sesión");
        let mut car = photo(5, 80, 0.6);
        car.state.player.as_mut().expect("jugador").car = vantare_domain::CarId(7);
        widget.update(&car, 0.4);
        assert_eq!(widget.trace.samples().len(), 1, "coche");
    }

    #[test]
    fn hiding_the_clutch_leaves_two_bars_and_two_traces() {
        let mut shown = widget(
            &Settings {
                show_clutch: true,
                ..Settings::default()
            },
            false,
        );
        let mut hidden = widget(&Settings::default(), false);
        for index in 1..=4 {
            let photo = photo(index, (index - 1) * 20, 0.4);
            shown.update(&photo, 0.0);
            hidden.update(&photo, 0.0);
        }
        assert!(shown.segments.iter().any(|segment| segment.signal == 0));
        assert!(!hidden.segments.iter().any(|segment| segment.signal == 0));
    }

    #[test]
    fn dispatch_accepts_input_telemetry_and_rejects_others() {
        let settings = AnySettings::InputTelemetry(Settings::default());
        let painter = <InputTelemetry as crate::widget::Widget>::new(
            &settings,
            Preferences::default(),
            true,
            15,
            0.0,
        )
        .expect("telemetría");
        assert!(painter.configured(&settings, Preferences::default()));
        assert_eq!(painter.size(), SIZE);
        assert!(
            <InputTelemetry as crate::widget::Widget>::new(
                &AnySettings::Pedals(Default::default()),
                Preferences::default(),
                true,
                15,
                0.0
            )
            .is_none()
        );
    }
}
