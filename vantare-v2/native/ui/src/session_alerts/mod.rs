//! Widget Pro LMU: máquina neutral, kit Vantare y un único reloj de frontera.
pub mod calendar;
mod paint;
mod sound;

use crate::app::{Paint, Wake};
use std::time::{Duration, Instant};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    session_alerts::{self as model, Machine, Options, View},
};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)]
pub struct Settings {
    pub thresholds: Vec<u8>,
    pub session: bool,
    pub calendar: bool,
    pub finished: bool,
    pub starts: bool,
    pub duration_seconds: u8,
    pub sound: bool,
    pub volume: u8,
    pub sound_zero: bool,
    pub mini: bool,
    pub mini_session: bool,
    pub mini_final: bool,
    pub mini_calendar: bool,
    pub mini_start: bool,
    pub mini_limit: u8,
    pub mini_size: String,
    /// La mini es otra instancia del mismo widget, unida al aviso por ID.
    pub companion_for: Option<String>,
    pub style: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            thresholds: vec![5, 1],
            session: true,
            calendar: true,
            finished: true,
            starts: true,
            duration_seconds: 8,
            sound: true,
            volume: 70,
            sound_zero: false,
            mini: true,
            mini_session: true,
            mini_final: true,
            mini_calendar: true,
            mini_start: true,
            mini_limit: 3,
            mini_size: "m".into(),
            companion_for: None,
            style: "neo".into(),
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut s = self.clone();
        s.thresholds.retain(|n| (1..=60).contains(n));
        s.thresholds.sort_unstable_by(|a, b| b.cmp(a));
        s.thresholds.dedup();
        s.thresholds.truncate(5);
        s.duration_seconds = s.duration_seconds.clamp(4, 15);
        s.volume = s.volume.min(100);
        s.mini_limit = s.mini_limit.clamp(1, 3);

        if !["neo", "carmin", "limpio", "transparente"].contains(&s.style.as_str()) {
            s.style = "neo".into();
        }
        if !["s", "m", "l"].contains(&s.mini_size.as_str()) {
            s.mini_size = "m".into();
        }
        s
    }
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{SessionClock, SessionInfo};
        crate::demand::signals(250, &[SessionInfo, SessionClock])
    }
    fn options(&self) -> Options {
        Options {
            thresholds: self.thresholds.clone(),
            session: self.session,
            calendar: self.calendar,
            finished: self.finished,
            starts: self.starts,
            duration_ms: u64::from(self.duration_seconds) * 1000,
            mini: self.mini,
            mini_session: self.mini_session,
            mini_final: self.mini_final,
            mini_calendar: self.mini_calendar,
            mini_start: self.mini_start,
            mini_limit: usize::from(self.mini_limit),
        }
    }
    pub fn set_threshold(&mut self, index: usize, minutes: u8) {
        self.thresholds
            .resize(index.max(self.thresholds.len().saturating_sub(1)) + 1, 0);
        self.thresholds[index] = minutes;
        *self = self.normalized();
    }
}
pub(crate) struct Widget {
    settings: Settings,
    machine: Machine,
    view: View,
    clock: Instant,
    wall: u64,
    calendar: Vec<model::CalendarInput>,
    sound_revision: u64,
    zero_revision: u64,
    sound: sound::Sound,
    pub(crate) live: bool,
    last_input: Option<model::SessionInput>,
    cursor: Option<(u64, u64)>,
}
impl Widget {
    pub(crate) fn new(settings: &Settings, _prefs: Preferences) -> Self {
        Self {
            settings: settings.normalized(),
            machine: Machine::default(),
            view: View::default(),
            clock: Instant::now(),
            wall: vantare_ipc::control::wall_ms().unwrap_or(0),
            calendar: vec![],
            sound_revision: 0,
            zero_revision: 0,
            sound: sound::Sound::default(),
            live: false,
            last_input: None,
            cursor: None,
        }
    }
    fn now(&self) -> u64 {
        self.wall
            .saturating_add(self.clock.elapsed().as_millis() as u64)
    }
    pub(crate) fn calendar(&mut self, events: &[model::CalendarInput]) -> bool {
        if self.calendar == events {
            return false;
        }
        self.calendar = events.to_vec();
        self.machine
            .calendar(events, self.now(), &self.settings.options());
        true
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        paint::bounds(&self.settings).0
    }
    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, _prefs: Preferences) -> bool {
        let cursor = (snapshot.epoch, snapshot.sequence);
        let next = model::project(snapshot);
        if self.cursor == Some(cursor) && self.last_input == next {
            return false;
        }
        self.cursor = Some(cursor);
        let changed = next != self.last_input;
        self.last_input.clone_from(&next);
        self.machine
            .session(next, self.now(), &self.settings.options());
        changed
    }
    pub(crate) fn frame(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let now = self.now();
        self.view = self.machine.tick(now, &self.settings.options());
        if self.view.sound_revision != self.sound_revision {
            self.sound_revision = self.view.sound_revision;
            if self.live
                && self.settings.companion_for.is_none()
                && self.settings.sound
                && self.settings.volume > 0
                && let Some(n) = &self.view.active
            {
                self.sound.play(n.tone(), self.settings.volume);
            }
        }
        if self.zero_revision != self.view.zero_revision {
            self.zero_revision = self.view.zero_revision;
            if self.live
                && self.settings.companion_for.is_none()
                && self.settings.sound
                && self.settings.sound_zero
                && self.settings.volume > 0
            {
                self.sound.play(model::Tone::Final, self.settings.volume);
            }
        }
        let counter = self
            .view
            .active
            .as_ref()
            .and_then(|n| self.machine.countdown(&n.event, now));
        let preview = !self.live;
        let settings = self.settings.clone();
        let view = self.view.clone();
        let main = settings.companion_for.is_none();
        let active = !view.minis.is_empty() || (main && (view.active.is_some() || view.queued > 0));
        let transition = main
            && view.active.as_ref().is_some_and(|n| {
                !reduced
                    && (now.saturating_sub(n.started_at_ms) < 150
                        || n.ends_at_ms.saturating_sub(now) <= 150)
            });
        let wake = if transition {
            Wake::Frame
        } else if active {
            let until_fade = view.active.as_ref().map_or(1000, |n| {
                n.ends_at_ms.saturating_sub(now).saturating_sub(150)
            });
            Wake::At(Duration::from_millis(
                (1000 - now % 1000).min(until_fade.max(1)),
            ))
        } else {
            self.machine
                .next_wake_at(now, &self.settings.options())
                .into_iter()
                .chain(view.active.as_ref().filter(|_| !main).map(|n| n.ends_at_ms))
                .min()
                .map_or(Wake::Idle, |at| {
                    Wake::At(Duration::from_millis(at.saturating_sub(now).max(1)))
                })
        };
        (
            Box::new(move |window, cx| {
                paint::paint(
                    &settings,
                    &view,
                    counter.as_ref(),
                    now,
                    prefs,
                    reduced,
                    preview,
                    window,
                    cx,
                );
            }),
            wake,
        )
    }
    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // Contrato común del registro.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_photo_with_same_cursor_cancels_notice_and_its_timer() {
        let mut photo = vantare_ipc::snapshot_from_saved_json(include_str!(
            "../../fixtures/session-alerts.snapshot.json"
        ))
        .expect("foto");
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&photo, prefs));
        assert!(widget.frame(prefs, false).1 != Wake::Idle);
        photo.state.source_state = vantare_domain::SourceState::Stale;
        vantare_domain::degrade(&mut photo.state);
        assert!(widget.ingest(&photo, prefs));
        assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
        assert!(!widget.ingest(&photo, prefs));
    }
    #[test]
    fn pause_or_stale_then_same_photo_never_replays_notice_or_sound() {
        let photo = vantare_ipc::snapshot_from_saved_json(include_str!(
            "../../fixtures/session-alerts.snapshot.json"
        ))
        .expect("foto");
        let prefs = Preferences::default();
        for state in [
            vantare_domain::SourceState::Paused,
            vantare_domain::SourceState::Stale,
        ] {
            let mut widget = Widget::new(&Settings::default(), prefs);
            widget.ingest(&photo, prefs);
            drop(widget.frame(prefs, false));
            let revision = widget.view.sound_revision;
            assert_eq!(revision, 1);
            let mut unavailable = photo.clone();
            unavailable.state.source_state = state;
            assert!(widget.ingest(&unavailable, prefs));
            assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
            assert!(widget.ingest(&photo, prefs));
            drop(widget.frame(prefs, false));
            assert!(widget.view.active.is_none());
            assert_eq!(widget.view.sound_revision, revision);
        }
    }

    #[test]
    fn hidden_companion_sleeps_until_notice_ends_then_shows_mini() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(
            &Settings {
                companion_for: Some("main".into()),
                ..Settings::default()
            },
            prefs,
        );
        let now = widget.now();
        widget.calendar(&[model::CalendarInput {
            id: "race".into(),
            label: "Spa".into(),
            starts_at_ms: now + 60_000,
        }]);
        let Wake::At(delay) = widget.frame(prefs, false).1 else {
            panic!("la mini oculta no anima el aviso principal");
        };
        assert!(delay > Duration::from_secs(7));
        assert!(widget.view.minis.is_empty());
        widget.wall += 8000;
        let Wake::At(delay) = widget.frame(prefs, false).1 else {
            panic!("la mini visible actualiza su cuenta");
        };
        assert!(delay <= Duration::from_secs(1));
        assert_eq!(widget.view.minis.len(), 1);
    }

    #[test]
    fn unproduced_finish_details_do_not_request_positions_or_laps() {
        let demand = Settings::default().demand();
        assert!(demand.contains(vantare_ipc::Signal::SessionInfo));
        assert!(demand.contains(vantare_ipc::Signal::SessionClock));
        assert!(!demand.contains(vantare_ipc::Signal::Positions));
        assert!(!demand.contains(vantare_ipc::Signal::LapTimes));
    }

    #[test]
    fn normalized_settings_roundtrip_and_calendar_wakes_without_telemetry() {
        let settings = Settings {
            thresholds: vec![0, 5, 1, 5, 90, 10, 30, 60, 40],
            duration_seconds: 99,
            mini_limit: 0,
            volume: 200,
            ..Settings::default()
        }
        .normalized();
        assert_eq!(settings.thresholds, vec![60, 40, 30, 10, 5]);
        assert_eq!(settings.duration_seconds, 15);
        assert_eq!(settings.volume, 100);
        let tagged = crate::Settings::SessionAlerts(settings);
        let text = serde_json::to_string(&tagged).expect("ajustes");
        assert_eq!(
            serde_json::from_str::<crate::Settings>(&text).expect("leer"),
            tagged
        );
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        let time = widget.now();
        widget.calendar(&[model::CalendarInput {
            id: "test".into(),
            label: "Spa".into(),
            starts_at_ms: time + 600000,
        }]);
        let Wake::At(delay) = widget.frame(Preferences::default(), false).1 else {
            panic!("despertar en el umbral sin telemetría");
        };
        assert!(delay > Duration::from_secs(299));
        assert!(widget.view.active.is_none() && widget.view.minis.is_empty());
        widget.calendar(&[]);
        assert_eq!(widget.frame(Preferences::default(), false).1, Wake::Idle);
    }
    #[test]
    fn approved_scene_drives_real_machine_without_windows() {
        let doc: serde_json::Value = serde_json::from_str(include_str!(
            "../../fixtures/session-alerts-default.scene.json"
        ))
        .expect("documento");
        let frames: Vec<_> = doc["frames"]
            .as_array()
            .expect("fases")
            .iter()
            .map(|f| f["snapshot"].clone())
            .collect();
        let photos =
            crate::workshop::snapshots_from_json(&serde_json::to_string(&frames).expect("fotos"))
                .expect("escena");
        let mut machine = Machine::default();
        let options = Options::default();
        let mut tones = vec![];
        for (i, photo) in photos.iter().enumerate() {
            let now = i as u64 * 1200;
            machine.session(model::project(photo), now, &options);
            if let Some(n) = machine.tick(now, &options).active {
                tones.push(n.tone());
            }
        }
        assert!(tones.contains(&model::Tone::Mild));
        assert!(tones.contains(&model::Tone::Final));
        assert!(tones.contains(&model::Tone::Finished));
        assert!(
            photos
                .iter()
                .all(|p| model::project(p).expect("LMU").phase.is_none())
        );
    }
}
