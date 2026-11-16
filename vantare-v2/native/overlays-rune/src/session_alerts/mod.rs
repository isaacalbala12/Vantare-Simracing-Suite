//! Avisos de sesión: proyección de LMU, máquina de avisos de domain y Look Vantare.
//! Sin sonido y sin avisos de calendario: diferencia declarada, se hace en un PR aparte.
mod render;
pub mod scene;
use crate::motion::Tween;
use crate::widget::Update;
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    session_alerts::{self as model, Machine, Options, View},
    widget_settings::session_alerts::Settings,
};

/// The GPUI painter fades the panel in and out over 150 ms.
const FADE: f64 = 0.15;

pub(crate) struct SessionAlerts {
    settings: Settings,
    options: Options,
    prefs: Preferences,
    machine: Machine,
    view: View,
    /// Wall clock when the widget was built; the runtime clock adds what elapsed since.
    wall: u64,
    /// A photo arrived: the widget is in track, not in the Studio preview.
    live: bool,
    reduced: bool,
    hz: u16,
    fade: Tween,
    shown: Option<(String, u64)>,
    last_input: Option<model::SessionInput>,
    /// Agenda plug of the next PR: the calendar feed will arrive here, empty for now.
    #[allow(dead_code)]
    calendar: Vec<model::CalendarInput>,
    painter: render::Painter,
    visual: scene::Scene,
}
impl SessionAlerts {
    pub fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let options = options(&settings);
        let wall = vantare_ipc::control::wall_ms().unwrap_or(0);
        let view = View::default();
        let initial = scene::sample(&settings, &view, None, false, 1.0);
        let painter = render::Painter::new(&initial, &settings.style);
        Self {
            settings,
            options,
            prefs,
            machine: Machine::default(),
            view,
            wall,
            live: false,
            reduced: false,
            hz: 0,
            fade: Tween::linear(1.0),
            shown: None,
            last_input: None,
            calendar: Vec::new(),
            painter,
            visual: initial,
        }
    }
    fn now(&self, clock: f64) -> u64 {
        self.wall
            .saturating_add((clock.max(0.0) * 1000.0) as u64)
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.painter.size()
    }
    /// The bounds only depend on the settings, so the host can place it before any photo.
    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        let (width, height) = scene::size(&self.settings);
        Size { width, height }
    }
    pub fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        let changed = self.reduced != reduced || self.hz != hz;
        self.reduced = reduced;
        self.hz = hz;
        if changed {
            self.animate(clock)
        } else {
            Update::default()
        }
    }
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let now = self.now(clock);
        let input = model::project(snapshot);
        self.live = true;
        if input != self.last_input {
            self.last_input = input.clone();
            self.machine.session(input, now, &self.options);
        }
        self.animate(clock)
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        let now = self.now(clock);
        self.view = self.machine.tick(now, &self.options);
        self.fade(now, clock);
        let opacity = if self.reduced {
            self.fade.to
        } else {
            self.fade.value(clock)
        };
        let counter = self
            .view
            .active
            .as_ref()
            .and_then(|notice| self.machine.countdown(&notice.event, now));
        let next = scene::sample(
            &self.settings,
            &self.view,
            counter.as_ref(),
            self.live,
            opacity,
        );
        if next == self.visual {
            return Update::default();
        }
        let update = self.painter.sync(&next);
        self.visual = next;
        update
    }
    /// 150 ms in and out; with reduced motion the final value is fixed at once.
    fn fade(&mut self, now: u64, clock: f64) {
        let key = self
            .view
            .active
            .as_ref()
            .map(|notice| (notice.event.clone(), notice.started_at_ms));
        if key != self.shown {
            self.shown = key.clone();
            self.fade = Tween::linear(0.0);
        }
        let target = match &self.view.active {
            Some(notice) if now.saturating_add(150) >= notice.ends_at_ms => 0.0,
            Some(_) => 1.0,
            None => 0.0,
        };
        if self.reduced {
            self.fade = Tween::linear(target);
        } else if (self.fade.to - target).abs() > f32::EPSILON {
            self.fade.retarget(target, clock, FADE);
        }
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if self.reduced {
            return;
        }
        if self.fade.active(clock) {
            let step = 1.0 / f64::from(if self.hz == 0 { 30 } else { self.hz });
            tx.wake_at(clock + step);
            return;
        }
        let now = self.now(clock);
        if let Some(notice) = &self.view.active {
            let end = notice.ends_at_ms.saturating_sub(now).saturating_sub(150).max(1);
            let second = 1000 - now % 1000;
            tx.wake_at(clock + f64::from(second.min(end) as u32) / 1000.0);
            return;
        }
        if let Some(at) = self.machine.next_wake_at(now, &self.options) {
            tx.wake_at(clock + at.saturating_sub(now) as f64 / 1000.0);
        }
    }
    pub fn view(&self) -> El {
        self.painter.view()
    }
}

fn options(settings: &Settings) -> Options {
    Options {
        thresholds: settings.thresholds.clone(),
        session: settings.session,
        calendar: settings.calendar,
        finished: settings.finished,
        starts: settings.starts,
        duration_ms: u64::from(settings.duration_seconds) * 1000,
        mini: settings.mini,
        mini_session: settings.mini_session,
        mini_final: settings.mini_final,
        mini_calendar: settings.mini_calendar,
        mini_start: settings.mini_start,
        mini_limit: usize::from(settings.mini_limit),
    }
}

impl crate::widget::Widget for SessionAlerts {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let vantare_domain::widget_settings::Settings::SessionAlerts(settings) = settings else {
            return None;
        };
        Some(Box::new(SessionAlerts::new(settings, prefs)))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::SessionAlerts(settings) = settings else {
            return false;
        };
        SessionAlerts::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        SessionAlerts::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        SessionAlerts::size_for(self, snapshot)
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        SessionAlerts::policy(self, reduced, hz, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        SessionAlerts::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        SessionAlerts::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        SessionAlerts::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        SessionAlerts::view(self)
    }
}
