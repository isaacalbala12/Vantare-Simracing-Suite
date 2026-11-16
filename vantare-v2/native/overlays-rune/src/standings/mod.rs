mod layout;
mod motion;
#[cfg(test)]
mod motion_tests;
#[cfg(test)]
mod painting_tests;
mod render;
#[cfg(test)]
mod tests;
use crate::{
    vantare::Style,
    widget::{Update, Widget},
};
use layout::{Options, Plan};
use std::sync::Arc;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    standings::{self, Board},
    widget_session::Session,
    widget_settings::{Settings, standings::Settings as Config},
};
const PAUSE_HEIGHT: f32 = 22.0;

#[derive(PartialEq)]
struct Scene {
    paused: bool,
    frame: motion::Frame,
    board: Option<Arc<Board>>,
    plan: Plan,
    options: Options,
}
pub(crate) struct Standings {
    settings: Config,
    prefs: Preferences,
    style: Arc<Style>,
    scene: Scene,
    session: Session,
    content: standings::Content,
    live_projection: bool,
    motion: motion::Motion,
    reduced: bool,
    hz: u16,
}
impl Standings {
    fn new(settings: &Config, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let style = Style::compiled();
        let options = Options::from_settings(&settings);
        let plan = layout::plan(None, &options, &style);
        let content = content(&settings);
        Self {
            settings,
            prefs,
            style,
            session: Session::Race,
            content,
            live_projection: false,
            motion: motion::Motion::default(),
            reduced: false,
            hz: 60,
            scene: Scene {
                paused: false,
                frame: motion::Frame::new(),
                board: None,
                plan,
                options,
            },
        }
    }
    fn settings_for(&self, session: Session) -> Config {
        let mut settings = self.settings.clone();
        let columns = match session {
            Session::Practice => settings.practice_columns.as_ref(),
            Session::Qualifying => settings.qualifying_columns.as_ref(),
            Session::Race => None,
        };
        settings.columns = columns.or(settings.columns.as_ref()).cloned();
        settings
    }
}
impl Widget for Standings {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::Standings(s) = settings else {
            return None;
        };
        let mut widget = Self::new(s, prefs);
        widget.policy(reduced, hz, clock);
        Some(Box::new(widget))
    }
    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        matches!(settings,Settings::Standings(s) if s.normalized()==self.settings)
            && prefs == self.prefs
    }
    fn size(&self) -> Size {
        Size {
            width: self.scene.plan.width,
            height: self.scene.plan.height + if self.scene.paused { PAUSE_HEIGHT } else { 0.0 },
        }
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let paused = snapshot.map_or(self.scene.paused, |s| {
            s.state.source_state == SourceState::Paused
        });
        let session = snapshot
            .and_then(|s| Session::of(&s.state.session.kind))
            .unwrap_or(self.session);
        let o = Options::from_settings(&self.settings_for(session));
        Size {
            width: o.layout(&self.style, o.driver_max(&self.style)).1,
            height: layout::fixed_height(&o, &self.style) + if paused { PAUSE_HEIGHT } else { 0.0 },
        }
    }

    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        self.reduced = reduced;
        self.hz = hz.max(1);
        if reduced {
            self.motion.settle();
        }
        if self.scene.paused && !reduced {
            return Update::default();
        }
        let frame = self.motion.sample(clock);
        let build = frame != self.scene.frame;
        self.scene.frame = frame;
        Update {
            build,
            pixels: false,
        }
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        // GPUI app::project_snapshot conserva la proyección viva durante la pausa.
        let paused = snapshot.state.source_state == SourceState::Paused;
        if paused && self.scene.paused {
            return Update::default();
        }
        let pause_changed = self.scene.paused != paused;
        self.scene.paused = paused;
        if paused && self.live_projection {
            return Update {
                build: pause_changed,
                pixels: false,
            };
        }
        self.live_projection = vantare_domain::freshness::shows_last_live(snapshot);
        let mut retained;
        let snapshot = if paused {
            retained = snapshot.clone();
            retained.state.source_state = SourceState::Live;
            &retained
        } else {
            snapshot
        };
        let session = Session::of(&snapshot.state.session.kind).unwrap_or(self.session);
        let options = if session != self.session {
            self.session = session;
            let settings = self.settings_for(session);
            self.content = content(&settings);
            Options::from_settings(&settings)
        } else {
            self.scene.options.clone()
        };
        let board = standings::project_cached(
            snapshot,
            self.prefs,
            &self.content,
            self.scene.board.as_ref(),
        );
        if self
            .scene
            .board
            .as_ref()
            .is_some_and(|old| Arc::ptr_eq(old, &board))
            && self.scene.options == options
        {
            return Update {
                build: pause_changed,
                pixels: false,
            };
        }
        let plan = layout::plan(Some(&board), &options, &self.style);
        let targets = plan
            .items
            .iter()
            .filter_map(|&(y, item)| {
                let layout::Item::Row(g, r) = item else {
                    return None;
                };
                Some((board.groups.get(g)?.rows.get(r)?.id, y))
            })
            .collect::<Vec<_>>();
        self.motion
            .update(&targets, &self.style, clock, self.reduced);
        let scene = Scene {
            paused,
            frame: self.motion.sample(clock),
            plan,
            board: Some(board),
            options,
        };
        let build = scene != self.scene || pause_changed;
        self.scene = scene;
        Update {
            build,
            pixels: false,
        }
    }
    fn animate(&mut self, clock: f64) -> Update {
        if self.scene.paused {
            return Update::default();
        }
        let frame = self.motion.sample(clock);
        let build = frame != self.scene.frame;
        self.scene.frame = frame;
        Update {
            build,
            pixels: false,
        }
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if !self.scene.paused
            && !self.reduced
            && let Some(due) = self.motion.next_wake(clock, self.hz)
        {
            tx.wake_at(due);
        }
    }
    fn view(&self) -> rune::El {
        render::view(
            &self.scene.options,
            self.scene.board.as_deref(),
            &self.scene.plan,
            &self.style,
            self.prefs.language,
            self.scene.paused,
            &self.scene.frame,
        )
    }
}

fn content(settings: &Config) -> standings::Content {
    let lap_format = |metric: &str| {
        settings
            .columns
            .as_ref()
            .and_then(|cols| cols.iter().find(|c| c.enabled && c.metric_id == metric))
            .map(|c| standings::LapFormat {
                compact: c.format.display.as_deref() == Some("compact"),
                decimals: c.format.decimals.unwrap_or(3),
            })
            .filter(|f| f.compact || f.decimals != 3)
    };
    let visible = |metric: &str| {
        settings
            .columns
            .as_ref()
            .is_some_and(|columns| columns.iter().any(|c| c.enabled && c.metric_id == metric))
    };
    let footer_slots = settings
        .footer_slots
        .as_ref()
        .is_some_and(|s| !s.is_empty());
    standings::Content {
        lap_visible: visible("currentLap"),
        interval_visible: visible("interval"),
        footer_visible: settings.show_session_footer,
        legacy_track_visible: settings.show_session_footer
            && !footer_slots
            && [&settings.footer_first, &settings.footer_second]
                .iter()
                .all(|id| ["none", "track", "estimatedLaps"].contains(&id.as_str()))
            && [&settings.footer_first, &settings.footer_second]
                .iter()
                .any(|id| id.as_str() == "track"),
        footer_ids: if footer_slots {
            settings.footer_slots.clone().unwrap_or_default()
        } else {
            vec![
                settings.footer_first.clone(),
                settings.footer_second.clone(),
            ]
        },
        footer_slots,
        player_class: settings.class_scope != "all-classes",
        row_count: settings.row_count,
        player_window: settings.player_window,
        window_around: settings.window_around,
        multiclass: settings.classification_mode == "multiclass",
        class_gaps: settings.class_scope != "all-classes"
            || settings.classification_mode == "multiclass",
        last_lap_format: lap_format("lastLap"),
        best_lap_format: lap_format("bestLap"),
    }
}
