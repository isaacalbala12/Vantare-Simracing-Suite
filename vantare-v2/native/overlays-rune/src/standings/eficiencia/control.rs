//! Registro y retención de pausa del host GPUI; movimiento finito de Eficiencia.
#[cfg(test)]
#[path = "review_e3_tests.rs"]
mod review_e3_tests;
#[cfg(test)]
#[path = "review_e5_tests.rs"]
mod review_e5_tests;
use super::{
    Visual,
    model::{Config, ContentPlan},
};
use crate::widget::{Update, Widget};
use std::sync::Arc;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    standings::{self, Board},
    widget_session::Session,
    widget_settings::{Settings, standings::Settings as Options},
};

pub(crate) struct Eficiencia {
    settings: Options,
    prefs: Preferences,
    pub(super) visual: Visual,
    session: Session,
    board: Option<Arc<Board>>,
    paused: bool,
    live_projection: bool,
    pub(super) motion: super::motion::Motion,
    reduced: bool,
    hz: u16,
}
impl Eficiencia {
    pub(super) fn new(settings: &Options, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            visual: Visual::new(&settings),
            settings,
            prefs,
            session: Session::Race,
            board: None,
            paused: false,
            live_projection: false,
            motion: super::motion::Motion::default(),
            reduced: false,
            hz: 60,
        }
    }
    fn sample(&mut self, clock: f64) -> bool {
        let frame = if self.reduced {
            Arc::default()
        } else {
            self.motion.frame_shared(clock)
        };
        let changed = *frame != *self.visual.frame;
        self.visual.frame = frame;
        changed
    }
    fn settings_for(&self, session: Session) -> Options {
        let mut settings = self.settings.clone();
        let columns = match session {
            Session::Practice => settings.practice_columns.as_ref(),
            Session::Qualifying => settings.qualifying_columns.as_ref(),
            Session::Race => None,
        };
        settings.columns = columns.or(settings.columns.as_ref()).cloned();
        settings
    }
    fn switch_session(&mut self, session: Session) {
        self.session = session;
        let mut config = Config::from_settings(&self.settings_for(session));
        config.fit(config.row_count);
        self.visual.config = Arc::new(config);
        self.visual.content_plan =
            Arc::new(ContentPlan::unavailable(super::model::Status::Disconnected));
        self.visual.plan = Arc::new(super::model::plan(
            &self.visual.config,
            &self.visual.content_plan,
        ));
        self.board = None;
    }
}
impl Widget for Eficiencia {
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let Settings::Standings(s) = settings else {
            return None;
        };
        let mut widget = Self::new(s, prefs);
        widget.reduced = reduced;
        widget.hz = hz.max(1);
        Some(Box::new(widget))
    }
    fn attach_assets(&mut self, cache: &Arc<rune::ImageCache>) {
        self.visual.attach_assets(cache);
    }
    fn capture_images(&self) -> Vec<rune::Image> {
        self.visual.capture_images()
    }
    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        matches!(settings, Settings::Standings(s) if s.normalized()==self.settings)
            && prefs == self.prefs
    }
    fn size(&self) -> Size {
        let (width, height) = self.visual.size();
        Size {
            width,
            height: height
                + if self.paused {
                    super::super::PAUSE_HEIGHT
                } else {
                    0.0
                },
        }
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let Some(photo) = snapshot else {
            return self.size();
        };
        let paused = photo.state.source_state == SourceState::Paused;
        let (width, height) = if paused && self.live_projection {
            self.visual.size()
        } else {
            let mut retained;
            let photo = if paused {
                retained = photo.clone();
                retained.state.source_state = SourceState::Live;
                &retained
            } else {
                photo
            };
            let session = Session::of(&photo.state.session.kind).unwrap_or(self.session);
            let settings = self.settings_for(session);
            let content = super::super::content(&settings);
            let board = standings::project_cached(photo, self.prefs, &content, self.board.as_ref());
            if session == self.session
                && self
                    .board
                    .as_ref()
                    .is_some_and(|last| Arc::ptr_eq(last, &board))
            {
                self.visual.size()
            } else {
                let mut visual = Visual::new(&settings);
                visual.ingest(Arc::new(ContentPlan::new(board, String::new(), 0)));
                visual.size()
            }
        };
        Size {
            width,
            height: height
                + if paused {
                    super::super::PAUSE_HEIGHT
                } else {
                    0.0
                },
        }
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        self.hz = hz.max(1);
        if reduced == self.reduced {
            return Update::default();
        }
        self.reduced = reduced;
        self.motion = super::motion::Motion::default();
        if !reduced {
            self.motion.update(
                &self.visual.content_plan,
                self.visual.plan.visible_rows,
                self.visual
                    .plan
                    .columns
                    .iter()
                    .any(|c| c.metric == super::model::Metric::BestLap),
                clock,
            );
        }
        Update {
            build: self.sample(clock),
            pixels: false,
        }
    }
    fn update(&mut self, photo: &Snapshot, clock: f64) -> Update {
        let paused = photo.state.source_state == SourceState::Paused;
        if paused && self.paused {
            return Update::default();
        }
        let pause_changed = paused != self.paused;
        self.paused = paused;
        if paused && self.live_projection {
            return Update {
                build: pause_changed,
                pixels: false,
            };
        }
        self.live_projection = vantare_domain::freshness::shows_last_live(photo);
        let mut retained;
        let photo = if paused {
            retained = photo.clone();
            retained.state.source_state = SourceState::Live;
            &retained
        } else {
            photo
        };
        let session = Session::of(&photo.state.session.kind).unwrap_or(self.session);
        let settings = self.settings_for(session);
        let session_changed = session != self.session;
        if session_changed {
            self.switch_session(session);
        }
        let content = super::super::content(&settings);
        let board = standings::project_cached(photo, self.prefs, &content, self.board.as_ref());
        let identity = format!("{}:{}", photo.state.session.id.0, photo.epoch);
        if !session_changed
            && self.visual.content_plan.identity == identity
            && self
                .board
                .as_ref()
                .is_some_and(|last| Arc::ptr_eq(last, &board))
        {
            return Update {
                build: pause_changed,
                pixels: false,
            };
        }
        // Metadato de continuidad de GPUI para E5/E6; sequence no decide proyección/repintado.
        let next = Arc::new(ContentPlan::new(board.clone(), identity, photo.sequence));
        self.board = Some(board);
        let changed = self.visual.ingest(next);
        // Visual::ingest de GPUI solo actualiza Motion si cambia el contenido visible.
        if changed && !self.reduced {
            self.motion.update(
                &self.visual.content_plan,
                self.visual.plan.visible_rows,
                self.visual
                    .plan
                    .columns
                    .iter()
                    .any(|c| c.metric == super::model::Metric::BestLap),
                clock,
            );
        }
        Update {
            build: self.sample(clock) || changed || pause_changed || session_changed,
            pixels: false,
        }
    }
    fn animate(&mut self, clock: f64) -> Update {
        if self.paused || self.reduced {
            return Update::default();
        }
        Update {
            build: self.sample(clock),
            pixels: false,
        }
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if !self.paused
            && !self.reduced
            && let Some(due) = self.motion.next_wake(clock, self.hz)
        {
            tx.wake_at(due);
        }
    }
    fn view(&self) -> rune::El {
        let mut root = self.visual.view(self.prefs.language);
        if self.paused {
            let (width, height) = self.visual.size();
            let title = if self.prefs.language == vantare_domain::format::Language::Es {
                "EN PAUSA"
            } else {
                "PAUSED"
            };
            root = root.h(height + super::super::PAUSE_HEIGHT).child(
                rune::el()
                    .key("pause-band")
                    .size(width, super::super::PAUSE_HEIGHT)
                    .fill(crate::eficiencia::color(0x101113, 0.95))
                    .pin(Some(0.0), Some(height), None, None)
                    .child(crate::eficiencia::label(
                        title,
                        8.0,
                        16.0,
                        crate::eficiencia::font(11.0, 600, 0.02),
                        crate::eficiencia::color(0xffffff, 1.0),
                    )),
            );
        }
        root
    }
}
